"""Bounded WQ2 native-cell/RPN oracle, independent author semantics and OOXML.

No converter or engine is imported. Layout references may share libwps lineage;
expected values are derived from raw records and the original creator's explicit
zero-based lookup semantics, never another parser/converter output.
"""
import argparse
from collections import Counter
from decimal import Decimal
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

CONFIG = json.loads((Path(__file__).parent / "fixture.json").read_text())
S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
EPSILON = Decimal("1e-9")  # Below 0.000000001, for binary64/OOXML decimal serialization only.


def write_json(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def sha(b):
    return hashlib.sha256(b).hexdigest()


def source_bytes(path):
    b = Path(path).read_bytes()
    c = CONFIG["source"]
    assert len(b) == c["bytes"] and sha(b) == c["sha256"]
    assert hashlib.sha1(b"blob " + str(len(b)).encode() + b"\0" + b).hexdigest() == c["blob"]
    return b


def fetch(url, path, digest):
    path = Path(path)
    if not path.exists():
        with urllib.request.urlopen(url, timeout=45) as r:
            data = r.read(1_000_000)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    assert sha(path.read_bytes()) == digest, str(path)


def address(row, col):
    assert 0 <= row < 8192 and 0 <= col < 26
    return chr(65 + col) + str(row + 1)


def lookup(cells, key, zero_column):
    assert zero_column in range(5)
    # This fixture contains strictly increasing unique keys; exact matches are
    # sufficient, without assuming undocumented approximate-match edge cases.
    rows = [r for r in range(2, 12) if cells[f"A{r}"]["value"] == key]
    assert len(rows) == 1
    return cells[address(rows[0] - 1, zero_column)]


def expected_results(oracle, edited=False, modern_columns=None):
    cells = oracle["cells"]
    key = CONFIG["edit"]["value"] if edited else cells["A15"]["value"]
    result = {}
    for a, c in cells.items():
        if "nativeIndex" not in c:
            continue
        index = c["nativeIndex"] if modern_columns is None else modern_columns[a] - 1
        found = lookup(cells, key, index)
        result[a] = {"kind": found["kind"], "value": found["value"]}
    return result


def parse_native(data):
    assert data[:6] == bytes.fromhex("000002002151"), "Not DOS WQ2 / PRONOM x-fmt/122"
    assert data[-4:] == bytes.fromhex("01000000")
    cells, caches, blanks, records, names = {}, {}, [], [], []
    pos = 0
    while pos + 4 <= len(data):
        rid, size = struct.unpack_from("<HH", data, pos)
        end = pos + 4 + size
        assert end <= len(data)
        b = data[pos + 4:end]
        records.append({"offset": pos, "id": f"0x{rid:04x}", "length": size, "payloadSha256": sha(b)})
        if rid == 0xde:
            names.append(b.hex())
        if rid in (12, 13, 14, 15, 16, 51):
            assert size >= 6
            col, sheet, row, style = struct.unpack_from("<BBHH", b)
            assert sheet == 0, "Fixture sheet identity changed"
            a = address(row, col)
            c = {"recordOffset": pos, "recordId": f"0x{rid:04x}", "styleWord": style}
            if rid == 12:
                assert size == 6
                blanks.append({"cell": a, **c})
            elif rid == 13:
                assert size == 8
                c.update(kind="number", value=struct.unpack_from("<h", b, 6)[0])
            elif rid == 14:
                assert size == 14
                value = struct.unpack_from("<d", b, 6)[0]
                assert math.isfinite(value)
                c.update(kind="number", value=value, numericBytesHex=b[6:].hex())
            elif rid == 15:
                assert size == 8 + b[7] and b[6] in (ord("'"), ord("^"))
                c.update(kind="text", value=b[8:].decode("ascii"))
            elif rid == 51:
                assert size == 7 + b[6]
                c.update(kind="text", value=b[7:].decode("ascii"))
                assert a not in caches
                caches[a] = c
            else:
                assert size == 47
                formula_length, refs_offset = struct.unpack_from("<HH", b, 14)
                assert formula_length == 31 and refs_offset == 9
                tokens = b[18:25]
                assert tokens[:3] == bytes([1, 2, 5]) and tokens[5:] == bytes([0x55, 3])
                native_index = struct.unpack_from("<h", tokens, 3)[0]
                assert native_index == col and col in (1, 2, 3, 4)
                # Type 0 + absolute cell A15, type 0x1000 + absolute A2:E11;
                # all sheet operands are relative zero (0x8000).
                assert struct.unpack_from("<HHHH", b, 25) == (0, 0, 14, 0x8000)
                assert struct.unpack_from("<HHHHHHH", b, 33) == (0x1000, 0, 1, 0x8000, 4, 10, 0x8000)
                cached = struct.unpack_from("<d", b, 6)[0]
                c.update(nativeIndex=native_index,
                         nativeFormula=f"@VLOOKUP($A$15,$A$2..$E$11,{native_index})",
                         expectedModernFormula=f"VLOOKUP($A$15,$A$2:$E$11,{native_index + 1})",
                         formulaTokensHex=tokens.hex(), referenceBytesHex=b[25:].hex(),
                         cachedNumericValue=cached if math.isfinite(cached) else None,
                         cachedBytesHex=b[6:14].hex())
            if rid not in (12, 51):
                assert a not in cells
                cells[a] = c
        pos = end
        if rid == 1:
            assert size == 0
            break
    assert pos == len(data) and len(records) == 236 and records[-1]["id"] == "0x0001"
    assert not names, "An explicit native name would require a name-preservation oracle"
    assert len(cells) == 61 and set(caches) == {"D15", "E15"}
    keys = [cells[f"A{r}"]["value"] for r in range(2, 12)]
    assert keys == list(range(4001, 4011))
    for a, c in cells.items():
        if "nativeIndex" not in c:
            continue
        result = lookup(cells, cells["A15"]["value"], c["nativeIndex"])
        c.update(kind=result["kind"], value=result["value"])
        if c["kind"] == "number":
            assert c["cachedNumericValue"] == c["value"]
        else:
            assert c["cachedNumericValue"] is None and caches[a]["value"] == c["value"]
            c["cachedTextRecord"] = caches[a]
    oracle = {"source": CONFIG["source"], "application": CONFIG["application"], "cells": cells,
              "logicalSheetIds": [0], "explicitNativeNameRecords": names,
              "sheetNameLimit": "No explicit serialized name; native default naming is not inferred from the WB2 implementation or used as a pass criterion",
              "recordInventory": records, "recordCounts": dict(Counter(r["id"] for r in records)),
              "blankStyleCells": blanks, "formulaCount": 4,
              "semantics": "Original creator explicitly documents Quattro VLOOKUP zero-based column indexing; raw integer constants 1/2/3/4 select B/C/D/E, whereas modern OOXML requires 2/3/4/5. Results independently selected from original native table and cross-checked against all four native caches including separate string records."}
    oracle["expectedBefore"] = expected_results(oracle)
    oracle["expectedAfter"] = expected_results(oracle, True)
    assert oracle["expectedBefore"] == {"B15": {"kind": "number", "value": 683.93}, "C15": {"kind": "number", "value": 3134.2}, "D15": {"kind": "text", "value": "c"}, "E15": {"kind": "text", "value": "sal"}}
    assert oracle["expectedAfter"] == {"B15": {"kind": "number", "value": 685.35}, "C15": {"kind": "number", "value": 3134.58}, "D15": {"kind": "text", "value": "c"}, "E15": {"kind": "text", "value": "l"}}
    return oracle


def negative_guards(data):
    rejected = []
    for offset, replacement, name in [(4, b"\x20\x51", "WQ1 signature"),
                                      (3199 + 4 + 23, b"\x54", "wrong function opcode"),
                                      (3199 + 4 + 6, struct.pack("<d", 4005), "wrong numeric source cache"),
                                      (3691 + 4 + 7, b"x", "wrong text source cache")]:
        altered = bytearray(data)
        altered[offset:offset + len(replacement)] = replacement
        try:
            parse_native(altered)
        except AssertionError:
            rejected.append(name)
        else:
            raise AssertionError(f"Oracle accepted {name}")
    return rejected


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
                    assert f is None or f.get("t") not in ("shared", "array"), "Need explicit shared/array oracle"
                    kind = "text" if c.get("t") in ("s", "str", "inlineStr") else "error" if c.get("t") == "e" else "number"
                    cells[c.get("r")] = {"value": value, "kind": kind, "formula": f.text if f is not None else None}
            sheets.append({"name": sheet.get("name"), "cells": cells})
        return sheets


def equal_value(expected, actual):
    if expected["kind"] != actual["kind"]:
        return False
    if expected["kind"] == "number":
        return abs(Decimal(str(expected["value"])) - Decimal(str(actual["value"]))) <= EPSILON
    return expected["value"] == actual["value"]


def verify_xlsx(oracle, path, edited):
    actual = read_xlsx(path)
    assert len(actual) == 1
    cells = actual[0]["cells"]
    assert set(cells) == set(oracle["cells"]), ("Populated addresses changed", set(cells) ^ set(oracle["cells"]))
    expected = {a: dict(c) for a, c in oracle["cells"].items()}
    if edited:
        expected[CONFIG["edit"]["cell"]]["value"] = CONFIG["edit"]["value"]
        expected[CONFIG["edit"]["textCell"]]["value"] = CONFIG["edit"]["textValue"]
        for a, value in oracle["expectedAfter"].items():
            expected[a].update(value)
    diffs, columns = [], {}
    for a, e in expected.items():
        got = cells[a]
        if not equal_value(e, got):
            diffs.append({"cell": a, "field": "value/type", "expected": {"kind": e["kind"], "value": e["value"]}, "actual": got})
        ef = e.get("expectedModernFormula")
        if (got["formula"] or "").upper() != (ef or "").upper():
            diffs.append({"cell": a, "field": "formula semantics", "expectedModernFormula": ef, "originalNativeFormula": e.get("nativeFormula"), "actual": got["formula"]})
        if ef:
            m = re.fullmatch(r"VLOOKUP\(\$A\$15,\$A\$2:\$E\$11,([1-5])\)", got["formula"] or "", re.I)
            assert m, (a, "Imported formula needs independent additional semantics", got)
            columns[a] = int(m[1])
    return {"file": str(path), "sha256": sha(Path(path).read_bytes()), "sheetNames": [actual[0]["name"]],
            "checkedPopulatedCells": 61, "checkedOriginalFormulas": 4, "edited": edited,
            "absoluteNumericTolerance": str(EPSILON), "importedModernColumnIndices": columns,
            "sourceImportAcceptance": not diffs, "fullFormatAcceptance": False, "differences": diffs,
            "cells": cells, "nativeExpectedResults": oracle["expectedAfter" if edited else "expectedBefore"],
            "expectedImportedFormulaResults": expected_results(oracle, edited, columns),
            "expectedImportedFormulaResultsBefore": expected_results(oracle, False, columns),
            "expectedImportedFormulaResultsAfter": expected_results(oracle, True, columns),
            "distinction": "Source preservation uses independent zero-based native oracle; imported-formula results are a separate diagnostic of what the converter actually emitted, not replacement acceptance criteria."}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["source", "xlsx"])
    p.add_argument("--source", default=".local/wq2-qa/source.wq2")
    p.add_argument("--out", default=".local/wq2-qa")
    p.add_argument("--xlsx")
    p.add_argument("--edited", action="store_true")
    p.add_argument("--diagnostic", action="store_true")
    args = p.parse_args()
    out = Path(args.out)
    if args.command == "source":
        c = CONFIG["source"]
        fetch(c["url"], args.source, c["sha256"])
        fetch(c["licenseUrl"], out / "source-license.md", c["licenseSha256"])
        fetch(c["authorOracleUrl"], out / "source-author-oracle.md", c["authorOracleSha256"])
        author = (out / "source-author-oracle.md").read_text()
        for index in range(1, 5):
            assert f"@VLOOKUP($A$15,$A$2..$E$11,{index})" in author
        assert "first column in the data block is 0" in author
        data = source_bytes(args.source)
        oracle = parse_native(data)
        oracle["negativeOracleGuards"] = negative_guards(data)
        write_json(out / "source-oracle.json", oracle)
        print(json.dumps({"populatedCells": 61, "formulas": 4, "expectedBefore": oracle["expectedBefore"], "expectedAfter": oracle["expectedAfter"], "guards": oracle["negativeOracleGuards"]}, indent=2))
    else:
        oracle = json.loads((out / "source-oracle.json").read_text())
        report = verify_xlsx(oracle, args.xlsx, args.edited)
        write_json(out / (Path(args.xlsx).stem + "-independent.json"), report)
        print(json.dumps({k: v for k, v in report.items() if k != "cells"}, indent=2))
        if not args.diagnostic and not report["sourceImportAcceptance"]:
            raise SystemExit("Strict native source/formula preservation failed; see independent JSON report")


if __name__ == "__main__":
    main()
