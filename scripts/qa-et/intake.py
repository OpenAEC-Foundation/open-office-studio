"""Record a source-authenticity gap. Successful diagnostics do not accept ET.

This narrow reader independently inspects BIFF8 records in an ET-named WPS
candidate and its provenance control. It is not a general ET recognizer. Equal
XLS/ET payloads are an ambiguity in this publication, not proof of renaming.
"""
import hashlib
import json
from pathlib import Path
import struct
import urllib.request

from cfb import cfb_streams

ROOT = Path(__file__).parent
CONFIG = json.loads((ROOT / "fixture-gate.json").read_text())
OUT = Path(".local/et-qa")


def sha(b):
    return hashlib.sha256(b).hexdigest()


def write_json(name, value):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def fetch(cfg, name):
    path = OUT / name
    if not path.exists():
        with urllib.request.urlopen(cfg["url"], timeout=45) as response:
            data = response.read(1_000_000)
        OUT.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    b = path.read_bytes()
    if "bytes" in cfg:
        assert len(b) == cfg["bytes"]
    if "sha256" in cfg:
        assert sha(b) == cfg["sha256"]
    if "blob" in cfg:
        assert hashlib.sha1(b"blob " + str(len(b)).encode() + b"\0" + b).hexdigest() == cfg["blob"]
    return b


def records(b):
    p = 0
    while p + 4 <= len(b):
        rid, n = struct.unpack_from("<HH", b, p)
        end = p + 4 + n
        assert end <= len(b)
        yield p, rid, b[p + 4:end]
        p = end
    assert p == len(b)


def biff_oracle(b):
    recs = list(records(b))
    assert recs[0][1] == 0x809 and struct.unpack_from("<HH", recs[0][2]) == (0x600, 5)
    bounds = [r for r in recs if r[1] == 0x85]
    assert len(bounds) == 1
    _, _, d = bounds[0]
    offset, visible, kind, chars, wide = struct.unpack_from("<IBBBB", d)
    assert visible == 0 and kind == 0 and wide == 1
    name = d[8:].decode("utf-16le")
    assert name == "Sheet1" and len(name) == chars
    assert b[offset:offset + 4] == bytes.fromhex("09081000")
    sst = [d for _, rid, d in recs if rid == 0xfc]
    assert len(sst) == 1
    sst = sst[0]
    assert struct.unpack_from("<II", sst) == (5, 5)
    strings, p = [], 8
    for _ in range(5):
        n, flags = struct.unpack_from("<HB", sst, p)
        p += 3
        assert flags == 1
        strings.append(sst[p:p + n * 2].decode("utf-16le"))
        p += n * 2
    assert p == len(sst)
    cells, cell_records, formulas = {}, [], []
    for pos, rid, data in recs:
        if rid == 6:
            formulas.append(pos)
        if rid not in (0xfd, 0x27e, 0x203, 0xbd, 0x204, 0x205, 6):
            continue
        assert pos >= offset
        row, col, xf = struct.unpack_from("<HHH", data)
        assert col < 26
        a = chr(65 + col) + str(row + 1)
        if rid == 0xfd:
            assert len(data) == 10
            index = struct.unpack_from("<I", data, 6)[0]
            value = {"kind": "text", "value": strings[index]}
        elif rid == 0x27e:
            assert len(data) == 10
            rk = struct.unpack_from("<I", data, 6)[0]
            assert rk == 0x3ff00000  # Original floating RK: high30 bits of binary64.
            assert not rk & 3
            number = struct.unpack("<d", struct.pack("<Q", (rk & 0xfffffffc) << 32))[0]
            value = {"kind": "number", "value": number, "rkHex": data[6:].hex()}
        else:
            raise AssertionError("Candidate needs an additional cell-record oracle")
        assert a not in cells
        cells[a] = value
        cell_records.append({"offset": pos, "id": hex(rid), "cell": a, "xf": xf, **value})
    assert not formulas and set(cells) == {"A1", "B1", "C1", "A2", "B2", "C2"}
    assert cells["A2"]["value"] == 1 and cells["C2"]["kind"] == "text"
    return {"sheetNames": [name], "cells": cells, "populatedCells": 6, "textCells": 5,
            "numericCells": 1, "sourceFormulas": 0, "recordCount": len(recs), "cellRecords": cell_records,
            "method": "Own CFB+BIFF8 byte reader, BOUNDSHEET/SST/LABELSST/RK; no parser/engine/converter output used",
            "role": "Candidate content oracle only; not proof of ET producer authenticity or ET import support"}


