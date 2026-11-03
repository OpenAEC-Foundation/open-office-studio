#!/usr/bin/env python3
"""Linux/WebKit: lijstknoppen, geschiedenis, bewaren en een nieuw native proces."""
import asyncio
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time
from urllib.request import urlopen
from xml.etree import ElementTree as ET
from zipfile import ZipFile

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('writer_basis', REPO/'scripts/test-writer-lang-native.py')
basis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(basis)
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
TEKST = 'Nummering bewaren en heropenen.'


def bewaarde_soort(pad):
    """Lees de echte numId → abstractNumId → niveaudefinitie, buiten de editor."""
    with ZipFile(pad) as z:
        doc = ET.fromstring(z.read('word/document.xml'))
        nummering = ET.fromstring(z.read('word/numbering.xml'))
        nummering_hash = hashlib.sha256(z.read('word/numbering.xml')).hexdigest()
    p = doc.find(f'{W}body/{W}p')
    assert ''.join(p.itertext()) == TEKST, 'Tekst veranderd bij de lijstopdracht'
    pr = p.find(f'{W}pPr/{W}numPr')
    num_id = int(pr.find(f'{W}numId').get(W+'val'))
    ilvl = pr.find(f'{W}ilvl')
    ilvl = int(ilvl.get(W+'val')) if ilvl is not None else 0
    if num_id == 0:
        return {'numId': 0, 'ilvl': ilvl, 'numFmt': None, 'nummering_sha256': nummering_hash}
    num = next(n for n in nummering.findall(W+'num') if int(n.get(W+'numId')) == num_id)
    abstract_id = int(num.find(W+'abstractNumId').get(W+'val'))
    abstract = next(n for n in nummering.findall(W+'abstractNum') if int(n.get(W+'abstractNumId')) == abstract_id)
    override = next((n for n in num.findall(W+'lvlOverride') if int(n.get(W+'ilvl')) == ilvl), None)
    niveau = override.find(W+'lvl') if override is not None else None
    if niveau is None:
        niveau = next(n for n in abstract.findall(W+'lvl') if int(n.get(W+'ilvl')) == ilvl)
    return {'numId': num_id, 'abstractNumId': abstract_id, 'ilvl': ilvl,
            'numFmt': niveau.find(W+'numFmt').get(W+'val'), 'nummering_sha256': nummering_hash}


