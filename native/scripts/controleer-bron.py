#!/usr/bin/env python3
"""Controleer de exacte gedeelde OpenAEC UI-bron, inclusief licenties/fonts."""
from pathlib import Path
import hashlib
import json
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root/'vendor/blueprint-bron.json').read_text(encoding='utf-8'))
files = {p.relative_to(root/'vendor/openaec-ui').as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'vendor/openaec-ui').rglob('*') if p.is_file()}
assert files == manifest['bestanden'], 'De gedeelde UI wijkt af van de gepinde bron'
print(f"OpenAEC UI: {len(files)} bronbestanden geverifieerd, revisie {manifest['revisie']}.")

lettermanifest = json.loads((root/'vendor/document-fonts/bron.json').read_text(encoding='utf-8'))
for face in lettermanifest['bestanden']:
    font = root/'vendor/document-fonts/assets'/face['file']
    assert hashlib.sha256(font.read_bytes()).hexdigest() == face['sha256'], f"Documentletter gewijzigd: {face['file']}"
    assert font.stat().st_size == face['byteLength'], f"Documentletter afgebroken: {face['file']}"
print(f"Documentletters: {len(lettermanifest['bestanden'])} oorspronkelijke fontbestanden geverifieerd.")

enginemanifest = json.loads((root/'vendor/document-engine-bron.json').read_text(encoding='utf-8'))
verwacht = dict(enginemanifest['oorspronkelijke_bestanden'])
for naam, wijziging in enginemanifest['aanpassingen'].items():
    assert naam in verwacht, f'Onbekend aangepast enginebestand: {naam}'
    verwacht[naam] = wijziging['sha256']
for naam, toevoeging in enginemanifest.get('aanvullingen', {}).items():
    assert naam not in verwacht, f'Dubbel enginebestand: {naam}'
    verwacht[naam] = toevoeging['sha256']
werkelijk = {p.relative_to(root/'vendor/docx-parse').as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in (root/'vendor/docx-parse').rglob('*') if p.is_file()}
assert werkelijk == verwacht, 'De documentparser wijkt af van de vastgelegde bron en correcties'
print(f"Documentparser: {len(werkelijk)} bronbestanden en {len(enginemanifest['aanpassingen'])} vastgelegde correctie geverifieerd.")

symbolenmap = root/'vendor/symbolen'
symbolen = json.loads((symbolenmap/'bron.json').read_text(encoding='utf-8'))
werkelijk = {p.name for p in symbolenmap.iterdir() if p.is_file() and p.name != 'bron.json'}
assert werkelijk == set(symbolen['bestanden']), 'Onverwachte symboollettertypebestanden'
for naam, bewijs in symbolen['bestanden'].items():
    data = (symbolenmap/naam).read_bytes()
    assert hashlib.sha256(data).hexdigest() == bewijs['sha256'] and len(data) == bewijs['bytes'], f'Symboollettertype gewijzigd: {naam}'
print(f"Symboollettertype: {len(werkelijk)} bestanden geverifieerd, revisie {symbolen['revisie']}.")

presentatiemap = root/'vendor/pptx'
presentatie = json.loads((root/'vendor/pptx-bron.json').read_text(encoding='utf-8'))
verwacht = dict(presentatie['oorspronkelijke_bestanden'])
for naam, wijziging in presentatie['aanpassingen'].items():
    assert naam in verwacht, 'Onbekende presentatiecorrectie'
    verwacht[naam] = wijziging['sha256']
for naam, aanvulling in presentatie['aanvullingen'].items():
    assert naam not in verwacht, 'Dubbel presentatiebestand'
    verwacht[naam] = aanvulling['sha256']
werkelijk = {p.relative_to(presentatiemap).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in presentatiemap.rglob('*') if p.is_file()}
assert werkelijk == verwacht, 'Presentatiefacade wijkt af van de vastgelegde bron en aansluiting'
print(f"Presentatiefacade: {len(werkelijk)} bronbestanden en {len(presentatie['aanpassingen'])} vastgelegde aansluiting geverifieerd.")

rastermap = root/'vendor/xlsx-raster'
raster = json.loads((root/'vendor/xlsx-raster-bron.json').read_text(encoding='utf-8'))
verwacht = dict(raster['oorspronkelijke_bestanden'])
for naam, wijziging in raster['aanpassingen'].items():
    assert naam in verwacht, f'Onbekende rasteraanpassing: {naam}'
    verwacht[naam] = wijziging['sha256']
for naam, aanvulling in raster['aanvullingen'].items():
    assert naam not in verwacht, f'Dubbel rasterbestand: {naam}'
    verwacht[naam] = aanvulling['sha256']
werkelijk = {p.relative_to(rastermap).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in rastermap.rglob('*') if p.is_file()}
assert werkelijk == verwacht, 'Rasterbron of oorspronkelijke PNG-bronbeelden wijken af van de vastgelegde bron'
print(f"Spreadsheetraster: {len(werkelijk)} bronbestanden en {len(raster['aanpassingen'])} vastgelegde aansluitingen geverifieerd.")
