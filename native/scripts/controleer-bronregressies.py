#!/usr/bin/env python3
"""Controleer een echte, vastgepinde bron met de gebouwde native bestandscontrole.

De oorspronkelijke bron blijft buiten het pakket en de repository. Alleen het
rapport met bronhash, programmaversie en resultaat wordt bewaard.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import tomllib
import urllib.request

REVISIE = 'd91a76448f0963a93b6cd95fb97fbe1d8bad82c6'
BRON = {
    'id': 'kopvoet-standaardfont',
    'url': f'https://raw.githubusercontent.com/apache/poi/{REVISIE}/test-data/integration/stress023.docx',
    'sha256': '32b036e66eb701f37e8b64a3c491bf1d6234be3cee1e6e36d2e8435f4516cc94',
    'max_bytes': 16 * 1024 * 1024,
}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--programma', type=Path, required=True)
    p.add_argument('--uitvoer', type=Path, required=True)
    p.add_argument('--bronbestand', type=Path, help='Gebruik een bestaande bron met dezelfde verplichte hash')
    p.add_argument('--verwachte-versie', help='Alleen voor vergelijking met een eerdere bouwstap')
    p.add_argument('--profiel', choices=['release', 'debug'], default='release')
    args = p.parse_args()
    root = Path(__file__).resolve().parents[1]
    versie = args.verwachte_versie or tomllib.loads((root / 'Cargo.toml').read_text(encoding='utf-8'))['workspace']['package']['version']
    programma = args.programma.resolve(strict=True)
    verwacht = f'Open Office native bestandscontrole {versie} ({args.profiel})'
    gemeld = subprocess.check_output([str(programma), '--version'], text=True, encoding='utf-8', timeout=15).strip()
    if gemeld != verwacht:
        raise RuntimeError(f'Verkeerde programmaversie: {gemeld}; verwacht {verwacht}')
    rapport = {
        'omvang': 'Vastgepinde kop-/voettekstbron: openen, eerste weergave, bewaren en zichtbare tekst/onderdeelstructuur teruglezen; geen volledige opmaak- of pixelcontrole',
        'programma': gemeld,
        'programma_sha256': hashlib.sha256(programma.read_bytes()).hexdigest(),
        'bron': {k: BRON[k] for k in ['id', 'url', 'sha256']},
        'bouwronde': os.environ.get('GITHUB_RUN_ID'),
        'geteste_checkout': os.environ.get('GITHUB_SHA'),
        'geslaagd': False,
    }
    try:
        with tempfile.TemporaryDirectory(prefix='office-bronregressie-') as tijdelijk:
            pad = Path(tijdelijk) / 'kopvoet.docx'
            if args.bronbestand:
                with args.bronbestand.open('rb') as f:
                    bytes = f.read(BRON['max_bytes'] + 1)
            else:
                with urllib.request.urlopen(BRON['url'], timeout=30) as antwoord:
                    bytes = antwoord.read(BRON['max_bytes'] + 1)
            rapport['gelezen_bron_bytes'] = len(bytes)
            rapport['gelezen_bron_sha256'] = hashlib.sha256(bytes).hexdigest()
            if len(bytes) > BRON['max_bytes'] or rapport['gelezen_bron_sha256'] != BRON['sha256']:
                raise ValueError('Bronomvang of verplichte bronhash wijkt af; geen document geopend')
            pad.write_bytes(bytes)
            opdracht = [str(programma), str(pad)]
            prlimit = shutil.which('prlimit') if os.sys.platform.startswith('linux') else None
            if prlimit:
                opdracht = [prlimit, '--as=3221225472', '--core=0', '--'] + opdracht
            rapport['adresruimte_bytes'] = 3 * 1024 ** 3 if prlimit else None
            start = time.monotonic()
            r = subprocess.run(opdracht, text=True, encoding='utf-8', errors='replace', capture_output=True, timeout=120)
            rapport['looptijd_seconden'] = round(time.monotonic() - start, 3)
            if r.returncode:
                raise RuntimeError(f'Bestandscontrole afgebroken ({r.returncode}): {r.stderr[-1000:]}')
            meting = json.loads(r.stdout.strip().splitlines()[-1])
            if not isinstance(meting, dict):
                raise ValueError('De bestandscontrole gaf geen resultaatobject')
            rapport['meting'] = meting
            rapport['geslaagd'] = (
                meting.get('status') == 'geslaagd'
                and meting.get('native_versie') == versie
                and meting.get('bouwprofiel') == args.profiel
                and meting.get('bron_sha256') == BRON['sha256']
                and meting.get('module') == 'Writer'
                and meting.get('weergaves_getest') == 1
            )
    except (OSError, ValueError, RuntimeError, IndexError, subprocess.SubprocessError) as e:
        rapport['fout'] = str(e)
    args.uitvoer.parent.mkdir(parents=True, exist_ok=True)
    args.uitvoer.write_text(json.dumps(rapport, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'bron': BRON['id'], 'geslaagd': rapport['geslaagd'], 'programma': gemeld}, ensure_ascii=False))
    return 0 if rapport['geslaagd'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
