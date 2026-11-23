"""Narrow independent WB2 byte oracle and stdlib OOXML checks; no engine imports.

This is deliberately not a general Quattro Pro reader. Unsupported fixture
changes fail closed. Expected formulas/results come from native operands and
RPN bytecode before the converter runs, not an upstream parser's output.
"""
import argparse
from collections import Counter
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import struct
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

CONFIG = json.loads((Path(__file__).parent / "fixture.json").read_text())
S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def write_json(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_bytes(path):
    b = Path(path).read_bytes()
    c = CONFIG["source"]
    assert len(b) == c["bytes"] and sha(b) == c["sha256"]
    assert hashlib.sha1(b"blob " + str(len(b)).encode() + b"\0" + b).hexdigest() == c["blob"]
    return b


def fetch(url, path, digest):
    path = Path(path)
    if not path.exists():
        with urllib.request.urlopen(url, timeout=45) as response:
            data = response.read(1_000_000)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    assert sha(path.read_bytes()) == digest, str(path)


def address(row, col):
    assert 0 <= row < 8192 and 0 <= col < 26
    return chr(65 + col) + str(row + 1)


def parse_native(data):
    assert data[:6] == bytes.fromhex("000002000210"), "Not native WB2 (0x1002)"
    records, cells, formulas = [], {}, []
    pos, sheet_id, sheet_count, sheet_ended, names = 0, None, 0, False, []
    while pos + 4 <= len(data):
        record_id, length = struct.unpack_from("<HH", data, pos)
        end = pos + 4 + length
        assert end <= len(data), "Truncated native record"
        b = data[pos + 4:end]
        records.append({"offset": pos, "id": f"0x{record_id:04x}", "length": length, "payloadSha256": sha(b)})
        if record_id == 202:
            assert b == b"\0" and sheet_count == 0
            sheet_id, sheet_count = b[0], sheet_count + 1
        elif record_id == 203:
            assert b == b"\0" and sheet_id == 0
            sheet_ended = True
        elif record_id == 204:
            names.append(b.hex())
        elif record_id in (12, 13, 14, 15, 16):
            assert sheet_id == 0 and not sheet_ended and len(b) >= 6
            col, page, row, style = struct.unpack_from("<BBHH", b)
            assert page == 0
            a = address(row, col)
            assert a not in cells
            c = {"recordOffset": pos, "recordId": f"0x{record_id:04x}", "styleWord": style}
            if record_id == 15:
                assert b[6] == 0
                c.update(kind="text", value=b[7:].split(b"\0", 1)[0].decode("ascii"))
            elif record_id == 13:
                assert length == 8
                c.update(kind="number", value=struct.unpack_from("<h", b, 6)[0])
            elif record_id == 16:
                assert length == 36
                cached, flags, total_length, ref_offset = struct.unpack_from("<dHHH", b, 6)
                assert flags == 0 and total_length == 16 and ref_offset == 4
                tokens = b[20:24]
                assert tokens == bytes([1, 1, 11, 3]), "Expected two refs, multiply, end"
                refs = []
                for start in (24, 30):
                    note, dc, dp, bits = struct.unpack_from("<HbbH", b, start)
                    assert note == 0 and dp == 0 and bits == 0xe000
                    # Relative column, sheet and signed 13-bit row offsets.
                    delta_row = bits & 0x1fff
                    if delta_row & 0x1000:
                        delta_row -= 0x2000
                    refs.append(address(row + delta_row, col + dc))
                assert refs == [address(row, 0), address(row, 1)]
                c.update(kind="number", cachedValue=cached, formula="*".join(refs),
                         formulaTokensHex=tokens.hex(), refs=refs, nativeReferenceBytesHex=b[24:].hex())
                formulas.append(a)
            else:
                raise AssertionError("This fixture must contain only labels, integers and formulas")
            cells[a] = c
        elif record_id == 1:
            assert length == 0
            pos = end
            break
        pos = end
    assert records[-1]["id"] == "0x0001" and pos == 4763
    assert sheet_count == 1 and sheet_ended and not names
    assert len(cells) == 33 and len(formulas) == 10
    assert [cells[a]["value"] for a in ("A1", "B1", "C1")] == ["X", "Y", "Z"]
    for a in formulas:
        c = cells[a]
        # Arithmetic is independently evaluated from raw integer cell records.
        c["value"] = cells[c["refs"][0]]["value"] * cells[c["refs"][1]]["value"]
        assert c["cachedValue"] == c["value"], (a, "source cache disagrees with native arithmetic")
    edit = CONFIG["edit"]
    before = cells[edit["formulaCell"]]["value"]
    after = edit["value"] * cells["B2"]["value"]
    return {"source": CONFIG["source"], "application": CONFIG["application"],
            "sheets": [{"name": "A", "nativeSheetId": 0, "nameBasis": "Native default for page 0; no explicit page-name record exists", "cells": cells}],
            "formulaCount": len(formulas), "recordInventory": records,
            "recordCounts": dict(Counter(r["id"] for r in records)),
            "trailer": {"offset": pos, "bytes": len(data) - pos, "hex": data[pos:].hex(), "sha256": sha(data[pos:]), "fidelityAccepted": False},
            "expected": {"edit": edit, "before": before, "after": after, "derivation": "Native RPN 01 01 0b 03 and relative references (-2,0,0),(-1,0,0) give Arow*Brow; raw integer operands evaluated without converter or engine"},
            "limits": [CONFIG["source"]["coverageLimit"], "Chart and other non-cell records inventoried, not semantically accepted", "Default sheet identity tested; explicit/custom sheet-name import not demonstrated"]}


def oracle_self_checks(data):
    # Meaningful guards against accepting a renamed WB1 or cache-only evidence.
    mutations = [(4, b"\x01\x10", "WB1 header"),
                 (4151 + 4 + 22, b"\x09", "addition instead of multiplication"),
                 (4151 + 4 + 6, struct.pack("<d", 11), "wrong source cache")]
    rejected = []
    for offset, replacement, name in mutations:
        b = bytearray(data)
        b[offset:offset + len(replacement)] = replacement
        try:
            parse_native(b)
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
                    assert f is None or f.get("t") not in ("shared", "array"), "Shared/array formulas need an explicit additional oracle"
                    cells[c.get("r")] = {"value": value, "kind": c.get("t", "n"), "formula": f.text if f is not None else None}
            sheets.append({"name": sheet.get("name"), "cells": cells})
        return sheets


def verify_xlsx(oracle, path, edited):
    actual = read_xlsx(path)
    assert [s["name"] for s in actual] == ["A"]
    expected = {a: dict(c) for a, c in oracle["sheets"][0]["cells"].items()}
    edit = CONFIG["edit"]
    if edited:
        expected[edit["cell"]]["value"] = edit["value"]
        expected[edit["formulaCell"]]["value"] = oracle["expected"]["after"]
        expected[edit["textCell"]]["value"] = edit["textValue"]
    result = actual[0]["cells"]
    assert set(result) == set(expected), ("Populated addresses changed", set(result) ^ set(expected))
    for a, c in expected.items():
        got = result[a]
        assert got["formula"] == c.get("formula"), (a, "formula", c.get("formula"), got)
        if c["kind"] == "number":
            assert got["kind"] == "n" and Decimal(got["value"]) == Decimal(c["value"]), (a, c, got)
        else:
            assert got["kind"] in ("s", "inlineStr", "str") and got["value"] == c["value"], (a, c, got)
    return {"file": str(path), "sha256": sha(Path(path).read_bytes()), "sheetNames": ["A"], "checkedPopulatedCells": len(expected), "checkedOriginalFormulas": 10, "edited": edited, "passed": True}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["source", "xlsx"])
    p.add_argument("--source", default=".local/wb2-qa/source.wb2")
    p.add_argument("--out", default=".local/wb2-qa")
    p.add_argument("--xlsx")
    p.add_argument("--edited", action="store_true")
    args = p.parse_args()
    out = Path(args.out)
    if args.command == "source":
        cfg = CONFIG["source"]
        fetch(cfg["url"], args.source, cfg["sha256"])
        fetch(cfg["mirror"]["url"], out / "apache-tika-source.wb2", cfg["sha256"])
        fetch(cfg["provenanceUrl"], out / "source-provenance-license.md", cfg["provenanceSha256"])
        data = source_bytes(args.source)
        assert data == (out / "apache-tika-source.wb2").read_bytes()
        oracle = parse_native(data)
        oracle["negativeOracleGuards"] = oracle_self_checks(data)
        write_json(out / "source-oracle.json", oracle)
        print(json.dumps({"populatedCells": 33, "formulas": 10, "sourceCaches": [c["cachedValue"] for c in oracle["sheets"][0]["cells"].values() if "formula" in c], "expected": oracle["expected"], "negativeGuards": oracle["negativeOracleGuards"]}, indent=2))
    else:
        oracle = json.loads((out / "source-oracle.json").read_text())
        report = verify_xlsx(oracle, args.xlsx, args.edited)
        write_json(out / (Path(args.xlsx).stem + "-independent.json"), report)
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
