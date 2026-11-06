"""Controleer de focusrand in een echte native schermafbeelding van de fixture.

Een berekende CSS-outline is geen bewijs: een canvas kan eroverheen tekenen.
Gebruik bij het standaardvenster van 1440 pixels en de lichte proefwerkmap:
    python3 scripts/controleer-rasterfocus.py schermafbeelding.png

Dit leest uitsluitend de bestaande PNG. Het maakt of bewerkt geen beeld.
"""
import argparse
import json
import sys

from PIL import Image


def controleer(pad):
    with Image.open(pad) as bron:
        beeld = bron.convert("RGB")
    kleur = (188, 106, 21)
    punten = [(x, y) for y in range(beeld.height) for x in range(beeld.width)
              if beeld.getpixel((x, y)) == kleur]
    vak = None
    if punten:
        xs, ys = zip(*punten)
        vak = {"x": min(xs), "y": min(ys), "breedte": max(xs) - min(xs) + 1,
               "hoogte": max(ys) - min(ys) + 1}
    # De synthetische fixture heeft deze kleur nergens in de celinhoud.
    # Een knop of klein accent mag niet voor een grote rasterrand doorgaan.
    zichtbaar = bool(vak and len(punten) >= 2000 and vak["breedte"] >= 500
                     and vak["hoogte"] >= 300)
    return {"kleur": list(kleur), "pixels": len(punten), "vak": vak,
            "zichtbareRasterfocus": zichtbaar}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("png")
    args = parser.parse_args()
    uitslag = controleer(args.png)
    print(json.dumps(uitslag, ensure_ascii=False))
    sys.exit(0 if uitslag["zichtbareRasterfocus"] else 1)
