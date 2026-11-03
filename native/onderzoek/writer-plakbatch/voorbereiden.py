#!/usr/bin/env python3
"""Maak geïsoleerde, op bronhash gecontroleerde bibliotheekkopieën voor de plakproef."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
LOKAAL = ROOT / '.local'

def sha(pad):
    h = hashlib.sha256()
    with pad.open('rb') as bestand:
        for blok in iter(lambda: bestand.read(1024 * 1024), b''):
            h.update(blok)
    return h.hexdigest()

def vereist(voorwaarde, melding):
    if not voorwaarde:
        raise RuntimeError(melding)

def bronnen(pakket):
    cargo = Path(os.environ.get('CARGO_HOME', Path.home() / '.cargo'))
    return sorted((cargo / 'registry' / 'src').glob('*/' + pakket))

def bereid_voor(naam):
    patch = ROOT / 'patches' / (naam + '.patch')
    brongegevens = json.loads((ROOT / 'patches' / (naam + '-bron.json')).read_text())
    doel = LOKAAL / 'vendor' / naam
    if doel.exists():
        bewijs = json.loads((doel / 'openaec-proef.json').read_text())
        vereist(bewijs['patch_sha256'] == sha(patch), f'{naam}: patch gewijzigd; bewaar de oude werkkopie afzonderlijk.')
        for bestand, checksum in bewijs['aangepast_sha256'].items():
            vereist(sha(doel / bestand) == checksum, f'{naam}: werkkopie gewijzigd: {bestand}')
        print(f'{naam}: bestaande, ongewijzigde proefkopie gecontroleerd.')
        return
    gevonden = bronnen(brongegevens['pakket'])
    if not gevonden:
        pakket, versie = brongegevens['pakket'].rsplit('-', 1)
        with tempfile.TemporaryDirectory(prefix='office-plakbron-') as tijdelijk:
            subprocess.run(['cargo', 'info', '--registry', 'crates-io', pakket + '@' + versie], cwd=tijdelijk, check=True)
        gevonden = bronnen(brongegevens['pakket'])
    vereist(gevonden, f"Bronpakket ontbreekt: {brongegevens['pakket']}")
    origineel = gevonden[0]
    for bestand, checksum in brongegevens['bronbestanden_sha256'].items():
        if checksum is None:
            vereist(not (origineel / bestand).exists(), f'{naam}: onverwacht bronbestand: {bestand}')
        else:
            vereist(sha(origineel / bestand) == checksum, f'{naam}: andere broninhoud: {bestand}')
    doel.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='plakpatch-', dir=LOKAAL) as tijdelijk:
        tijdelijk = Path(tijdelijk)
        kopie = tijdelijk / naam
        shutil.copytree(origineel, kopie)
        # Een registerpakket kan alleen-lezen zijn. Alleen deze nieuwe eigen kopie wijzigen.
        for bestand in kopie.rglob('*'):
            if bestand.is_file():
                bestand.chmod(bestand.stat().st_mode | 0o200)
        omgeving = dict(os.environ, GIT_CEILING_DIRECTORIES=str(LOKAAL))
        opdracht = ['git', 'apply', '--directory=' + naam, str(patch)]
        subprocess.run(opdracht[:2] + ['--check'] + opdracht[2:], cwd=tijdelijk, env=omgeving, check=True)
        subprocess.run(opdracht, cwd=tijdelijk, env=omgeving, check=True)
        bewijs = {'pakket': brongegevens['pakket'], 'patch_sha256': sha(patch),
                  'aangepast_sha256': {bestand: sha(kopie / bestand) for bestand in brongegevens['bronbestanden_sha256']}}
        (kopie / 'openaec-proef.json').write_text(json.dumps(bewijs, ensure_ascii=False, indent=2) + '\n')
        kopie.rename(doel)
    print(f'{naam}: eigen proefkopie voorbereid; registerbron behouden.')

if __name__ == '__main__':
    LOKAAL.mkdir(parents=True, exist_ok=True)
    for naam in ['docx-edit', 'yrs']:
        bereid_voor(naam)
