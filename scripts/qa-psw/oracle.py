"""Own bounded Pocket Word byte oracle and independent DOCX XML comparisons.

No Office/third-party parser output supplies expected content. Original 0x0a
bytes remain explicit strict expectations, with their native semantics bounded.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

CONFIG = json.loads((Path(__file__).parent / "fixture.json").read_text(encoding="utf-8"))
OUT = Path(".local/psw-qa")
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def sha(b):
    return hashlib.sha256(b).hexdigest()


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def source_bytes(path):
    b = Path(path).read_bytes()
    c = CONFIG["source"]
    assert len(b) == c["bytes"] and sha(b) == c["sha256"]
    assert hashlib.sha1(b"blob " + str(len(b)).encode() + b"\0" + b).hexdigest() == c["blob"]
    return b


def fetch(url):
    with urllib.request.urlopen(url, timeout=45) as response:
        return response.read(1_000_000)


def native(b):
    assert struct.unpack_from("<IIHHH", b) == (0x77705c7b, 0x1569, 0x101, 6, 0)
    p, zones, by_id = 14, [], {}
    while p < len(b):
        kind, ident, words = struct.unpack_from("<HHH", b, p)
        assert kind != 85  # No extended sound/ink record in this fixture.
        size, start = words * 4, p + 6
        assert start + size <= len(b) and ident not in by_id
        entry = {"offset": p, "payloadOffset": start, "type": kind, "id": ident, "bytes": size,
                 "sha256": sha(b[start:start + size])}
        zones.append(entry)
        by_id[ident] = entry
        p = start + size
    assert p == len(b) and [z["type"] for z in zones] == [0, 20, 21, 7, 8, 64, 65, 66, 130]
    fonts = {}
    f = zones[0]
    start = f["payloadOffset"]
    assert f["bytes"] == 176 and struct.unpack_from("<H", b, start + 4)[0] == 2
    for i in range(2):
        q = start + 16 + 80 * i
        ident = struct.unpack_from("<H", b, q)[0]
        fonts[ident] = b[q + 16:q + 80].decode("utf-16le").split("\0")[0]
    assert fonts == {1: "Tahoma", 2: "Courier New"}
    listing = next(z for z in zones if z["type"] == 64)
    q = listing["payloadOffset"]
    assert listing["bytes"] == 32 and struct.unpack_from("<6I", b, q) == (1, 1, 190, 8, 0, 0)
    lines, chars, paragraph_id, flags = struct.unpack_from("<4H", b, q + 24)
    assert (lines, chars, paragraph_id, flags) == (8, 190, 35, 0)
    paragraph = by_id[paragraph_id]
    assert paragraph["type"] == 65 and paragraph["bytes"] == 228
    q = paragraph["payloadOffset"]
    header = struct.unpack_from("<HHHhHHhhhBBHH", b, q)
    assert header == (190, 203, 8, -1, 34, 0, 0, 0, 0, 0, 0, 0, 0)
    # Header is 24 bytes (the upstream reader's looser 22-byte guard is not copied).
    p, end = q + 24, q + 24 + header[1]
    assert end + 1 == q + paragraph["bytes"] and b[end] == 0
    text, commands, source_positions, spans = [], [], [], []
    font, size = None, None
    while p < end:
        c = b[p]
        if c in (0xe5, 0xe6):
            assert p + 3 <= end
            value = struct.unpack_from("<H", b, p + 1)[0]
            commands.append({"offset": p, "opcode": hex(c), "value": value})
            if c == 0xe5:
                assert value in fonts
                font = fonts[value]
            else:
                size = value
            p += 3
        elif c == 0xc4:
            assert b[p + 1] == 0 and p + 2 == end
            commands.append({"offset": p, "opcode": "0xc4", "value": 0, "role": "end marker"})
            p += 2
        else:
            assert c == 10 or 32 <= c < 127, (p, c)
            assert font == "Courier New" and size == 10
            source_positions.append(p)
            spans.append({"character": len(text), "font": font, "points": size})
            text.append(chr(c))
            p += 1
    raw = "".join(text)
    assert len(raw) == 189 and len(raw) + 1 == chars and raw.count("\n") == 2
    first, bits, trailing = raw.split("\n")
    assert first == "file format commons psw Pocket Word" and trailing == ""
    assert len(bits) == 152 and set(bits) == {"0", "1"}
    assert bytes(int(bits[i:i + 8], 2) for i in range(0, len(bits), 8)).decode("ascii") == "file format commons"
    edit = CONFIG["edit"]
    return {"source": CONFIG["source"], "signature": "{\\pwi binary, version6", "zones": zones,
            "fontTable": fonts, "paragraphList": {"id": listing["id"], "paragraphIds": [paragraph_id], "declaredCharactersIncludingTerminator": chars, "storedLayoutLines": lines},
            "paragraphHeader": list(header), "commands": commands, "sourceTextPositions": source_positions,
            "text": raw, "rawLfOffsets": [source_positions[i] for i, c in enumerate(raw) if c == "\n"],
            "activeFontOnAllSourceText": {"family": "Courier New", "points": 10},
            "expected": {"texts": [raw], "editedTexts": [edit["text"] + raw], "edit": edit, "tables": 0},
            "method": "Own length-bounded binary records, unique ID/paragraph linkage, UTF16 font table and ASCII/format-opcode reader; no converter/third-party parser execution",
            "nativeLfSemanticsIndependentlyProven": False,
            "limits": CONFIG["source"]["coverageLimit"], "fullFormatAcceptance": False}


def source(out):
    out.mkdir(parents=True, exist_ok=True)
    p = out / "source.psw"
    if not p.exists():
        p.write_bytes(fetch(CONFIG["source"]["url"]))
    b = source_bytes(p)
    assert fetch(CONFIG["source"]["catalogCopy"]["url"]) == b
    for name, url, digest in [("source-LICENSE.txt", CONFIG["source"]["licenseUrl"], CONFIG["source"]["licenseSha256"]),
                              ("source-README.md", CONFIG["source"]["readmeUrl"], CONFIG["source"]["readmeSha256"])]:
        data = fetch(url)
        assert sha(data) == digest
        (out / name).write_bytes(data)
    oracle = native(b)
    write_json(out / "source-oracle.json", oracle)
    print(json.dumps({"version": 6, "records": len(oracle["zones"]), "paragraphs": 1, "sourceCodepoints": len(oracle["text"]),
                      "rawLfOffsets": oracle["rawLfOffsets"], "activeFont": oracle["activeFontOnAllSourceText"], "fullFormatAcceptance": False}))


def docx(path, out, edited, observe):
    oracle = json.loads((out / "source-oracle.json").read_text(encoding="utf-8"))
    source_bytes(out / "source.psw")
    with zipfile.ZipFile(path) as z:
        body = ET.fromstring(z.read("word/document.xml")).find(W + "body")
        styles = ET.fromstring(z.read("word/styles.xml"))
    style_map = {s.get(W + "styleId"): s for s in styles.findall(W + "style")}
    default = next((s for s in styles.findall(W + "style") if s.get(W + "type") == "paragraph" and s.get(W + "default") == "1"), None)
    def inherited(p, r, tag):
        roots = [r.find(W + "rPr"), p.find(W + "pPr/" + W + "rPr")]
        ps = p.find(W + "pPr/" + W + "pStyle")
        name = ps.get(W + "val") if ps is not None else default.get(W + "styleId") if default is not None else None
        seen = set()
        while name and name in style_map and name not in seen:
            seen.add(name)
            s = style_map[name]
            roots.append(s.find(W + "rPr"))
            parent = s.find(W + "basedOn")
            name = parent.get(W + "val") if parent is not None else None
        roots.append(styles.find(W + "docDefaults/" + W + "rPrDefault/" + W + "rPr"))
        return next((x.find(W + tag) for x in roots if x is not None and x.find(W + tag) is not None), None)
    paragraphs, text, fonts, mismatches = list(body.iter(W + "p")), [], [], []
    for p in paragraphs:
        chunks = []
        for r in p.iter(W + "r"):
            content = "".join(e.text or "" if e.tag == W + "t" else "\t" if e.tag == W + "tab" else "\n" if e.tag in (W + "br", W + "cr") else "" for e in r.iter())
            chunks.append(content)
            if content:
                f, s = inherited(p, r, "rFonts"), inherited(p, r, "sz")
                family = f.get(W + "ascii") or f.get(W + "hAnsi") if f is not None else None
                points = int(s.get(W + "val")) / 2 if s is not None else None
                fonts.append({"text": content, "family": family, "points": points})
                if family != "Courier New" or points != 10:
                    mismatches.append({"kind": "source-font", "family": family, "points": points})
        text.append("".join(chunks))
    expected = oracle["expected"]["editedTexts" if edited else "texts"]
    if text != expected:
        mismatches.append({"kind": "original-text-with-raw-LF", "expected": expected, "actual": text})
    if len(paragraphs) != 1 or list(body.iter(W + "tbl")):
        mismatches.append({"kind": "paragraph-or-table-structure", "paragraphs": len(paragraphs)})
    report = {"file": str(path), "sha256": sha(path.read_bytes()), "edited": edited, "paragraphTexts": text,
              "fonts": fonts, "mismatches": mismatches, "boundedSourceAcceptance": not mismatches,
              "fullFormatAcceptance": False, "sourceRawLfSemanticsIndependentlyProven": False,
              "limits": oracle["limits"]}
    write_json(out / (path.stem + "-xml-report.json"), report)
    if not observe:
        assert not mismatches, json.dumps(mismatches, ensure_ascii=True)
    print(json.dumps({"file": str(path), "paragraphs": len(text), "mismatchKinds": [m["kind"] for m in mismatches], "boundedSourceAcceptance": not mismatches}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["source", "docx"])
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--docx", type=Path)
    parser.add_argument("--edited", action="store_true")
    parser.add_argument("--observe", action="store_true")
    args = parser.parse_args()
    source(args.out) if args.mode == "source" else docx(args.docx, args.out, args.edited, args.observe)
