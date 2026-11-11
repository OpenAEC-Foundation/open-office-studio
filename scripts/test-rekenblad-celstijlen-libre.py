"""Independent import/export checks of the production browser's named cell styles."""
import json
import os
import zipfile
from xml.etree import ElementTree as ET
from libreoffice_test_hulp import ROOT,office_session,prop
OUT=ROOT/os.environ.get("OOS_TEST_UIT",".local/proef-celstijlen-libre")
report={"checks":{}}
try:
    with office_session(OUT) as load:
        doc=load(ROOT/".local/proef-celstijlen/saved.xlsx")
        sheet=doc.Sheets.getByIndex(0)
        styled=sheet.getCellRangeByName("D4")
        money=sheet.getCellRangeByName("B2")
        names=doc.StyleFamilies.getByName("CellStyles").ElementNames
        report["checks"]["namedStyleImported"]="Project result" in names and styled.CellStyle=="Project result"
        report["checks"]["styleFormatting"]=styled.CharHeight==22 and styled.CharWeight>=150 and styled.CellBackColor==0xEECCAA
        report["checks"]["currencyPreserved"]="$" in doc.NumberFormats.getByKey(money.NumberFormat).FormatString and money.Value==2.5
        report["checks"]["formulaPreserved"]=sheet.getCellRangeByName("C2").Formula=="=B2*2" and sheet.getCellRangeByName("C2").Value==5
        doc.storeToURL((OUT/"roundtrip.xlsx").as_uri(),(prop("FilterName","Calc MS Excel 2007 XML"),prop("Overwrite",True)))
    with zipfile.ZipFile(OUT/"roundtrip.xlsx") as z:
        for name in z.namelist():
            if name.endswith((".xml",".rels")):ET.fromstring(z.read(name))
        root=ET.fromstring(z.read("xl/styles.xml"));ns={"s":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        styles=root.find("s:cellStyles",ns)
        report["checks"]["namedStyleRoundtrip"]=any(s.attrib.get("name")=="Project result" for s in styles)
    report["pass"]=all(report["checks"].values())
    assert report["pass"],report
finally:
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/"report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf8")
    print(json.dumps(report))
