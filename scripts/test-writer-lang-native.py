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


def ruim_profiel_op(pad):
    try:
        shutil.rmtree(pad, ignore_errors=True)
    except OSError as fout:
        # Een verdwijnende eigen portalmap kan ook bij fstat een fout geven.
        # Alleen opruimen is vrijblijvend; de uitkomst van de proef blijft staan.
        print('Eigen tijdelijke profielmap niet volledig opgeruimd: '+str(fout), file=sys.stderr)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--programma', type=Path, required=True)
    p.add_argument('--uitvoer', type=Path, required=True)
    p.add_argument('--versie', required=True)
    p.add_argument('--historische-registerwissels', action='store_true', help='Alleen voor vergelijking met een oude binary: registreer de canvaswissels zonder deze specifieke nieuwe acceptatie-eis.')
    p.add_argument('--herstelstart', action='store_true', help='Wacht op een echte eigen herstelkopie en toets Later, verder bewerken en daarna Herstellen in een nieuw tabblad.')
    p.add_argument('--geheugenrondes', type=int, default=0, help='Extra selectie-/Backspace-/undo-/redo-rondes vóór de gewone bewaarproef (0–100).')
    p.add_argument('--geheugen-gc', action='store_true', help='Vraag na iedere extra ronde expliciet WebKit-garbagecollection aan; een geweigerde opdracht keurt de proef af.')
    p.add_argument('--binnen', action='store_true', help=argparse.SUPPRESS)
    a = p.parse_args()
    if not 0 <= a.geheugenrondes <= 100:
        p.error('--geheugenrondes moet tussen 0 en 100 liggen')
    if a.geheugen_gc and not a.geheugenrondes:
        p.error('--geheugen-gc vereist minstens één geheugenronde')
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
        opruimen.callback(ruim_profiel_op, tmp)
        omgeving = os.environ.copy()
        for naam in ['DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'DBUS_STARTER_ADDRESS', 'DBUS_STARTER_BUS_TYPE', 'GNOME_KEYRING_CONTROL', 'SSH_AUTH_SOCK', 'SESSION_MANAGER', 'WEBKIT_DISABLE_COMPOSITING_MODE']:
            omgeving.pop(naam, None)
        for naam in ['CONFIG', 'DATA', 'CACHE', 'RUNTIME']:
            pad = Path(tmp)/naam.lower()
            pad.mkdir(mode=0o700)
            omgeving['XDG_'+naam+'_HOME' if naam != 'RUNTIME' else 'XDG_RUNTIME_DIR'] = str(pad)
        http, inspectie = poorten()
        omgeving.update(GDK_BACKEND='x11', LC_ALL='C.UTF-8', WEBKIT_DISABLE_DMABUF_RENDERER='1', WEBKIT_INSPECTOR_HTTP_SERVER=f'127.0.0.1:{http}', WEBKIT_INSPECTOR_SERVER=f'127.0.0.1:{inspectie}', OFFICE_PROEF_HTTP=str(http))
        extra = ['--historische-registerwissels'] if a.historische_registerwissels else []
        extra += ['--geheugenrondes', str(a.geheugenrondes)]
        if a.herstelstart:
            extra.append('--herstelstart')
        if a.geheugen_gc:
            extra.append('--geheugen-gc')
        return subprocess.call(['dbus-run-session', '--', 'xvfb-run', '-a', '-s', '-screen 0 1600x1100x24 -nolisten tcp', sys.executable, str(Path(__file__).resolve()), '--binnen', '--programma', str(a.programma), '--uitvoer', str(a.uitvoer), '--versie', a.versie, *extra], env=omgeving)


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
    rapport = {'geslaagd': False, 'versie': a.versie, 'programma_sha256': hashlib.sha256(a.programma.read_bytes()).hexdigest(), 'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'bron_begin_sha256': hashlib.sha256(bron.read_bytes()).hexdigest(), 'stappen': [], 'invoerinterval_ms': 20, 'vaste_nawacht_ms': 2000, 'invoer_gereedheid': 'Native keyup van de laatste punt, inputwachtrij, zichtbare golflijnen en één exacte controle van de laatste alinea; alle 500 bronalinea’s daarnaast apart vergeleken.', 'grenzen': ['Eén gegenereerde 500-paginabron, normale compositor, alleen een lichte teller om getBoundingClientRect. Geen algemene prestatie-, IME-, enorme-plak- of platformacceptatie.']}

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
                    pid_prop = v.get_full_property(d.intern_atom('_NET_WM_PID'), X.AnyPropertyType)
                    pid = int(pid_prop.value[0]) if pid_prop is not None else programma.pid
                    werkelijk = Path(f'/proc/{pid}/exe').read_bytes()
                    assert werkelijk.startswith(b'\x7fELF'), 'Eigen vensterproces is geen ELF'
                    rapport['startprogramma_sha256'] = hashlib.sha256(a.programma.read_bytes()).hexdigest()
                    rapport['programma_sha256'] = hashlib.sha256(werkelijk).hexdigest()
                    maps = Path(f'/proc/{pid}/maps').read_text()
                    rapport['geladen_runtime'] = sorted({regel.split()[-1] for regel in maps.splitlines() if 'libwebkit2gtk' in regel or 'libjavascriptcoregtk' in regel})
                    v.configure(x=0, y=0, width=1440, height=1000); v.set_input_focus(X.RevertToParent, X.CurrentTime); d.sync()
                    await asyncio.sleep(12)
                    return
            await asyncio.sleep(.1)
        raise TimeoutError('Eigen proefvenster niet gevonden')

    def lees_docx(pad):
        with ZipFile(pad) as z:
            xml = ET.fromstring(z.read('word/document.xml'))
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        return [''.join(e.text or '' for e in alinea.findall('.//w:t', ns)) for alinea in xml.findall('.//w:body/w:p', ns)]

    async def klik(p, selector):
        xy = await p.ev("(()=>{const e=document.querySelector("+json.dumps(selector)+");if(!e||e.disabled)throw Error('Eigen herstelknop ontbreekt');const r=e.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()")
        subprocess.run(['xdotool', 'mousemove', '--window', str(venster.id), str(xy['x']), str(xy['y']), 'click', '1'], check=True)

    async def gereed(p, heropenen=False, herstelkeuze='later'):
        await p.command('Console.enable')
        if a.herstelstart and not heropenen:
            # De normale instelling is vijf minuten tussen gewijzigde kopieën.
            # Kies voor deze eigen proef het ondersteunde interval van één
            # minuut; een eerdere kopie kan vóór de laatste edit zijn gemaakt.
            await p.ev('localStorage.setItem("openaec-office-herstelinterval", "1");true')
            rapport['herstelbeleid_proef'] = {
                'interval_minuten': 1,
                'wachtgrens_seconden': 120,
                'betekenis': 'Eén interval, een periodieke tik van 30 seconden en 30 seconden export-/IO-ruimte; de uiteindelijke kopie moet nog steeds volledig actueel zijn.',
            }
        try:
            if heropenen:
                await p.begin_foutbewaking()
                if a.herstelstart:
                    await p.run("const eind=performance.now()+15000;while(!document.querySelector('.office-herstel')){if(performance.now()>eind)throw Error('Eigen herstelkopie niet aangeboden');await new Promise(r=>setTimeout(r,100))}return true;")
                aanbod = await p.ev("(()=>{const d=document.querySelector('.office-herstel');return d?{namen:Array.from(d.querySelectorAll('.office-herstellijst strong')).map(e=>e.textContent),tekst:d.textContent}:null})()")
                fouten = await p.fouten()
                rapport.setdefault('herstelkeuzes', []).append({'keuze': herstelkeuze, 'aanbod': aanbod, 'fouten_voor_keuze': fouten})
                # Eerst de oorspronkelijke render-/enginefout afkeuren. Niet
                # wegklikken en daarna een gerepareerde proef suggereren.
                assert not any(fouten.values()), 'Applicatiefout achter het herstelvenster'
                if aanbod:
                    assert aanbod['namen'] == ['Prestatieproef.docx'], 'Onverwacht herstelitem in het eigen geïsoleerde profiel'
                    assert not await p.ev("document.body.innerText.includes('Something went wrong')"), 'Renderfout achter het herstelvenster'
                    beeld('herstel-aanbod-'+herstelkeuze)
                    bron_voor_keuze = hashlib.sha256(bron.read_bytes()).hexdigest()
                    await klik(p, '.office-herstel .office-dialoogacties button' if herstelkeuze == 'later' else '.office-herstel .office-dialoogdoorgaan')
                    await p.run("const eind=performance.now()+15000;while(document.querySelector('.office-herstel')){if(performance.now()>eind)throw Error('Eigen herstelkeuze niet verwerkt');await new Promise(r=>setTimeout(r,100))}return true;")
                    assert hashlib.sha256(bron.read_bytes()).hexdigest() == bron_voor_keuze, 'Herstelkeuze overschrijft de oorspronkelijke bron'
            await p.run('''window.proefApi=()=>{const el=document.querySelector('.office-tabpaneel:not([hidden]) .office-tekst');if(!el)return null;for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let s=f.memoizedState,i=0;s&&i<200;i++,s=s.next){const v=s.memoizedState?.current;if(v?.getEditorRef&&v.commands)return v}return null};let einde=performance.now()+60000;while(proefApi()?.getTotalPages()!==500||!proefApi().getEditorRef()?.getYrsSession()){if(performance.now()>einde)throw Error('500 pagina’s niet gereed');await new Promise(r=>setTimeout(r,100))}await proefApi().flushPendingInput();return true;''')
        except Exception:
            # Bewaar een opstartafkeuring terwijl de inspectieverbinding nog
            # bestaat. Een herstelvenster of foutmelding wordt niet weggeklikt.
            try:
                rapport['niet_gereed'] = await p.ev("({paginas:window.proefApi?.()?.getTotalPages(),tekst:document.body.innerText.slice(0,16000),meldingen:Array.from(document.querySelectorAll('.office-melding')).map(e=>e.textContent)})")
                rapport['niet_gereed']['console'] = list(p.consoleberichten)
            except Exception as inspectiefout:
                rapport['niet_gereed_inspectiefout'] = repr(inspectiefout)
            raise
        werkelijk = await p.run("return await window.__TAURI_INTERNALS__.invoke('plugin:app|version');")
        assert werkelijk == a.versie, (werkelijk, a.versie)
        await p.begin_foutbewaking()
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
            # Tel de werkelijke projecties naar de pakketstructuur; een
            # verborgen lint mag niet het hele document per toets opbouwen.
            await p.ev("window._docRef=(()=>{let el=document.querySelector('.office-tabpaneel:not([hidden]) .office-tekst');for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let s=f.memoizedState,n=0;s&&n<200;n++,s=s.next)if(s.memoizedState?.current?.getEditorRef&&s.memoizedState.current.commands)return s.memoizedState;throw Error('API-ref ontbreekt')})();window._docDescriptor=Object.getOwnPropertyDescriptor(_docRef,'current');if(!_docDescriptor?.configurable||!('value' in _docDescriptor))throw Error('API-ref niet meetbaar');window._docValue=_docRef.current;window._docProef={calls:0,ms:0,api_wissels:0};window._docOrig=[];window._docSeen=new WeakSet;window._docVolg=a=>{if(!a||_docSeen.has(a))return;let oud=a.getDocument;if(typeof oud!=='function')throw Error('GetDocument-meetpunt ontbreekt');_docSeen.add(a);_docOrig.push([a,oud]);a.getDocument=function(...args){_docProef.calls++;let begin=performance.now();try{return oud.apply(this,args)}finally{_docProef.ms+=performance.now()-begin}}};_docVolg(_docValue);Object.defineProperty(_docRef,'current',{configurable:true,enumerable:_docDescriptor.enumerable,get(){return _docValue},set(a){_docProef.api_wissels++;_docVolg(a);_docValue=a}});true")
            # Dezelfde Rust-sessie blijft bij deze invoer bestaan, ook als de
            # React-API-objecten wisselen. Tel de synchrone spellingleesroute.
            await p.ev("""
              window._nativeSessie = proefApi().getEditorRef().getYrsSession();
              window._nativeLees = {};
              window._nativeHerstel = [];
              for (const naam of ['readParagraphs', 'paragraphSpans']) {
                const oud = _nativeSessie[naam];
                if (typeof oud !== 'function') throw Error('Native leesmeetpunt ontbreekt');
                const eigen = Object.getOwnPropertyDescriptor(_nativeSessie, naam);
                _nativeLees[naam] = {calls: 0, ms: 0};
                _nativeHerstel.push([naam, eigen]);
                _nativeSessie[naam] = function(...args) {
                  const meting = _nativeLees[naam], begin = performance.now();
                  meting.calls++;
                  try { return oud.apply(this, args); }
                  finally { meting.ms += performance.now() - begin; }
                };
              }
              window._canvasVergelijkOrig = Node.prototype.compareDocumentPosition;
              window._canvasVergelijk = {calls: 0};
              Node.prototype.compareDocumentPosition = function(node) {
                if (this instanceof HTMLCanvasElement && node instanceof HTMLCanvasElement) _canvasVergelijk.calls++;
                return _canvasVergelijkOrig.call(this, node);
              };
              true
            """)
            vanaf = await p.ev('_toetsenProef.length')
            begin = time.monotonic()
            subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '20', ' Een proefzin.'], check=True)
            # Wacht op de werkelijk verwerkte laatste toets vóór het legen van
            # de invoerwachtrij. Lees niet telkens alle 500 alinea’s tijdens de
            # tijdmeting; hun exacte broncontrole volgt eenmaal hieronder.
            laatste = await p.run("let einde=performance.now()+90000;while(!_toetsenProef.slice("+str(vanaf)+").some(e=>e.key==='.')){if(performance.now()>einde)throw Error('Laatste native invoertoets niet ontvangen');await new Promise(r=>setTimeout(r,50))}await proefApi().flushPendingInput();while(!document.querySelector('.spelling-golf')){if(performance.now()>einde)throw Error('Golflijnen niet gereed');await new Promise(r=>setTimeout(r,50))}return proefApi().getEditorRef().getYrsSession().paragraphs('body').at(-1).text;", t=100)
            assert laatste == origineel[-1]+' Een proefzin.', 'Laatste invoer na keyup en flush niet exact'
            rapport['invoer_tot_bron_en_golven_ms'] = round((time.monotonic()-begin)*1000)
            rapport['paginavergelijkingen_tijdens_invoer'] = await p.ev('(()=>{Node.prototype.compareDocumentPosition=_canvasVergelijkOrig;return _canvasVergelijk})()')
            rapport['documentuitlezingen_tijdens_invoer'] = await p.ev("(()=>{let gevolgd=_docSeen.has(proefApi());Object.defineProperty(_docRef,'current',{..._docDescriptor,value:_docValue});for(let[a,oud]of _docOrig)a.getDocument=oud;return{..._docProef,actieve_api_gevolgd:gevolgd,omvang:'GetDocument-aanroepen tijdens native invoer tot bron-/golflijngereedheid. De stabiele React-ref volgt vervanging van API-objecten; geen CPU-profiler.'}})()")
            assert rapport['documentuitlezingen_tijdens_invoer']['actieve_api_gevolgd'], 'Actieve API buiten de invoermeting gevallen'
            rapport['native_leesaanroepen'] = await p.ev("""
              (() => {
                const zelfde = proefApi().getEditorRef().getYrsSession() === _nativeSessie;
                for (const [naam, eigen] of _nativeHerstel) {
                  if (eigen) Object.defineProperty(_nativeSessie, naam, eigen);
                  else delete _nativeSessie[naam];
                }
                return {zelfde_sessie: zelfde, ..._nativeLees};
              })()
            """)
            assert rapport['native_leesaanroepen']['zelfde_sessie'], 'Native sessie vervangen tijdens invoermeting'
            tussenpozen = await p.ev('(()=>{_frameProef.stop=true;return _frameProef.v})()')
            volgorde = sorted(tussenpozen)
            rapport['frame_tussenpozen_ms'] = {'aantal': len(volgorde), 'maximum': volgorde[-1] if volgorde else None, 'p95': volgorde[min(len(volgorde)-1, int(len(volgorde)*.95))] if volgorde else None, 'reeks': tussenpozen, 'omvang': 'requestAnimationFrame tijdens invoer en bron-/golflijngereedheid; vóór de vaste nawacht. Geen fysieke beeldscherm-FPS.'}
            await asyncio.sleep(2)
            rapport['invoermeting'] = await p.ev("(()=>{Element.prototype.getBoundingClientRect=_rectOud;return{..._rectProef,golven:document.querySelectorAll('.spelling-golf').length,paginas:proefApi().getTotalPages()}})()")
            rapport['invoermeting']['tot_bron_en_golven_ms_inclusief_nawacht'] = round((time.monotonic()-begin)*1000)
            getypt = list(origineel); getypt[-1] += ' Een proefzin.'
            await controle(p, 'getypte_bron', getypt); beeld('getypt-pagina-500')
            if a.geheugenrondes:
                rapport['geheugenproef'] = {'gevraagde_rondes': a.geheugenrondes, 'gc_gevraagd': a.geheugen_gc, 'rondes': [], 'grens': 'Extra native geschiedenis-/selectiebelasting; geen bewijs dat een incidentele allocatorpanic is opgelost.'}
                if a.geheugen_gc:
                    antwoord = await p.command('Heap.enable')
                    assert not antwoord.get('error'), antwoord
                for ronde in range(1, a.geheugenrondes + 1):
                    # Right is een unieke laatste keyup: wachten op z kan al
                    # de eerste undo zien terwijl de rest nog onderweg is.
                    await toets(p, 'ctrl+shift+Left', 'BackSpace', 'ctrl+z', 'ctrl+y', 'ctrl+z', 'Right')
                    gc = None
                    if a.geheugen_gc:
                        gc = await p.command('Heap.gc')
                        assert not gc.get('error'), gc
                    teksten = await bronstand(p)
                    fouten = await p.fouten()
                    stap = {'ronde': ronde, 'exact': teksten == getypt, **samenvatting(teksten), 'fouten': fouten, 'gc': gc}
                    rapport['geheugenproef']['rondes'].append(stap)
                    assert stap['exact'], 'Geheugenronde verandert brongegevens'
                    assert not any(fouten.values()), 'GUI of engine meldt fouten in de geheugenronde'
                    print('geheugenronde', ronde, 'geslaagd', flush=True)
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
            # De luie kop-/voettekstinhoud moet dezelfde bediening en
            # geometrie houden; leg beide tabbladen buiten de snelheidsmeting vast.
            rapport['lintbeelden'] = {}
            for sleutel, naam in [('startlint', 'Home'), ('kopvoetlint', 'Header & Footer')]:
                xy = await p.ev("(()=>{let t=Array.from(document.querySelectorAll('.office-lintplek:not([hidden]) [role=tab],.office-tekst [role=tab]')).find(t=>t.textContent.trim()==="+json.dumps(naam)+");if(!t)throw Error('Linttab ontbreekt');let r=t.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()")
                subprocess.run(['xdotool', 'mousemove', '--window', str(venster.id), str(xy['x']), str(xy['y']), 'click', '1'], check=True)
                await p.run("let einde=performance.now()+10000;while(!Array.from(document.querySelectorAll('.office-lintplek:not([hidden]) [role=tab],.office-tekst [role=tab]')).some(t=>t.textContent.trim()==="+json.dumps(naam)+"&&t.getAttribute('aria-selected')==='true')){if(performance.now()>einde)throw Error('Linttab niet gekozen');await new Promise(r=>setTimeout(r,50))}return true;")
                await asyncio.sleep(1)
                rapport['lintbeelden'][sleutel] = await p.ev("(()=>{let b=(document.querySelector('.office-lintplek:not([hidden]) .ribbon')||document.querySelector('.office-tekst .ribbon')),r=b.getBoundingClientRect();return{plek:{x:r.x,y:r.y,breedte:r.width,hoogte:r.height},knoppen:Array.from(b.querySelectorAll('.ribbon-baan button')).map(e=>({naam:e.getAttribute('aria-label')||e.textContent,actief:e.getAttribute('aria-pressed'),uit:e.disabled}))}})()")
                beeld(sleutel)
            assert any(k['naam']=='Different First Page' for k in rapport['lintbeelden']['kopvoetlint']['knoppen']), 'Koptekstopties ontbreken'
            # Het register moet dezelfde canvasnodes blijven gebruiken als
            # alleen hun schaal verandert, en echte structuurwijzigingen wel
            # volgen. De onafhankelijke waarheid is de actuele DOM-volgorde.
            rapport['paginaregister'] = await p.run('''
              const host = document.querySelector('.canvas-pages');
              let registry = null;
              for (let f=host[Object.keys(host).find(k=>k.startsWith('__reactFiber$'))];f&&!registry;f=f.return) {
                for (let s=f.memoizedState,n=0;s&&n<200;s=s.next,n++) {
                  const v=s.memoizedState;
                  if (v && typeof v.all==='function' && typeof v.canvas==='function' && typeof v.invalidate==='function') { registry=v; break; }
                }
              }
              if (!registry) throw Error('Paginaregister niet gevonden');
              window._registerProef = registry;
              window._controleerRegister = () => {
                const dom=Array.from(host.querySelectorAll('.canvas-pages__column > .canvas-page > canvas'));
                const alle=registry.all();
                if (dom.length!==alle.length || dom.some((c,i)=>c!==alle[i] || registry.canvas(Number(c.dataset.pageIndex))!==c)) throw Error('Register wijkt af van werkelijke DOM-volgorde/indices');
                return dom.length;
              };
              const aantal=_controleerRegister(), teller={add:0,delete:0,invalidate:0}, herstel=[];
              for (const naam of Object.keys(teller)) {
                const eigen=Object.getOwnPropertyDescriptor(registry,naam), oud=registry[naam];
                herstel.push([naam,eigen]);
                registry[naam]=function(...args){teller[naam]++;return oud.apply(this,args)};
              }
              try {
                proefApi().setZoom(1.15);
                await new Promise(r=>setTimeout(r,1000));
                await proefApi().flushPendingInput();
                const na=_controleerRegister();
                return {voor:aantal,na,zoom:proefApi().getZoom(),...teller};
              } finally {
                for (const [naam,eigen] of herstel) {
                  if (eigen) Object.defineProperty(registry,naam,eigen); else delete registry[naam];
                }
              }
            ''')
            assert rapport['paginaregister']['voor'] == rapport['paginaregister']['na'] == 500
            assert rapport['paginaregister']['zoom'] == 1.15
            rapport['paginaregister']['historische_registerwissels'] = a.historische_registerwissels
            rapport['paginaregister']['geen_canvaswissels'] = rapport['paginaregister']['add'] == rapport['paginaregister']['delete'] == 0
            if not a.historische_registerwissels:
                assert rapport['paginaregister']['geen_canvaswissels'], 'Zoomen registreert ongewijzigde canvasnodes opnieuw'
            await p.run("const e=proefApi().getEditorRef(),p=e.getYrsSession().paragraphs('body')[0];e.setSelection(e.yrsLocToDisplayPosition({story:'body',paraId:p.paraId,offset:20}));proefApi().focus();return true;")
            rapport['paginaregister']['paginaopdracht'] = await p.run("return await proefApi().commands.execute('insertPageBreak',null);")
            assert rapport['paginaregister']['paginaopdracht']['ok'], 'Paginaopdracht geweigerd'
            rapport['paginaregister']['na_pagina_invoegen'] = await p.run("const eind=performance.now()+30000;while(proefApi().getTotalPages()!==501||document.querySelectorAll('.canvas-pages__column > .canvas-page > canvas').length!==501){if(performance.now()>eind)throw Error('Ingevoegde pagina niet gereed');await new Promise(r=>setTimeout(r,100))}await proefApi().flushPendingInput();return _controleerRegister();")
            assert rapport['paginaregister']['na_pagina_invoegen'] == 501
            subprocess.run(['xdotool', 'key', '--clearmodifiers', 'ctrl+z'], check=True)
            rapport['paginaregister']['na_undo'] = await p.run("const eind=performance.now()+30000;while(proefApi().getTotalPages()!==500||document.querySelectorAll('.canvas-pages__column > .canvas-page > canvas').length!==500){if(performance.now()>eind)throw Error('Undo pagina niet gereed');await new Promise(r=>setTimeout(r,100))}await proefApi().flushPendingInput();proefApi().setZoom(1);return _controleerRegister();")
            assert rapport['paginaregister']['na_undo'] == 500
            assert await bronstand(p) == getypt, 'Pagina invoegen/undo verandert bronalinea’s'
            rapport['paginaregister']['geslaagd'] = True
            print('paginaregister, zoom en paginagrens geslaagd', flush=True)
            if a.herstelstart:
                # Dit pad ligt uitsluitend onder het voor deze proef gemaakte
                # XDG-profiel. Wacht op de echte periodieke app-bewaring.
                herstelmap = Path(os.environ['XDG_DATA_HOME']) / 'org.openaec.office-studio' / 'herstel'
                einde = time.monotonic()+rapport['herstelbeleid_proef']['wachtgrens_seconden']
                herstelkopie = None
                rapport['herstelwaarnemingen'] = []
                herstelgezien = set()
                while herstelkopie is None:
                    for kandidaat in herstelmap.glob('*/tab-*.bin'):
                        if not kandidaat.with_suffix('.json').is_file():
                            continue
                        try:
                            inhoud = lees_docx(kandidaat)
                            som = hashlib.sha256(kandidaat.read_bytes()).hexdigest()
                            if som not in herstelgezien:
                                herstelgezien.add(som)
                                exact = inhoud == getypt
                                rapport['herstelwaarnemingen'].append({
                                    'sha256': som, 'exact': exact,
                                    'alinea_aantal': len(inhoud),
                                    'tekst_sha256': hashlib.sha256(json.dumps(inhoud, ensure_ascii=False).encode()).hexdigest(),
                                })
                                if not exact:
                                    # Alleen de laatste afwijkende eigen proefkopie;
                                    # niets uit een gebruikersprofiel verzamelen.
                                    shutil.copyfile(kandidaat, a.uitvoer/'herstel-afwijkend.docx')
                                    shutil.copyfile(kandidaat.with_suffix('.json'), a.uitvoer/'herstel-afwijkend.json')
                            if inhoud == getypt:
                                herstelkopie = kandidaat
                                break
                        except FileNotFoundError:
                            continue
                    if time.monotonic() >= einde:
                        try:
                            rapport['fouten_tijdens_herstelwacht'] = await p.fouten()
                        except Exception as bewakingsfout:
                            rapport['foutbewaking_niet_beschikbaar'] = repr(bewakingsfout)
                    assert time.monotonic() < einde, 'Geen actuele eigen periodieke herstelkopie'
                    if herstelkopie is None:
                        await asyncio.sleep(.2)
                shutil.copyfile(herstelkopie, a.uitvoer/'herstelkopie.docx')
                rapport['herstelkopie'] = {'sha256': hashlib.sha256(herstelkopie.read_bytes()).hexdigest(), 'exact': lees_docx(herstelkopie) == getypt}
                print('eigen periodieke herstelkopie geslaagd', flush=True)
            rapport['fouten_voor_heropenen'] = await p.fouten()
            assert not any(rapport['fouten_voor_heropenen'].values()), 'GUI of engine meldt fouten vóór heropenen'
        stop(); await start()
        async with Inspector(int(os.environ['OFFICE_PROEF_HTTP'])) as p:
            await gereed(p, heropenen=True)
            await controle(p, 'nieuw_proces_heropend', getypt)
            if a.herstelstart:
                tekens = sum(len(tekst) for tekst in getypt)
                rapport['status_na_later'] = await p.run("const eind=performance.now()+8000;while(true){const b=Array.from(document.querySelectorAll('.office-statusbalk .statusbalk-module button')).map(e=>e.textContent||'');if(b[0]?.endsWith(' of 500')&&b[1]?.includes("+json.dumps(f', {tekens:,} characters')+"))return b;if(performance.now()>eind)throw Error('Statusbalk komt niet terug na Later: '+JSON.stringify(b));await new Promise(r=>setTimeout(r,100))}", t=10)
            rapport['fouten_na_heropenen'] = await p.fouten()
            assert not any(rapport['fouten_na_heropenen'].values()), 'GUI of engine meldt fouten na heropenen'
            if a.herstelstart:
                assert herstelkopie.is_file(), 'Later beslissen verwijdert de herstelkopie'
                assert hashlib.sha256(herstelkopie.read_bytes()).hexdigest() == rapport['herstelkopie']['sha256']
                await p.run("const e=proefApi().getEditorRef(),a=e.getYrsSession().paragraphs('body').at(-1);e.setSelection(e.yrsLocToDisplayPosition({story:'body',paraId:a.paraId,offset:a.text.length}));proefApi().scrollToPage(500);proefApi().focus();return true;")
                subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '20', ' Verder.'], check=True)
                await toets(p, 'Right')
                verder = list(getypt); verder[-1] += ' Verder.'
                await controle(p, 'verder_na_later', verder)
                voor = bron.stat().st_mtime_ns
                await toets(p, 'ctrl+s')
                einde = time.monotonic()+60
                while bron.stat().st_mtime_ns == voor:
                    assert time.monotonic() < einde, 'Bewaren na Later ontbreekt'
                    await asyncio.sleep(.1)
                assert lees_docx(bron) == verder, 'Vervolgbewaring na Later wijkt af'
                rapport['verder_na_later_bewaard'] = True
                rapport['bron_na_verder_sha256'] = hashlib.sha256(bron.read_bytes()).hexdigest()
                assert herstelkopie.is_file(), 'Vervolgbewaring verwijdert de oudere aangeboden kopie'
                assert hashlib.sha256(herstelkopie.read_bytes()).hexdigest() == rapport['herstelkopie']['sha256'], 'Vervolgbewaring verandert de oudere aangeboden kopie'
        if a.herstelstart:
            stop(); await start()
            async with Inspector(int(os.environ['OFFICE_PROEF_HTTP'])) as p:
                await gereed(p, heropenen=True, herstelkeuze='herstellen')
                await controle(p, 'herstelde_kopie', getypt)
                assert lees_docx(bron) == verder, 'Herstellen verandert de inmiddels verder bewerkte bron'
                assert hashlib.sha256(bron.read_bytes()).hexdigest() == rapport['bron_na_verder_sha256'], 'Herstellen wijzigt bytes van de oorspronkelijke bron'
                rapport['hersteltabbladen'] = await p.ev("document.querySelectorAll('.office-tabpaneel .office-tekst').length")
                assert rapport['hersteltabbladen'] == 2, 'Herstellen opent geen afzonderlijk document'
                assert not herstelkopie.exists(), 'Verwerkte kopie blijft aangeboden worden'
                await p.run("const e=proefApi().getEditorRef(),a=e.getYrsSession().paragraphs('body').at(-1);e.setSelection(e.yrsLocToDisplayPosition({story:'body',paraId:a.paraId,offset:a.text.length}));proefApi().scrollToPage(500);proefApi().focus();return true;")
                subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '20', ' Hersteld.'], check=True)
                await toets(p, 'Right')
                hersteld = list(getypt); hersteld[-1] += ' Hersteld.'
                await controle(p, 'verder_in_herstelde_kopie', hersteld)
                data = await p.run('return Array.from(new Uint8Array(await proefApi().save()));')
                kopie = a.uitvoer/'hersteld.docx'; kopie.write_bytes(bytes(data))
                assert lees_docx(kopie) == hersteld, 'Bewaarde herstelde kopie wijkt af'
                assert lees_docx(bron) == verder, 'Export van herstelde kopie wijzigt de oorspronkelijke bron'
                assert hashlib.sha256(bron.read_bytes()).hexdigest() == rapport['bron_na_verder_sha256'], 'Export van de herstelde kopie wijzigt oorspronkelijke bronbytes'
                rapport['herstel_fouten'] = await p.fouten()
                assert not any(rapport['herstel_fouten'].values()), 'GUI of engine meldt fouten in de herstelde kopie'
                beeld('herstelde-kopie-bewerkt')
                print('Herstellen, voortbewerken en onafhankelijk bewaren geslaagd', flush=True)
        rapport['bron_eind_sha256'] = hashlib.sha256(bron.read_bytes()).hexdigest()
        rapport['geslaagd'] = True
    except Exception as fout:
        rapport['fout'] = repr(fout)
        inspectie = locals().get('p')
        if inspectie is not None:
            rapport['console_bij_afkeuring'] = inspectie.consoleberichten
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
