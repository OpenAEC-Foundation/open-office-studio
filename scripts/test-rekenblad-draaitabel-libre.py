"""Independent Calc import, refresh and XLSX/ODS round-trip checks.

Generate fixtures with OOS_PIVOT_EVIDENCE=1 vitest draaitabellen.test.ts first.
Run with a Python that provides UNO and OPENAEC_CONVERSIE_PROGRAMMA set.
"""
from pathlib import Path
import json
import math
from libreoffice_test_hulp import office_session, prop

root = Path.cwd()
out = root / ".local/proef-draaitabel-libre"
report = {"steps": []}


def check(actual, expected):
    assert math.isclose(actual, expected, abs_tol=1e-10), (actual, expected)


with office_session(out) as load:
    for name, total, before, after in [
        ("generated", "D5", 150, 240),
        ("grouped", "E7", 1, 1),
        ("multiple", "G6", 30, 48),
        ("minimum", "D5", 10, 20),
        ("maximum", "D5", 50, 100),
        ("interval", "D6", 150, 240),
        ("page", "D7", 80, 170),
    ]:
        doc = load(root / f".local/proef-draaitabel/{name}.xlsx")
        sheet = doc.Sheets.getByName("Summary")
        assert list(sheet.DataPilotTables.ElementNames) == ["SalesPivot"]
        pivot = sheet.DataPilotTables.getByName("SalesPivot")
        check(sheet.getCellRangeByName(total).Value, before)
        doc.Sheets.getByIndex(0).getCellRangeByName("C2").Value = 100
        pivot.refresh()
        check(sheet.getCellRangeByName(total).Value, after)
        if name == "grouped":
            # Jan/A genuinely recalculates; a constant grand total alone is weak evidence.
            check(sheet.getCellRangeByName("C3").Value, 100 / 240)
        if name == "multiple":
            check(sheet.getCellRangeByName("F6").Value, 5)
        doc.storeToURL((out / f"{name}-roundtrip.xlsx").as_uri(),
                       (prop("FilterName", "Calc MS Excel 2007 XML"), prop("Overwrite", True)))
        report[ name ] = {"total": total, "before": before, "after": after}
        report["steps"].append(f"{name}: real pivot import and refresh")
        if name == "generated":
            ods = out / "pivot.ods"
            doc.storeToURL(ods.as_uri(), (prop("FilterName", "calc8"), prop("Overwrite", True)))
            native = load(ods)
            ns = native.Sheets.getByName("Summary")
            assert ns.DataPilotTables.hasByName("SalesPivot")
            native.Sheets.getByIndex(0).getCellRangeByName("C2").Value = 200
            ns.DataPilotTables.getByName("SalesPivot").refresh()
            check(ns.getCellRangeByName("D5").Value, 340)
            native.storeToURL((out / "ods-roundtrip.xlsx").as_uri(),
                              (prop("FilterName", "Calc MS Excel 2007 XML"), prop("Overwrite", True)))
            report["steps"].append("ODS: preserved pivot and refreshed after reopening")

(out / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report))
