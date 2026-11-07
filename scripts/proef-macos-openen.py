"""Native LaunchServices-proef voor de eigen gebouwde app op de macOS-bouwrunner."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import signal
import subprocess
import sys
import tempfile
import time


def processen(programma):
    tekst = subprocess.check_output(['ps', '-axww', '-o', 'pid=', '-o', 'comm='], text=True)
    gevonden = []
    for regel in tekst.splitlines():
        delen = regel.strip().split(None, 1)
        if len(delen) == 2 and Path(delen[1]).resolve() == programma.resolve():
            gevonden.append(int(delen[0]))
    return gevonden


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundels', type=Path, default=Path('src-tauri/target/release/bundle'))
    parser.add_argument('--rapport', type=Path, required=True)
    args = parser.parse_args()
    if sys.platform != 'darwin' or os.environ.get('GITHUB_ACTIONS') != 'true':
        raise RuntimeError('Deze proef gebruikt uitsluitend de eigen macOS-bouwrunner.')
    apps = list((args.bundels / 'macos').glob('*.app'))
    if len(apps) != 1:
        raise RuntimeError('Er moet precies één gebouwde app aanwezig zijn.')
    app = apps[0].resolve()
    info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
    if info['CFBundleIdentifier'] != 'org.openaec.office-studio':
        raise RuntimeError('Onverwachte app-identificatie.')
    programma = app / 'Contents/MacOS' / info['CFBundleExecutable']
    if processen(programma):
        raise RuntimeError('De eigen proefapp draait al vóór de proef.')
    recent = Path.home() / 'Library/Application Support' / info['CFBundleIdentifier'] / 'recent.json'
    voorkeuren = recent.with_name('voorkeuren.json')
    if not voorkeuren.exists():
        voorkeuren.parent.mkdir(parents=True, exist_ok=True)
        voorkeuren.write_text(json.dumps({'taal': 'nl', 'updates': {'automatisch': False}}), encoding='utf-8')
    rapport = {'stappen': []}
    gestart = False
    try:
        with tempfile.TemporaryDirectory(prefix='office-macos-openen-') as mapnaam:
            map_ = Path(mapnaam)
            for bron, naam in [('nieuw.xlsx', 'Rekenblad met spaties %.xlsx'),
                              ('nieuw.docx', 'Tweede document.docx')]:
                bestand = map_ / naam
                shutil.copyfile(Path('public/templates') / bron, bestand)
                voor = hashlib.sha256(bestand.read_bytes()).hexdigest()
                # Ook de eerste opening loopt via LaunchServices, zonder bestandsargumenten
                # rechtstreeks aan het programma te geven. De tweede bereikt de draaiende app.
                gestart = True
                subprocess.run(['open', '-a', str(app), str(bestand)], check=True, timeout=20)
                einde = time.monotonic() + 60
                verwerkt = False
                while time.monotonic() < einde:
                    try:
                        lijst = json.loads(recent.read_text(encoding='utf-8'))
                    except (FileNotFoundError, json.JSONDecodeError):
                        lijst = []
                    if any(Path(i['pad']).resolve() == bestand.resolve() for i in lijst):
                        verwerkt = True
                        break
                    time.sleep(.25)
                if not verwerkt or len(processen(programma)) != 1:
                    raise RuntimeError(f'Bestand {naam} is niet door precies één draaiende app verwerkt.')
                if hashlib.sha256(bestand.read_bytes()).hexdigest() != voor:
                    raise RuntimeError('Openen heeft het oorspronkelijke proefbestand gewijzigd.')
                rapport['stappen'].append({'naam': naam, 'sha256': voor,
                                          'viaLaunchServicesVerwerkt': True, 'eenAppProces': True,
                                          'bronOngewijzigd': True})
                print(f'Native macOS-opening geslaagd: {naam}', flush=True)
    finally:
        if gestart:
            for pid in processen(programma):
                os.kill(pid, signal.SIGTERM)
            einde = time.monotonic() + 10
            while processen(programma) and time.monotonic() < einde:
                time.sleep(.25)
        rapport['eigenAppAfgesloten'] = not processen(programma)
        args.rapport.parent.mkdir(parents=True, exist_ok=True)
        args.rapport.write_text(json.dumps(rapport, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if not rapport['eigenAppAfgesloten']:
        raise RuntimeError('De eigen proefapp is niet afgesloten.')


if __name__ == '__main__':
    main()
