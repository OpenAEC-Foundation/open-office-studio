#!/usr/bin/env python3
"""Eigen queryfout in de echte WebView: foutmelding, bron behouden, bewaren/heropenen.

De proef wekt bewust één RuntimeError op aan de querygrens. Zij beschadigt geen
Wasm-geheugen en bewijst geen herstel van de oorspronkelijke geheugentrappen.
"""
import asyncio
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
from urllib.request import urlopen
from xml.etree import ElementTree as ET
from zipfile import ZipFile

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / 'scripts'))
spec = importlib.util.spec_from_file_location('basis', REPO / 'scripts/test-writer-lang-native.py')
basis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(basis)
MARKERING = 'OpenAEC eigen rendererfoutproef'
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def teksten(pad):
    with ZipFile(pad) as z:
        root = ET.fromstring(z.read('word/document.xml'))
    return [''.join(p.itertext()) for p in root.find(W+'body').findall(W+'p')]


async def proef(a):
    from Xlib import X, display
    from PIL import Image, ImageChops
    from gui.webkit_inspector import Inspector
    a.uitvoer.mkdir(parents=True, exist_ok=False)
    bron = a.uitvoer / 'Rendererproef.docx'
    verwacht = [f'Oorspronkelijke proefalinea {n+1}.' for n in range(64)]
    inhoud = ''.join('<w:p>'+('<w:pPr><w:pageBreakBefore/></w:pPr>' if n else '')+'<w:r><w:t>'+t+'</w:t></w:r></w:p>' for n, t in enumerate(verwacht))
    with ZipFile(REPO / 'public/templates/nieuw.docx') as z, ZipFile(bron, 'w') as uit:
        for info in z.infolist():
            data = z.read(info.filename)
            if info.filename == 'word/document.xml':
                xml = data.decode()
                sectie = re.search(r'<w:sectPr(?:\s[^>]*)?>[\s\S]*?</w:sectPr>|<w:sectPr\b[^>]*/>', xml)
                assert sectie
                xml, aantal = re.subn(r'<w:body>[\s\S]*?</w:body>', '<w:body>'+inhoud+sectie.group(0)+'</w:body>', xml, count=1)
                assert aantal == 1
                data = xml.encode()
            uit.writestr(info, data)
    cfg = Path(os.environ['XDG_CONFIG_HOME']) / 'org.openaec.office-studio'
    cfg.mkdir(parents=True)
    (cfg / 'voorkeuren.json').write_text(json.dumps({'taal': 'en', 'thema': 'forge', 'updates': {'automatisch': False}}))
    subprocess.run(['dbus-update-activation-environment', 'DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME'], check=True)
    d = display.Display()
    log = (a.uitvoer / 'programma.log').open('w')
    app = venster = None
    r = {'geslaagd': False, 'versie': a.versie, 'programma_sha256': hashlib.sha256(a.programma.read_bytes()).hexdigest(),
         'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'stappen': [], 'grens': __doc__}

    def stop():
        if app and app.poll() is None:
            os.killpg(app.pid, signal.SIGTERM)
            try:
                app.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(app.pid, signal.SIGKILL)
                app.wait(timeout=10)

    def beeld(naam):
        g = venster.get_geometry()
        raw = venster.get_image(0, 0, g.width, g.height, X.ZPixmap, 0xffffffff)
        Image.frombytes('RGB', (g.width, g.height), raw.data, 'raw', 'BGRX').save(a.uitvoer / (naam+'.png'))

    async def start():
        nonlocal app, venster
        app = subprocess.Popen([str(a.programma), str(bron)], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        einde = time.monotonic()+60
        while time.monotonic() < einde:
            assert app.poll() is None, 'Eigen proefprogramma onverwacht afgesloten'
            for v in d.screen().root.query_tree().children:
                pid = v.get_full_property(d.intern_atom('_NET_WM_PID'), X.AnyPropertyType)
                if pid is not None and int(pid.value[0]) == app.pid and v.get_attributes().map_state == X.IsViewable:
                    venster = v
                    v.configure(x=0, y=0, width=1440, height=1000)
                    v.set_input_focus(X.RevertToParent, X.CurrentTime)
                    d.sync()
                    try:
                        with urlopen(f"http://127.0.0.1:{os.environ['OFFICE_PROEF_HTTP']}/", timeout=2) as antwoord:
                            if b'/socket/' in antwoord.read():
                                await asyncio.sleep(12)
                                return
                    except OSError:
                        pass
            await asyncio.sleep(.1)
        raise TimeoutError('Eigen Writer-venster niet gevonden')

    async def gereed(p):
        await p.run('''window.api=()=>{const el=document.querySelector('.office-tabpaneel:not([hidden]) .office-tekst');if(!el)return null;for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let s=f.memoizedState,n=0;s&&n<1000;n++,s=s.next){const v=s.memoizedState?.current;if(v?.getEditorRef&&v.commands)return v}return null};
          window.queryStand=()=>{const el=document.querySelector('.office-tabpaneel:not([hidden]) .office-tekst');if(!el)return null;for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let s=f.memoizedState,n=0;s&&n<1000;n++,s=s.next){const v=s.memoizedState;if(v?.queries?.sourceState&&typeof v.ready==='boolean'&&'engine'in v)return v;const frame=v?.current;if(frame?.queries?.sourceState&&frame.displayList){const bron=frame.queries.sourceState();return{queries:frame.queries,engine:api()?.getEditorRef()?.getYrsSession(),ready:frame.queries.isReady(),error:bron.status==='error'?bron.error:null}}}return null};
          const einde=performance.now()+60000;while(!api()?.getEditorRef()?.getYrsSession()||api().getTotalPages()!==64||!queryStand()?.ready){if(performance.now()>einde)throw Error('Writer/querybron niet gereed');await new Promise(r=>setTimeout(r,100))}await api().flushPendingInput();return true;''')
        assert await p.run("return await window.__TAURI_INTERNALS__.invoke('plugin:app|version');") == a.versie
        await p.begin_foutbewaking()

    async def bronstand(p):
        return await p.ev("api().getEditorRef().getYrsSession().paragraphs('body').map(p=>p.text)")

    async def bewaar(p):
        voor = bron.stat().st_mtime_ns
        subprocess.run(['xdotool', 'key', '--clearmodifiers', 'ctrl+s'], check=True)
        einde = time.monotonic()+45
        while bron.stat().st_mtime_ns == voor:
            assert app.poll() is None and time.monotonic() < einde, 'Bewaren na queryfout niet voltooid'
            await asyncio.sleep(.1)
        assert teksten(bron) == verwacht, 'Onafhankelijke DOCX-teruglezing wijkt af'
        await p.run("const einde=performance.now()+30000;while(document.querySelector('.office-tab.is-actief.is-gewijzigd')){if(performance.now()>einde)throw Error('Bewaarstatus blijft gewijzigd');await new Promise(r=>setTimeout(r,50))}return true;")

    try:
        await start()
        async with Inspector(int(os.environ['OFFICE_PROEF_HTTP'])) as p:
            await gereed(p)
            assert await bronstand(p) == verwacht
            await p.run("const e=api().getEditorRef(),s=e.getYrsSession(),b=s.paragraphs('body')[0];window._rendererSessie=s;e.setSelection(e.yrsLocToDisplayPosition({story:'body',paraId:b.paraId,offset:b.text.length}));api().focus();window._rendererToetsen=[];window.addEventListener('keyup',e=>_rendererToetsen.push(e.key),true);return true;")
            toevoeging = ' Eigen invoer.'
            subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '20', toevoeging], check=True)
            verwacht[0] += toevoeging
            await p.run("const einde=performance.now()+30000;while(!_rendererToetsen.includes('.')){if(performance.now()>einde)throw Error('Native invoer ontbreekt');await new Promise(r=>setTimeout(r,25))}await api().flushPendingInput();window._selectieVoorFout=_rendererSessie.selection();return true;")
            assert await bronstand(p) == verwacht
            r['stappen'].append('64 bronalinea’s en echte onbewaarde toetsinvoer exact')
            rechthoek = await p.ev("(()=>{const p=document.querySelector('.office-tekst .canvas-page');if(!p)throw Error('Oorspronkelijke pagina ontbreekt');const r=p.getBoundingClientRect();return[Math.ceil(r.left+20),Math.ceil(r.top+20),Math.floor(r.left+Math.min(r.width-20,620)),Math.floor(r.top+Math.min(r.height-20,520))]})()")
            beeld('voor-queryfout')
            r['injectie'] = await p.run('''const stand=queryStand(),q=stand.queries,e=stand.engine;const marker='''+json.dumps(MARKERING)+''';let route=null;
              const oud=JSON.stringify;try{JSON.stringify=function(v,...a){if(v?.keep===true&&Array.isArray(v.replace)){route='paginavervanging';throw new WebAssembly.RuntimeError(marker)}return oud.call(this,v,...a)};q.hitTestRegions(q.pageCount()-1,1,1)}finally{JSON.stringify=oud}
              if(q.sourceState().status!=='error'&&typeof e?.displayHitTestRegionsJson==='function'){const oud=e.displayHitTestRegionsJson;try{e.displayHitTestRegionsJson=()=>{route='residentquery';throw new WebAssembly.RuntimeError(marker)};q.hitTestRegions(q.pageCount()-1,1,1)}finally{e.displayHitTestRegionsJson=oud}}
              if(q.sourceState().status!=='error'){q.dispose();const oud=JSON.stringify;try{JSON.stringify=function(v,...a){if(v===q.displayList){route='JSON-query na handlevrijgave';throw new WebAssembly.RuntimeError(marker)}return oud.call(this,v,...a)};q.hitTestRegions(q.pageCount()-1,1,1)}finally{JSON.stringify=oud}}
              if(!route||q.sourceState().status!=='error')throw Error('Eigen queryfout niet opgewekt');
              return{route,bronstatus:q.sourceState().status,gereed:q.isReady(),paginaAantal:q.pageCount()};''')
            await p.run("const einde=performance.now()+15000;while(queryStand()?.ready||queryStand()?.error?.message!=="+json.dumps(MARKERING)+"){if(performance.now()>einde)throw Error('Queryfout bereikt interface niet');await new Promise(r=>setTimeout(r,25))}while(!Array.from(document.querySelectorAll('.office-melding[data-toon=\"fout\"]')).some(e=>e.textContent.includes("+json.dumps(MARKERING)+"))){if(performance.now()>einde)throw Error('Zichtbare foutmelding ontbreekt');await new Promise(r=>setTimeout(r,25))}return true;")
            r['zichtbare_foutmeldingen'] = await p.ev("Array.from(document.querySelectorAll('.office-melding[data-toon=\"fout\"]')).filter(e=>e.textContent.includes("+json.dumps(MARKERING)+")).length")
            assert r['zichtbare_foutmeldingen'] == 1
            assert r['injectie']['gereed'] is False and r['injectie']['paginaAantal'] == 64
            assert await p.ev("!!document.querySelector('.office-tekst .canvas-page')&&!document.querySelector('[data-testid=\"canvas-renderer-error\"]')"), 'Bestaande pagina verdwijnt achter het algemene foutscherm'
            assert await p.ev("api().getEditorRef().getYrsSession()===_rendererSessie&&JSON.stringify(_rendererSessie.selection())===JSON.stringify(_selectieVoorFout)")
            assert await bronstand(p) == verwacht
            r['stappen'].append('Queryfout zichtbaar; dezelfde bron, selectie en alle onbewaarde tekst behouden')
            beeld('queryfout-zichtbaar')
            voor = Image.open(a.uitvoer/'voor-queryfout.png').convert('RGB').crop(rechthoek)
            na = Image.open(a.uitvoer/'queryfout-zichtbaar.png').convert('RGB').crop(rechthoek)
            verschil = ImageChops.difference(voor, na)
            r['paginabeeld'] = {'rechthoek': rechthoek, 'verschillende_pixels': sum(pixel != (0,0,0) for pixel in verschil.getdata()), 'grens': 'Eén bestaand viewportdeel buiten de foutmelding; cursor/spelling kunnen verschillen. Geen volledige pixelpariteit.'}
            assert r['paginabeeld']['verschillende_pixels'] < 2000, 'Het bestaande paginabeeld is vervangen of grotendeels veranderd'
            await bewaar(p)
            assert await bronstand(p) == verwacht
            r['stappen'].append('Na de queryfout fysiek opgeslagen; alle 64 alinea’s onafhankelijk teruggelezen')
            fouten = await p.fouten()
            assert fouten['gui'] and all(MARKERING in f['tekst'] for f in fouten['gui']), fouten
            assert len(fouten['console']) == 1 and all(MARKERING in m.get('text','') or any(MARKERING in x.get('description','') for x in m.get('parameters',[])) for m in fouten['console']), fouten
            r['verwachte_fouten'] = fouten
        stop()
        await start()
        async with Inspector(int(os.environ['OFFICE_PROEF_HTTP'])) as p:
            await gereed(p)
            assert await bronstand(p) == verwacht
            await p.run("const e=api().getEditorRef(),s=e.getYrsSession(),b=s.paragraphs('body')[0];e.setSelection(e.yrsLocToDisplayPosition({story:'body',paraId:b.paraId,offset:b.text.length}));api().focus();return true;")
            subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '20', ' Na heropenen.'], check=True)
            verwacht[0] += ' Na heropenen.'
            await p.run("const einde=performance.now()+30000;while(api().getEditorRef().getYrsSession().paragraphs('body')[0].text!=="+json.dumps(verwacht[0])+"){if(performance.now()>einde)throw Error('Vervolginvoer na heropenen ontbreekt');await new Promise(r=>setTimeout(r,50))}await api().flushPendingInput();return true;")
            await bewaar(p)
            r['fouten_na_heropenen'] = await p.fouten()
            assert not any(r['fouten_na_heropenen'].values())
            r['stappen'].append('Nieuw eigen proces heropent, bewerkt en bewaart dezelfde DOCX zonder fouten')
            beeld('heropend-en-bewerkt')
        r['geslaagd'] = True
    except Exception as fout:
        r['fout'] = repr(fout)
        if 'p' in locals():
            r['console_bij_afkeuring'] = p.consoleberichten
        if venster and app and app.poll() is None:
            try:
                beeld('afgekeurd')
            except Exception:
                pass
        raise
    finally:
        stop()
        d.close()
        log.close()
        (a.uitvoer/'rapport.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
    return 0


basis.proef = proef
basis.__file__ = str(Path(__file__).resolve())
if __name__ == '__main__':
    raise SystemExit(basis.main())
