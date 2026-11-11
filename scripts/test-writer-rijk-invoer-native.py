#!/usr/bin/env python3
"""Eigen rijke bron: lange fysieke invoer, rendergereedheid en gegevensbehoud.

De gewone invoermeting voegt geen antwoordvertraging toe. Daarna worden
selectie/bewaren/verwerpen afzonderlijk met vastgehouden echte antwoorden getest.
Alle tijden gelden voor deze eigen virtuele X11-proef, niet fysieke scherm-FPS.
OFFICE_TEST_JOURNAAL=1 kiest de echte schema-3-route; standaard schema 2.
"""
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
import threading
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
    shutil.copyfile(REPO / 'docs/tests/writer-rust-plakbatch/bron-128-tabellen.docx', bron)
    with ZipFile(bron) as pakket:
        begin_xml = ET.fromstring(pakket.read('word/document.xml'))
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    tabelbron = [ET.tostring(t) for t in begin_xml.findall('.//w:tbl', ns)]
    assert len(tabelbron) == 128, 'Vaste rijke bron heeft niet 128 tabellen'
    cfg = Path(os.environ['XDG_CONFIG_HOME']) / 'org.openaec.office-studio'
    cfg.mkdir(parents=True)
    (cfg / 'voorkeuren.json').write_text(json.dumps({'taal': 'en', 'thema': 'forge', 'updates': {'automatisch': False}}))
    subprocess.run(['dbus-update-activation-environment', 'DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME'], check=True)
    d = display.Display()
    log = (a.uitvoer / 'programma.log').open('w')
    app = subprocess.Popen([str(a.programma), str(bron)], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    r = {'geslaagd': False, 'versie': a.versie, 'programma_sha256': hashlib.sha256(a.programma.read_bytes()).hexdigest(), 'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'stappen': [], 'grenzen': __doc__}
    v = None

    def stop():
        if app.poll() is None:
            try:
                os.killpg(app.pid, signal.SIGTERM)
                app.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(app.pid, signal.SIGKILL)
                app.wait(timeout=10)
            except ProcessLookupError:
                pass

    timer = threading.Timer(360, stop)
    timer.daemon = True
    timer.start()

    def beeld(naam):
        g = v.get_geometry()
        raw = v.get_image(0, 0, g.width, g.height, X.ZPixmap, 0xffffffff)
        Image.frombytes('RGB', (g.width, g.height), raw.data, 'raw', 'BGRX').save(a.uitvoer / (naam + '.png'))

    async def beeld_stabiel(p, naam):
        gegevens = await p.run('''await api().flushPendingInput();await document.fonts.ready;
          let begin=performance.now(),vorig=null,sinds=performance.now();
          while(true){
            const nu=performance.now();
            const melding=!!document.querySelector('.office-melding');
            const sleutel=document.body.innerText+Array.from(document.querySelectorAll('canvas')).map(c=>c.toDataURL()).join('|');
            if(melding||sleutel!==vorig){vorig=sleutel;sinds=nu}
            if(!melding&&nu-sinds>=1600&&nu-begin>=4000){await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {wachtMs:performance.now()-begin,taal:document.querySelector('.statusbalk-taal')?.textContent,bron:stand(),selectie:sessie().selection()}}
            if(nu-begin>15000)throw Error('Beeld wordt niet stabiel: '+String(melding));
            await new Promise(r=>setTimeout(r,100));
          }
        ''')
        r.setdefault('beeldstabiliteit', {})[naam] = gegevens
        beeld(naam)

    async def toets(p, *toetsen, leeg=True):
        vanaf = await p.ev('_toetsen.length')
        subprocess.run(['xdotool', 'key', '--clearmodifiers', *toetsen], check=True)
        laatste = {'left': 'arrowleft', 'right': 'arrowright'}.get(toetsen[-1].split('+')[-1].lower(), toetsen[-1].split('+')[-1].lower())
        await p.run('let eind=performance.now()+10000;while(!_toetsen.slice(' + str(vanaf) + ').includes(' + json.dumps(laatste) + ')){if(performance.now()>eind)throw Error("Toets niet ontvangen");await new Promise(r=>setTimeout(r,20))}return true;')
        if leeg:
            await p.run('await api().flushPendingInput();return true;')

    async def klik(p, expressie):
        xy = await p.ev('(()=>{let e=' + expressie + ';if(!e)throw Error("Geen knop");let r=e.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()')
        subprocess.run(['xdotool', 'mousemove', '--window', str(v.id), str(xy['x']), str(xy['y']), 'click', '1'], check=True)

    try:
        eind = time.monotonic()+60
        while v is None and time.monotonic() < eind:
            assert app.poll() is None
            for w in d.screen().root.query_tree().children:
                pid = w.get_full_property(d.intern_atom('_NET_WM_PID'), X.AnyPropertyType)
                if w.get_attributes().map_state == X.IsViewable and pid is not None and int(pid.value[0]) == app.pid:
                    v = w
                    break
            await asyncio.sleep(.1)
        assert v, 'Geen eigen venster'
        pid_prop = v.get_full_property(d.intern_atom('_NET_WM_PID'), X.AnyPropertyType)
        pid = int(pid_prop.value[0])
        werkelijk = Path(f'/proc/{pid}/exe').read_bytes()
        assert werkelijk.startswith(b'\x7fELF')
        r['startprogramma_sha256'] = r['programma_sha256']
        r['programma_sha256'] = hashlib.sha256(werkelijk).hexdigest()
        v.configure(x=0, y=0, width=1440, height=1000)
        v.set_input_focus(X.RevertToParent, X.CurrentTime)
        d.sync()
        await asyncio.sleep(12)
        async with Inspector(int(os.environ['OFFICE_PROEF_HTTP'])) as p:
            try:
                await p.run("window.api=()=>{let el=document.querySelector('.office-tabpaneel:not([hidden]) .office-tekst');if(!el)return null;for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let s=f.memoizedState,n=0;s&&n<200;n++,s=s.next){let v=s.memoizedState?.current;if(v?.getEditorRef&&v.commands)return v}return null};let eind=performance.now()+60000;while(!api()?.getEditorRef()?.getYrsSession()){if(performance.now()>eind)throw Error('Geen sessie');await new Promise(r=>setTimeout(r,100))}await api().flushPendingInput();return true;")
                assert await p.run("return await window.__TAURI_INTERNALS__.invoke('plugin:app|version');") == a.versie
                assert await p.run("return await window.__TAURI_INTERNALS__.invoke('plugin:app|identifier');") == 'org.openaec.office-studio'
                # Zelfde eigen proefbron opnieuw openen na vastzetten van de testoptie.
                schema = 3 if os.environ.get('OFFICE_TEST_JOURNAAL') == '1' else 2
                await p.ev("history.replaceState(null,''," + json.dumps('?writerBronjournaal=1' if schema == 3 else '?writerBronjournaal=0') + ");true")
                subprocess.run(['xdotool', 'key', '--clearmodifiers', 'ctrl+w'], check=True)
                await p.run('let eind=performance.now()+15000;while(document.querySelector(".office-tekst")){if(document.querySelector(".office-dialoogacties"))throw Error("Verse bron onverwacht gewijzigd");if(performance.now()>eind)throw Error("Oude editor sluit niet");await new Promise(r=>setTimeout(r,50))}return true;')
                tweede = subprocess.run([str(a.programma), str(bron)], stdout=log, stderr=subprocess.STDOUT, timeout=30)
                assert tweede.returncode == 0
                await p.run("let eind=performance.now()+60000;while(!api()?.getEditorRef()?.getYrsSession()){if(performance.now()>eind)throw Error('Geen heropende sessie');await new Promise(r=>setTimeout(r,100))}await api().flushPendingInput();return true;")
                r['schema'] = schema
                if schema == 3:
                    r['mogelijkheden'] = await p.run("return await window.__TAURI_INTERNALS__.invoke('writer_journaal_mogelijkheden');")
                    assert r['mogelijkheden']['beschikbaar'] is True
                await p.begin_foutbewaking()
                await p.ev('''(() => {
                  window.sessie=()=>api().getEditorRef().getYrsSession();
                  window.tekst=()=>sessie().paragraphs('body').map(p=>p.text).join('');
                  window.stand=()=>JSON.stringify(Object.fromEntries(sessie().storyIds().sort().map(id=>[id,sessie().storySegments(id)])));
                  window._toetsen=[];window._keyupTijden=[];window.addEventListener('keyup',e=>{_toetsen.push(e.key.toLowerCase());_keyupTijden.push({key:e.key.toLowerCase(),ms:performance.now()})},true);
                  window._rust={aanvragen:[],updates:0,houd:false,vertragingMs:0};window._diagnose=[];
                  const intern=window.__TAURI_INTERNALS__,oud=window.fetch,doel=intern.convertFileSrc('writer_tekst_voorbereiden','ipc'),doel3=intern.convertFileSrc('writer_journaal_voorbereiden','ipc'),s=sessie(),pasToe=s.applyLocalUpdate;
                  window.fetch=async function(url,args,...rest){
                    if(String(url)!==doel&&String(url)!==doel3)return oud.call(this,url,args,...rest);
                    const envelop=JSON.parse(args.body),a=envelop.gegevens?.aanvraag??envelop.aanvraag,m={schema:a.schema,levensduur:envelop.gegevens?.koppeling.levensduur,volgnummer:envelop.gegevens?.volgnummer,requestId:a.requestId,position:a.position,text:a.text,gereed:false,wacht:false};_rust.aanvragen.push(m);
                    const response=await oud.call(this,url,args,...rest),json=response.json.bind(response);
                    response.json=async()=>{
                      const antwoord=await json();
                      m.bronbinding=['schema','requestId','documentId','sourceVersion','snapshotSha256','clientId'].every(k=>antwoord[k]===a[k]);
                      m.bronbinding=m.bronbinding&&(a.schema!==3||(antwoord.levensduur===m.levensduur&&antwoord.volgnummer===m.volgnummer));m.gereed=true;m.caret=antwoord.caret;
                      m.vertragingMs=_rust.vertragingMs;
                      if(m.vertragingMs)await new Promise(resolve=>setTimeout(resolve,m.vertragingMs));
                      if(_rust.houd)await new Promise(resolve=>{m.wacht=true;_rust.los=()=>{_rust.houd=false;m.wacht=false;delete _rust.los;resolve()}});
                      return antwoord;
                    };
                    return response;
                  };
                  s.applyLocalUpdate=function(...args){_rust.updates++;_diagnose.push({soort:'delta',selection:s.selection()});return pasToe.apply(this,args)};
                  const selectie=s.setSelection;
                  s.setSelection=function(...args){_diagnose.push({soort:'selectie',args,stack:new Error().stack.slice(0,500)});return selectie.apply(this,args)};
                  const eerste=s.paragraphs('body')[0],e=api().getEditorRef();
                  e.setSelection(e.yrsLocToDisplayPosition({story:'body',paraId:eerste.paraId,offset:0}));api().focus();
                  window._voor=stand();window._voorTekst=tekst();return true;
                })()''')
                await toets(p, 'ctrl+End')
                assert await p.ev('sessie().undoCaptureMode()') == 'auto', 'Gewone invoer staat niet op automatische Undo-groepering'
                r['gewone_invoer_antwoordvertraging_ms'] = 0
                await p.ev('window._voor=stand();window._voorTekst=tekst();true')
                invoer = ' Een langere proefzin met gewone woorden en spaties.'*20+' EINDEPROEF.'
                await p.ev('window._langeInvoer='+json.dumps(invoer)+';window._meetBegin=performance.now();window._laatsteToetsVanaf=_keyupTijden.length;true')
                begin_invoer = time.monotonic()
                subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '2', invoer], check=True)
                toetsen_verzonden = time.monotonic()
                # Een unieke niet-schrijvende eindtoets volgt alle teksttoetsen.
                # Shift-keyups tellen ook mee; een aantaldrempel is onveilig.
                subprocess.run(['xdotool', 'key', '--clearmodifiers', 'Right'], check=True)
                r['lange_invoer'] = await p.run("""
                  const einde=performance.now()+120000;
                  while(!_keyupTijden.slice(_laatsteToetsVanaf).some(t=>t.key==='arrowright')){
                    if(performance.now()>einde)throw Error('Laatste fysieke invoer niet ontvangen');await new Promise(r=>setTimeout(r,20));
                  }
                  const eindtoets=_keyupTijden.slice(_laatsteToetsVanaf).findIndex(t=>t.key==='arrowright');
                  const laatsteKeyup=_keyupTijden.slice(_laatsteToetsVanaf,eindtoets+_laatsteToetsVanaf).at(-1).ms;
                  await api().flushPendingInput();const bronGereed=performance.now();
                  if(tekst()!==_voorTekst+_langeInvoer)throw Error('Lange broninvoer niet exact');
                  let frameTekst='';
                  while(true){
                    const el=document.querySelector('.office-tabpaneel:not([hidden]) .office-tekst');let gevonden=false;
                    for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f&&!gevonden;f=f.return)
                      for(let s=f.memoizedState,n=0;s&&n<1500;n++,s=s.next)
                        for(const v of [s.memoizedState,s.memoizedState?.current]){
                          if(!v?.displayList?.pages||!v.queries?.sourceState)continue;
                          if(v.queries.sourceState().status==='error')throw Error('Renderbron geeft fout');
                          frameTekst=v.displayList.pages.flatMap(p=>p.primitives??[]).filter(p=>typeof p.text==='string').map(p=>p.text).join('');
                          if(frameTekst.includes('EINDEPROEF.')){gevonden=true;break}
                        }
                    if(gevonden)break;
                    if(performance.now()>einde)throw Error('Laatste tekst ontbreekt in renderframe');await new Promise(r=>setTimeout(r,50));
                  }
                  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
                  return {tekens:_langeInvoer.length,interval_ms:2,laatste_keyup_ms:laatsteKeyup,begin_tot_bron_ms:bronGereed-_meetBegin,laatste_keyup_tot_bron_ms:bronGereed-laatsteKeyup,laatste_keyup_tot_frame_ms:performance.now()-laatsteKeyup,begin_tot_frame_ms:performance.now()-_meetBegin,paginas:api().getTotalPages(),laatste_frame_tekst:frameTekst.slice(-150)};
                """, t=130)
                r['lange_invoer']['wall_begin_tot_frame_ms'] = round((time.monotonic()-begin_invoer)*1000)
                r['lange_invoer']['wall_verzonden_tot_frame_ms'] = round((time.monotonic()-toetsen_verzonden)*1000)
                r['lange_invoer']['grens'] = 'Keyup is ontvangst in WebKit; wachttijd vóór ontvangst zit wel in totale wall-tijd. Renderlijst plus twee rAFs is geen fysieke schermpaint.'
                assert await p.ev('tekst()===_voorTekst+_langeInvoer'), 'Gewone lange invoer ontbreekt'
                await p.ev('window._getypt=stand();true')
                groepen = 0
                while not await p.ev('stand()===_voor'):
                    assert groepen < 32, 'Meer dan32Undo-groepen voor één lange invoerreeks'
                    await toets(p, 'ctrl+z');groepen += 1
                    assert await p.ev('tekst().startsWith(_voorTekst)&&(_voorTekst+_langeInvoer).startsWith(tekst())'), 'Undo wijzigt tekst buiten de eigen invoer'
                r['undo_groepen_lange_invoer'] = groepen
                for _ in range(groepen):
                    await toets(p, 'ctrl+y')
                assert await p.ev('stand()===_getypt'), 'Redo herstelt de lange invoer en opmaak niet exact'
                r['stappen'].append('Lange fysieke tekstinvoer zonder antwoordvertraging, renderframe en bronexacte Undo/Redo-groepen')
                await beeld_stabiel(p, 'invoer-redo')
                await p.ev('_rust.vertragingMs=0;true')

                await toets(p, 'ctrl+End')
                await p.ev('window._voorSnelleTekst=tekst();_rust.houd=true;true')
                subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '10', ' SNEL'], check=True)
                await p.run('let eind=performance.now()+30000;while(!_rust.aanvragen.at(-1)?.wacht){if(performance.now()>eind)throw Error("Geen vastgehouden tekstantwoord");await new Promise(r=>setTimeout(r,30))}return true;')
                await toets(p, 'shift+Left', 'shift+Left', 'shift+Left', leeg=False)
                subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '10', '!'], check=True)
                voor_mtime = bron.stat().st_mtime_ns
                await toets(p, 'ctrl+s', leeg=False)
                assert await p.ev('tekst()===_voorSnelleTekst'), 'Toetsen liepen buiten de vastgehouden invoer om'
                await p.ev('_rust.los();true')
                await p.run('await api().flushPendingInput();let eind=performance.now()+30000;while(tekst()!==_voorSnelleTekst+" S!"){if(performance.now()>eind)throw Error("Snelle invoer/selectie onjuist: "+tekst().slice(-100));await new Promise(r=>setTimeout(r,50))}return true;')
                eind = time.monotonic()+30
                while bron.stat().st_mtime_ns == voor_mtime:
                    assert time.monotonic() < eind, 'Bewaren tijdens tekstinvoer blijft hangen'
                    await asyncio.sleep(.1)
                with ZipFile(bron) as z:
                    xml = ET.fromstring(z.read('word/document.xml'))
                ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                assert [ET.tostring(t) for t in xml.findall('.//w:tbl', ns)] == tabelbron, 'Bewaarde 128 tabellen zijn gewijzigd'
                r['bewaarde_tabellen_exact'] = len(tabelbron)
                body = xml.find('w:body', ns)
                terug = ''.join(t.text or '' for p_xml in body.findall('w:p', ns) for t in p_xml.findall('.//w:t', ns))
                assert terug == await p.ev('tekst()'), 'Bewaring mist invoer of bevat verkeerde selectie'
                r['bewaring_sha256'] = hashlib.sha256(bron.read_bytes()).hexdigest()
                r['stappen'].append('Fysiek typen, Shift-selectie, vervangen en Save vóór tekstantwoord; DOCX onafhankelijk exact teruggelezen')
                await beeld_stabiel(p, 'snel-getypt-bewaard')

                await toets(p, 'ctrl+End')
                updates_voor_sluiten = await p.ev('_rust.updates')
                await p.ev('_rust.houd=true;true')
                subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '10', ' NIET OPSLAAN'], check=True)
                await p.run('let eind=performance.now()+30000;while(!_rust.aanvragen.at(-1)?.wacht){if(performance.now()>eind)throw Error("Geen vastgehouden tweede tekstantwoord");await new Promise(r=>setTimeout(r,30))}return true;')
                await toets(p, 'ctrl+w', leeg=False)
                await p.run('let eind=performance.now()+10000;while(!document.querySelector(".office-dialoogacties")){if(performance.now()>eind)throw Error("Sluitdialoog wacht op tekstinvoer");await new Promise(r=>setTimeout(r,50))}return true;')
                await klik(p, 'Array.from(document.querySelectorAll(".office-dialoogacties button")).find(b=>/Don.t save|Niet opslaan/.test(b.textContent))')
                await p.run('let eind=performance.now()+10000;while(document.querySelector(".office-tekst")||document.querySelector(".office-dialoogacties")){if(performance.now()>eind)throw Error("Niet opslaan wacht op tekstinvoer");await new Promise(r=>setTimeout(r,50))}return true;')
                await klik(p, 'document.querySelector("button.start-sjabloon.module-docx")')
                await p.run('let eind=performance.now()+30000;while(!api()?.getEditorRef()?.getYrsSession()){if(performance.now()>eind)throw Error("Geen nieuw document");await new Promise(r=>setTimeout(r,50))}api().focus();return true;')
                # Nieuwe editor heeft een eigen levensduur. Laat diens invoer
                # doorgaan, maar houd het oude antwoord nog apart vast.
                await p.ev('_rust.houd=false;true')
                subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '20', 'Nieuw document'], check=True)
                await toets(p, 'Right')
                assert await p.ev('tekst()') == 'Nieuw document'
                await p.ev('_rust.los();true')
                await asyncio.sleep(.5)
                await p.run('await api().flushPendingInput();return true;')
                assert await p.ev('tekst()') == 'Nieuw document', 'Laat tekstantwoord verandert nieuw document'
                assert await p.ev('_rust.updates') == updates_voor_sluiten, 'Laat antwoord schrijft in de gesloten sessie'
                assert hashlib.sha256(bron.read_bytes()).hexdigest() == r['bewaring_sha256'], 'Niet opslaan wijzigt bewaarde bron'
                r['stappen'].append('Niet opslaan zonder tekstantwoord; nieuw document en laat antwoord behouden bron en invoer')
                r['native_opdrachten'] = await p.ev('_rust.aanvragen')
                assert len(r['native_opdrachten']) >= 3 and all(m['gereed'] and m['bronbinding'] and m['schema'] == schema for m in r['native_opdrachten'])
                r['fouten'] = await p.fouten()
                assert not any(r['fouten'].values()), 'GUI of engine meldt fouten'
                await beeld_stabiel(p, 'nieuw-na-laat-antwoord')
                r['geslaagd'] = True
            finally:
                try:
                    r['diagnose'] = await p.ev('({toetsen:window._keyupTijden?.slice(-30),opdrachten:window._rust?.aanvragen,updates:window._rust?.updates,selecties:window._diagnose,selectie:api()?.getEditorRef()?.getYrsSession()?.selection(),begin:api()?tekst().slice(0,100):null,eind:api()?tekst().slice(-100):null})')
                except Exception as diagnosefout:
                    r['diagnosefout'] = str(diagnosefout)

    except Exception as fout:
        r['fout'] = repr(fout)
        if 'p' in locals():
            r['console_bij_afkeuring'] = p.consoleberichten
        if v and app.poll() is None:
            try:
                beeld('afgekeurd')
            except Exception as beeldfout:
                r['beeldfout'] = repr(beeldfout)
        raise
    finally:
        timer.cancel()
        stop()
        d.close()
        log.close()
        (a.uitvoer / 'rapport.json').write_text(json.dumps(r, ensure_ascii=False, indent=2)+'\n')
    return 0


basis.proef = proef
basis.__file__ = str(Path(__file__).resolve())
if __name__ == '__main__':
    raise SystemExit(basis.main())
