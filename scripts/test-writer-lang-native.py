#!/usr/bin/env python3
"""Linux/WebKit: 500 pagina’s typen, selecteren, geschiedenis, bewaren en heropenen."""
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
        tmp = tempfile.mkdtemp(prefix='office-liniaalproef-')
        # Een portal kan zijn tijdelijke FUSE-map pas na sessie-einde loslaten.
        opruimen.callback(shutil.rmtree, tmp, ignore_errors=True)
        omgeving = os.environ.copy()
        for naam in ['DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'DBUS_STARTER_ADDRESS', 'DBUS_STARTER_BUS_TYPE', 'GNOME_KEYRING_CONTROL', 'SSH_AUTH_SOCK', 'SESSION_MANAGER', 'WEBKIT_DISABLE_COMPOSITING_MODE']:
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
    bron = a.uitvoer/'Prestatieproef.docx'
    origineel = [f'Pagina {i+1}. '+'Een gewone alinea met woorden en spaties. '*8 for i in range(500)]
    alinea_xml = ''.join('<w:p>'+('<w:pPr><w:pageBreakBefore/></w:pPr>' if i else '')+'<w:r><w:t xml:space="preserve">'+tekst+'</w:t></w:r></w:p>' for i, tekst in enumerate(origineel))
    with ZipFile(repo/'public/templates/nieuw.docx') as z, ZipFile(bron, 'w') as uit:
        for info in z.infolist():
            inhoud = z.read(info.filename)
            if info.filename == 'word/document.xml':
                xml = inhoud.decode()
                sectie = re.search(r'<w:sectPr(?:\s[^>]*)?>[\s\S]*?</w:sectPr>|<w:sectPr\b[^>]*/>', xml)
                assert sectie, 'Vaste proefbron mist haar sectie'
                xml, aantal = re.subn(r'<w:body>[\s\S]*?</w:body>', '<w:body>'+alinea_xml+sectie.group(0)+'</w:body>', xml, count=1)
                assert aantal == 1
                inhoud = xml.encode()
            # Behoud de metadata van de vaste bron; geen klokafhankelijke ZIP.
            uit.writestr(info, inhoud)
    cfg = Path(os.environ['XDG_CONFIG_HOME'])/'org.openaec.office-studio'
    cfg.mkdir(parents=True)
    (cfg/'voorkeuren.json').write_text(json.dumps({'taal': 'en', 'thema': 'forge', 'updates': {'automatisch': False, 'kanaal': 'ontwikkel'}}))
    subprocess.run(['dbus-update-activation-environment', 'DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME'], check=True)
    d = display.Display()
    log = (a.uitvoer/'programma.log').open('w')
    programma = venster = None
    rapport = {'geslaagd': False, 'versie': a.versie, 'programma_sha256': hashlib.sha256(a.programma.read_bytes()).hexdigest(), 'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'bron_begin_sha256': hashlib.sha256(bron.read_bytes()).hexdigest(), 'stappen': [], 'invoerinterval_ms': 20, 'vaste_nawacht_ms': 2000, 'grenzen': ['Eén gegenereerde 500-paginabron, normale compositor, alleen een lichte teller om getBoundingClientRect. Geen algemene prestatie-, IME-, enorme-plak- of platformacceptatie.']}

    async def toets(p, *toetsen):
        vanaf = await p.ev('window._toetsenProef.length')
        subprocess.run(['xdotool', 'key', '--clearmodifiers', *toetsen], check=True)
        laatste = toetsen[-1].split('+')[-1].lower()
        laatste = {'left': 'arrowleft', 'right': 'arrowright'}.get(laatste, laatste)
        # XSendEvent gereed betekent nog niet dat WebKit de toets heeft verwerkt.
        # Wacht op de echte keyup vóór de enginewachtrij wordt geleegd.
        await p.run('let einde=performance.now()+15000;while(!_toetsenProef.slice('+str(vanaf)+').some(e=>e.key==='+json.dumps(laatste)+')){if(performance.now()>einde)throw Error("Laatste native toets niet ontvangen");await new Promise(r=>setTimeout(r,50))}await proefApi().flushPendingInput();return true;')

    def stop():
        if programma and programma.poll() is None:
            os.killpg(programma.pid, signal.SIGTERM)
            try: programma.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(programma.pid, signal.SIGKILL); programma.wait()

    def beeld(naam):
        g = venster.get_geometry()
        raw = venster.get_image(0, 0, g.width, g.height, X.ZPixmap, 0xffffffff)
        Image.frombytes('RGB', (g.width, g.height), raw.data, 'raw', 'BGRX').save(a.uitvoer/(naam+'.png'))

    def samenvatting(teksten):
        return {'alinea_aantal': len(teksten), 'tekst_sha256': hashlib.sha256(json.dumps(teksten, ensure_ascii=False).encode()).hexdigest(), 'laatste_alinea': teksten[-1]}

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
        await p.run('''window.proefApi=()=>{const el=document.querySelector('.office-tabpaneel:not([hidden]) .office-tekst');if(!el)return null;for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let s=f.memoizedState,i=0;s&&i<200;i++,s=s.next){const v=s.memoizedState?.current;if(v?.getEditorRef&&v.commands)return v}return null};let einde=performance.now()+60000;while(proefApi()?.getTotalPages()!==500||!proefApi().getEditorRef()?.getYrsSession()){if(performance.now()>einde)throw Error('500 pagina’s niet gereed');await new Promise(r=>setTimeout(r,100))}await proefApi().flushPendingInput();return true;''')
        werkelijk = await p.run("return await window.__TAURI_INTERNALS__.invoke('plugin:app|version');")
        assert werkelijk == a.versie, (werkelijk, a.versie)
        await p.ev("window._toetsenProef=[];window.addEventListener('keyup',e=>_toetsenProef.push({key:e.key.toLowerCase(),code:e.code,target:e.target?.className}),true);true")

    async def bronstand(p):
        return await p.run("await proefApi().flushPendingInput();return proefApi().getEditorRef().getYrsSession().paragraphs('body').map(p=>p.text);")

    async def controle(p, naam, verwacht):
        teksten = await bronstand(p)
        stap = {'naam': naam, **samenvatting(teksten), 'exact': teksten == verwacht}
        rapport['stappen'].append(stap)
        assert stap['exact'], stap
        print(naam, 'geslaagd', flush=True)
        return teksten

    try:
        await start()
        async with Inspector(int(os.environ['OFFICE_PROEF_HTTP'])) as p:
            await gereed(p)
            await controle(p, 'beginbron', origineel)
            await p.run("let e=proefApi().getEditorRef(),a=e.getYrsSession().paragraphs('body').at(-1);e.setSelection(e.yrsLocToDisplayPosition({story:'body',paraId:a.paraId,offset:a.text.length}));proefApi().scrollToPage(500);proefApi().focus();await proefApi().flushPendingInput();return true;")
            await asyncio.sleep(3)
            await p.ev("window._rectProef={calls:0,classes:Object.create(null)};window._rectOud=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(...args){_rectProef.calls++;const k=this.getAttribute('class')||this.tagName;_rectProef.classes[k]=(_rectProef.classes[k]||0)+1;return _rectOud.apply(this,args)};window._frameProef={v:[],last:performance.now(),stop:false};window._frameTik=nu=>{if(_frameProef.stop)return;_frameProef.v.push(nu-_frameProef.last);_frameProef.last=nu;requestAnimationFrame(_frameTik)};requestAnimationFrame(_frameTik);true")
            begin = time.monotonic()
            subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '20', ' Een proefzin.'], check=True)
            await p.run("await proefApi().flushPendingInput();let einde=performance.now()+90000;while(!proefApi().getEditorRef().getYrsSession().paragraphs('body').at(-1).text.endsWith(' Een proefzin.')||!document.querySelector('.spelling-golf')){if(performance.now()>einde)throw Error('Bron/golflijnen niet gereed');await new Promise(r=>setTimeout(r,150))}return true;", t=100)
            rapport['invoer_tot_bron_en_golven_ms'] = round((time.monotonic()-begin)*1000)
            tussenpozen = await p.ev('(()=>{_frameProef.stop=true;return _frameProef.v})()')
            volgorde = sorted(tussenpozen)
            rapport['frame_tussenpozen_ms'] = {'aantal': len(volgorde), 'maximum': volgorde[-1] if volgorde else None, 'p95': volgorde[min(len(volgorde)-1, int(len(volgorde)*.95))] if volgorde else None, 'reeks': tussenpozen, 'omvang': 'requestAnimationFrame tijdens invoer en bron-/golflijngereedheid; vóór de vaste nawacht. Geen fysieke beeldscherm-FPS.'}
            await asyncio.sleep(2)
            rapport['invoermeting'] = await p.ev("(()=>{Element.prototype.getBoundingClientRect=_rectOud;return{..._rectProef,golven:document.querySelectorAll('.spelling-golf').length,paginas:proefApi().getTotalPages()}})()")
            rapport['invoermeting']['tot_bron_en_golven_ms_inclusief_nawacht'] = round((time.monotonic()-begin)*1000)
            getypt = list(origineel); getypt[-1] += ' Een proefzin.'
            await controle(p, 'getypte_bron', getypt); beeld('getypt-pagina-500')
            await toets(p, 'ctrl+shift+Left', 'BackSpace')
            verwijderd = await bronstand(p)
            rapport['selectie_backspace'] = {**samenvatting(verwijderd), 'eerste_verschil': next((i for i, paar in enumerate(zip(verwijderd, getypt)) if paar[0] != paar[1]), None), 'native_toetsen': await p.ev('_toetsenProef')}
            assert verwijderd[:-1] == getypt[:-1] and verwijderd[-1] != getypt[-1] and getypt[-1].startswith(verwijderd[-1]), 'Selectie/Backspace verandert niet uitsluitend de laatste tekst'
            rapport['stappen'].append({'naam': 'selectie_en_backspace', **samenvatting(verwijderd), 'exact': True})
            await toets(p, 'ctrl+z'); await controle(p, 'undo', getypt)
            await toets(p, 'ctrl+y'); await controle(p, 'redo', verwijderd)
            await toets(p, 'ctrl+z'); await controle(p, 'hersteld_voor_bewaren', getypt)
            voor = bron.stat().st_mtime_ns
            await toets(p, 'ctrl+s')
            einde = time.monotonic()+60
            while bron.stat().st_mtime_ns == voor:
                assert time.monotonic() < einde, 'Werkelijke bewaaractie ontbreekt'
                await asyncio.sleep(.1)
            with ZipFile(bron) as z:
                xml = ET.fromstring(z.read('word/document.xml'))
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            teksten = [''.join(e.text or '' for e in alinea.findall('.//w:t', ns)) for alinea in xml.findall('.//w:body/w:p', ns)]
            assert teksten == getypt, 'Onafhankelijke DOCX-teruglezing wijkt af'
            rapport['stappen'].append({'naam': 'native_bewaaractie_onafhankelijk', **samenvatting(teksten), 'exact': True})
        stop(); await start()
        async with Inspector(int(os.environ['OFFICE_PROEF_HTTP'])) as p:
            await gereed(p)
            await controle(p, 'nieuw_proces_heropend', getypt)
        rapport['bron_eind_sha256'] = hashlib.sha256(bron.read_bytes()).hexdigest()
        rapport['geslaagd'] = True
    except Exception as fout:
        rapport['fout'] = repr(fout)
        if venster and programma and programma.poll() is None:
            try: beeld('afgekeurd')
            except Exception as beeldfout: rapport['beeldfout'] = repr(beeldfout)
        raise
    finally:
        stop(); d.close(); log.close()
        (a.uitvoer/'rapport.json').write_text(json.dumps(rapport, ensure_ascii=False, indent=2)+'\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
