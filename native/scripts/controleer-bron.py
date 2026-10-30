#!/usr/bin/env python3
"""Controleer de exacte gedeelde OpenAEC UI-bron, inclusief licenties/fonts."""
from pathlib import Path
import hashlib
import json
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root/'vendor/blueprint-bron.json').read_text())
files = {str(p.relative_to(root/'vendor/openaec-ui')): hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'vendor/openaec-ui').rglob('*') if p.is_file()}
assert files == manifest['bestanden'], 'De gedeelde UI wijkt af van de gepinde bron'
print(f"OpenAEC UI: {len(files)} bronbestanden geverifieerd, revisie {manifest['revisie']}.")
