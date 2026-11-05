"""Tauri-vensters op eigen X11-scherm; uitsluitend synthetische proefbestanden."""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import select
import shutil
import signal
import struct
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
import zipfile
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--binary', required=True, help='Tauri-proefbouw met een eigen app-identificatie')
parser.add_argument('--docx', required=True, type=Path, help='Leeg synthetisch DOCX-sjabloon')
parser.add_argument('--ifcx', required=True, type=Path, help='IFCX met hetzelfde lege DOCX-sjabloon')
args = parser.parse_args()
for naam in ['Xvfb', 'xdotool', 'xclip', 'xwd', 'dbus-run-session']:
    if not shutil.which(naam):
        parser.error(f'Benodigd programma ontbreekt in PATH: {naam}')
BIN = str(Path(args.binary).resolve(strict=True))
for bestand in [args.docx, args.ifcx]:
    if not bestand.is_file():
        parser.error(f'Proefbestand ontbreekt: {bestand}')
ROOT = Path(tempfile.mkdtemp(prefix='office-native-tekst-'))
print('UITVOER', ROOT, flush=True)
ENV = os.environ.copy()
for key in ['WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'DBUS_STARTER_ADDRESS', 'DBUS_STARTER_BUS_TYPE', 'WEBKIT_INSPECTOR_SERVER', 'WEBKIT_INSPECTOR_HTTP_SERVER']:
    ENV.pop(key, None)
ENV.update(GDK_BACKEND='x11', XDG_SESSION_TYPE='x11', GDK_SCALE='1', GDK_DPI_SCALE='1', LIBGL_ALWAYS_SOFTWARE='1', GIO_USE_VFS='local', GTK_USE_PORTAL='0')
OWN_ENV = ENV.copy()
RESULTS = []

def stop(p):
    if p is None or p.poll() is not None:
        return
    try:
        os.killpg(p.pid, signal.SIGTERM)
        p.wait(timeout=8)
    except subprocess.TimeoutExpired:
        os.killpg(p.pid, signal.SIGKILL)
        p.wait(timeout=5)
    except ProcessLookupError:
        pass

def screenshot(env, pad):
    raw = pad.with_suffix('.xwd')
    subprocess.run(['xwd', '-root', '-silent', '-out', str(raw)], env=env, check=True)
    data = raw.read_bytes()
    h = struct.unpack('>25I', data[:100])
    kop, versie, formaat, diepte, breedte, hoogte, offset, bytevolgorde, _, _, _, bits, stap, _, rood, groen, blauw, _, _, kleuren, *_ = h
    assert (versie, formaat, diepte, offset, bytevolgorde) == (7, 2, 24, 0, 0)
    assert bits in (24, 32) and (rood, groen, blauw) == (0xff0000, 0xff00, 0xff)
    beeld = Image.frombytes('RGB', (breedte, hoogte), data[kop + kleuren * 12:], 'raw', 'BGRX' if bits == 32 else 'BGR', stap, 1)
    beeld.save(pad)

def source(pad):
    data = pad.read_bytes()
    if pad.suffix == '.ifcx':
        dossier = json.loads(data)
        doc = next(n for n in dossier['data'] if 'openaec::office::document' in n.get('attributes', {}))
        payload = next(n['attributes']['openaec::office::payload'] for n in dossier['data'] if n['path'] == doc['attributes']['openaec::office::document']['source'])
        data = base64.b64decode(payload['content'], validate=True)
        assert len(data) == payload['byteLength']
        assert hashlib.sha256(data).hexdigest() == payload['sha256']
    return data

def tekst(pad):
    with zipfile.ZipFile(io.BytesIO(source(pad))) as z:
        xml = ET.fromstring(z.read('word/document.xml'))
    return ''.join(t.text or '' for t in xml.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'))

for geval in ['ifcx', 'klembord']:
    werk = ROOT / geval
    werk.mkdir()
    env = OWN_ENV.copy()
    for key, mapnaam in [('XDG_CONFIG_HOME', 'config'), ('XDG_DATA_HOME', 'data'), ('XDG_CACHE_HOME', 'cache'), ('XDG_RUNTIME_DIR', 'runtime')]:
        map_ = werk / mapnaam
        map_.mkdir(mode=0o700)
        env[key] = str(map_)
    bestand = werk / ('Proef.ifcx' if geval == 'ifcx' else 'Proef.docx')
    shutil.copy(args.ifcx if geval == 'ifcx' else args.docx, bestand)
    x = app = clipboard = None
    with (werk / 'x11.log').open('wb') as xlog, (werk / 'programma.log').open('wb') as log:
        try:
            x = subprocess.Popen(['Xvfb', '-displayfd', '1', '-nolisten', 'tcp', '-ac', '-screen', '0', '1440x950x24'], stdout=subprocess.PIPE, stderr=xlog,
                env=ENV, start_new_session=True)
            assert select.select([x.stdout], [], [], 10)[0], 'Geen X11-scherm'
            scherm = x.stdout.readline().decode().strip()
            assert scherm.isdigit()
            env['DISPLAY'] = ':' + scherm
            app = subprocess.Popen(['dbus-run-session', '--', BIN, str(bestand)], env=env, stdout=log, stderr=log, start_new_session=True)
            def xdo(*args):
                return subprocess.run(['xdotool', *args], env=env, capture_output=True, text=True, check=True, timeout=10).stdout.strip()
            venster = ''
            einde = time.monotonic() + 50
            while time.monotonic() < einde:
                assert app.poll() is None, f'App gestopt: {app.returncode}'
                r = subprocess.run(['xdotool', 'search', '--onlyvisible', '--name', 'Open (Writer|Office) Studio'], env=env, capture_output=True, text=True, timeout=10)
                if r.returncode == 0 and r.stdout.strip():
                    venster = r.stdout.splitlines()[0]
                    break
                time.sleep(.5)
            assert venster, 'Geen Writer-venster'
            xdo('windowfocus', '--sync', venster)
            print('VENSTER', geval, venster, flush=True)
            time.sleep(12)
            screenshot(env, werk / 'voor.png')
            def bewaar(verwacht=None):
                vorig = bestand.stat().st_mtime_ns
                for _ in range(12):
                    xdo('key', '--clearmodifiers', 'ctrl+s')
                    einde = time.monotonic() + 2
                    while time.monotonic() < einde:
                        assert app.poll() is None
                        if bestand.stat().st_mtime_ns != vorig:
                            huidig = tekst(bestand)
                            if verwacht is None or huidig == verwacht:
                                # De schrijfactie kan klaar zijn vóór React de
                                # nieuwe naam en de schone toestand heeft getekend.
                                schoon_tot = time.monotonic() + 5
                                while time.monotonic() < schoon_tot:
                                    if '•' not in xdo('getwindowname', venster):
                                        return huidig
                                    time.sleep(.1)
                                screenshot(env, werk / 'opslag-blijft-gewijzigd.png')
                                raise AssertionError('Inhoud bewaard, maar het document blijft gewijzigd')
                        time.sleep(.1)
                screenshot(env, werk / 'opslag-mislukt.png')
                raise AssertionError(('Ctrl+S gaf niet de verwachte inhoud', verwacht, tekst(bestand)))
            print('GEOPEND', geval, flush=True)
            origineel = bestand.read_bytes()
            bewaar()
            print('ONGEWIJZIGD OPGESLAGEN', geval, flush=True)
            if geval == 'ifcx':
                assert bestand.read_bytes() == origineel, 'Ongewijzigde IFCX is herschreven'
                xdo('key', '--clearmodifiers', 'ctrl+Home')
                time.sleep(1)
                xdo('type', '--clearmodifiers', '--delay', '180', 'Native IFCX proef')
                time.sleep(.5)
                bewaar('Native IFCX proef')
                dossier = json.loads(bestand.read_bytes())
                assert len([n for n in dossier['data'] if 'openaec::office::payload' in n.get('attributes', {})]) >= 2
                RESULTS.append({'geval': geval, 'bytegelijkeCtrlS': True, 'bewerktEnTeruggeschreven': True, 'tekst': tekst(bestand), 'bestand': str(bestand)})
            else:
                xdo('key', '--clearmodifiers', 'ctrl+Home')
                time.sleep(1)
                xdo('type', '--clearmodifiers', '--delay', '180', 'Basis')
                bewaar('Basis')
                def extern(inhoud):
                    global clipboard
                    stop(clipboard)
                    clipboard = subprocess.Popen(['xclip', '-selection', 'clipboard', '-in', '-quiet'], stdin=subprocess.PIPE, stdout=log, stderr=log, env=env, start_new_session=True)
                    clipboard.stdin.write(inhoud.encode())
                    clipboard.stdin.close()
                    time.sleep(.3)
                    uit = subprocess.check_output(['xclip', '-selection', 'clipboard', '-out'], env=env).decode()
                    assert uit == inhoud
                extern('.Lint')
                xdo('key', '--clearmodifiers', 'ctrl+End')
                xdo('mousemove', '--window', venster, '105', '104', 'click', '1')
                time.sleep(.5)
                bewaar('Basis.Lint')
                extern('.Sneltoets')
                xdo('key', '--clearmodifiers', 'ctrl+End', 'ctrl+v')
                time.sleep(.5)
                geheel = 'Basis.Lint.Sneltoets'
                bewaar(geheel)
                xdo('key', '--clearmodifiers', 'ctrl+a', 'ctrl+c')
                time.sleep(.3)
                xdo('key', '--clearmodifiers', 'ctrl+End', 'ctrl+v')
                time.sleep(.5)
                bewaar(geheel * 2)
                xdo('key', '--clearmodifiers', 'ctrl+a', 'ctrl+c')
                time.sleep(.3)
                xdo('key', '--clearmodifiers', 'ctrl+End')
                xdo('mousemove', '--window', venster, '105', '104', 'click', '1')
                time.sleep(.5)
                bewaar(geheel * 4)
                RESULTS.append({'geval': geval, 'externLint': True, 'externCtrlV': True, 'internCtrlV': True, 'internLint': True, 'tekst': tekst(bestand), 'bestand': str(bestand)})
            screenshot(env, werk / 'na.png')
            (ROOT / 'resultaat.json').write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2))
            print('OK', geval, RESULTS[-1], flush=True)
        finally:
            stop(clipboard)
            stop(app)
            stop(x)
print('GROEN', ROOT, flush=True)
