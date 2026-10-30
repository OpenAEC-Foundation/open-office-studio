#!/usr/bin/env python3
"""Vergelijk echte referentie- en native PNG's; verander nooit de schaal of inhoud."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageChops
p = argparse.ArgumentParser()
p.add_argument('referentie', type=Path)
p.add_argument('native', type=Path)
p.add_argument('--uitvoer', type=Path, required=True)
p.add_argument('--kanaalverschil', type=int, default=0)
p.add_argument('--max-afwijkende-pixels', type=int, default=0)
args = p.parse_args()
assert 0 <= args.kanaalverschil <= 255
args.uitvoer.mkdir(parents=True, exist_ok=True)
a = Image.open(args.referentie).convert('RGB')
b = Image.open(args.native).convert('RGB')
assert a.size == b.size, f'Verschillende viewports: {a.size} en {b.size}; maak vergelijkbare bronbeelden'
verschil = ImageChops.difference(a, b)
afwijkend = sum(max(pixel) > args.kanaalverschil for pixel in verschil.getdata())
rapport = {'referentie': str(args.referentie), 'native': str(args.native), 'breedte': a.width,
           'hoogte': a.height, 'pixels': a.width*a.height, 'afwijkende_pixels': afwijkend,
           'kanaalverschil_toegestaan': args.kanaalverschil,
           'max_afwijkende_pixels': args.max_afwijkende_pixels,
           'geslaagd': afwijkend <= args.max_afwijkende_pixels}
verschil.save(args.uitvoer/'verschil.png')
(args.uitvoer/'rapport.json').write_text(json.dumps(rapport, indent=2)+'\n', encoding='utf-8')
print(json.dumps(rapport))
raise SystemExit(0 if rapport['geslaagd'] else 1)
