"""Independent stdlib check of the conditional-format browser download."""
import hashlib
import json
import sys
import xml.etree.ElementTree as ET
import zipfile

path = sys.argv[1] if len(sys.argv) > 1 else ".local/proef-voorwaardelijke-dxf/saved.xlsx"
ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with zipfile.ZipFile(path) as z:
    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    styles = ET.fromstring(z.read("xl/styles.xml"))
    cells = {c.attrib["r"]: c for c in sheet.findall(".//s:sheetData/s:row/s:c", ns)}
    assert cells["A1"].find("s:v", ns).text == "0.125"
    assert cells["B1"].find("s:v", ns).text == "45000"
    cell_formats = styles.find("s:cellXfs", ns)
    for cell in [cells["A1"], cells["B1"]]:
        assert cell_formats[int(cell.attrib.get("s", "0"))].attrib.get("numFmtId", "0") == "0"
    order = [c.tag.rsplit("}", 1)[-1] for c in sheet]
    if "pageMargins" in order:
        assert max(i for i, name in enumerate(order) if name == "conditionalFormatting") < order.index("pageMargins")
    rules = sheet.findall("s:conditionalFormatting/s:cfRule", ns)
    assert len(rules) == 2
    dxfs = styles.findall("s:dxfs/s:dxf", ns)
    assert int(styles.find("s:dxfs", ns).attrib["count"]) == len(dxfs)
    percentage = dxfs[int(rules[0].attrib["dxfId"])]
    date = dxfs[int(rules[1].attrib["dxfId"])]
    assert percentage.find("s:numFmt", ns).attrib["formatCode"] == "0.0%"
    assert date.find("s:numFmt", ns).attrib["formatCode"] == "yyyy-mm-dd"
    assert percentage.find("s:font/s:color", ns).attrib == {"theme": "4", "tint": "0.4"}
    assert percentage.find("s:font/s:u", ns) is not None
    assert percentage.find("s:font/s:strike", ns) is not None
    assert percentage.find("s:border/s:bottom", ns).attrib["style"] == "double"
    assert percentage.find("s:fill/s:patternFill/s:fgColor", ns).attrib == {"theme": "5", "tint": "-0.25"}
    assert z.read("custom/unchanged.bin") == bytes([0, 1, 255])
    print(json.dumps({"file": path, "sha256": hashlib.sha256(open(path, "rb").read()).hexdigest(), "original_numeric_inputs": ["0.125", "45000"], "rules": len(rules), "source_theme_tints_fonts_border_and_number_formats": "retained", "unknown_part": "unchanged"}, indent=2))
