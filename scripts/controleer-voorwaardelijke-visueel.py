"""Independent stdlib comparison of source and actual browser download."""
import hashlib
import json
import sys
import xml.etree.ElementTree as ET
import zipfile

root = sys.argv[1] if len(sys.argv) > 1 else ".local/proef-voorwaardelijke-visueel"
ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with zipfile.ZipFile(root + "/source.xlsx") as source, zipfile.ZipFile(root + "/saved.xlsx") as saved:
    counts = []
    for i in [1, 2]:
        name = "xl/worksheets/sheet%d.xml" % i
        before, after = [ET.fromstring(z.read(name)) for z in [source, saved]]
        rules = [tree.findall("s:conditionalFormatting", ns) for tree in [before, after]]
        assert [ET.tostring(r) for r in rules[0]] == [ET.tostring(r) for r in rules[1]]
        counts.append(len(rules[1]))
        cell = lambda tree: {c.attrib["r"]: (c.attrib.get("t", "n"), c.findtext("s:v", namespaces=ns), c.findtext("s:f", namespaces=ns)) for c in tree.findall("s:sheetData/s:row/s:c", ns)}
        assert cell(before) == cell(after)
        assert [r.attrib for r in before.findall("s:mergeCells/s:mergeCell", ns)] == [r.attrib for r in after.findall("s:mergeCells/s:mergeCell", ns)]
    assert counts == [4, 17]
    assert source.read("custom/visual-unknown.bin") == saved.read("custom/visual-unknown.bin") == bytes([0, 255, 7, 42])
    for name in saved.namelist():
        if name.endswith(".xml") or name.endswith(".rels"):
            ET.fromstring(saved.read(name))
    print(json.dumps({"rules_per_sheet": counts, "rule_xml": "unchanged", "cell_values_and_formulas": "unchanged", "merges": "unchanged", "unknown_part": "unchanged", "sha256": hashlib.sha256(open(root + "/saved.xlsx", "rb").read()).hexdigest()}, indent=2))