def summary_app(data):
    # The pinned SummaryInformation property18 is a UTF16 application label.
    assert struct.unpack_from("<H", data)[0] == 0xfffe
    assert struct.unpack_from("<I", data, 24)[0] == 1
    section = struct.unpack_from("<I", data, 44)[0]
    count = struct.unpack_from("<I", data, section + 4)[0]
    for i in range(count):
        pid, offset = struct.unpack_from("<II", data, section + 8 + i * 8)
        if pid == 18:
            p = section + offset
            assert struct.unpack_from("<I", data, p)[0] == 31
            n = struct.unpack_from("<I", data, p + 4)[0]
            return data[p + 8:p + 8 + n * 2].decode("utf-16le").rstrip("\0")
    raise AssertionError("Application-label property absent")


def main():
    a = fetch(CONFIG["candidate"], "unqualified-candidate.et")
    b = fetch(CONFIG["control"], "same-publication-xls-control.bin")
    fetch(CONFIG["license"], "source-LICENSE.txt")
    false = fetch(CONFIG["falsePositive"], "rejected-placeholder.bin")
    assert false.startswith(b'"Lorem ipsum') and len(false) == 448
    assert false[:8] != bytes.fromhex("d0cf11e0a1b11ae1") and not false.startswith(b"PK")
    ea, sa = cfb_streams(a)
    eb, sb = cfb_streams(b)
    expected = {"Workbook", "ETExtData", "\x05SummaryInformation", "\x05DocumentSummaryInformation"}
    assert set(sa) == set(sb) == expected
    assert len(sa["Workbook"]) == 15598 and len(sa["ETExtData"]) == 570
    assert sha(sa["Workbook"]) == "7da8ecb0206f0cb61a73f1ec5b64b1ded0447ef164aae2cab3161068cad86bf4"
    assert sha(sa["ETExtData"]) == "59a721bef100a0c143fa624fecc2aca08125eabe32a1a7bccee873eed2278c0a"
    assert sa["Workbook"] == sb["Workbook"] and sa["ETExtData"] == sb["ETExtData"]
    assert len(a) == len(b)
    changes = [i for i, (x, y) in enumerate(zip(a, b)) if x != y]
    assert len(changes) == 28
    app_a = summary_app(sa["\x05SummaryInformation"])
    app_b = summary_app(sb["\x05SummaryInformation"])
    assert app_a == app_b == "WPS 文字"
    build = "2052-7.5.1.8994".encode("utf-16le")
    assert build in sa["\x05DocumentSummaryInformation"] and build in sb["\x05DocumentSummaryInformation"]
    native = biff_oracle(sa["Workbook"])
    assert native == biff_oracle(sb["Workbook"])
    write_json("candidate-content-oracle.json", native)
    report = {"application": CONFIG["application"], "candidate": CONFIG["candidate"], "control": CONFIG["control"],
              "license": CONFIG["license"], "gate": CONFIG["gate"], "diagnosticChecksPassed": True,
              "sourceGatePassed": False, "sourceImportAcceptance": False, "fullFormatAcceptance": False,
              "comparison": {"candidateStreams": ea, "controlStreams": eb, "sameWorkbookPayload": True,
                             "sameETExtDataPayload": True, "changedFileBytes": len(changes), "changedOffsets": changes,
                             "changedStreamNames": [k for k in sa if sa[k] != sb[k]],
                             "metadataApplicationLabels": [app_a, app_b], "metadataBuild": "2052-7.5.1.8994"},
              "candidateOracle": native,
              "rejectedPlaceholder": {**CONFIG["falsePositive"], "sha256": sha(false), "headerHex": false[:16].hex()},
              "limits": ["WPS metadata/ETExtData identify family, not independently documented original native ET Save-As intent.",
                         "Equal payloads do not prove renaming; the producer provenance remains unresolved.",
                         "No Office conversion, actual spreadsheet WASM, ET edit/UndoRedo/save/freshreopen, hosted browser UI or native GUI test.",
                         "Opaque ETExtData is hashed, not semantically decoded or accepted for fidelity.",
                         "Candidate has zero formulas; not an original ET formula-import oracle."]}
    write_json("source-gate-report.json", report)
    print(json.dumps({"diagnosticChecksPassed": True, "sourceGatePassed": False, "fullFormatAcceptance": False,
                      "sameWorkbookPayload": True, "sameETExtDataPayload": True, "changedBytes": 28,
                      "candidatePopulatedCells": 6, "sourceFormulas": 0}, indent=2))


if __name__ == "__main__":
    main()
