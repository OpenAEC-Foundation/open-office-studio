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
if not 0 <= args.kanaalverschil <= 255 or args.max_afwijkende_pixels < 0:
    p.error('Toleranties mogen niet negatief zijn; kanaalverschil is maximaal 255')
args.uitvoer.mkdir(parents=True, exist_ok=True)
rapportpad = args.uitvoer/'rapport.json'
def weiger(reden):
    rapport = {'geslaagd': False, 'meetbaar': False, 'reden': reden}
    rapportpad.write_text(json.dumps(rapport, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(rapport))
    raise SystemExit(2)
def lees(pad):
    with Image.open(pad) as bron:
        # Een extensie bewijst geen verliesvrije bron. JPEG-opnamen kunnen door
        # compressieruis verschillen of details verbergen; opnieuw opslaan helpt niet.
        if bron.format != 'PNG':
            weiger(f'{pad}: werkelijk formaat {bron.format}; een oorspronkelijke verliesvrije PNG is vereist')
        if bron.n_frames != 1:
            weiger(f'{pad}: meerdere animatieframes zijn geen eenduidig bronbeeld')
        return bron.convert('RGBA')
a = lees(args.referentie)
b = lees(args.native)
if a.size != b.size:
    weiger(f'Verschillende viewports: {a.size} en {b.size}; maak vergelijkbare bronbeelden')
verschil = ImageChops.difference(a, b)
afwijkend = sum(max(pixel) > args.kanaalverschil for pixel in verschil.getdata())
rapport = {'referentie': str(args.referentie), 'native': str(args.native), 'meetbaar': True, 'breedte': a.width,
           'hoogte': a.height, 'pixels': a.width*a.height, 'afwijkende_pixels': afwijkend,
           'kanaalverschil_toegestaan': args.kanaalverschil,
           'max_afwijkende_pixels': args.max_afwijkende_pixels,
           'geslaagd': afwijkend <= args.max_afwijkende_pixels}
# Ook een verschil uitsluitend in transparantie blijft zichtbaar in het bewijsbeeld.
bewijs = Image.new('L', a.size)
bewijs.putdata([max(pixel) for pixel in verschil.getdata()])
bewijs.save(args.uitvoer/'verschil.png')
rapportpad.write_text(json.dumps(rapport, indent=2)+'\n', encoding='utf-8')
print(json.dumps(rapport))
raise SystemExit(0 if rapport['geslaagd'] else 1)