async def proef(a):
    from Xlib import X, display
    from PIL import Image
    from gui.webkit_inspector import Inspector
    a.uitvoer.mkdir(parents=True, exist_ok=False)
    bron = a.uitvoer/'Lijstenproef.docx'
    shutil.copyfile(REPO/'public/templates/nieuw.docx', bron)
    with ZipFile(bron) as z:
        definitie_hash = hashlib.sha256(z.read('word/numbering.xml')).hexdigest()
    cfg = Path(os.environ['XDG_CONFIG_HOME'])/'org.openaec.office-studio'
    cfg.mkdir(parents=True)
    (cfg/'voorkeuren.json').write_text(json.dumps({'taal': 'en', 'thema': 'forge', 'updates': {'automatisch': False, 'kanaal': 'ontwikkel'}}))
    subprocess.run(['dbus-update-activation-environment', 'DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME'], check=True)
    d = display.Display()
    log = (a.uitvoer/'programma.log').open('w')
    programma = venster = None
    rapport = {'geslaagd': False, 'versie': a.versie,
               'programma_sha256': hashlib.sha256(a.programma.read_bytes()).hexdigest(),
               'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'stappen': [],
               'grenzen': ['Eigen nieuw DOCX met bestaande lijstdefinities, één Linux/WebKit-omgeving; geen Windows-, snelheids- of volledige lijstacceptatie.']}

    def stop():
        if programma and programma.poll() is None:
            os.killpg(programma.pid, signal.SIGTERM)
            try:
                programma.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(programma.pid, signal.SIGKILL)
                programma.wait()

    def beeld(naam):
        g = venster.get_geometry()
        raw = venster.get_image(0, 0, g.width, g.height, X.ZPixmap, 0xffffffff)
        Image.frombytes('RGB', (g.width, g.height), raw.data, 'raw', 'BGRX').save(a.uitvoer/(naam+'.png'))

    async def start():
        nonlocal programma, venster
        venster = None
        programma = subprocess.Popen([str(a.programma), str(bron)], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        einde = time.monotonic()+60
        while time.monotonic() < einde:
            assert programma.poll() is None, 'Eigen proefprogramma onverwacht afgesloten'
            for v in d.screen().root.query_tree().children:
                pid = v.get_full_property(d.intern_atom('_NET_WM_PID'), X.AnyPropertyType)
                if pid is None or int(pid.value[0]) != programma.pid:
                    continue
                if v.get_attributes().map_state == X.IsViewable:
                    venster = v
                    v.configure(x=0, y=0, width=1440, height=1000)
                    v.set_input_focus(X.RevertToParent, X.CurrentTime)
                    d.sync()
                    # Het GTK-venster bestaat vóór de WebKit-pagina. Wacht op
                    # de eigen inspectiepagina, niet op een vaste opstartduur.
                    while time.monotonic() < einde:
                        assert programma.poll() is None
                        try:
                            with urlopen(f"http://127.0.0.1:{os.environ['OFFICE_PROEF_HTTP']}/", timeout=2) as antwoord:
                                if b'/socket/' in antwoord.read():
                                    # De eerste about:blank wordt bij opstarten
                                    # nog vervangen; sluit daarna pas aan.
                                    await asyncio.sleep(12)
                                    return
                        except OSError:
                            pass
                        await asyncio.sleep(.1)
                    raise TimeoutError('Eigen WebKit-pagina niet gevonden')
            await asyncio.sleep(.1)
        raise TimeoutError('Eigen proefvenster niet gevonden')

    async def gereed(p):
        await p.run('''window.proefApi=()=>{const el=document.querySelector('.office-tabpaneel:not([hidden]) .office-tekst');if(!el)return null;for(let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];f;f=f.return)for(let s=f.memoizedState,i=0;s&&i<200;i++,s=s.next){const v=s.memoizedState?.current;if(v?.getEditorRef&&v.commands)return v}return null};let einde=performance.now()+60000;while(!proefApi()?.getEditorRef()?.getYrsSession()||proefApi().getTotalPages()<1){if(performance.now()>einde)throw Error('Writer niet gereed');await new Promise(r=>setTimeout(r,100))}await proefApi().flushPendingInput();return true;''')
        assert await p.run("return await window.__TAURI_INTERNALS__.invoke('plugin:app|version');") == a.versie
        await p.begin_foutbewaking()

    async def klik(p, label):
        xy = await p.ev("(()=>{const b=Array.from(document.querySelectorAll('.office-lintplek:not([hidden]) .ribbon-baan button')).find(b=>b.getAttribute('aria-label')==="+json.dumps(label)+");if(!b)throw Error('Lijstknop ontbreekt');const r=b.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()")
        subprocess.run(['xdotool', 'mousemove', '--window', str(venster.id), str(xy['x']), str(xy['y']), 'click', '1'], check=True)
        await p.run('await proefApi().flushPendingInput();return true;')

    async def controle(p, naam, verwacht, bewaar=True):
        # Verwerken van de echte native muis/toets en de lintmelding mag niet
        # worden verward met het verzenden door xdotool.
        await asyncio.sleep(.5)
        stand = await p.run("await proefApi().flushPendingInput();const a=proefApi(),s=a.getEditorRef().getYrsSession();return{alinea:s.paragraphs('body')[0],bullets:a.commands.getState('bulletList'),nummering:a.commands.getState('numberedList')};")
        stap = {'naam': naam, 'verwacht': verwacht, 'stand': stand}
        rapport['stappen'].append(stap)
        assert stand['alinea']['text'] == TEKST
        if bewaar:
            voor = bron.stat().st_mtime_ns
            subprocess.run(['xdotool', 'key', '--clearmodifiers', 'ctrl+s'], check=True)
            einde = time.monotonic()+30
            while bron.stat().st_mtime_ns == voor:
                assert time.monotonic() < einde, 'Native bewaren ontbreekt'
                await asyncio.sleep(.1)
            # De native bewaaropdracht schrijft atomair; XML is de poort.
            stap['bewaard'] = bewaarde_soort(bron)
            assert stap['bewaard']['numFmt'] == verwacht, stap
            assert stap['bewaard']['nummering_sha256'] == definitie_hash, 'Ongewijzigde definities herschreven'
            shutil.copy2(bron, a.uitvoer/(naam+'.docx'))
        assert stand['bullets'].get('active') is (verwacht == 'bullet'), stap
        assert stand['nummering'].get('active') is (verwacht == 'decimal'), stap
        if verwacht:
            assert stand['alinea']['properties'].get('listIsBullet') is (verwacht == 'bullet'), stap
        beeld(naam)
        stap['geslaagd'] = True
        print(naam, 'geslaagd', flush=True)

    try:
        await start()
        async with Inspector(int(os.environ['OFFICE_PROEF_HTTP'])) as p:
            await gereed(p)
            await p.run("const e=proefApi().getEditorRef(),p=e.getYrsSession().paragraphs('body')[0];e.setSelection(e.yrsLocToDisplayPosition({story:'body',paraId:p.paraId,offset:0}));proefApi().focus();return true;")
            subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '20', TEKST], check=True)
            await p.run("const einde=performance.now()+20000;while(proefApi().getEditorRef().getYrsSession().paragraphs('body')[0].text!=="+json.dumps(TEKST)+"){if(performance.now()>einde)throw Error('Invoer niet gereed');await new Promise(r=>setTimeout(r,50))}await proefApi().flushPendingInput();return true;")
            await klik(p, 'Bullets')
            await controle(p, '01-opsomming', 'bullet')
            await klik(p, 'Numbering')
            await controle(p, '02-nummering', 'decimal')
            subprocess.run(['xdotool', 'key', '--clearmodifiers', 'ctrl+z'], check=True)
            await controle(p, '03-ongedaan', 'bullet')
            subprocess.run(['xdotool', 'key', '--clearmodifiers', 'ctrl+y'], check=True)
            await controle(p, '04-opnieuw', 'decimal')
            rapport['fouten_eerste_proces'] = await p.fouten()
            assert not any(rapport['fouten_eerste_proces'].values())
        stop()
        await start()
        async with Inspector(int(os.environ['OFFICE_PROEF_HTTP'])) as p:
            await gereed(p)
            await controle(p, '05-heropend', 'decimal', bewaar=False)
            await klik(p, 'Bullets')
            await controle(p, '06-terug-opsomming', 'bullet')
            await klik(p, 'Bullets')
            await controle(p, '07-uit', None)
            rapport['fouten_tweede_proces'] = await p.fouten()
            assert not any(rapport['fouten_tweede_proces'].values())
        rapport['geslaagd'] = True
    except Exception as fout:
        rapport['fout'] = repr(fout)
        raise
    finally:
        stop()
        d.close()
        log.close()
        (a.uitvoer/'rapport.json').write_text(json.dumps(rapport, ensure_ascii=False, indent=2)+'\n')
    return 0


basis.proef = proef
basis.__file__ = str(Path(__file__).resolve())
if __name__ == '__main__':
    raise SystemExit(basis.main())
