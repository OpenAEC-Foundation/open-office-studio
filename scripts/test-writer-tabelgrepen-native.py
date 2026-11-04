#!/usr/bin/env python3
"""Echte tabelrand slepen, Undo/Redo en DOCX bewaren/heropenen in een eigen profiel."""
import asyncio
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
from xml.etree import ElementTree as ET
from zipfile import ZipFile

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / 'scripts'))
spec = importlib.util.spec_from_file_location('basis', REPO / 'scripts/test-writer-lang-native.py')
basis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(basis)


async def proef(a):
    from Xlib import X, display
    from PIL import Image
    from gui.webkit_inspector import Inspector
    a.uitvoer.mkdir(parents=True, exist_ok=False)
    bron = a.uitvoer / 'Ontwerpnotitie.docx'
    shutil.copyfile(REPO / 'docs/voorbeelden/Ontwerpnotitie.docx', bron)
    shutil.copyfile(bron, a.uitvoer / 'Tabelproef-begin.docx')
    cfg = Path(os.environ['XDG_CONFIG_HOME']) / 'org.openaec.office-studio'
    cfg.mkdir(parents=True)
    (cfg / 'voorkeuren.json').write_text(json.dumps({'taal': 'en', 'thema': 'forge', 'updates': {'automatisch': False}}))
    subprocess.run(['dbus-update-activation-environment', 'DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME'], check=True)
    d = display.Display()
    log = (a.uitvoer / 'programma.log').open('w')
    app = v = None
    r = {'geslaagd': False, 'versie': a.versie, 'programma_sha256': hashlib.sha256(a.programma.read_bytes()).hexdigest(),
         'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'bron_begin_sha256': hashlib.sha256(bron.read_bytes()).hexdigest(), 'stappen': [], 'grens': __doc__}

    def stop():
        if app and app.poll() is None:
            os.killpg(app.pid, signal.SIGTERM)
            try:
                app.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(app.pid, signal.SIGKILL)
                app.wait(timeout=10)

    def beeld(naam):
        g = v.get_geometry()
        raw = v.get_image(0, 0, g.width, g.height, X.ZPixmap, 0xffffffff)
        Image.frombytes('RGB', (g.width, g.height), raw.data, 'raw', 'BGRX').save(a.uitvoer / (naam+'.png'))

    async def start():
        nonlocal app, v
        app = subprocess.Popen([str(a.programma), str(bron)], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        eind = time.monotonic()+60
        while time.monotonic() < eind:
            assert app.poll() is None and time.monotonic() < eind, 'Eigen app onverwacht afgesloten'
            for kandidaat in d.screen().root.query_tree().children:
                pid = kandidaat.get_full_property(d.intern_atom('_NET_WM_PID'), X.AnyPropertyType)
                if pid is not None and int(pid.value[0]) == app.pid and kandidaat.get_attributes().map_state == X.IsViewable:
                    v = kandidaat
                    v.configure(x=0, y=0, width=1440, height=1000)
                    v.set_input_focus(X.RevertToParent, X.CurrentTime)
                    d.sync()
                    await asyncio.sleep(12)
                    return
            await asyncio.sleep(.1)
        raise TimeoutError('Eigen tabelproefvenster ontbreekt')

    async def gereed(p):
        await p.run('''window.api=()=>{const el=document.querySelector('.office-tabpaneel:not([hidden]) .office-tekst');if(!el)return null;for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let h=f.memoizedState,n=0;h&&n<1000;n++,h=h.next){const a=h.memoizedState?.current;if(a?.getEditorRef&&a.commands)return a}return null};
          const eind=performance.now()+60000;while(!api()?.getEditorRef()?.getYrsSession()){if(performance.now()>eind)throw Error('Eigen tabeldocument niet gereed');await new Promise(r=>setTimeout(r,100))}await api().flushPendingInput();
          window.tabelStand=()=>{const s=api().getEditorRef().getYrsSession();return{teksten:Object.fromEntries(s.storyIds().sort().map(id=>[id,s.paragraphs(id).map(p=>p.text)])),grids:s.storySegments('body').filter(p=>p.kind==='embed'&&p.embedKind==='table').map(p=>p.payload.grid)}};return true;''')
        assert await p.run("return await window.__TAURI_INTERNALS__.invoke('plugin:app|version');") == a.versie
        await p.run('api().focus();return true;')
        await p.begin_foutbewaking()
        assert not any((await p.fouten()).values())

    async def stand(p):
        return await p.run('await api().flushPendingInput();return tabelStand();')

    async def wacht_grid(p, verwacht):
        return await p.run('const verwacht='+json.dumps(verwacht)+''';const eind=performance.now()+30000;
          while(JSON.stringify(tabelStand().grids)!==JSON.stringify(verwacht)){if(performance.now()>eind)throw Error('Tabelbreedte niet bijgewerkt');await new Promise(r=>setTimeout(r,50))}await api().flushPendingInput();return tabelStand();''')

    try:
        await start()
        async with Inspector(int(os.environ['OFFICE_PROEF_HTTP'])) as p:
            await gereed(p)
            begin = await stand(p)
            assert len(begin['grids']) == 1 and len(begin['grids'][0]) == 2, 'Eigen bron moet één tabel met twee kolommen hebben'
            r['begin'] = begin
            greep = await p.run('''const eind=performance.now()+30000;while(true){const lijst=[...document.querySelectorAll('.office-tabpaneel:not([hidden]) .tl-greep-kolom')];for(let i=0;i<lijst.length;i++){const b=lijst[i].getBoundingClientRect(),y=Math.max(b.top+12,220);if(b.left>20&&b.right<innerWidth-20&&y<b.bottom-12&&y<innerHeight-60){window._greepIndex=i;return {x:Math.round(b.left+b.width/2),y:Math.round(y),links:b.left,index:i}}}if(performance.now()>eind)throw Error('Geen zichtbare kolomgreep');await new Promise(r=>setTimeout(r,100))}''')
            r['greep'] = greep
            beeld('voor-slepen')
            subprocess.run(['xdotool', 'mousemove', '--window', str(v.id), str(greep['x']), str(greep['y']), 'mousedown', '1'], check=True)
            await asyncio.sleep(.15)
            subprocess.run(['xdotool', 'mousemove', '--window', str(v.id), str(greep['x']+20), str(greep['y'])], check=True)
            await asyncio.sleep(.15)
            subprocess.run(['xdotool', 'mouseup', '1'], check=True)
            na = await p.run('''const oud='''+json.dumps(begin['grids'])+''';const eind=performance.now()+30000;while(JSON.stringify(tabelStand().grids)===JSON.stringify(oud)){if(performance.now()>eind)throw Error('Echte sleepactie wijzigt de tabel niet');await new Promise(r=>setTimeout(r,50))}await api().flushPendingInput();return tabelStand();''')
            assert na['teksten'] == begin['teksten'], 'Slepen wijzigt alinea- of celtekst'
            assert len(na['grids']) == 1 and sum(na['grids'][0]) == sum(begin['grids'][0])
            assert na['grids'][0][0] > begin['grids'][0][0] and na['grids'][0][1] < begin['grids'][0][1]
            r['na_slepen'] = na
            r['stappen'].append('Echte kolomrand versleept; aangrenzende breedtes en alle teksten correct')
            await p.run('''const eind=performance.now()+30000;while(true){const el=document.querySelectorAll('.office-tabpaneel:not([hidden]) .tl-greep-kolom')[_greepIndex];if(el&&el.getBoundingClientRect().left>'''+str(greep['links']+5)+''')return true;if(performance.now()>eind)throw Error('Tabelgreep toont de nieuwe breedte niet');await new Promise(r=>setTimeout(r,50))}''')
            beeld('na-slepen')
            subprocess.run(['xdotool', 'key', '--clearmodifiers', 'ctrl+z'], check=True)
            assert await wacht_grid(p, begin['grids']) == begin
            subprocess.run(['xdotool', 'key', '--clearmodifiers', 'ctrl+y'], check=True)
            assert await wacht_grid(p, na['grids']) == na
            r['stappen'].append('Fysieke Undo en Redo herstellen de brongebonden tabelgegevens exact')
            voor = bron.stat().st_mtime_ns
            subprocess.run(['xdotool', 'key', '--clearmodifiers', 'ctrl+s'], check=True)
            eind = time.monotonic()+45
            while bron.stat().st_mtime_ns == voor:
                assert app.poll() is None and time.monotonic() < eind, 'Opslaan na slepen niet voltooid'
                await asyncio.sleep(.1)
            with ZipFile(bron) as z:
                xml = ET.fromstring(z.read('word/document.xml'))
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            grids = [[int(k.get('{'+ns['w']+'}w')) for k in t.findall('w:tblGrid/w:gridCol', ns)] for t in xml.findall('w:body/w:tbl', ns)]
            assert grids == na['grids'], 'Onafhankelijke DOCX-lezing verliest de kolombreedtes'
            r['docx_grids'] = grids
            assert not any((await p.fouten()).values())
            r['stappen'].append('Fysiek opgeslagen; kolombreedtes onafhankelijk in DOCX-XML gecontroleerd')
        stop()
        await start()
        async with Inspector(int(os.environ['OFFICE_PROEF_HTTP'])) as p:
            await gereed(p)
            assert await stand(p) == na, 'Nieuw eigen proces verliest de gewijzigde tabelgegevens of tekst'
            assert not any((await p.fouten()).values())
            beeld('heropend')
            r['stappen'].append('Nieuw eigen proces behoudt alle kolombreedtes, alinea- en celteksten')
        r['geslaagd'] = True
    except Exception as fout:
        r['fout'] = repr(fout)
        if v and app and app.poll() is None:
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
