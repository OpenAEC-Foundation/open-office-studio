#!/usr/bin/env python3
"""Linux: vijf modules openen, toegestane velden bewerken en in een nieuw proces teruglezen."""
import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from zipfile import ZipFile
from xml.etree import ElementTree as ET


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--programma', type=Path, required=True)
    p.add_argument('--uitvoer', type=Path, required=True)
    p.add_argument('--binnen', action='store_true', help=argparse.SUPPRESS)
    a = p.parse_args()
    a.programma = a.programma.resolve(strict=True)
    a.uitvoer = a.uitvoer.resolve()
    if a.binnen:
        return asyncio.run(proef(a))
    for naam in ['dbus-run-session', 'dbus-update-activation-environment', 'xvfb-run', 'xdotool']:
        if not shutil.which(naam):
            raise RuntimeError('Testhulpmiddel ontbreekt: '+naam)
    basis = Path(tempfile.mkdtemp(prefix='office-moduleproef-'))
    try:
        env = os.environ.copy()
        for naam in ['DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'DBUS_STARTER_ADDRESS', 'DBUS_STARTER_BUS_TYPE', 'GNOME_KEYRING_CONTROL', 'SSH_AUTH_SOCK', 'SESSION_MANAGER', 'WEBKIT_DISABLE_COMPOSITING_MODE']:
            env.pop(naam, None)
        for naam in ['CONFIG', 'DATA', 'CACHE', 'RUNTIME']:
            pad = basis/naam.lower(); pad.mkdir(mode=0o700)
            env['XDG_'+naam+'_HOME' if naam != 'RUNTIME' else 'XDG_RUNTIME_DIR'] = str(pad)
        with socket.socket() as http, socket.socket() as inspectie:
            http.bind(('127.0.0.1', 0)); inspectie.bind(('127.0.0.1', 0))
            poort, achter = http.getsockname()[1], inspectie.getsockname()[1]
        env.update(GDK_BACKEND='x11', WEBKIT_DISABLE_DMABUF_RENDERER='1', WEBKIT_INSPECTOR_HTTP_SERVER=f'127.0.0.1:{poort}', WEBKIT_INSPECTOR_SERVER=f'127.0.0.1:{achter}', OFFICE_PROEF_HTTP=str(poort))
        return subprocess.call(['dbus-run-session', '--', 'xvfb-run', '-a', '-s', '-screen 0 1440x1000x24 -nolisten tcp', sys.executable, str(Path(__file__).resolve()), '--binnen', '--programma', str(a.programma), '--uitvoer', str(a.uitvoer)], env=env)
    finally:
        shutil.rmtree(basis, ignore_errors=True)


async def proef(a):
    from Xlib import X, display
    from PIL import Image
    repo = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repo/'scripts'))
    from gui.webkit_inspector import Inspector
    a.uitvoer.mkdir(parents=True, exist_ok=False)
    cases = [
        ('Tekst', repo/'docs/voorbeelden/Ontwerpnotitie.docx', 'Werkproef Tekst.docx'),
        ('Rekenblad', repo/'docs/voorbeelden/Materiaaloverzicht.xlsx', 'Werkproef Rekenblad.xlsx'),
        ('Presentatie', repo/'docs/voorbeelden/Ontwerpvisie.pptx', 'Werkproef Presentatie.pptx'),
        ('Email', None, 'Werkproef Email.eml'),
        ('Notities', repo/'docs/voorbeelden/Notitieboek.json', 'Werkproef Notities.json'),
    ]
    bestanden = []
    for module, bron, naam in cases:
        pad = a.uitvoer/naam
        if bron:
            shutil.copyfile(bron, pad)
        else:
            pad.write_bytes(b'From: afzender@voorbeeld.invalid\r\nTo: ontvanger@voorbeeld.invalid\r\nSubject: Rust proefbericht\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nEen generiek proefbericht.\r\n')
        bestanden.append(pad)
    email_bron = bestanden[3].read_bytes()
    rapport = {'geslaagd': False, 'versie': subprocess.check_output([str(a.programma), '--version'], text=True).strip(), 'programma_sha256': hashlib.sha256(a.programma.read_bytes()).hexdigest(), 'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'bron_hashes': {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in bestanden}, 'stappen': [], 'grenzen': ['Veldbediening van de Rust-preview; geen volledige oorspronkelijke editors, mailaccounts, database of pixelacceptatie.']}
    poort = int(os.environ['OFFICE_PROEF_HTTP'])
    d = display.Display(); log = (a.uitvoer/'programma.log').open('w'); programma = None; venster = None
    subprocess.run(['dbus-update-activation-environment', 'DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME'], check=True)

    def stop():
        if programma and programma.poll() is None:
            os.killpg(programma.pid, signal.SIGTERM)
            try: programma.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(programma.pid, signal.SIGKILL); programma.wait()

    async def wacht(voorwaarde, limiet=90):
        einde = time.monotonic()+limiet
        while time.monotonic()<einde:
            assert programma.poll() is None, 'Eigen testapp onverwacht afgesloten'
            if await voorwaarde(): return
            await asyncio.sleep(.1)
        raise TimeoutError('Verwachte moduletesttoestand ontbreekt')

    async def start():
        nonlocal programma, venster
        programma = subprocess.Popen([str(a.programma), *map(str, bestanden)], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        einde = time.monotonic()+60
        while time.monotonic()<einde:
            for v in d.screen().root.query_tree().children:
                prop = v.get_full_property(d.intern_atom('_NET_WM_NAME'), X.AnyPropertyType)
                naam = prop.value.decode(errors='replace') if prop and isinstance(prop.value, bytes) else ''
                if v.get_attributes().map_state == X.IsViewable and 'Office Studio' in naam:
                    venster = v; v.configure(width=1058, height=892); v.set_input_focus(X.RevertToParent, X.CurrentTime); d.sync()
                    await asyncio.sleep(12); return
            await asyncio.sleep(.1)
        raise TimeoutError('Geen eigen programmavenster')

    def scherm(naam):
        g = venster.get_geometry(); raw = venster.get_image(0, 0, g.width, g.height, X.ZPixmap, 0xffffffff)
        Image.frombytes('RGB', (g.width, g.height), raw.data, 'raw', 'BGRX').save(a.uitvoer/(naam+'.png'))

    async def klik(p, selector, index=0):
        r = await p.ev('(()=>{const e=document.querySelectorAll('+json.dumps(selector)+')['+str(index)+'];if(!e)throw Error("Bediening ontbreekt");e.scrollIntoView({block:"nearest",inline:"nearest"});const r=e.getBoundingClientRect();return{x:Math.round(r.x+Math.min(30,r.width/2)),y:Math.round(r.y+r.height/2)}})()')
        assert 0<=r['x']<1058 and 0<=r['y']<892, r
        subprocess.run(['xdotool', 'mousemove', '--window', str(venster.id), str(r['x']), str(r['y']), 'click', '1'], check=True)

    async def gereed(p):
        await wacht(lambda: p.ev('document.querySelectorAll(".office-tablijst .office-tab").length===5&&!document.querySelector(".office-tablijst [aria-busy=true]")'))
        namen = await p.ev('Array.from(document.querySelectorAll(".office-tablijst .office-tabnaam")).map(e=>e.textContent.trim())')
        assert namen == [c[2] if c[0]!='Notities' else 'Notities' for c in cases], namen

    async def open_tab(p, i):
        await klik(p, '.office-tablijst .office-tab', i)
        await wacht(lambda: p.ev('document.querySelectorAll(".office-tablijst .office-tab")['+str(i)+'].getAttribute("aria-selected")==="true"'))
        await wacht(lambda: p.ev('document.querySelector(".office-werkvlak textarea, .office-werkvlak input.notities-paginatitel")!==null'))

    def controleer_bron(i, marker):
        pad = bestanden[i]
        if cases[i][0]=='Email':
            assert pad.read_bytes()==email_bron, 'De volledige MIME-bron moet exact blijven'
        elif pad.suffix=='.json':
            data = json.loads(pad.read_text()); assert data['boeken'][0]['secties'][0]['paginas'][0]['titel']==marker
        else:
            with ZipFile(pad) as z:
                teksten = '\n'.join(''.join(e.text or '' for e in ET.fromstring(z.read(n)).iter() if e.tag.rsplit('}',1)[-1] in {'t','v'}) for n in z.namelist() if n.endswith('.xml'))
                assert marker in teksten, 'Opgeslagen pakket mist de werkelijk getypte tekst'

    try:
        await start()
        async with Inspector(poort) as p:
            await gereed(p)
            for i,(module,_,_) in enumerate(cases):
                await open_tab(p, i); marker = 'Rust werkproef '+module
                if module=='Email':
                    assert await p.ev('document.querySelectorAll(".office-werkvlak textarea").length>=2&&Array.from(document.querySelectorAll(".office-werkvlak textarea")).every(e=>e.disabled)')
                else:
                    selector = '.office-werkvlak input.notities-paginatitel' if module=='Notities' else '.office-werkvlak textarea:not([disabled])'
                    await klik(p, selector)
                    subprocess.run(['xdotool','key','--clearmodifiers','ctrl+a'],check=True)
                    subprocess.run(['xdotool','type','--clearmodifiers','--delay','12',marker],check=True)
                    await wacht(lambda: p.ev('document.querySelector('+json.dumps(selector)+').value==='+json.dumps(marker)))
                st = bestanden[i].stat(); voor = (st.st_ino, st.st_mtime_ns)
                await klik(p, '.office-snelletoegang button[aria-label="Opslaan"]')
                async def bewaard():
                    s = bestanden[i].stat()
                    if (s.st_ino,s.st_mtime_ns)==voor:return False
                    return await p.ev('!document.querySelectorAll(".office-tablijst .office-tabnaam")['+str(i)+'].textContent.includes("•")')
                await wacht(bewaard)
                controleer_bron(i, marker)
                subprocess.run(['xdotool','mousemove','--window',str(venster.id),'1040','875'],check=True); await asyncio.sleep(.2)
                scherm(module+'-bewaard'); rapport['stappen'].append({'module':module,'stap':'bewerken en bewaren' if module!='Email' else 'alleen lezen en bronexact bewaren','geslaagd':True})
                print(module,'bewaard',flush=True)
        stop(); await start()
        async with Inspector(poort) as p:
            await gereed(p)
            for i,(module,_,_) in enumerate(cases):
                await open_tab(p,i);marker='Rust werkproef '+module
                if module!='Email':
                    selector = '.office-werkvlak input.notities-paginatitel' if module=='Notities' else '.office-werkvlak textarea:not([disabled])'
                    await wacht(lambda: p.ev('document.querySelector('+json.dumps(selector)+')?.value==='+json.dumps(marker)))
                else:
                    assert await p.ev('document.querySelector(".office-werkvlak textarea").value==="Rust proefbericht"')
                controleer_bron(i,marker)
                subprocess.run(['xdotool','mousemove','--window',str(venster.id),'1040','875'],check=True); await asyncio.sleep(.2)
                scherm(module+'-heropend');rapport['stappen'].append({'module':module,'stap':'nieuw proces heropend','geslaagd':True});print(module,'heropend',flush=True)
        rapport['bewaarde_hashes']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in bestanden}
        rapport['geslaagd']=True
    except Exception as e:
        rapport['fout']=repr(e)
        if venster and programma and programma.poll() is None:scherm('afgekeurd')
        raise
    finally:
        stop();d.close();log.close();(a.uitvoer/'rapport.json').write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n')
    return 0


if __name__=='__main__':raise SystemExit(main())
