"""Independent stdlib UOF1 XML -> OOXML content oracle; no application imports."""
import argparse
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

CONFIG = json.loads((Path(__file__).parent / "fixture.json").read_text(encoding="utf-8"))
U = "{http://schemas.uof.org/cn/2003/uof}"
T = "{http://schemas.uof.org/cn/2003/uof-spreadsheet}"
TXT = "{http://schemas.uof.org/cn/2003/uof-wordproc}"
S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def write_json(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_bytes(path):
    data = Path(path).read_bytes()
    assert len(data) == CONFIG["source"]["bytes"]
    assert sha(data) == CONFIG["source"]["sha256"]
    assert hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == CONFIG["source"]["blob"]
    return data


def fetch(url, path, digest):
    path = Path(path)
    if not path.exists():
        with urllib.request.urlopen(url, timeout=45) as response:
            data = response.read(1_000_000)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    assert sha(path.read_bytes()) == digest


def address(row, col):
    letters = ""
    while col >= 0:
        col, n = divmod(col, 26)
        letters = chr(65 + n) + letters
        col -= 1
    return letters + str(row + 1)


def parse_source(path):
    data = source_bytes(path)
    assert data.startswith(b'<?xml') and not zipfile.is_zipfile(path)
    root = ET.fromstring(data)
    assert root.tag == U + "UOF"
    assert root.get(U + "version") == "1.0"
    assert root.get(U + "mimetype") == "vnd.uof.spreadsheet"
    assert root.findtext(".//" + U + "创建应用程序") == CONFIG["source"]["generator"]
    assert root.findtext(".//" + U + "创建日期") == CONFIG["source"]["created"]
    assert root.findtext(".//" + U + "作者") == CONFIG["source"]["author"]
    # Check actual tags/attributes rather than interpreting a lack of cached results as no formulas.
    formula_nodes = [e for e in root.iter() if "公式" in e.tag]
    formula_attributes = [k for e in root.iter() for k in e.attrib if "公式" in k]
    assert not formula_nodes and not formula_attributes, "Fixture's zero-formula boundary changed"
    sheets = []
    for table in root.iter(T + "工作表"):
        cells = {}
        next_row = 1
        for row in table.findall(T + "工作表内容/" + T + "行"):
            row_number = int(row.get(T + "行号", next_row))
            assert int(row.get(T + "跨度", "1")) == 1
            next_col = 1
            for cell in row.findall(T + "单元格"):
                col = int(cell.get(T + "列号", next_col))
                assert int(cell.get(T + "跨度", "1")) == 1
                d = cell.find(T + "数据")
                if d is not None:
                    kind = d.get(T + "数据类型")
                    assert kind in ("text", "number"), kind
                    value = d.get(T + "数据数值") if kind == "number" else "".join(n.text or "" for n in d.iter(TXT + "文本串"))
                    if kind == "number":
                        Decimal(value)
                    a = address(row_number - 1, col - 1)
                    assert a not in cells
                    cells[a] = {"kind": kind, "value": value}
                next_col = col + 1
            next_row = row_number + 1
        sheets.append({"name": table.get(T + "名称"), "cells": cells})
    assert [s["name"] for s in sheets] == ["Sheet1", "Sheet2", "Sheet3"]
    assert [len(s["cells"]) for s in sheets] == [156, 0, 0]
    assert sum(c["kind"] == "number" for s in sheets for c in s["cells"].values()) == 152
    edit = CONFIG["edit"]
    row2 = sheets[0]["cells"]
    operands = {a: row2[a]["value"] for a in ["A2", "B2", "C2", "D2"]}
    assert edit["formula"] == "=SUM(A2:D2)"
    before = sum(Decimal(v) for v in operands.values())
    after = before - Decimal(operands[edit["cell"]]) + Decimal(edit["value"])
    return {"source": CONFIG["source"], "application": CONFIG["application"], "sheets": sheets,
            "formulaCount": 0, "expected": {"edit": edit, "operands": operands,
            "before": str(before), "after": str(after), "derivation": "SUM over original XML row2 values, then replace A2 by the planned edit; no converter/engine output used"}}


def read_xlsx(path):
    import posixpath
    with zipfile.ZipFile(path) as z:
        types = ET.fromstring(z.read("[Content_Types].xml"))
        assert any(e.get("PartName") == "/xl/workbook.xml" and e.get("ContentType") == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" for e in types)
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = {e.get("Id"): e.get("Target") for e in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
        strings = []
        if "xl/sharedStrings.xml" in z.namelist():
            strings = ["".join(n.text or "" for n in si.iter(S + "t")) for si in ET.fromstring(z.read("xl/sharedStrings.xml"))]
        sheets = []
        for sheet in wb.find(S + "sheets"):
            target = rels[sheet.get(REL + "id")]
            part = target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join("xl", target))
            cells = {}
            for c in ET.fromstring(z.read(part)).iter(S + "c"):
                value = c.findtext(S + "v")
                if c.get("t") == "s":
                    value = strings[int(value)]
                elif c.get("t") == "inlineStr":
                    value = "".join(n.text or "" for n in c.iter(S + "t"))
                f = c.find(S + "f")
                if value is not None or f is not None:
                    cells[c.get("r")] = {"value": value, "kind": c.get("t", "n"), "formula": f.text if f is not None else None}
            sheets.append({"name": sheet.get("name"), "cells": cells})
        return sheets


def verify_xlsx(oracle, path, edited):
    actual = read_xlsx(path)
    assert [s["name"] for s in actual] == [s["name"] for s in oracle["sheets"]]
    edit = oracle["expected"]["edit"]
    checked = 0
    for source, result in zip(oracle["sheets"], actual):
        expected = {a: dict(c) for a, c in source["cells"].items()}
        if edited and source["name"] == edit["sheet"]:
            expected[edit["cell"]] = {"kind":"number", "value":str(edit["value"])}
            expected[edit["formulaCell"]] = {"kind":"number", "value":oracle["expected"]["after"], "formula":edit["formula"].lstrip("=")}
        if edited and source["name"] == edit["textSheet"]:
            expected[edit["textCell"]] = {"kind":"text", "value":edit["textValue"]}
        assert set(result["cells"]) == set(expected), (source["name"], "populated addresses changed", set(result["cells"]) ^ set(expected))
        for a, c in expected.items():
            got = result["cells"][a]
            assert got["formula"] == c.get("formula"), (source["name"], a, "formula", got)
            if c["kind"] == "number":
                assert got["kind"] == "n" and Decimal(got["value"]) == Decimal(c["value"]), (a, c, got)
            else:
                assert got["kind"] in ("s", "inlineStr", "str") and got["value"] == c["value"], (a, c, got)
            checked += 1
    return {"file":str(path), "sha256":sha(Path(path).read_bytes()), "sheets":len(actual), "checkedPopulatedCells":checked,
            "sourceFormulaCount":0, "addedFormulaCount":int(edited), "edited":edited, "passed":True}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["source", "xlsx"])
    p.add_argument("--source", default=".local/uos-qa/source.uos")
    p.add_argument("--out", default=".local/uos-qa")
    p.add_argument("--xlsx")
    p.add_argument("--edited", action="store_true")
    args = p.parse_args()
    out = Path(args.out)
    if args.command == "source":
        cfg = CONFIG["source"]
        fetch(cfg["url"], args.source, cfg["sha256"])
        fetch(cfg["licenseUrl"], out / "source-LICENSE.txt", cfg["licenseSha256"])
        fetch(cfg["readmeUrl"], out / "source-README.md", cfg["readmeSha256"])
        oracle = parse_source(args.source)
        write_json(out / "source-oracle.json", oracle)
        print(json.dumps({"sheets":[s["name"] for s in oracle["sheets"]], "populatedCells":156, "formulas":0, "expected":oracle["expected"]}, indent=2))
    else:
        oracle = json.loads((out / "source-oracle.json").read_text(encoding="utf-8"))
        report = verify_xlsx(oracle, args.xlsx, args.edited)
        write_json(out / (Path(args.xlsx).stem + "-independent.json"), report)
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
