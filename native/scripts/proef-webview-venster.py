#!/usr/bin/env python3
"""Gerichte echte Linux-vensterproef; geen volledige functie- of pixelacceptatie."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time


def sha(pad):
    return hashlib.sha256(pad.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--programma', type=Path, required=True)
    parser.add_argument('--bron', type=Path, required=True)
    parser.add_argument('--uitvoer', type=Path, required=True)
    parser.add_argument('--binnen', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    args.programma = args.programma.resolve(strict=True)
    args.bron = args.bron.resolve(strict=True)
    args.uitvoer = args.uitvoer.resolve()
    if not args.binnen:
        for opdracht in ['dbus-run-session', 'dbus-update-activation-environment', 'xvfb-run', 'xdotool']:
            if not shutil.which(opdracht):
                raise RuntimeError('Testhulpmiddel ontbreekt: '+opdracht)
        omgeving = os.environ.copy()
        for naam in ['DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'DBUS_STARTER_ADDRESS', 'DBUS_STARTER_BUS_TYPE', 'GNOME_KEYRING_CONTROL', 'SSH_AUTH_SOCK', 'SESSION_MANAGER']:
            omgeving.pop(naam, None)
        basis = Path(tempfile.mkdtemp(prefix='office-webview-proef-'))
        basis.chmod(0o700)
        for naam in ['CONFIG', 'DATA', 'CACHE', 'RUNTIME']:
            pad = basis/naam.lower()
            pad.mkdir(mode=0o700)
            omgeving['XDG_'+naam+'_HOME' if naam != 'RUNTIME' else 'XDG_RUNTIME_DIR'] = str(pad)
        omgeving.update(GDK_BACKEND='x11', WEBKIT_DISABLE_DMABUF_RENDERER='1')
        return subprocess.call(['dbus-run-session', '--', 'xvfb-run', '-a', '-s', '-screen 0 1440x900x24 -nolisten tcp', sys.executable, str(Path(__file__).resolve()), '--binnen', '--programma', str(args.programma), '--bron', str(args.bron), '--uitvoer', str(args.uitvoer)], env=omgeving)
    from Xlib import X, display
    from Xlib.protocol import event
    from PIL import Image
    args.uitvoer.mkdir(parents=True, exist_ok=False)
    bron = args.uitvoer/'Eigen-notitieboek.json'
    bron.write_bytes(args.bron.read_bytes())
    log = (args.uitvoer/'programma.log').open('w')
    d = display.Display()
    programma = None
    venster = None
    rapport = {'geslaagd': False, 'omvang': __doc__, 'programma_sha256': sha(args.programma), 'programma_versie': subprocess.check_output([str(args.programma), '--version'], text=True).strip(), 'script_sha256': sha(Path(__file__)), 'bron_begin_sha256': sha(bron), 'invoerinterval_ms': 12, 'stappen': [], 'controles': []}

    def naam(v):
        prop = v.get_full_property(d.intern_atom('_NET_WM_NAME'), X.AnyPropertyType)
        tekst = prop.value if prop else v.get_wm_name()
        return tekst.decode('utf-8', errors='replace') if isinstance(tekst, bytes) else str(tekst or '')

    def diagnose():
        return {'programma_eindcode': programma.poll(), 'vensters': [{'id': v.id, 'naam': naam(v), 'zichtbaar': v.get_attributes().map_state} for v in d.screen().root.query_tree().children]}

    def beeld(titel):
        assert programma.poll() is None, 'Programma onverwacht afgesloten'
        assert venster.get_attributes().map_state == X.IsViewable, 'Eigen venster onverwacht verborgen'
        omvang = venster.get_geometry()
        assert (omvang.width, omvang.height) == (1058, 892)
        raw = venster.get_image(0, 0, 1058, 892, X.ZPixmap, 0xffffffff)
        pad = args.uitvoer/(titel+'.png')
        Image.frombytes('RGB', (1058, 892), raw.data, 'raw', 'BGRX').save(pad)
        h = sha(bron)
        kopie = args.uitvoer/('bron-'+h+'.json')
        if not kopie.exists():
            kopie.write_bytes(bron.read_bytes())
        return {'bestand': pad.name, 'sha256': sha(pad), 'bron_sha256': h}

    def start(titel):
        nonlocal programma, venster
        programma = subprocess.Popen([str(args.programma), str(bron)], stdout=log, stderr=subprocess.STDOUT, cwd=args.uitvoer)
        for _ in range(300):
            assert programma.poll() is None, 'Programma start niet'
            kandidaten = [v for v in d.screen().root.query_tree().children if v.get_attributes().map_state == X.IsViewable and naam(v).startswith('Open Office Studio')]
            if kandidaten:
                venster = kandidaten[0]
                venster.set_input_focus(X.RevertToParent, X.CurrentTime)
                d.sync()
                break
            time.sleep(.2)
        else:
            raise RuntimeError('Eigen venster ontbreekt')
        time.sleep(3)
        rapport['stappen'].append({'actie': 'start', 'beeld': beeld(titel)})

    def stap(titel, actie, *waarden, wacht=1):
        assert programma.poll() is None
        if actie == 'klik':
            subprocess.run(['xdotool', 'mousemove', *map(str, waarden), 'click', '1'], check=True, stdout=log, stderr=log)
        elif actie == 'toets':
            subprocess.run(['xdotool', 'key', '--clearmodifiers', *waarden], check=True, stdout=log, stderr=log)
        elif actie == 'tekst':
            assert '\n' not in waarden[0], 'Gebruik afzonderlijke Return-toetsaanslagen'
            subprocess.run(['xdotool', 'type', '--clearmodifiers', '--delay', '12', waarden[0]], check=True, stdout=log, stderr=log)
        elif actie == 'sluiten':
            venster.send_event(event.ClientMessage(window=venster, client_type=d.intern_atom('WM_PROTOCOLS'), data=(32, [d.intern_atom('WM_DELETE_WINDOW'), X.CurrentTime, 0, 0, 0])), event_mask=0)
            d.flush()
        time.sleep(wacht)
        rapport['stappen'].append({'actie': actie, 'waarden': waarden, 'beeld': beeld(titel)})
        print(titel, flush=True)

    def controle(titel, verwacht):
        v = json.loads(bron.read_text())
        pagina = v['boeken'][0]['secties'][0]['paginas'][0]
        werkelijk = {'titel': pagina['titel'], 'canvas': pagina['vakken'][0]['blokken'][0]['tekst'], 'markdown': v['boeken'][0]['secties'][1]['paginas'][0]['markdown']}
        for veld, waarde in verwacht.items():
            assert werkelijk[veld] == waarde, (titel, veld, werkelijk[veld], waarde)
        rapport['controles'].append({'naam': titel, 'verwacht': verwacht, 'werkelijk': {k: werkelijk[k] for k in verwacht}, 'bron_sha256': sha(bron)})

    def schoon_sluiten(titel):
        venster.send_event(event.ClientMessage(window=venster, client_type=d.intern_atom('WM_PROTOCOLS'), data=(32, [d.intern_atom('WM_DELETE_WINDOW'), X.CurrentTime, 0, 0, 0])), event_mask=0)
        d.flush()
        assert programma.wait(timeout=15) == 0
        rapport['controles'].append({'naam': titel, 'programma_eindcode': 0})

    try:
        subprocess.run(['dbus-update-activation-environment', 'DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME'], check=True, stdout=log, stderr=log)
        start('begin')
        titel = 'Notitie uit Rust WebView'
        canvas = 'Snelle canvastekst met alle letters 0123456789.'
        markdown = 'Volledige Markdown tekst 0123456789.\n\nTweede regel blijft ook compleet.'
        stap('titel-focus', 'klik', 700, 245)
        stap('titel-selectie', 'toets', 'ctrl+a')
        stap('titel-typen', 'tekst', titel)
        stap('titel-bewaren', 'klik', 58, 16)
        controle('snelle titel bewaard', {'titel': titel})
        stap('canvas-focus', 'klik', 650, 370)
        stap('canvas-selectie', 'toets', 'ctrl+a')
        stap('canvas-typen', 'tekst', canvas)
        stap('canvas-bewaren', 'klik', 58, 16)
        controle('snelle canvastekst bewaard', {'titel': titel, 'canvas': canvas})
        stap('canvas-undo', 'klik', 66, 85)
        stap('undo-bewaren', 'klik', 58, 16)
        controle('undo', {'canvas': canvas[:-1]})
        stap('canvas-opnieuw', 'klik', 58, 113)
        stap('opnieuw-bewaren', 'klik', 58, 16)
        controle('opnieuw', {'canvas': canvas})
        stap('markdown-sectie', 'klik', 90, 401)
        stap('markdown-focus', 'klik', 690, 414)
        stap('markdown-selectie', 'toets', 'ctrl+a')
        stap('markdown-regel-een', 'tekst', markdown.split('\n')[0])
        stap('markdown-enter-een', 'toets', 'Return')
        stap('markdown-enter-twee', 'toets', 'Return')
        stap('markdown-regel-twee', 'tekst', markdown.split('\n')[-1])
        stap('markdown-bewaren', 'klik', 58, 16)
        controle('markdown met echte regelovergangen', {'markdown': markdown})
        stap('canvas-terug', 'klik', 90, 356)
        stap('bestand', 'klik', 35, 45)
        stap('bestand-escape', 'toets', 'Escape')
        stap('donker', 'klik', 1038, 16)
        stap('licht', 'klik', 1038, 16)
        stap('start', 'klik', 40, 170)
        stap('notitie-terug', 'klik', 114, 47)
        bewaard = sha(bron)
        stap('sluitproef-focus', 'klik', 700, 245)
        stap('sluitproef-einde', 'toets', 'ctrl+End')
        stap('sluitproef-invoer', 'tekst', 'X')
        stap('tabblad-sluiten', 'klik', 178, 170)
        stap('tabblad-annuleren', 'toets', 'Return')
        stap('systeemsluiten', 'sluiten', wacht=3)
        stap('systeemsluiten-annuleren', 'toets', 'Escape')
        stap('sluitproef-undo', 'klik', 66, 85)
        stap('sluitproef-bewaren', 'klik', 58, 16)
        assert sha(bron) == bewaard, 'Annuleren/undo moet de bewaarde bron exact herstellen'
        controle('eindbron', {'titel': titel, 'canvas': canvas, 'markdown': markdown})
        stap('canvas-eindbeeld', 'klik', 990, 207)
        schoon_sluiten('schoon systeemsluiten')
        start('heropend-canvas')
        assert sha(bron) == bewaard
        stap('heropende-markdown', 'klik', 90, 401)
        controle('heropend', {'titel': titel, 'canvas': canvas, 'markdown': markdown})
        schoon_sluiten('heropend schoon systeemsluiten')
        start('voor-verwerpen')
        stap('verwerpen-focus', 'klik', 700, 245)
        stap('verwerpen-einde', 'toets', 'ctrl+End')
        stap('verwerpen-invoer', 'tekst', 'X')
        stap('verwerpen-systeemsluiten', 'sluiten', wacht=3)
        subprocess.run(['xdotool', 'mousemove', '686', '498', 'click', '1'], check=True, stdout=log, stderr=log)
        assert programma.wait(timeout=15) == 0
        assert sha(bron) == bewaard
        rapport['controles'].append({'naam': 'expliciet verwerpen sluit werkelijk en behoudt schijfbron', 'programma_eindcode': 0, 'bron_sha256': bewaard})
        rapport['geslaagd'] = True
    except Exception as fout:
        rapport['fout'] = repr(fout)
        if programma:
            rapport['diagnose'] = diagnose()
        raise
    finally:
        rapport['bron_eind_sha256'] = sha(bron)
        if programma and programma.poll() is None:
            rapport['eigen_testproces_opgeruimd'] = True
            programma.terminate()
            programma.wait(timeout=20)
        (args.uitvoer/'rapport.json').write_text(json.dumps(rapport, ensure_ascii=False, indent=2)+'\n')
        d.close()
        log.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
