#!/usr/bin/env python3
"""Linux/WebKit: extern en intern plakken, invoegpositie, bewaren en heropenen (#126)."""
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
        tmp = tempfile.mkdtemp(prefix='office-klembordproef-')
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
        omgeving.update(GDK_BACKEND='x11', LC_ALL='C.UTF-8', WEBKIT_DISABLE_DMABUF_RENDERER='1', WEBKIT_INSPECTOR_HTTP_SERVER=f'127.0.0.1:{http}', WEBKIT_INSPECTOR_SERVER=f'127.0.0.1:{inspectie}', OFFICE_PROEF_HTTP=str(http))
        return subprocess.call(['dbus-run-session', '--', 'xvfb-run', '-a', '-s', '-screen 0 1600x1100x24 -nolisten tcp', sys.executable, str(Path(__file__).resolve()), '--binnen', '--programma', str(a.programma), '--uitvoer', str(a.uitvoer), '--versie', a.versie], env=omgeving)


async def proef(a):
    from Xlib import X, display
    from PIL import Image
    from gui.webkit_inspector import Inspector
    a.uitvoer.mkdir(parents=True, exist_ok=False)
    repo = Path(__file__).resolve().parents[1]
    bron = a.uitvoer/'Klembordproef.docx'
    with ZipFile(repo/'public/templates/nieuw.docx') as z, ZipFile(bron, 'w', ZIP_DEFLATED) as uit:
        for naam in z.namelist():
            inhoud = z.read(naam)
            if naam == 'word/document.xml':
                inhoud, aantal = re.subn(r'<w:p(?:\s[^>]*)?(?:/>|>[\s\S]*?</w:p>)', '<w:p><w:r><w:t>Voor | na.</w:t></w:r></w:p>', inhoud.decode(), count=1)
                assert aantal == 1
                inhoud = inhoud.encode()
            uit.writestr(naam, inhoud)
    cfg = Path(os.environ['XDG_CONFIG_HOME'])/'org.openaec.office-studio'
    cfg.mkdir(parents=True)
    (cfg/'voorkeuren.json').write_text(json.dumps({'taal': 'en', 'thema': 'forge', 'updates': {'automatisch': False, 'kanaal': 'ontwikkel'}}))
    subprocess.run(['dbus-update-activation-environment', 'DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME'], check=True)
    d = display.Display()
    log = (a.uitvoer/'programma.log').open('w')
    programma = extern = venster = None
    rapport = {'geslaagd': False, 'versie': a.versie, 'programma_sha256': hashlib.sha256(a.programma.read_bytes()).hexdigest(), 'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'stappen': [], 'grenzen': ['Gerichte Linux/X11-proef met een aparte GTK-klembordbron; geen fysieke platform- of volledige klembordformaatacceptatie.']}

    def toets(*toetsen):
        subprocess.run(['xdotool', 'key', '--clearmodifiers', *toetsen], check=True)

    def stop():
        if programma and programma.poll() is None:
            os.killpg(programma.pid, signal.SIGTERM)
            try: programma.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(programma.pid, signal.SIGKILL); programma.wait()

    def klembord(tekst):
        nonlocal extern
        if extern:
            extern.terminate(); extern.wait(timeout=5)
        # Dit andere proces bezit het echte X11-klembord; geen DOM- of engine-injectie.
        code = "import gi;gi.require_version('Gtk','3.0');from gi.repository import Gtk,Gdk;c=Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD);c.set_text("+repr(tekst)+",-1);print('klaar',flush=True);Gtk.main()"
        extern = subprocess.Popen(['/usr/bin/python3', '-c', code], stdout=subprocess.PIPE, stderr=log, text=True)
        assert extern.stdout.readline().strip() == 'klaar', 'Externe klembordbron niet gereed'

    def beeld(naam):
        g = venster.get_geometry()
        raw = venster.get_image(0, 0, g.width, g.height, X.ZPixmap, 0xffffffff)
        Image.frombytes('RGB', (g.width, g.height), raw.data, 'raw', 'BGRX').save(a.uitvoer/(naam+'.png'))

    def teksten(bytes_):
        with ZipFile(io.BytesIO(bytes_)) as z:
            xml = ET.fromstring(z.read('word/document.xml'))
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        return [''.join(e.text or '' for e in p.findall('.//w:t', ns)) for p in xml.findall('.//w:body/w:p', ns)]

    async def start():
        nonlocal programma, venster
        programma = subprocess.Popen([str(a.programma), str(bron)], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        einde = time.monotonic()+60
        while time.monotonic() < einde:
            assert programma.poll() is None, 'Eigen proefprogramma onverwacht afgesloten'
            for v in d.screen().root.query_tree().children:
                prop = v.get_full_property(d.intern_atom('_NET_WM_NAME'), X.AnyPropertyType)
                naam = prop.value.decode(errors='replace') if prop and isinstance(prop.value, bytes) else ''
                if v.get_attributes().map_state == X.IsViewable and 'Office Studio' in naam:
                    venster = v
                    v.configure(x=0, y=0, width=1440, height=1000); v.set_input_focus(X.RevertToParent, X.CurrentTime); d.sync()
                    await asyncio.sleep(12)
                    return
            await asyncio.sleep(.1)
        raise TimeoutError('Eigen proefvenster niet gevonden')

    async def gereed(p):
        await p.run('''window.proefApi=()=>{const el=document.querySelector('.office-tabpaneel:not([hidden]) .office-tekst');if(!el)return null;for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let s=f.memoizedState,i=0;s&&i<200;i++,s=s.next){const v=s.memoizedState?.current;if(v?.getEditorRef&&v.commands)return v}return null};let einde=performance.now()+60000;while(!proefApi()?.getEditorRef()?.getLayout()?.pages.length){if(performance.now()>einde)throw Error('Editor niet gereed');await new Promise(r=>setTimeout(r,100))}return true;''')
        werkelijk = await p.run("return await window.__TAURI_INTERNALS__.invoke('plugin:app|version');")
        assert werkelijk == a.versie, (werkelijk, a.versie)

    async def controle(p, naam, verwacht):
        bytes_ = bytes(await p.run('await proefApi().flushPendingInput();return Array.from(new Uint8Array(await proefApi().save()));'))
        (a.uitvoer/(naam+'.docx')).write_bytes(bytes_)
        werkelijk = teksten(bytes_)
        stap = {'naam': naam, 'verwacht': list(verwacht), 'werkelijk': werkelijk, 'geslaagd': werkelijk == verwacht}
        rapport['stappen'].append(stap); beeld(naam)
        assert stap['geslaagd'], stap
        print(naam, 'geslaagd', flush=True)

    async def lint(p):
        punt = await p.ev('(()=>{const e=Array.from(document.querySelectorAll("button")).find(e=>e.getAttribute("aria-label")==="Paste"&&e.getBoundingClientRect().width>0);if(!e)throw Error("Plakknop ontbreekt");const r=e.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()')
        subprocess.run(['xdotool', 'mousemove', '--window', str(venster.id), str(punt['x']), str(punt['y']), 'click', '1'], check=True)
        await asyncio.sleep(2)

    async def klik(p, selector):
        punt = await p.ev('(()=>{const e=document.querySelector('+json.dumps(selector)+');if(!e)throw Error("Bediening ontbreekt");const r=e.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()')
        subprocess.run(['xdotool', 'mousemove', '--window', str(venster.id), str(punt['x']), str(punt['y']), 'click', '1'], check=True)
        await asyncio.sleep(.3)

    try:
        await start()
        async with Inspector(int(os.environ['OFFICE_PROEF_HTTP'])) as p:
            await gereed(p)
            await p.run('proefApi().focus();return true;')
            toets('ctrl+Home', *(['Right']*5))
            klembord('Externe toetsenproef')
            toets('ctrl+v'); await asyncio.sleep(2)
            verwacht = ['Voor Externe toetsenproef| na.']
            await controle(p, 'extern-toets-met-invoegpositie', verwacht)

            klembord(' Lintproef Ω 🏠.')
            toets('ctrl+End'); await lint(p)
            verwacht[0] += ' Lintproef Ω 🏠.'
            await controle(p, 'extern-lint-met-unicode', verwacht)

            await p.run('proefApi().focus();return true;'); toets('ctrl+a', 'ctrl+c')
            await asyncio.sleep(.3); toets('ctrl+End'); await lint(p)
            verwacht[0] *= 2
            await controle(p, 'intern-lint', verwacht)

            await p.run('proefApi().focus();return true;'); toets('ctrl+a', 'ctrl+c')
            await asyncio.sleep(.3); toets('ctrl+End', 'ctrl+v'); await asyncio.sleep(2)
            verwacht[0] *= 2
            await controle(p, 'intern-toets', verwacht)

            klembord('Twee regels.\nVolgende regel.')
            toets('ctrl+End'); await lint(p)
            verwacht = [verwacht[0]+'Twee regels.', 'Volgende regel.']
            await controle(p, 'extern-lint-meerregelig', verwacht)
            voor = bron.stat().st_mtime_ns
            toets('ctrl+s')
            einde = time.monotonic()+60
            while bron.stat().st_mtime_ns == voor:
                assert time.monotonic() < einde, 'Werkelijke bewaaractie ontbreekt'
                await asyncio.sleep(.1)
            assert teksten(bron.read_bytes()) == verwacht, 'Native bewaarkopie wijkt af'
            rapport['stappen'].append({'naam': 'native-bewaaractie', 'geslaagd': True})
        stop(); await start()
        async with Inspector(int(os.environ['OFFICE_PROEF_HTTP'])) as p:
            await gereed(p)
            await controle(p, 'nieuw-proces-heropend', verwacht)
            oude_vensters = {v.id for v in d.screen().root.query_tree().children}
            await klik(p, '.office-venstermenu > button')
            await klik(p, '.office-venstermenu-nieuw')
        einde = time.monotonic()+60
        while time.monotonic() < einde:
            nieuwe = [v for v in d.screen().root.query_tree().children if v.id not in oude_vensters and v.get_attributes().map_state == X.IsViewable and 'Office Studio' in str(v.get_wm_name() or '')]
            if nieuwe:
                venster = nieuwe[0]
                venster.configure(x=0, y=0, width=1440, height=1000); venster.set_input_focus(X.RevertToParent, X.CurrentTime); d.sync()
                break
            await asyncio.sleep(.1)
        else:
            raise TimeoutError('Nieuw documentvenster ontbreekt')
        await asyncio.sleep(12)
        with urlopen(f'http://127.0.0.1:{os.environ["OFFICE_PROEF_HTTP"]}/', timeout=5) as antwoord:
            (a.uitvoer/'eigen-inspectievensters.html').write_bytes(antwoord.read())
        async with Inspector(int(os.environ['OFFICE_PROEF_HTTP']), pagina=1) as p:
            assert await p.ev('new URLSearchParams(location.search).get("venster")==="document"'), 'Inspectie is niet aan het nieuwe documentvenster verbonden'
            await klik(p, 'button.start-sjabloon.module-docx')
            await gereed(p)
            await p.run('proefApi().focus();proefApi().getEditorRef().selectAll();await proefApi().flushPendingInput();return true;')
            klembord('Nieuw venster: extern geplakt.')
            await lint(p)
            await controle(p, 'nieuw-venster-extern-lint', ['Nieuw venster: extern geplakt.'])
        rapport['bron_eind_sha256'] = hashlib.sha256(bron.read_bytes()).hexdigest()
        rapport['geslaagd'] = True
    except Exception as fout:
        rapport['fout'] = repr(fout)
        if venster and programma and programma.poll() is None:
            try: beeld('afgekeurd')
            except Exception as beeldfout: rapport['beeldfout'] = repr(beeldfout)
        raise
    finally:
        if extern:
            extern.terminate(); extern.wait(timeout=5)
        stop(); d.close(); log.close()
        (a.uitvoer/'rapport.json').write_text(json.dumps(rapport, ensure_ascii=False, indent=2)+'\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())


