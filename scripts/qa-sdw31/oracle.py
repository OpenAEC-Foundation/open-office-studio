"""Bounded native SW3 byte oracle, then independent DOCX XML comparisons.

No Office or third-party document parser is imported. Historical producer
record layouts are references; no converter output supplies expectations.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

from cfb import cfb_streams

CONFIG = json.loads((Path(__file__).parent / "fixture.json").read_text(encoding="utf-8"))
OUT = Path(".local/sdw31-qa")
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def sha(b):
    return hashlib.sha256(b).hexdigest()


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def source_bytes(path):
    b = Path(path).read_bytes()
    cfg = CONFIG["source"]
    assert len(b) == cfg["bytes"] and sha(b) == cfg["sha256"]
    assert hashlib.sha1(b"blob " + str(len(b)).encode() + b"\0" + b).hexdigest() == cfg["blob"]
    return b


def fetch(url):
    with urllib.request.urlopen(url, timeout=45) as response:
        return response.read(1_000_000)


def native(data):
    entries, streams = cfb_streams(data)
    assert b"StarWriter 3.1\0" in streams["\x01CompObj"]
    b = streams["StarWriterDocument"]
    assert sha(b) == "6e2fc2dd6e066d09f9735646c1a9708bc06ebd9971bd1deaf9bc1b32f9962fd2"
    assert b[:7] == b"SW3HDR\0" and b[7] == 0x2e
    u16 = lambda p: struct.unpack_from("<H", b, p)[0]
    assert u16(8) == 0x000b and u16(10) == 0  # This fixture's SW3 version and flags, no password flag.
    pool, paragraphs, sections, contents = [], [], [], []

    def records(p, end):
        while p < end:
            size = int.from_bytes(b[p + 1:p + 4], "little")
            assert size >= 4 and p + size <= end
            yield p, chr(b[p]), p + size
            p += size
        assert p == end

    def string(p):
        size = u16(p)
        raw = b[p + 2:p + 2 + size]
        assert len(raw) == size
        # All original visible text and pool names are ASCII in this fixture.
        return raw.decode("ascii"), p + 2 + size

    def visit(p, kind, end, context):
        q = p + 4
        if kind == "!":
            encoding, count = b[q], u16(q + 1)
            assert encoding == 2 and count == 28
            q += 3
            for _ in range(count):
                ident = u16(q)
                text, q = string(q + 2)
                pool.append({"id": ident, "name": text})
            assert q == end
            return
        if kind == "N":
            flags = b[q]
            ident, declared = u16(q + 1), u16(q + 3)
            assert flags == 4
            q += 1 + (flags & 15)
            children = list(records(q, end))
            assert len(children) == declared
            contents.append({"offset": p, "sectionId": ident, "declaredNodes": declared, "path": context})
            for start, tag, stop in children:
                assert tag in ("T", "I"), (start, tag)
                visit(start, tag, stop, context)
            return
        if kind == "I":
            name, q = string(q)
            condition, q = string(q)
            flags, section_type = b[q], u16(q + 1)
            assert flags == 2 and not condition and section_type == 0
            q += 1 + (flags & 15)
            sections.append({"offset": p, "name": name, "condition": condition, "flags": flags, "type": section_type})
            for start, tag, stop in records(q, end):
                assert tag in ("s", "N")
                if tag == "N":
                    visit(start, tag, stop, context + [name])
            return
        assert kind == "T"
        flags, style = b[q], u16(q + 1)
        assert flags in (2, 0x13)
        level = b[q + 3] if flags & 0x10 else None
        q += 1 + (flags & 15)
        text_start = q + 2
        text, q = string(q)
        children = [{"offset": a, "type": tag, "bytes": z - a, "sha256": sha(b[a:z])} for a, tag, z in records(q, end)]
        assert all(x["type"] in ("S", "R", "K") for x in children)
        assert style < len(pool)
        paragraphs.append({"offset": p, "bytes": end - p, "textOffset": text_start, "text": text,
                           "stylePoolIndex": style, "stylePoolEntry": pool[style], "rawListLevel": level,
                           "explicitListLevel": level if level is not None and level < 200 else None,
                           "sectionPath": context, "opaqueChildRecords": children})

    top = list(records(8 + b[7], len(b)))
    assert [kind for _, kind, _ in top] == ["C", "D", "!", "d", "0", "1", "N", "U", "J", "Z"]
    for p, kind, end in top:
        if kind in ("!", "N"):
            visit(p, kind, end, [])
    texts = [p["text"] for p in paragraphs]
    assert len(paragraphs) == 27 and len(sections) == 2
    assert [s["name"] for s in sections] == ["section1", "section2"]
    assert texts == ["Col 1", "", "Col 2", "", "", "text1", "", "standart", "standart", "list 2", "", "Text2   azeee", "", "Text2   azeee", "", "List", "same(IV)", "new list", "list level 2", "list level 4", "", "normal", "", "", "List (without bullet)", "", "standart"]
    edit = CONFIG["edit"]
    edited = list(texts)
    edited[edit["paragraph"]] = edit["text"] + edited[edit["paragraph"]]
    return {"source": CONFIG["source"], "method": "Own CFB/SW3 bounded record reader; original N/T/I records, pool references and text/list bytes before any conversion",
            "containerEntries": entries, "signature": "SW3HDR", "documentVersion": 11, "passwordHeaderFlag": False,
            "paragraphs": paragraphs, "sections": sections, "contents": contents, "pool": pool,
            "expected": {"texts": texts, "editedTexts": edited, "edit": edit, "tables": 0,
                         "explicitListLevels": {str(i): p["explicitListLevel"] for i, p in enumerate(paragraphs) if p["explicitListLevel"] is not None}},
            "limits": CONFIG["source"]["coverageLimit"], "fullFormatAcceptance": False}


def source(out):
    out.mkdir(parents=True, exist_ok=True)
    p = out / "source.sdw"
    if not p.exists():
        p.write_bytes(fetch(CONFIG["source"]["url"]))
    data = source_bytes(p)
    assert fetch(CONFIG["source"]["upstream"]["url"]) == data
    for item in CONFIG["source"]["notices"]:
        b = fetch(item["url"])
        assert sha(b) == item["sha256"]
        (out / ("source-" + item["path"].replace("/", "-"))).write_bytes(b)
    oracle = native(data)
    write_json(out / "source-oracle.json", oracle)
    print(json.dumps({"sourceSha256": sha(data), "paragraphs": len(oracle["paragraphs"]), "sections": len(oracle["sections"]),
                      "explicitListLevels": oracle["expected"]["explicitListLevels"], "fullFormatAcceptance": False}))


def docx(path, out, edited, observe=False):
    oracle = json.loads((out / "source-oracle.json").read_text(encoding="utf-8"))
    assert source_bytes(out / "source.sdw")
    with zipfile.ZipFile(path) as z:
        doc = ET.fromstring(z.read("word/document.xml"))
        styles = ET.fromstring(z.read("word/styles.xml"))
        numbering = ET.fromstring(z.read("word/numbering.xml")) if "word/numbering.xml" in z.namelist() else None
    by_style = {e.get(W + "styleId"): e for e in styles.findall(W + "style")}
    def prop(p, tag, seen=None):
        value = p.find(W + "pPr/" + W + tag)
        if value is not None:
            return value
        style = p.find(W + "pPr/" + W + "pStyle")
        name = style.get(W + "val") if style is not None else None
        seen = set() if seen is None else seen
        while name and name not in seen and name in by_style:
            seen.add(name)
            s = by_style[name]
            value = s.find(W + "pPr/" + W + tag)
            if value is not None:
                return value
            base = s.find(W + "basedOn")
            name = base.get(W + "val") if base is not None else None
        return None
    body = doc.find(W + "body")
    paragraphs = list(body.iter(W + "p"))
    # A pPr/tabs/tab is a tab-stop definition, not a visible r/tab character.
    texts = ["".join(e.text or "" if e.tag == W + "t" else "\t" if e.tag == W + "tab" else "\n" if e.tag in (W + "br", W + "cr") else "" for r in p.iter(W + "r") for e in r.iter()) for p in paragraphs]
    carriers = [i for i, p in enumerate(paragraphs) if len(p) == 1 and p[0].tag == W + "pPr" and len(p[0]) == 1 and p[0][0].tag == W + "sectPr"]
    levels = {}
    for i, p in enumerate(paragraphs):
        num = prop(p, "numPr")
        if num is None:
            continue
        nid, lev = num.find(W + "numId"), num.find(W + "ilvl")
        if nid is not None and int(nid.get(W + "val")) > 0:
            levels[str(i)] = int(lev.get(W + "val")) if lev is not None else 0
    expected = oracle["expected"]["editedTexts" if edited else "texts"]
    mismatches = []
    if texts != expected:
        mismatches.append({"kind": "paragraph-sequence", "expected": expected, "actual": texts})
    if list(body.iter(W + "tbl")):
        mismatches.append({"kind": "unexpected-table"})
    for index, level in oracle["expected"]["explicitListLevels"].items():
        if levels.get(index) != level:
            mismatches.append({"kind": "explicit-list-level", "paragraph": int(index), "expected": level, "actual": levels.get(index)})
    report = {"file": str(path), "sha256": sha(path.read_bytes()), "edited": edited,
              "paragraphTexts": texts, "pureSectionPropertyCarrierIndices": carriers,
              "effectiveListLevels": levels, "sectionPropertiesObserved": len(list(body.iter(W + "sectPr"))),
              "sourceSectionNameEquivalenceAccepted": False, "mismatches": mismatches, "boundedSourceAcceptance": not mismatches,
              "fullFormatAcceptance": False, "limits": oracle["limits"], "numberingPartPresent": numbering is not None}
    write_json(out / (path.stem + "-xml-report.json"), report)
    if not observe:
        assert not mismatches, json.dumps(mismatches, ensure_ascii=True)
    print(json.dumps({"file": str(path), "paragraphs": len(texts), "boundedSourceAcceptance": not mismatches, "fullFormatAcceptance": False}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["source", "docx"])
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--docx", type=Path)
    parser.add_argument("--edited", action="store_true")
    parser.add_argument("--observe", action="store_true", help="Record strict mismatches so the separate downstream engine phase can still run; never changes acceptance")
    args = parser.parse_args()
    source(args.out) if args.mode == "source" else docx(args.docx, args.out, args.edited, args.observe)
