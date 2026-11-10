"""Independent table import, calculation and XLSX roundtrip through LibreOffice."""
import json
import os
import zipfile
from xml.etree import ElementTree as ET
from libreoffice_test_hulp import ROOT, office_session, prop

OUT = ROOT / os.environ.get("OOS_TEST_UIT", ".local/proef-tabellen-libre")
report = {"checks": {}}
try:
    with office_session(OUT) as load:
        doc = load(ROOT / ".local/proef-tabellen/saved.xlsx")
        doc.calculateAll()
        sheet = doc.Sheets.getByIndex(0)
        table = doc.DatabaseRanges.getByName("Sales")
        area = table.DataArea
        report["checks"]["tableImported"] = (area.StartColumn, area.StartRow, area.EndColumn, area.EndRow) == (0, 0, 1, 4)
        report["checks"]["dataAndStructuredFormula"] = sheet.getCellRangeByName("B4").Value == 7 and sheet.getCellRangeByName("E1").Value == 12
        report["checks"]["totalsFollowFilter"] = sheet.getCellRangeByName("B5").Value == 9
        report["checks"]["currencyPreserved"] = "$" in doc.NumberFormats.getByKey(sheet.getCellRangeByName("B2").NumberFormat).FormatString
        report["checks"]["headerFormatting"] = sheet.getCellRangeByName("A1").CellBackColor == 0x375623
        report["checks"]["filterVisibility"] = not sheet.Rows.getByIndex(2).IsVisible and sheet.Rows.getByIndex(1).IsVisible
        doc.storeToURL((OUT / "roundtrip.xlsx").as_uri(), (prop("FilterName", "Calc MS Excel 2007 XML"), prop("Overwrite", True)))
    with zipfile.ZipFile(OUT / "roundtrip.xlsx") as z:
        for name in z.namelist():
            if name.endswith((".xml", ".rels")):
                ET.fromstring(z.read(name))
        tables = [ET.fromstring(z.read(n)) for n in z.namelist() if n.startswith("xl/tables/") and n.endswith(".xml")]
        report["checks"]["tableRoundtrip"] = any(t.attrib.get("displayName") == "Sales" and t.attrib.get("ref") == "A1:B5" for t in tables)
    report["pass"] = all(report["checks"].values())
    assert report["pass"], report
finally:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    print(json.dumps(report))
