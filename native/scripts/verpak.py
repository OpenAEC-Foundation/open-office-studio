#!/usr/bin/env python3
"""Draagbare preview met herbouwbare bron, UI-licenties en controlehash."""
from pathlib import Path
import csv
import hashlib
import json
import platform
import shutil
import subprocess
import tomllib
import zipfile
root = Path(__file__).resolve().parents[1]
repo = root.parent
versie = tomllib.loads((root/'Cargo.toml').read_text(encoding='utf-8'))['workspace']['package']['version']
if '-' not in versie:
    import sys
    subprocess.run([sys.executable, str(root/'scripts/controleer-migratie.py'), '--vrijgave'], check=True)
exe = 'open-office-studio-native' + ('.exe' if platform.system() == 'Windows' else '')
bron = root/'target/release'/exe
assert bron.is_file(), f'Ontbrekende releasebuild: {bron}'
naam = f'Open-Office-Studio-native-{versie}-{platform.system()}-{platform.machine()}'
uit = root/'target/distributie'
uit.mkdir(parents=True, exist_ok=True)
pakket = root/'target/pakket'/naam
if pakket.exists(): shutil.rmtree(pakket)
pakket.mkdir(parents=True)
shutil.copy2(bron, pakket/exe)
shutil.copy2(repo/'LICENSE', pakket/'LICENSE')
shutil.copy2(root/'README.md', pakket/'LEESMIJ.md')
shutil.copytree(root/'docs', pakket/'docs')
shutil.copytree(root/'vendor/openaec-ui/licenses', pakket/'licenties')
shutil.copy2(root/'vendor/openaec-ui/LICENSE.md', pakket/'licenties/OpenAEC-UI-LICENSE.md')
shutil.copy2(root/'vendor/openaec-ui/NOTICE.md', pakket/'licenties/OpenAEC-UI-NOTICE.md')
shutil.copytree(root/'vendor/document-fonts/LICENSES', pakket/'licenties/documentletters')
shutil.copytree(root/'vendor/document-fonts/LICENSES-CJK', pakket/'licenties/documentletters-cjk')
for bestand in ['Cargo.toml', 'Cargo.lock', 'README.md']:
    doel = pakket/'bron/native'/bestand
    doel.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root/bestand, doel)
for map in ['crates', 'vendor', 'scripts', 'docs']:
    shutil.copytree(root/map, pakket/'bron/native'/map, ignore=shutil.ignore_patterns('__pycache__'))
shutil.copytree(repo/'public/templates', pakket/'bron/public/templates')
shutil.copy2(repo/'LICENSE', pakket/'bron/LICENSE')
metadata = json.loads(subprocess.check_output(['cargo', 'metadata', '--manifest-path', str(root/'Cargo.toml'), '--locked', '--format-version', '1'], text=True, encoding='utf-8'))
with (pakket/'licenties/afhankelijkheden.csv').open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['pakket', 'versie', 'licentie', 'bron'])
    for p in sorted(metadata['packages'], key=lambda p:(p['name'],p['version'])):
        w.writerow([p['name'],p['version'],p.get('license') or p.get('license_file') or '',p.get('repository') or p.get('source') or 'meegeleverde bron'])
        # Neem de daadwerkelijke notices mee, niet uitsluitend licentiecodes.
        pakketbron = Path(p['manifest_path']).parent
        licentiemap = pakket/'licenties/rust'/f"{p['name']}-{p['version']}"
        for document in pakketbron.iterdir():
            klein = document.name.casefold()
            if document.is_file() and klein.startswith(('license', 'licence', 'notice', 'copying', 'copyright')):
                licentiemap.mkdir(parents=True, exist_ok=True)
                shutil.copy2(document, licentiemap/document.name)
            elif document.is_dir() and klein in ('license', 'licenses', 'licence', 'licences'):
                shutil.copytree(document, licentiemap/document.name, dirs_exist_ok=True)
        if p.get('license_file'):
            document = Path(p['license_file'])
            if not document.is_absolute(): document = pakketbron/document
            if document.is_file():
                licentiemap.mkdir(parents=True, exist_ok=True)
                shutil.copy2(document, licentiemap/document.name)

zip_pad = uit/f'{naam}.zip'
with zipfile.ZipFile(zip_pad, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6, strict_timestamps=False) as z:
    for p in sorted(pakket.rglob('*')):
        if p.is_file(): z.write(p, p.relative_to(pakket.parent))
hash = hashlib.sha256(zip_pad.read_bytes()).hexdigest()
(uit/f'{naam}.sha256').write_text(f'{hash}  {zip_pad.name}\n', encoding='utf-8')
print(zip_pad)
