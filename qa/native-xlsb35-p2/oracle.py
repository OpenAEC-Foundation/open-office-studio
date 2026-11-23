"""Source-derived oracle for ONE pinned XLSB; never uses converted output as a golden.

The limited BIFF12 decoder intentionally rejects other formulas/fixtures. Runtime
execution belongs to isolated Linux CI; this source/oracle inspection is portable.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import xml.etree.ElementTree as ET
import zipfile

COMMIT = "bd7011e96264ddfe5506839319dd610975328a59"
SHA256 = "e06ae79ed345495eee0bf5e7fd7a32638af0b646c5819f7d83a4f6fb97a151a3"
BLOB = "b304e0826c391c4977d55a0eddca74d39138a7ee"
BASE = Path(__file__).resolve().parent
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def records(data):
    pos = 0
    while pos < len(data):
        kind = data[pos]
        pos += 1
        if kind & 128:
            kind = (kind & 127) | (data[pos] << 7)
            pos += 1
        length = 0
        for shift in (0, 7, 14, 21):
            byte = data[pos]
            pos += 1
            length |= (byte & 127) << shift
            if not byte & 128:
                break
        else:
            raise AssertionError("Oversized BIFF12 record header")
        end = pos + length
        assert end <= len(data), "Truncated BIFF12 record"
        yield kind, data[pos:end]
        pos = end


def wide(data, pos):
    length = struct.unpack_from("<I", data, pos)[0]
    end = pos + 4 + 2 * length
    assert end <= len(data)
    return data[pos + 4:end].decode("utf-16-le"), end


def source_oracle():
    source = BASE / "shared_formula.xlsb"
    data = source.read_bytes()
    assert len(data) == 7651
    assert hashlib.sha256(data).hexdigest() == SHA256
    assert hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest() == BLOB
    with zipfile.ZipFile(source) as package:
        names = package.namelist()
        assert "xl/workbook.bin" in names and "xl/workbook.xml" not in names
        assert not any("vbaproject" in name.lower() or "externallink" in name.lower() for name in names)
        bundles = [body for kind, body in records(package.read("xl/workbook.bin")) if kind == 156]
        assert len(bundles) == 1
        relation, pos = wide(bundles[0], 8)
        sheet_name, end = wide(bundles[0], pos)
        assert relation == "rId1" and sheet_name == "Sheet1" and end == len(bundles[0])
        row = None
        formulas = {}
        groups = []
        for kind, body in records(package.read("xl/worksheets/sheet1.bin")):
            if kind == 0:  # BrtRowHdr
                row = struct.unpack_from("<I", body)[0]
            elif kind == 9:  # BrtFmlaNum: Cell(8), cached double(8), flags(2)
                col = struct.unpack_from("<I", body)[0]
                cached = struct.unpack_from("<d", body, 8)[0]
                cce = struct.unpack_from("<I", body, 18)[0]
                tokens = body[22:22 + cce]
                extra_size = struct.unpack_from("<I", body, 22 + cce)[0]
                extra = body[26 + cce:]
                assert len(extra) == extra_size and col == 0 and row is not None
                assert row not in formulas
                formulas[row] = (cached, tokens, extra)
            elif kind == 427:  # BrtShrFmla, RfX(16), SharedParsedFormula
                bounds = struct.unpack_from("<IIII", body)
                size = struct.unpack_from("<I", body, 16)[0]
                groups.append((bounds, body[20:20 + size]))
        # Literal RPN: PtgInt(1), PtgInt(2), PtgAdd. Arithmetic is independent
        # of both LibreOffice conversion and the application's calculation engine.
        rpn = bytes.fromhex("1e01001e020003")
        assert formulas.keys() == set(range(30))
        assert formulas[0] == (3.0, rpn, b"")
        assert groups == [((1, 29, 0, 0), rpn)]
        for index in range(1, 30):
            assert formulas[index] == (3.0, b"\x01" + struct.pack("<I", 1), struct.pack("<I", 0))
    return {
        "source": {
            "upstreamCommit": COMMIT, "gitBlob": BLOB, "bytes": len(data), "sha256": SHA256,
            "url": f"https://raw.githubusercontent.com/LibreOffice/core/{COMMIT}/sc/qa/unit/data/xlsb/shared_formula.xlsb",
            "upstreamTest": f"https://github.com/LibreOffice/core/blob/{COMMIT}/sc/qa/unit/subsequent_filters_test2.cxx#L476",
            "license": "LibreOffice core MPL-2.0; upstream test fixture, unmodified",
            "formatProof": "workbook.bin/worksheet.bin with 30 BrtFmlaNum records, not renamed XLSX",
            "macroProjectPresent": False,
        },
        "sheets": [sheet_name],
        "formula": "1+2", "cachedValue": 3, "formulaCount": 30,
        "sourceSharedRange": "A2:A30", "standaloneFormula": "A1",
        "rpnHex": rpn.hex(),
        "edit": {"cell": "A15", "input": "=40+2", "formula": "40+2", "value": 42},
        "scope": "One actual XLSB source; no XLS/XLT/date/chart or XLSB-save assertion",
    }


def inspect_xlsx(path, edited):
    oracle = source_oracle()
    with zipfile.ZipFile(path) as package:
        assert "xl/workbook.bin" not in package.namelist()
        book = ET.fromstring(package.read("xl/workbook.xml"))
        assert [s.attrib["name"] for s in book.findall("s:sheets/s:sheet", NS)] == oracle["sheets"]
        root = ET.fromstring(package.read("xl/worksheets/sheet1.xml"))
        cells = {c.attrib["r"]: c for c in root.findall("s:sheetData/s:row/s:c", NS)}
        shared = {}
        formulas = []
        for row in range(1, 31):
            address = f"A{row}"
            cell = cells[address]
            formula = cell.find("s:f", NS)
            assert formula is not None, f"Lost formula at {address}"
            text = (formula.text or "").replace(" ", "").lstrip("=")
            if formula.get("t") == "shared":
                index = formula.attrib["si"]
                if text:
                    shared[index] = text
                else:
                    text = shared[index]  # This fixture's formula has no references.
            expected_formula = "40+2" if edited and address == "A15" else "1+2"
            assert text == expected_formula, (address, text, expected_formula)
            cached = cell.find("s:v", NS)
            expected_value = 42 if edited and address == "A15" else 3
            assert cached is not None and float(cached.text) == expected_value, (address, "cached result")
            formulas.append({"cell": address, "formula": text, "cached": expected_value})
        all_formulas = root.findall(".//s:f", NS)
        assert len(all_formulas) == 30, "Unexpected or missing formulas"
    return {"file": str(path), "sha256": hashlib.sha256(Path(path).read_bytes()).hexdigest(),
            "sheets": oracle["sheets"], "formulaCount": len(formulas), "cells": formulas, "edited": edited}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xlsx", type=Path)
    parser.add_argument("--edited", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = inspect_xlsx(args.xlsx, args.edited) if args.xlsx else source_oracle()
    text = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text)
