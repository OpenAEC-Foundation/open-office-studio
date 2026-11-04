"""CPU-attributie van een eigen 500-paginakopie in de native Linux-app.

Gebruik --bron <docx> naast --programma, --versie en --uitvoer.
De proef bedient echte toetsen en bewaart begrensde WebKit-ScriptProfilerdata.
Geen proces-CPUduur: deze runtime levert geen trackingUpdate-intervallen.
De stackvolgorde wordt op dezelfde runtime met drie geneste functies geijkt.
"""
import asyncio, importlib.util, json, os, signal, subprocess, sys, time, shutil, hashlib
from pathlib import Path
REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / 'scripts'))
spec = importlib.util.spec_from_file_location('basis', REPO / 'scripts/test-writer-lang-native.py')
basis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(basis)

async def proef(a):
    from Xlib import X, display
    from PIL import Image
    from gui.webkit_inspector import Inspector as BasisInspector
    from collections import Counter
    import gzip

    class Inspector(BasisInspector):

        async def __aenter__(self):
            self.gebeurtenissen = []
            self.notificatie_bytes = 0
            await super().__aenter__()
            self.ws.max_size = 64 * 1024 * 1024
            return self

        async def command(self, method, params=None):
            self.i += 1
            nummer = self.i
            await self.ws.send(json.dumps({'id': nummer, 'method': 'Target.sendMessageToTarget', 'params': {'targetId': self.target, 'message': json.dumps({'id': nummer, 'method': method, 'params': params or {}})}}))
            while True:
                bericht = json.loads(await asyncio.wait_for(self.ws.recv(), timeout=90))
                if bericht.get('method') != 'Target.dispatchMessageFromTarget':
                    if bericht.get('id') == nummer and bericht.get('error'):
                        raise RuntimeError(bericht['error'])
                    continue
                inhoud = bericht['params']['message']
                bericht = json.loads(inhoud)
                if 'method' in bericht:
                    self.notificatie_bytes += len(inhoud)
                    if self.notificatie_bytes > 64 * 1024 * 1024:
                        raise RuntimeError('Profiel overschrijdt de datagrens')
                    self.gebeurtenissen.append(bericht)
                if bericht.get('id') == nummer:
                    return bericht

        async def worker(self, worker, method, params=None):
            nummer = 100000 + self.i
            vanaf = len(self.gebeurtenissen)
            antwoord = await self.command('Worker.sendMessageToWorker', {'workerId': worker, 'message': json.dumps({'id': nummer, 'method': method, 'params': params or {}})})
            if antwoord.get('error'):
                return antwoord
            einde = time.monotonic() + 15
            while time.monotonic() < einde:
                for ev in self.gebeurtenissen[vanaf:]:
                    if ev.get('method') == 'Worker.dispatchMessageFromWorker' and ev['params']['workerId'] == worker:
                        binnen = json.loads(ev['params']['message'])
                        if binnen.get('id') == nummer:
                            return binnen
                await self.ev('void 0')
                await asyncio.sleep(0.05)
            raise TimeoutError('Worker-profielantwoord ontbreekt')
    a.uitvoer.mkdir(parents=True, exist_ok=False)
    bron = a.uitvoer / 'Prestatieproef.docx'
    shutil.copyfile(Path(os.environ['OFFICE_PROFIEL_BRON']), bron)
    cfg = Path(os.environ['XDG_CONFIG_HOME']) / 'org.openaec.office-studio'
    cfg.mkdir(parents=True)
    (cfg / 'voorkeuren.json').write_text(json.dumps({'taal': 'en', 'thema': 'forge', 'updates': {'automatisch': False, 'kanaal': 'ontwikkel'}}))
    subprocess.run(['dbus-update-activation-environment', 'DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME'], check=True)
    d = display.Display()
    log = (a.uitvoer / 'programma.log').open('w')
    app = subprocess.Popen([str(a.programma), str(bron)], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    r = {'bron_sha256': hashlib.sha256(bron.read_bytes()).hexdigest(), 'omvang': 'Eigen 500-paginakopie, echte toetsen en ScriptProfiler van WebKit; geen algemene snelheidsmeting. Runtime-polls van de proef staan mede in het hoofdthreadprofiel.'}
    try:
        einde = time.monotonic() + 60
        v = None
        while not v and time.monotonic() < einde:
            for w in d.screen().root.query_tree().children:
                prop = w.get_full_property(d.intern_atom('_NET_WM_NAME'), X.AnyPropertyType)
                naam = prop.value.decode(errors='replace') if prop and isinstance(prop.value, bytes) else ''
                if w.get_attributes().map_state == X.IsViewable and 'Office Studio' in naam:
                    v = w
                    break
            await asyncio.sleep(0.1)
        assert v
        v.configure(x=0, y=0, width=1440, height=1000)
        v.set_input_focus(X.RevertToParent, X.CurrentTime)
        d.sync()
        await asyncio.sleep(12)
        async with Inspector(int(os.environ['OFFICE_PROEF_HTTP'])) as p:
            await p.run("window.api=()=>{let el=document.querySelector('.office-tabpaneel:not([hidden]) .office-tekst');if(!el)return null;for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let s=f.memoizedState,n=0;s&&n<200;n++,s=s.next){let v=s.memoizedState?.current;if(v?.getEditorRef&&v.commands)return v}return null};let eind=performance.now()+60000;while(api()?.getTotalPages()!==500){if(performance.now()>eind)throw Error('Geen 500 paginas');await new Promise(r=>setTimeout(r,100))}let e=api().getEditorRef(),alinea=e.getYrsSession().paragraphs('body').at(-1);window.voor=alinea.text;e.setSelection(e.yrsLocToDisplayPosition({story:'body',paraId:alinea.paraId,offset:alinea.text.length}));api().scrollToPage(500);api().focus();await api().flushPendingInput();return true;")
            await asyncio.sleep(3)
            r['programma_sha256'] = hashlib.sha256(a.programma.read_bytes()).hexdigest()
            r['script_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
            r['versie'] = await p.run("return await window.__TAURI_INTERNALS__.invoke('plugin:app|version');")
            assert r['versie'] == a.versie
            await p.ev("window._profielToetsen=[];window.addEventListener('keyup',e=>_profielToetsen.push(e.key),true);true")
            r['inputmeting'] = 'Native laatste keyup, inputwachtrij en golflijnen; bron eenmaal buiten het profileringsvenster exact gecontroleerd. Inspectiecommando’s blijven onderdeel van de opname.'
            r['worker_enable'] = await p.command('Worker.enable')
            await p.ev('void 0')
            await asyncio.sleep(0.2)
            await p.ev('void 0')
            workers = {ev['params']['workerId']: ev['params'] for ev in p.gebeurtenissen if ev.get('method') == 'Worker.workerCreated'}
            r['workers'] = workers
            r['begin_profielen'] = {}
            for worker in workers:
                r['begin_profielen'][worker] = {'initialized': await p.command('Worker.initialized', {'workerId': worker}), 'profiel': await p.worker(worker, 'ScriptProfiler.startTracking', {'includeSamples': True})}
            r['begin_hoofdthread'] = await p.command('ScriptProfiler.startTracking', {'includeSamples': True})
            begin = time.monotonic()
            subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '20', ' Een proefzin.'], check=True)
            await p.run("let einde=performance.now()+90000;while(!_profielToetsen.includes('.')){if(performance.now()>einde)throw Error('Laatste native toets ontbreekt');await new Promise(r=>setTimeout(r,50))}await api().flushPendingInput();while(!document.querySelector('.spelling-golf')){if(performance.now()>einde)throw Error('Golven niet gereed');await new Promise(r=>setTimeout(r,50))}return true;", t=100)
            r['invoer_en_inspectie_ms'] = round((time.monotonic() - begin) * 1000)
            r['stop_hoofdthread'] = await p.command('ScriptProfiler.stopTracking')
            r['stop_workers'] = {worker: await p.worker(worker, 'ScriptProfiler.stopTracking') for worker in workers}
            await p.ev('void 0')
            await asyncio.sleep(0.2)
            await p.ev('void 0')
            profiel_einde = len(p.gebeurtenissen)
            await p.command('ScriptProfiler.startTracking', {'includeSamples': True})
            await p.ev('(()=>{function profielOnder(){let einde=performance.now()+100,uit=0;while(performance.now()<einde)uit+=Math.sqrt(Math.random());return uit}function profielMidden(){return profielOnder()}function profielBoven(){return profielMidden()}return profielBoven()})()')
            await p.command('ScriptProfiler.stopTracking')
            await p.ev('void 0')
            kalibratie = [s for e in p.gebeurtenissen[profiel_einde:] if e.get('method') == 'ScriptProfiler.trackingComplete' for s in e['params'].get('samples', {}).get('stackTraces', [])]
            voorbeelden = []
            for sample in kalibratie:
                namen = [f['name'] for f in sample['stackFrames']]
                if all((n in namen for n in ['profielOnder', 'profielMidden', 'profielBoven'])):
                    voorbeelden.append(namen)
            assert voorbeelden, 'Geen geneste kalibratiestack'
            assert all((n.index('profielOnder') < n.index('profielMidden') < n.index('profielBoven') for n in voorbeelden)), 'Stackvolgorde niet eenduidig'
            r['stack_kalibratie'] = {'leaf_eerst': True, 'voorbeelden': voorbeelden[:2], 'aantal': len(voorbeelden)}
            with gzip.open(a.uitvoer / 'profielen.json.gz', 'wt', encoding='utf-8') as f:
                json.dump(p.gebeurtenissen, f, ensure_ascii=False)
            lijsten = {'hoofdthread': []}
            for ev in p.gebeurtenissen[:profiel_einde]:
                if ev.get('method', '').startswith('ScriptProfiler.'):
                    lijsten['hoofdthread'].append(ev)
                elif ev.get('method') == 'Worker.dispatchMessageFromWorker':
                    binnen = json.loads(ev['params']['message'])
                    if binnen.get('method', '').startswith('ScriptProfiler.'):
                        lijsten.setdefault(ev['params']['workerId'], []).append(binnen)
            r['samenvatting'] = {}
            for naam, events in lijsten.items():
                compleet = [e['params'] for e in events if e['method'] == 'ScriptProfiler.trackingComplete']
                samples = [s for e in compleet for s in e.get('samples', {}).get('stackTraces', [])]
                top = Counter()
                inclusief = Counter()
                for sample in samples:
                    frames = sample.get('stackFrames', [])
                    sleutel = lambda f: (f.get('name'), f.get('url'), f.get('line'), f.get('column'))
                    if frames:
                        top[sleutel(frames[0])] += 1
                    inclusief.update(set((sleutel(f) for f in frames)))
                intervallen = sorted(((e['params']['event']['startTime'], e['params']['event']['endTime']) for e in events if e['method'] == 'ScriptProfiler.trackingUpdate'))
                som = 0
                einde = -1
                for start, stop in intervallen:
                    som += max(0, stop - max(start, einde))
                    einde = max(einde, stop)
                r['samenvatting'][naam] = {'events': len(events), 'voltooide_profielen': len(compleet), 'samples': len(samples), 'script_intervallen_unie_s': som if intervallen else None, 'interval_gebeurtenissen': len(intervallen), 'top': top.most_common(25), 'inclusief': inclusief.most_common(35)}
            # Pas na het profiel exacte bronbytes uit deze eigen binary halen.
            # Minificatienamen of kolommen nooit op een andere build projecteren.
            urls = sorted({f['url'] for sample in lijsten['hoofdthread']
                           if sample.get('method') == 'ScriptProfiler.trackingComplete'
                           for s in sample['params'].get('samples', {}).get('stackTraces', [])
                           for f in s['stackFrames']
                           if f.get('url', '').startswith('tauri://localhost/assets/') and f['url'].endswith('.js')})
            assert len(urls) <= 8, 'Te veel hoofdthreadbronnen voor begrensde bronattributie'
            r['scriptbronnen'] = []
            omvang = 0
            for url in urls:
                inhoud = await p.run('const r=await fetch('+json.dumps(url)+');if(!r.ok)throw Error("Eigen scriptbron niet opgehaald");return await r.text();')
                data = inhoud.encode()
                omvang += len(data)
                assert len(data) <= 4*1024*1024 and omvang <= 12*1024*1024, 'Scriptbron overschrijdt de diagnosegrens'
                naam = 'bron-'+url.rsplit('/', 1)[-1]+'.gz'
                (a.uitvoer/naam).write_bytes(gzip.compress(data, mtime=0))
                r['scriptbronnen'].append({'url': url, 'bestand': naam, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
            r.update(await p.ev("({voor,na:api().getEditorRef().getYrsSession().paragraphs('body').at(-1).text,paginas:api().getTotalPages()})"))
            assert r['na'] == r['voor'] + ' Een proefzin.'
            g = v.get_geometry()
            raw = v.get_image(0, 0, g.width, g.height, X.ZPixmap, 4294967295)
            Image.frombytes('RGB', (g.width, g.height), raw.data, 'raw', 'BGRX').save(a.uitvoer / 'profiel.png')
            r['geslaagd'] = True
            print(json.dumps({'samples': {n: s['samples'] for n, s in r['samenvatting'].items()}, 'kalibratie': r['stack_kalibratie'], 'invoer_en_inspectie_ms': r['invoer_en_inspectie_ms']}, ensure_ascii=False), flush=True)
    except Exception as e:
        r['fout'] = repr(e)
        raise
    finally:
        if app.poll() is None:
            os.killpg(app.pid, signal.SIGTERM)
            try:
                app.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(app.pid, signal.SIGKILL)
                app.wait(timeout=10)
        d.close()
        log.close()
        (a.uitvoer / 'profiel.json').write_text(json.dumps(r, ensure_ascii=False, indent=2) + '\n')
    return 0
basis.proef = proef
basis.__file__ = str(Path(__file__).resolve())
if __name__ == '__main__':
    import argparse
    p = argparse.ArgumentParser(add_help=False)
    p.add_argument('--bron', type=Path, default=os.environ.get('OFFICE_PROFIEL_BRON'))
    eigen, overig = p.parse_known_args()
    if eigen.bron is None and '--help' not in overig:
        p.error('Geef --bron met een eigen DOCX van 500 pagina’s; de proef werkt uitsluitend op een kopie.')
    if eigen.bron is not None:
        os.environ['OFFICE_PROFIEL_BRON'] = str(eigen.bron.resolve(strict=True))
    sys.argv = [sys.argv[0], *overig]
    basis.__doc__ = __doc__
    raise SystemExit(basis.main())
