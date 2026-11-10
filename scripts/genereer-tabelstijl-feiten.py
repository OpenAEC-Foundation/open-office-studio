"""Extract renderable font/fill facts from the normative ECMA-376 Annex D XML.

Usage: python scripts/genereer-tabelstijl-feiten.py presetTableStyles.xml output.json
Source: OfficeOpenXML-SpreadsheetMLStyles.zip in the official Part 1 distribution.
The Annex D preset's dxfId values are ONE-based, unlike workbook custom DXFs.
"""
import hashlib
import json
from pathlib import Path
import sys
from xml.etree import ElementTree as E

source, target = map(Path, sys.argv[1:])
digest = hashlib.sha256(source.read_bytes()).hexdigest()
expected = "74c6cf73d551bb2bd33a51690d4922095260b6647b2a38fcbc0d6da6c6275d7e"
if digest != expected:
    raise ValueError("Unexpected Annex D source: review its version before updating facts")
root = E.fromstring(source.read_text(encoding="utf-8-sig"))


def color(node):
    if node is None:
        return None
    assert set(node.attrib) <= {"theme", "tint"}
    result = {"theme": int(node.attrib["theme"])}
    if "tint" in node.attrib:
        result["tint"] = float(node.attrib["tint"])
    return result


styles = {}
for preset in root:
    if not preset.tag.startswith("TableStyle"):
        continue
    dxfs = preset.find("dxfs").findall("dxf")
    definition = preset.find("tableStyles/tableStyle")
    # The normative archive has two stray nested labels. Its enclosing preset
    # identifier is canonical; keep these exceptions explicit and source-pinned.
    labels = {"TableStyleLight14": "TableStyleLight14 ", "TableStyleDark9": "TableStyleDark9 2"}
    assert definition.attrib["name"] == labels.get(preset.tag, preset.tag)
    elements = []
    for e in definition.findall("tableStyleElement"):
        index = int(e.attrib["dxfId"]) - 1
        assert 0 <= index < len(dxfs)
        dxf = dxfs[index]
        element = {"type": e.attrib["type"], "size": int(e.attrib.get("size", "1"))}
        font = dxf.find("font")
        if font is not None:
            c = color(font.find("color"))
            if c is not None:
                element["fontColor"] = c
            b = font.find("b")
            if b is not None:
                element["bold"] = b.attrib.get("val", "1") not in ("0", "false")
        fill = dxf.find("fill/patternFill")
        if fill is not None:
            assert fill.attrib.get("patternType") == "solid"
            element["fill"] = color(fill.find("fgColor"))
        elements.append(element)
    styles[preset.tag] = elements
assert len(styles) == 60
result = {
    "bron": {
        "standaard": "ECMA-376 Part 1, 5th edition December 2016, Annex D",
        "url": "https://ecma-international.org/wp-content/uploads/ECMA-376-1_5th_edition_december_2016.zip",
        "bestand": "OfficeOpenXML-SpreadsheetMLStyles.zip/presetTableStyles.xml",
        "sha256": digest,
        "facetten": "font color, bold and solid fill; no border or pivot-style data",
    },
    "stijlen": dict(sorted(styles.items())),
}
target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"{len(styles)} table-style font/fill definitions: {target}")
