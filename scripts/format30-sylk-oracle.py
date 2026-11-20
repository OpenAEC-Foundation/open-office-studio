"""Independent source/OOXML oracle for the pinned SYLK alias-route probe."""
import argparse
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

SOURCE_SHA = "bcfaae8f2ce55e393c100dcd95c37301129b9121af0429586de75b3ec99df420"
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
CELLS = {"J1", "A2", "A4", "A5", "A6", "A8", "A10", "B6", "D6", "J6", "B8", "J10"}


def source_cells(data):
    assert len(data) == 2581 and hashlib.sha256(data).hexdigest() == SOURCE_SHA
    lines = data.decode("latin-1").splitlines()
    assert lines[0] == "ID;PXL;N;E" and lines[-1] == "E"
    # A narrow oracle for these immutable source bytes, not a SYLK importer.
    # This fixture carries X/Y coordinates in both F and C records.
    x = y = 1
    result = {}
    for line in lines:
        fields = line.split(";")
        if fields[0] not in ("F", "C"):
            continue
        for field in fields[1:]:
            if re.fullmatch(r"[XY][0-9]+", field):
                if field[0] == "X": x = int(field[1:])
                else: y = int(field[1:])
        if fields[0] != "C":
            continue
        address = chr(64 + x) + str(y)
        if address not in CELLS:
            continue
        values = [v[1:] for v in fields[1:] if v.startswith("K")]
        assert len(values) == 1
        value = values[0]
        result[address] = {"kind": "string", "value": value[1:-1]} if value.startswith('"') else {"kind": "number", "value": float(Decimal(value))}
    assert set(result) == CELLS
    assert result["A6"]["value"] == "Fuel" and result["J6"]["value"] == 1100.64
    return result


def workbook_cells(data):
    assert len(data) <= 20 * 1024 * 1024
    with zipfile.ZipFile(__import__("io").BytesIO(data)) as archive:
        entries = archive.infolist()
        names = [e.filename for e in entries]
        assert len(names) == len(set(names)) and len(names) < 3000
        assert sum(e.file_size for e in entries) < 50 * 1024 * 1024
        assert all(".." not in n.split("/") and not n.startswith("/") for n in names)
        assert not any("vbaproject" in n.lower() or "/embeddings/" in n.lower() for n in names)
        types = ET.fromstring(archive.read("[Content_Types].xml"))
        assert any(e.attrib.get("PartName") == "/xl/workbook.xml" and e.attrib.get("ContentType") == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" for e in types)
        for name in names:
            if name.endswith(".rels"):
                assert not any(r.attrib.get("TargetMode") == "External" for r in ET.fromstring(archive.read(name)))
        strings = []
        if "xl/sharedStrings.xml" in names:
            strings = ["".join(e.itertext()) for e in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        sheets = workbook.find("s:sheets", NS)
        assert sheets is not None and len(sheets) == 1
        relation = sheets[0].attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        links = {r.attrib["Id"]: r.attrib["Target"] for r in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        target = links[relation]
        path = target.lstrip("/") if target.startswith("/") else "xl/" + target
        assert ".." not in path.split("/")
        result = {}
        for cell in ET.fromstring(archive.read(path)).findall(".//s:sheetData/s:row/s:c", NS):
            kind = cell.attrib.get("t", "n")
            raw = cell.findtext("s:v", default="", namespaces=NS)
            if kind == "s": value = {"kind": "string", "value": strings[int(raw)]}
            elif kind == "inlineStr": value = {"kind": "string", "value": "".join(cell.find("s:is", NS).itertext())}
            elif raw: value = {"kind": "number", "value": float(Decimal(raw))}
            else: continue
            result[cell.attrib["r"]] = value
        return result


def check(data, expected, marker):
    cells = workbook_cells(data)
    for address, value in expected.items():
        actual = cells.get(address)
        assert actual and actual["kind"] == value["kind"], f"Missing/wrong typed cell {address}"
        if value["kind"] == "number":
            assert abs(actual["value"] - value["value"]) < 1e-8, f"Number changed at {address}"
        else:
            assert actual == value, f"Text changed at {address}"
    if marker:
        assert cells.get("L1") == {"kind": "string", "value": "SYLK30 EDIT"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--xlsx", type=Path)
    parser.add_argument("--marker", action="store_true")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    original = args.source.read_bytes()
    expected = source_cells(original)
    report = {"status": "passed", "scope": "pinned SYLK input/cell content only; not native UI or visual acceptance", "sourceSha256": SOURCE_SHA, "expectedCells": expected}
    if args.xlsx:
        data = args.xlsx.read_bytes()
        check(data, expected, args.marker)
        report.update(xlsxSha256=hashlib.sha256(data).hexdigest(), xlsxBytes=len(data), editMarkerChecked=args.marker)
    assert args.source.read_bytes() == original
    report["originalUnchanged"] = True
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
