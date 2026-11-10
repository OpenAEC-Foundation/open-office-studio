"""Compare the original synthetic package with the actual browser download."""
import hashlib
import json
import sys
import xml.etree.ElementTree as ET
import zipfile

root = sys.argv[1] if len(sys.argv) > 1 else ".local/proef-lineaire-trendlijn"
ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "c": "http://schemas.openxmlformats.org/drawingml/2006/chart"}
with zipfile.ZipFile(root + "/source.xlsx") as source, zipfile.ZipFile(root + "/saved.xlsx") as saved:
    chart_names = [name for name in source.namelist() if name.startswith("xl/charts/") and name.endswith(".xml")]
    assert len(chart_names) == 2
    for name in chart_names:
        assert source.read(name) == saved.read(name)
        xml = ET.fromstring(saved.read(name))
        trend = xml.find(".//c:trendline", ns)
        assert trend.find("c:trendlineType", ns).attrib["val"] == "linear"
    for i in [1, 2]:
        name = "xl/worksheets/sheet%d.xml" % i
        original, result = [ET.fromstring(z.read(name)) for z in [source, saved]]
        cells = lambda tree: {c.attrib["r"]: (c.attrib.get("t", "n"), c.findtext("s:v", namespaces=ns), c.findtext("s:f", namespaces=ns)) for c in tree.findall("s:sheetData/s:row/s:c", ns)}
        assert cells(original) == cells(result)
    assert source.read("custom/trend-unknown.bin") == saved.read("custom/trend-unknown.bin") == bytes([0, 255, 7, 42])
    for name in saved.namelist():
        if name.endswith(".xml") or name.endswith(".rels"):
            ET.fromstring(saved.read(name))
    print(json.dumps({"chart_parts": chart_names, "chart_xml": "byte-identical", "cell_values_and_formulas": "unchanged", "unknown_part": "unchanged", "sha256": hashlib.sha256(open(root + "/saved.xlsx", "rb").read()).hexdigest()}, indent=2))
