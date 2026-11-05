#!/usr/bin/env python3
"""Een stabiele native vrijgave vereist aantoonbare pariteit in ieder acceptatiegebied."""
import argparse
import json
from pathlib import Path
p = argparse.ArgumentParser()
p.add_argument('--vrijgave', action='store_true')
args = p.parse_args()
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root/'docs/migratie.json').read_text(encoding='utf-8'))
ids = set()
openstaand = []
for gebied in manifest['gebieden']:
    assert gebied['id'] not in ids, 'Dubbel acceptatiegebied'
    ids.add(gebied['id'])
    klaar = True
    for veld in ['functioneel_gelijk', 'alle_functies_getest', 'visueel_gelijk']:
        assert isinstance(gebied[veld], bool), f"Ongeldige status {gebied['id']}/{veld}"
        klaar = klaar and gebied[veld]
    if not klaar:
        assert gebied['resterend'].strip(), 'Ontbrekende toelichting'
        openstaand.append(gebied['naam'])
print(f"Native migratie: {len(openstaand)} acceptatiegebieden nog open; referentie {manifest['referentie']['versie']}.")
if args.vrijgave and openstaand:
    print('Geen volledige native vrijgave: ' + ', '.join(openstaand))
    raise SystemExit(1)
