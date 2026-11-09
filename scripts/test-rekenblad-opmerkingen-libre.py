"""Independent import and XLSX round-trip checks of actual browser-authored comments."""
import json
import os
import zipfile
from xml.etree import ElementTree as ET
from libreoffice_test_hulp import ROOT, office_session, prop

OUT = ROOT / os.environ.get("OOS_TEST_UIT", ".local/proef-opmerkingen-libre")
SOURCE = ROOT / ".local/proef-opmerkingen/saved.xlsx"
NS = {"t": "http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments", "s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

def threads(path):
    with zipfile.ZipFile(path) as package:
        result = []
        for name in package.namelist():
            if name.endswith((".xml", ".rels")):
                root = ET.fromstring(package.read(name))
                if root.tag == "{" + NS["t"] + "}ThreadedComments":
                    result.extend({**el.attrib, "text": el.findtext("t:text", namespaces=NS)} for el in root)
        return result

def main():
    report = {"checks": {}}
    try:
        source = threads(SOURCE)
        report["checks"]["sourceThreadAndReply"] = len(source) == 2 and source[1]["parentId"] == source[0]["id"] and source[0]["ref"] == source[1]["ref"] == "B3"
        with office_session(OUT) as load:
            doc = load(SOURCE)
            sheet = doc.Sheets.getByIndex(0)
            report["allAnnotations"] = [{"row": a.Position.Row, "col": a.Position.Column, "text": a.getString(), "author": a.Author} for a in sheet.Annotations]
            report["cellProbes"] = {ref: sheet.getCellRangeByName(ref).Annotation.getString() for ref in ["B2", "B3", "D5", "D6", "E6", "E7"]}
            # Calc lazily materializes hidden annotation text when the shape is shown.
            def text_at(ref):
                annotation = sheet.getCellRangeByName(ref).Annotation
                visible = annotation.IsVisible
                annotation.IsVisible = True
                text = annotation.String
                annotation.IsVisible = visible
                return text
            report["annotation"] = text_at("B3")
            report["checks"]["importedThreadText"] = "A question for the project" in report["annotation"] and "Reply with Unicode" in report["annotation"]
            report["checks"]["importedClassicNotes"] = text_at("D6") == "Visible classic note" and text_at("E7") == "Hidden classic note"
            report["checks"]["importedVisibility"] = sheet.getCellRangeByName("D6").Annotation.IsVisible and not sheet.getCellRangeByName("E7").Annotation.IsVisible
            report["checks"]["otherSheetNote"] = doc.Sheets.getByIndex(1).getCellRangeByName("C3").Annotation.String == "Note on second sheet"
            doc.storeToURL((OUT / "roundtrip.xlsx").as_uri(), (prop("FilterName", "Calc MS Excel 2007 XML"), prop("Overwrite", True)))
            resolved = load(ROOT / ".local/proef-opmerkingen/resolved.xlsx")
            resolved.storeToURL((OUT / "resolved-roundtrip.xlsx").as_uri(), (prop("FilterName", "Calc MS Excel 2007 XML"), prop("Overwrite", True)))
        result = threads(OUT / "roundtrip.xlsx")
        report["roundtrip"] = result
        report["checks"]["threadedRoundtrip"] = len(result) == 2 and {el["text"] for el in result} == {el["text"] for el in source}
        resolved_result=threads(OUT / "resolved-roundtrip.xlsx")
        report["checks"]["resolvedRoundtrip"]=len(resolved_result)==2 and resolved_result[0].get("done") in ("true","1")
        report["pass"] = all(report["checks"].values())
        assert report["pass"], report
    finally:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
        print(json.dumps(report, ensure_ascii=False))

if __name__ == "__main__": main()
