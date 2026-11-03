"""Werkelijk kopiëren/plakken van een eigen kopie, inclusief tabellen en sluiten.

Extra opties: --rondes 1..10 (standaard 6), --maxduur 30..900 seconden
(standaard 300), --bewaar-na-ronde voor een bewaarmoment vóór verder bewerken.
De tijdgrens stopt uitsluitend de eigen testapp.
"""
import argparse, asyncio, hashlib, importlib.util, json, os, shutil, signal, subprocess, sys, threading, time
from pathlib import Path
from collections import Counter
from zipfile import ZipFile
from xml.etree import ElementTree as ET
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
    profiel = os.environ.get('OFFICE_PLAK_PROFIEL', 'org.openaec.office-studio')
    cfg = Path(os.environ['XDG_CONFIG_HOME']) / profiel
    cfg.mkdir(parents=True)
    (cfg / 'voorkeuren.json').write_text(json.dumps({'taal': 'en', 'thema': 'forge', 'updates': {'automatisch': False, 'kanaal': 'ontwikkel'}}))
    subprocess.run(['dbus-update-activation-environment', 'DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME'], check=True)
    d = display.Display()
    log = (a.uitvoer / 'programma.log').open('w')
    app = subprocess.Popen([str(a.programma), str(bron)], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    r = {'maxduur_seconden': int(os.environ['OFFICE_PLAK_MAXDUUR']), 'geslaagd': False, 'versie': a.versie, 'programma_sha256': hashlib.sha256(a.programma.read_bytes()).hexdigest(), 'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'bron_sha256': hashlib.sha256(bron.read_bytes()).hexdigest(), 'rondes': [], 'invoergereedheid': 'Gewijzigde bron, lege engine-invoerwachtrij en nieuw verschenen plakopties na de eigen opmaakverwerking; bronvergelijkingen daarnaast buiten de tijdmeting.', 'grenzen': 'Eigen kopie van meegeleverd document; selecteer alles, kopieer, ga naar einde en plak; per ronde broncontrole. Geen snelle plakreeks zonder barrières.'}

    r['bewaar_na_ronde'] = int(os.environ.get('OFFICE_PLAK_BEWAAR_NA', '0'))

    def stop():
        if app.poll() is None:
            try:
                os.killpg(app.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                app.wait(timeout=10)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(app.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                app.wait(timeout=10)

    def tijdgrens():
        r['afgebroken_door_tijdgrens'] = True
        stop()
    timer = threading.Timer(r['maxduur_seconden'], tijdgrens)
    timer.daemon = True
    timer.start()
    v = None

    def beeld(naam):
        g = v.get_geometry()
        raw = v.get_image(0, 0, g.width, g.height, X.ZPixmap, 4294967295)
        Image.frombytes('RGB', (g.width, g.height), raw.data, 'raw', 'BGRX').save(a.uitvoer / (naam + '.png'))

    def key(*toetsen):
        subprocess.run(['xdotool', 'key', '--clearmodifiers', *toetsen], check=True)

    async def klik(p, expressie):
        xy = await p.ev('(()=>{let el=' + expressie + ';if(!el)throw Error("Geen knop");let r=el.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()')
        subprocess.run(['xdotool', 'mousemove', '--window', str(v.id), str(xy['x']), str(xy['y']), 'click', '1'], check=True)
    try:
        einde = time.monotonic() + 60
        while v is None and time.monotonic() < einde:
            assert app.poll() is None
            for w in d.screen().root.query_tree().children:
                pid = w.get_full_property(d.intern_atom('_NET_WM_PID'), X.AnyPropertyType)
                if w.get_attributes().map_state == X.IsViewable and pid is not None and int(pid.value[0]) == app.pid:
                    v = w
                    break
            await asyncio.sleep(0.1)
        assert v, 'Geen eigen venster'
        v.configure(x=0, y=0, width=1440, height=1000)
        v.set_input_focus(X.RevertToParent, X.CurrentTime)
        d.sync()
        # AppRun stelt onder meer de GTK- en WebKit-paden in en exec't de
        # echte app. Bind het bewijs aan die eigen, zichtbare ELF, niet alleen
        # aan de eventuele startscriptbytes.
        r['startprogramma_sha256'] = r['programma_sha256']
        werkelijk = Path(f'/proc/{app.pid}/exe').read_bytes()
        assert werkelijk.startswith(b'\x7fELF'), 'Eigen zichtbare proces is geen ELF'
        r['programma_sha256'] = hashlib.sha256(werkelijk).hexdigest()
        await asyncio.sleep(12)
        async with Inspector(int(os.environ['OFFICE_PROEF_HTTP'])) as p:
            await p.run("window.api=()=>{let el=document.querySelector('.office-tabpaneel:not([hidden]) .office-tekst');if(!el)return null;for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let s=f.memoizedState,n=0;s&&n<200;n++,s=s.next){let v=s.memoizedState?.current;if(v?.getEditorRef&&v.commands)return v}return null};let eind=performance.now()+60000;while(!api()?.getEditorRef()?.getYrsSession()){if(performance.now()>eind)throw Error('Document niet gereed');await new Promise(r=>setTimeout(r,100))}await api().flushPendingInput();return true;")
            assert await p.run("return await window.__TAURI_INTERNALS__.invoke('plugin:app|version');") == a.versie
            assert await p.run("return await window.__TAURI_INTERNALS__.invoke('plugin:app|identifier');") == profiel
            r['profiel'] = profiel
            await p.begin_foutbewaking()
            await p.ev("window.proefStand=()=>{let s=api().getEditorRef().getYrsSession(),tabellen=s.storySegments('body').filter(x=>x.kind==='embed'&&x.embedKind==='table'),cellen=[];for(let t of tabellen)for(let r of t.payload.rows)for(let c of r.cells)cellen.push({story:c.story,tekst:s.paragraphs(c.story).map(p=>p.text).join('')});let a=s.paragraphs('body');return{body:a.map(p=>p.text).join(''),alineas:a.length,uniekeAlineas:new Set(a.map(p=>p.paraId)).size,tabellen:tabellen.length,tabelvormen:tabellen.map(t=>t.payload.rows.map(r=>r.cells.length)),cellen,paginas:api().getTotalPages(),lengte:s.storyLength('body')}};window._plakToetsen=[];window.addEventListener('keyup',e=>_plakToetsen.push({key:e.key.toLowerCase(),ms:performance.now()}),true);true")
            stand = await p.ev('proefStand()')
            r['begin'] = stand
            beeld('begin')
            await p.run("let e=api().getEditorRef(),a=e.getYrsSession().paragraphs('body')[0];e.setSelection(e.yrsLocToDisplayPosition({story:'body',paraId:a.paraId,offset:0}));api().focus();await api().flushPendingInput();return true;")
            for n in range(int(os.environ.get('OFFICE_PLAK_RONDES', '3'))):
                await p.ev('window._plakRonde=' + str(n + 1))
                key('ctrl+a', 'ctrl+c')
                await asyncio.sleep(0.5)
                key('ctrl+End')
                await asyncio.sleep(0.2)
                await p.run("let eind=performance.now()+10000;while(document.querySelector('.tekst-plakopties')){if(performance.now()>eind)throw Error('Oude plakopties blijven staan');await new Promise(r=>setTimeout(r,50))}return true;")
                begin = time.monotonic()
                key('ctrl+v')
                await p.run("let eind=performance.now()+120000;while(api().getEditorRef().getYrsSession().storyLength('body')<=" + str(stand['lengte']) + "){if(performance.now()>eind)throw Error('Plakactie niet toegelaten');await new Promise(r=>setTimeout(r,100))}await api().flushPendingInput();while(!document.querySelector('.tekst-plakopties')){if(performance.now()>eind)throw Error('Plakopmaak niet gereed');await new Promise(r=>setTimeout(r,50))}return true;", t=130)
                duur = round((time.monotonic() - begin) * 1000)
                na = await p.ev('proefStand()')
                stap = {'ronde': n + 1, 'plak_tot_bron_ms': duur, 'voor': stand, 'na': na}
                r['rondes'].append(stap)
                assert na['body'] == stand['body'] * 2, ('Body verdubbelt niet', n + 1, len(stand['body']), len(na['body']))
                assert na['tabellen'] == stand['tabellen'] * 2, ('Tabelverlies', n + 1)
                assert Counter((json.dumps(x) for x in na['tabelvormen'])) == Counter({k: v * 2 for k, v in Counter((json.dumps(x) for x in stand['tabelvormen'])).items()}), ('Tabelvorm wijkt af', n + 1)
                assert Counter((c['tekst'] for c in na['cellen'])) == Counter({k: v * 2 for k, v in Counter((c['tekst'] for c in stand['cellen'])).items()}), ('Celtekst wijkt af', n + 1)
                assert len({c['story'] for c in na['cellen']}) == len(na['cellen']), ('Celverhalen gedeeld', n + 1)
                assert na['alineas'] == na['uniekeAlineas'], ('Dubbele alinea-id', n + 1)
                print(json.dumps({'ronde': n + 1, 'ms': duur, 'paginas': na['paginas'], 'tabellen': na['tabellen'], 'alineas': na['alineas']}, ensure_ascii=False), flush=True)
                stand = na
                if n + 1 == int(os.environ.get('OFFICE_PLAK_BEWAAR_NA', '0')):
                    # Dezelfde export als een herstelkopie, vóór de volgende
                    # echte invoer. Dit maakt de late worker-import gericht toetsbaar.
                    data = await p.run('let b=new Uint8Array(await api().save());return Array.from(b);', t=90)
                    tussen = a.uitvoer / 'tussenbewaring.docx'
                    tussen.write_bytes(bytes(data))
                    r['tussenbewaring'] = {'na_ronde': n + 1, 'bytes': len(data), 'sha256': hashlib.sha256(bytes(data)).hexdigest()}
            # De statusbalk telt gedebounced. Een direct beeld kan nog de oude
            # helft tonen; eis begrensd de werkelijke, bijgewerkte totalen.
            tekens = len(stand['body'].encode('utf-16-le')) // 2
            verwachte_tekens = f', {tekens:,} characters'
            verwachte_paginas = f" of {stand['paginas']:,}"
            status = await p.run(
                "let eind=performance.now()+8000;while(true){let b=Array.from(document.querySelectorAll('.office-statusbalk .statusbalk-module button')).map(e=>e.textContent||'');"
                "if(b[0]?.endsWith(" + json.dumps(verwachte_paginas) + ")&&b[1]?.includes(" + json.dumps(verwachte_tekens) + "))return b;"
                "if(performance.now()>eind)throw Error('Statusbalktotalen blijven achter: '+JSON.stringify(b));await new Promise(r=>setTimeout(r,100));}", t=10)
            r['statusbalk_na_rust'] = {'paginas': stand['paginas'], 'body_tekens_utf16': tekens, 'grens_ms': 8000, 'knoppen': status}
            beeld('na-plakken')
            # Bewaar een aparte kopie; de geopende bron blijft onopgeslagen.
            data = await p.run('let b=new Uint8Array(await api().save());return Array.from(b);', t=90)
            kopie = a.uitvoer / 'geplakt.docx'
            kopie.write_bytes(bytes(data))
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            with ZipFile(kopie) as z:
                xml = ET.fromstring(z.read('word/document.xml'))
            body = xml.find('w:body', ns)
            xmltekst = ''.join((t.text or '' for al in body.findall('w:p', ns) for t in al.findall('.//w:t', ns)))
            xmltabellen = body.findall('w:tbl', ns)
            assert xmltekst == stand['body'], 'DOCX-body wijkt af'
            assert len(xmltabellen) == stand['tabellen'], 'DOCX-tabelverlies'
            assert Counter((''.join((t.text or '' for t in c.findall('.//w:t', ns))) for tabel in xmltabellen for rij in tabel.findall('w:tr', ns) for c in rij.findall('w:tc', ns))) == Counter((c['tekst'] for c in stand['cellen'])), 'DOCX-celverlies'
            wisselend = {'paraId', 'textId', 'rsidR', 'rsidRDefault', 'rsidRPr', 'rsidP'}
            for el in body.iter():
                for k in list(el.attrib):
                    if k.rsplit('}', 1)[-1] in wisselend:
                        del el.attrib[k]
            r['onafhankelijk_docx'] = {'exact': True, 'sha256': hashlib.sha256(kopie.read_bytes()).hexdigest(), 'bytes': kopie.stat().st_size, 'body_met_opmaak_sha256': hashlib.sha256(ET.tostring(body, encoding='utf-8')).hexdigest(), 'normalisatie': 'Alleen paraId/textId en rsid-attributen verwijderd; tekst, run- en alineaopmaak, hyperlinks en tabelstructuur blijven in de bodyhash.'}
            key('ctrl+w')
            await p.run("let eind=performance.now()+15000;while(!document.querySelector('.office-dialoogacties')){if(performance.now()>eind)throw Error('Geen sluitdialoog');await new Promise(r=>setTimeout(r,100))}return true;")
            beeld('sluitdialoog')
            begin = time.monotonic()
            await klik(p, 'Array.from(document.querySelectorAll(\'.office-dialoogacties button\')).find(b=>b.textContent.includes(\'Don’t save\')||b.textContent.includes("Don\'t save")||b.textContent.includes(\'Niet opslaan\'))')
            await p.run("let eind=performance.now()+15000;while(document.querySelector('.office-tekst')||document.querySelector('.office-dialoogacties')){if(performance.now()>eind)throw Error('Verwerpen blijft hangen');await new Promise(r=>setTimeout(r,100))}return true;")
            r['verwerpen_ms'] = round((time.monotonic() - begin) * 1000)
            await klik(p, "document.querySelector('button.start-sjabloon.module-docx')")
            await p.run("let eind=performance.now()+30000;while(!api()?.getEditorRef()?.getYrsSession()){if(performance.now()>eind)throw Error('Geen nieuw document na verwerpen');await new Promise(r=>setTimeout(r,100))}return true;")
            assert len(await p.ev("api().getEditorRef().getYrsSession().paragraphs('body').map(p=>p.text).join('')")) == 0
            beeld('nieuw-na-verwerpen')
            r['nieuw_document_na_verwerpen'] = True
            assert hashlib.sha256(bron.read_bytes()).hexdigest() == r['bron_sha256'], 'Niet opslaan wijzigde bron'
            fouten = await p.fouten()
            r['gui_fouten'] = fouten['gui']
            r['console_fouten'] = fouten['console']
            assert not r['gui_fouten'], 'De broncontroles slagen, maar de GUI meldt fouten'
            assert not r['console_fouten'], 'De engine meldt consolefouten, ook zonder zichtbare melding'
            assert r['bewaar_na_ronde'] == 0 or r.get('tussenbewaring', {}).get('na_ronde') == r['bewaar_na_ronde'], 'Tussenbewaring is niet uitgevoerd'
            r['geslaagd'] = True
    except Exception as e:
        r['fout'] = repr(e)
        if v and app.poll() is None:
            try:
                beeld('afgekeurd')
            except Exception as b:
                r['beeldfout'] = repr(b)
        raise
    finally:
        timer.cancel()
        stop()
        if r.get('afgebroken_door_tijdgrens'):
            r['geslaagd'] = False
            r['fout'] = r.get('fout', 'Eigen proefprogramma afgebroken door de tijdgrens')
        d.close()
        log.close()
        (a.uitvoer / 'rapport.json').write_text(json.dumps(r, ensure_ascii=False, indent=2) + '\n')
    return 0 if r['geslaagd'] else 1
basis.__doc__ = __doc__
basis.proef = proef
basis.__file__ = str(Path(__file__).resolve())
if __name__ == '__main__':
    p = argparse.ArgumentParser(add_help=False)
    p.add_argument('--rondes', type=int, default=int(os.environ.get('OFFICE_PLAK_RONDES', '6')))
    p.add_argument('--maxduur', type=int, default=int(os.environ.get('OFFICE_PLAK_MAXDUUR', '300')))
    p.add_argument('--profiel', choices=['org.openaec.office-studio', 'org.openaec.office-studio.dev', 'org.openaec.writer-studio'], default=os.environ.get('OFFICE_PLAK_PROFIEL', 'org.openaec.office-studio'))
    p.add_argument('--bewaar-na-ronde', type=int, default=int(os.environ.get('OFFICE_PLAK_BEWAAR_NA', '0')))
    eigen, overig = p.parse_known_args()
    if not 1 <= eigen.rondes <= 10:
        p.error('Gebruik 1 tot en met 10 rondes.')
    if not 30 <= eigen.maxduur <= 900:
        p.error('Gebruik 30 tot en met 900 seconden als tijdgrens.')
    if not 0 <= eigen.bewaar_na_ronde < eigen.rondes:
        p.error('Het bewaarmoment moet vóór een volgende bewerkingsronde liggen, of 0 zijn.')
    os.environ['OFFICE_PLAK_RONDES'] = str(eigen.rondes)
    os.environ['OFFICE_PLAK_MAXDUUR'] = str(eigen.maxduur)
    os.environ['OFFICE_PLAK_PROFIEL'] = eigen.profiel
    os.environ['OFFICE_PLAK_BEWAAR_NA'] = str(eigen.bewaar_na_ronde)
    sys.argv = [sys.argv[0], *overig]
    raise SystemExit(basis.main())
