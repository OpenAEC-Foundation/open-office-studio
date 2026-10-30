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
