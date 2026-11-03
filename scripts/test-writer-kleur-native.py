#!/usr/bin/env python3
"""Linux/WebKit: echte GTK-kleurkeuze, DOCX-teruglezing en een nieuw proces (#125)."""
import argparse
import asyncio
from contextlib import ExitStack
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen
from zipfile import ZipFile, ZIP_DEFLATED
from xml.etree import ElementTree as ET


def poorten():
    with socket.socket() as a, socket.socket() as b:
        a.bind(('127.0.0.1', 0))
        b.bind(('127.0.0.1', 0))
        return a.getsockname()[1], b.getsockname()[1]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--programma', type=Path, required=True)
    p.add_argument('--uitvoer', type=Path, required=True)
    p.add_argument('--versie', required=True)
    p.add_argument('--binnen', action='store_true', help=argparse.SUPPRESS)
    a = p.parse_args()
    a.programma = a.programma.resolve(strict=True)
    a.uitvoer = a.uitvoer.resolve()
    if a.binnen:
        return asyncio.run(proef(a))
    for naam in ['dbus-run-session', 'dbus-update-activation-environment', 'xvfb-run', 'xdotool']:
        if not shutil.which(naam):
            raise RuntimeError('Testhulpmiddel ontbreekt: '+naam)
    with ExitStack() as opruimen:
        tmp = tempfile.mkdtemp(prefix='office-kleurproef-')
        # Een portal kan zijn tijdelijke FUSE-map pas na sessie-einde loslaten.
        opruimen.callback(shutil.rmtree, tmp, ignore_errors=True)
        omgeving = os.environ.copy()
        for naam in ['DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'DBUS_STARTER_ADDRESS', 'DBUS_STARTER_BUS_TYPE', 'GNOME_KEYRING_CONTROL', 'SSH_AUTH_SOCK', 'SESSION_MANAGER']:
            omgeving.pop(naam, None)
        for naam in ['CONFIG', 'DATA', 'CACHE', 'RUNTIME']:
            pad = Path(tmp)/naam.lower()
            pad.mkdir(mode=0o700)
            omgeving['XDG_'+naam+'_HOME' if naam != 'RUNTIME' else 'XDG_RUNTIME_DIR'] = str(pad)
        http, inspectie = poorten()
        omgeving.update(GDK_BACKEND='x11', LC_ALL='C.UTF-8', WEBKIT_DISABLE_DMABUF_RENDERER='1', WEBKIT_DISABLE_COMPOSITING_MODE='1', WEBKIT_INSPECTOR_HTTP_SERVER=f'127.0.0.1:{http}', WEBKIT_INSPECTOR_SERVER=f'127.0.0.1:{inspectie}', OFFICE_PROEF_HTTP=str(http))
        return subprocess.call(['dbus-run-session', '--', 'xvfb-run', '-a', '-s', '-screen 0 1600x1100x24 -nolisten tcp', sys.executable, str(Path(__file__).resolve()), '--binnen', '--programma', str(a.programma), '--uitvoer', str(a.uitvoer), '--versie', a.versie], env=omgeving)


async def proef(a):
    from Xlib import X, display
    from PIL import Image
    from gui.webkit_inspector import Inspector
    a.uitvoer.mkdir(parents=True, exist_ok=False)
    repo = Path(__file__).resolve().parents[1]
    tekst = 'Een proef voor de markeerkleur.'
    bron = a.uitvoer/'Markeerkleurproef.docx'
    # De vaste proefbron bevat precies één tekstdeel, zonder oorspronkelijke markering.
    with ZipFile(repo/'public/templates/nieuw.docx') as z, ZipFile(bron, 'w', ZIP_DEFLATED) as uit:
        for naam in z.namelist():
            inhoud = z.read(naam)
            if naam == 'word/document.xml':
                inhoud, aantal = re.subn(r'<w:p(?:\s[^>]*)?(?:/>|>[\s\S]*?</w:p>)', '<w:p><w:r><w:t>'+tekst+'</w:t></w:r></w:p>', inhoud.decode(), count=1)
                assert aantal == 1
                inhoud = inhoud.encode()
            uit.writestr(naam, inhoud)
    cfg = Path(os.environ['XDG_CONFIG_HOME'])/'org.openaec.office-studio'
    cfg.mkdir(parents=True)
    (cfg/'voorkeuren.json').write_text(json.dumps({'taal': 'en', 'thema': 'forge', 'updates': {'automatisch': False, 'kanaal': 'ontwikkel'}}))
    subprocess.run(['dbus-update-activation-environment', 'DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME'], check=True)
    d = display.Display()
    log = (a.uitvoer/'programma.log').open('w')
    programma = None
    rapport = {'geslaagd': False, 'versie': a.versie, 'programma_sha256': hashlib.sha256(a.programma.read_bytes()).hexdigest(), 'stappen': [], 'kleurgebeurtenissen': [], 'paletten': [], 'beperking': 'GTK3-palet op Linux/X11; geen volledige platform- of functieacceptatie.'}
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    http = int(os.environ['OFFICE_PROEF_HTTP'])

    def naam(v):
        prop = v.get_full_property(d.intern_atom('_NET_WM_NAME'), X.AnyPropertyType)
        tekst = prop.value if prop else v.get_wm_name()
        return tekst.decode(errors='replace') if isinstance(tekst, bytes) else str(tekst or '')

    def scherm(titel):
        wortel = d.screen().root
        raw = wortel.get_image(0, 0, 1440, 1000, X.ZPixmap, 0xffffffff)
        Image.frombytes('RGB', (1440, 1000), raw.data, 'raw', 'BGRX').save(a.uitvoer/(titel+'.png'))

    async def zoekvenster(voorwaarde):
        einde = time.monotonic()+60
        while time.monotonic() < einde:
            assert programma.poll() is None, 'Eigen testapp onverwacht afgesloten'
            for v in d.screen().root.query_tree().children:
                if v.get_attributes().map_state == X.IsViewable and voorwaarde(naam(v)):
                    return v
            await asyncio.sleep(.1)
        raise TimeoutError('Verwacht venster ontbreekt')

    def stop():
        if programma and programma.poll() is None:
            os.killpg(programma.pid, signal.SIGTERM)
            try:
                programma.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(programma.pid, signal.SIGKILL)
                programma.wait()

    async def start(pad):
        nonlocal programma
        programma = subprocess.Popen([str(a.programma), str(pad)], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        v = await zoekvenster(lambda n: 'Office Studio' in n)
        v.configure(width=1440, height=1000)
        v.set_input_focus(X.RevertToParent, X.CurrentTime)
        d.sync()
        # Laat de eerste paginalading voltooien vóór inspectie. Een navigatie
        # vervangt anders het JavaScript-resultaatvak van de lopende proef.
        await asyncio.sleep(12)
        einde = time.monotonic()+60
        while time.monotonic() < einde:
            try:
                with urlopen(f'http://127.0.0.1:{http}/', timeout=1) as antwoord:
                    if '/socket/' in antwoord.read().decode():
                        return v
            except OSError:
                pass
            await asyncio.sleep(.15)
        raise TimeoutError('Inspectie van de eigen testapp niet gereed')

    async def gereed(p):
        await p.run('''window.proefApi=()=>{const el=document.querySelector('.office-tabpaneel:not([hidden]) .office-tekst');if(!el)return null;for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let s=f.memoizedState,i=0;s&&i<200;i++,s=s.next){const v=s.memoizedState?.current;if(v?.getEditorRef&&v.commands)return v}return null};let einde=performance.now()+60000;while(!proefApi()?.getEditorRef()?.getLayout()?.pages.length){if(performance.now()>einde)throw Error('Editor niet gereed');await new Promise(r=>setTimeout(r,100))}proefApi().getEditorRef().selectAll();await proefApi().flushPendingInput();return true;''')
        versie = await p.run("return await window.__TAURI_INTERNALS__.invoke('plugin:app|version');")
        assert versie == a.versie, (versie, a.versie)

    async def controle(p, titel, verwacht, verwachte_tekst=None):
        bytes_ = await p.run('await proefApi().flushPendingInput();return Array.from(new Uint8Array(await proefApi().save()));')
        bytes_ = bytearray(bytes_)
        (a.uitvoer/(titel+'.docx')).write_bytes(bytes_)
        with ZipFile(io.BytesIO(bytes_)) as z:
            xml = ET.fromstring(z.read('word/document.xml'))
        werkelijk = ''.join(e.text or '' for e in xml.findall('.//w:body//w:t', ns))
        vullingen = [e.get('{'+ns['w']+'}fill').lower() for e in xml.findall('.//w:rPr/w:shd', ns)]
        verwachte_tekst = tekst if verwachte_tekst is None else verwachte_tekst
        tekstdelen = [r for r in xml.findall('.//w:r', ns) if r.find('w:t', ns) is not None]
        stap = {'naam': titel, 'vullingen': vullingen, 'tekstExact': werkelijk == verwachte_tekst}
        rapport['stappen'].append(stap)
        assert werkelijk == verwachte_tekst, stap
        assert vullingen == ([verwacht]*len(tekstdelen) if verwacht else []), stap
        print(titel, vullingen, flush=True)
        return bytes_

    async def kies(p, venster, kolom, rij, verwacht):
        await p.ev("window.kleurEvents=[];window.kleurLuisteraar??=(e)=>{if(e.target.type==='color')kleurEvents.push({soort:e.type,kleur:e.target.value,native:e.isTrusted})};for(let s of ['input','change'])document.addEventListener(s,kleurLuisteraar,true)")
        pos = await p.ev('(()=>{let e=Array.from(document.querySelectorAll(".ribbon-kleur input")).find(e=>e.getBoundingClientRect().width>0),r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()')
        subprocess.run(['xdotool', 'mousemove', '--window', str(venster.id), str(pos['x']), str(pos['y']), 'click', '1'], check=True)
        kiezer = await zoekvenster(lambda n: n == 'Select Color')
        g = kiezer.get_geometry()
        scherm('kiezer-'+verwacht)
        # Ubuntu 22.04 en de lokale GTK3-omgeving hebben dezelfde kleurcellen,
        # maar verschillen twee pixels in de ondermarge. Alleen gemeten vormen
        # toelaten; controleer de kleur onder de muis vóór de echte klik.
        assert g.width == 488 and g.height in (301, 303), f'GTK-palet wijkt af: {g.width}×{g.height}; coördinaten niet toepassen'
        x, y = 36+52*kolom, 28+34*rij
        raw = kiezer.get_image(0, 0, g.width, g.height, X.ZPixmap, 0xffffffff)
        palet = Image.frombytes('RGB', (g.width, g.height), raw.data, 'raw', 'BGRX')
        pixel = palet.getpixel((x, y))
        rgb = tuple(bytes.fromhex(verwacht))
        rapport['paletten'].append({'keuze': verwacht, 'breedte': g.width, 'hoogte': g.height, 'pixel': pixel, 'verwacht': rgb})
        assert pixel == rgb, 'Het gemeten kleurvlak bevat niet de verwachte kleur; niet klikken'
        subprocess.run(['xdotool', 'mousemove', '--window', str(kiezer.id), str(x), str(y), 'click', '1'], check=True)
        await asyncio.sleep(.5)
        subprocess.run(['xdotool', 'mousemove', '--window', str(kiezer.id), str(g.width-50), str(g.height-24), 'click', '1'], check=True)
        await asyncio.sleep(1)
        events = await p.ev('kleurEvents')
        rapport['kleurgebeurtenissen'].append({'keuze': verwacht, 'gebeurtenissen': events})
        # Bewaar eerst het tegenbewijs als de kleur verkeerd terugkoppelt.
        await controle(p, 'keuze-'+verwacht, verwacht)
        assert 1 <= len(events) <= 4 and all(e['kleur'] == '#'+verwacht and e['native'] for e in events), events

    try:
        venster = await start(bron)
        print('Eigen appvenster gereed', flush=True)
        async with Inspector(http) as p:
            print('Eigen inspectieverbinding gereed', flush=True)
            await gereed(p)
            print('Document gereed', flush=True)
            await controle(p, 'begin', None)
            await kies(p, venster, 2, 2, 'f6d32d')
            await p.run('await proefApi().commands.execute("undo",null);return true;')
            await controle(p, 'ongedaan', None)
            await p.run('await proefApi().commands.execute("redo",null);return true;')
            await controle(p, 'opnieuw', 'f6d32d')
            await kies(p, venster, 0, 0, '99c1f1')
            await p.ev('proefApi().getEditorRef().focus()')
            subprocess.run(['xdotool', 'key', '--clearmodifiers', 'ctrl+End'], check=True)
            subprocess.run(['xdotool', 'type', '--clearmodifiers', 'X'], check=True)
            await asyncio.sleep(.3)
            bewaard = await controle(p, 'nieuw-getypte-tekst', '99c1f1', tekst+'X')
        stop()
        heropen = a.uitvoer/'Bewaarde markeerkleur.docx'
        heropen.write_bytes(bewaard)
        await start(heropen)
        async with Inspector(http) as p:
            print('Eigen inspectieverbinding gereed', flush=True)
            await gereed(p)
            print('Document gereed', flush=True)
            await controle(p, 'nieuw-native-proces', '99c1f1', tekst+'X')
            fouten = await p.ev('Array.from(document.querySelectorAll(".office-melding[data-toon=fout]")).map(e=>e.innerText)')
            assert fouten == [], fouten
            rapport['foutmeldingen'] = fouten
            await p.ev('proefApi().getEditorRef().focus()')
            subprocess.run(['xdotool', 'key', '--clearmodifiers', 'Right'], check=True)
            await asyncio.sleep(.3)
            scherm('heropend')
        rapport['geslaagd'] = True
    except Exception as fout:
        rapport['fout'] = repr(fout)
        scherm('afgekeurd')
        raise
    finally:
        stop()
        (a.uitvoer/'rapport.json').write_text(json.dumps(rapport, ensure_ascii=False, indent=2)+'\n')
        d.close()
        log.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
