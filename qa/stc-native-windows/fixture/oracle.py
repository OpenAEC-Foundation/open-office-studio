"""Independent stdlib oracle: original Sun XML source -> OOXML observations.

Never learns expected formula results from a converter or the application engine.
"""
import argparse
from decimal import Decimal, ROUND_HALF_UP
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

HERE = Path(__file__).resolve().parent
CONFIG = json.loads((HERE / "fixture.json").read_text(encoding="utf-8"))
T = "{http://openoffice.org/2000/table}"
O = "{http://openoffice.org/2000/office}"
TXT = "{http://openoffice.org/2000/text}"
META = "{http://openoffice.org/2000/meta}"
MAN = "{http://openoffice.org/2001/manifest}"
S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def write_json(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_bytes(path):
    data = Path(path).read_bytes()
    assert len(data) == CONFIG["source"]["bytes"], "Source size differs"
    assert sha(data) == CONFIG["source"]["sha256"], "Source SHA-256 differs"
    assert hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == CONFIG["source"]["blob"]
    return data


def fetch(path):
    if not Path(path).exists():
        with urllib.request.urlopen(CONFIG["source"]["url"], timeout=45) as response:
            data = response.read(1_000_000)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_bytes(data)
    source_bytes(path)


def address(row, col):
    letters = ""
    while col >= 0:
        col, n = divmod(col, 26)
        letters = chr(65 + n) + letters
        col -= 1
    return letters + str(row + 1)


def text_content(node):
    if node.tag == TXT + "s":
        return " " * int(node.get(TXT + "c", "1"))
    if node.tag == TXT + "tab-stop":
        return "\t"
    if node.tag == TXT + "line-break":
        return "\n"
    return (node.text or "") + "".join(text_content(c) + (c.tail or "") for c in node)


def parse_source(path):
    source_bytes(path)
    with zipfile.ZipFile(path) as z:
        assert len(z.namelist()) == 6, "Unexpected source package parts"
        assert not any(n.startswith(("xl/", "Basic/", "Scripts/")) for n in z.namelist())
        assert z.read("mimetype").decode() == CONFIG["source"]["observedMime"]
        manifest = ET.fromstring(z.read("META-INF/manifest.xml"))
        root_entry = next(e for e in manifest if e.get(MAN + "full-path") == "/")
        assert root_entry.get(MAN + "media-type") == CONFIG["source"]["observedMime"]
        root = ET.fromstring(z.read("content.xml"))
        assert root.tag == O + "document-content" and root.get(O + "version") == "1.0"
        assert root.get(O + "class") == "spreadsheet"
        meta = ET.fromstring(z.read("meta.xml"))
        assert meta.findtext(".//" + META + "generator") == CONFIG["source"]["generator"]
        template = meta.find(".//" + META + "template")
        assert template is not None and template.get("{http://www.w3.org/1999/xlink}href").endswith(".stc")
        description = meta.findtext(".//{http://purl.org/dc/elements/1.1/}description", "")
        assert "Public Documentation License" in description
        package_parts = {n: sha(z.read(n)) for n in z.namelist()}
    sheets = []
    for table in root.iter(T + "table"):
        cells = {}
        row_index = 0
        for row in table.iter(T + "table-row"):
            repeat_rows = int(row.get(T + "number-rows-repeated", "1"))
            col_index = 0
            for cell in row:
                if cell.tag not in (T + "table-cell", T + "covered-table-cell"):
                    continue
                repeat_cols = int(cell.get(T + "number-columns-repeated", "1"))
                formula = cell.get(T + "formula")
                text = "\n".join(text_content(p) for p in cell.findall(TXT + "p"))
                value = cell.get(T + "value")
                kind = cell.get(T + "value-type")
                if formula is not None or value is not None or text:
                    assert repeat_rows * repeat_cols <= 10_000, "Unexpected populated repetition"
                    for dr in range(repeat_rows):
                        for dc in range(repeat_cols):
                            cells[address(row_index + dr, col_index + dc)] = {
                                "formula": formula, "value": value, "kind": kind, "text": text,
                            }
                col_index += repeat_cols
            row_index += repeat_rows
        sheets.append({"name": table.get(T + "name"), "cells": cells})
    assert len(sheets) == 6
    assert sum(c["formula"] is not None for s in sheets for c in s["cells"].values()) == 854
    return {"source": CONFIG["source"], "parts": package_parts, "sheets": sheets}


def expanded_range(value):
    value = value.replace("$", "").replace(".", "")
    first, last = value.split(":")
    a, b = [re.fullmatch(r"([A-Z]+)(\d+)", v) for v in (first, last)]
    assert a and b and a[2] == b[2] and len(a[1]) == len(b[1]) == 1
    return [chr(col) + a[2] for col in range(ord(a[1]), ord(b[1]) + 1)]


def derive_expected(source):
    edit = CONFIG["edit"]
    sheet = next(s for s in source["sheets"] if s["name"] == edit["sheet"])
    formula = sheet["cells"][edit["weightedCell"]]["formula"]
    match = re.fullmatch(r'=SUMPRODUCT\(\[([^]]+)\];\[([^]]+)\]\)/SUMIF\(\[([^]]+)\];">=0";\[([^]]+)\]\)', formula)
    assert match, "The source weighted-mean formula changed"
    weight_range, grade_range, criterion_range, sum_range = map(expanded_range, match.groups())
    assert grade_range == criterion_range and weight_range == sum_range
    weights = [Fraction(edit["coefficients"][a]) for a in weight_range]
    grades = [Fraction(edit["grades"][a]) for a in grade_range]
    numerator = sum(w * v for w, v in zip(weights, grades))
    denominator = sum(w for w, v in zip(weights, grades) if v >= 0)
    result = numerator / denominator
    rounded_formula = sheet["cells"][edit["roundedCell"]]["formula"]
    mround = re.fullmatch(r'=com.sun.star.sheet.addin.Analysis.getMround\(\[\.H5\];([0-9.]+)\)', rounded_formula)
    assert mround, "The source rounding formula changed"
    step = Decimal(mround[1])
    decimal_result = Decimal(result.numerator) / Decimal(result.denominator)
    rounded = (decimal_result / step).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * step
    return {
        "edit": edit,
        "weighted": {"formula": formula, "numerator": result.numerator, "denominator": result.denominator, "value": float(result)},
        "rounded": {"formula": rounded_formula, "multiple": str(step), "value": float(rounded)},
        "note": "Derived only from original STC formula operands and planned edits; original cached error values are not calculation oracles.",
    }


def read_xlsx(path):
    import posixpath
    with zipfile.ZipFile(path) as z:
        types = ET.fromstring(z.read("[Content_Types].xml"))
        assert any(e.get("PartName") == "/xl/workbook.xml" and e.get("ContentType") == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" for e in types)
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = {e.get("Id"): e.get("Target") for e in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
        strings = []
        if "xl/sharedStrings.xml" in z.namelist():
            strings = ["".join(si.itertext()) for si in ET.fromstring(z.read("xl/sharedStrings.xml"))]
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
                    value = "".join(c.find(S + "is").itertext())
                f = c.find(S + "f")
                cells[c.get("r")] = {"value": value, "kind": c.get("t", "n"), "formula": f.text if f is not None else None, "hasFormula": f is not None}
            sheets.append({"name": sheet.get("name"), "cells": cells})
        return sheets


def verify_xlsx(oracle, path, edited):
    actual = read_xlsx(path)
    assert [s["name"] for s in actual] == [s["name"] for s in oracle["sheets"]], "Sheet names/order changed"
    formula_counts = []
    for source, result in zip(oracle["sheets"], actual):
        addresses = [a for a, c in source["cells"].items() if c["formula"] is not None]
        missing = [a for a in addresses if not result["cells"].get(a, {}).get("hasFormula")]
        assert not missing, (source["name"], "formula cells missing", missing[:10])
        formula_counts.append(len(addresses))
    cfg = oracle["expected"]["edit"]
    table = next(s for s in actual if s["name"] == cfg["sheet"])["cells"]
    for a, text in [("H3", "Moyenne brute"), ("I3", "Moyenne arrondie")]:
        assert table[a]["value"] == text
    if edited:
        for a, v in {**cfg["coefficients"], **cfg["grades"]}.items():
            assert table[a]["kind"] == "n" and Fraction(table[a]["value"]) == Fraction(v), (a, table[a])
        h = table[cfg["weightedCell"]]
        i = table[cfg["roundedCell"]]
        assert h["kind"] == i["kind"] == "n", (h, i)
        assert abs(float(h["value"]) - oracle["expected"]["weighted"]["value"]) < 1e-10
        assert float(i["value"]) == oracle["expected"]["rounded"]["value"]
        names = next(s for s in actual if s["name"] == cfg["nameSheet"])["cells"]
        assert names[cfg["nameCell"]]["value"] == cfg["nameValue"]
        assert table["A5"]["value"] == cfg["nameValue"], "Named-range formula failed to follow source edit"
    return {"file": str(path), "sha256": sha(Path(path).read_bytes()), "sheets": len(actual), "sourceFormulaCellsRetained": formula_counts, "edited": edited, "passed": True}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["source", "xlsx"])
    p.add_argument("--source", default=".local/stc-qa/source.stc")
    p.add_argument("--out", default=".local/stc-qa")
    p.add_argument("--xlsx")
    p.add_argument("--edited", action="store_true")
    args = p.parse_args()
    if args.command == "source":
        fetch(args.source)
        oracle = parse_source(args.source)
        oracle["application"] = CONFIG["application"]
        oracle["expected"] = derive_expected(oracle)
        write_json(Path(args.out) / "source-oracle.json", oracle)
        print(json.dumps({"sourceSha256": CONFIG["source"]["sha256"], "sheets": len(oracle["sheets"]), "formulaCells": 854, "expected": oracle["expected"]}, ensure_ascii=False, indent=2))
    else:
        oracle = json.loads((Path(args.out) / "source-oracle.json").read_text(encoding="utf-8"))
        report = verify_xlsx(oracle, args.xlsx, args.edited)
        write_json(Path(args.out) / (Path(args.xlsx).stem + "-independent.json"), report)
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
