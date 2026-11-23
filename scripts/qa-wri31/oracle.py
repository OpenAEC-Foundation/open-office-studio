"""Bounded original Write header/FOD/font oracle; independent DOCX XML check.

Only predeclared ordinary-text/font/justification cases are accepted. Original
symbol bytes, objects and geometry are inventoried, never decoded by guessing.
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
OUT = Path(".local/wri31-qa")
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
    u16 = lambda p: struct.unpack_from("<H", b, p)[0]
    u32 = lambda p: struct.unpack_from("<I", b, p)[0]
    assert (u16(0), u16(2), u16(4)) == (0xbe32, 0, 0xab00)
    end, para_page, font_page, pages = u32(14), u16(18), u16(28), u16(96)
    assert (end, para_page, font_page, pages) == (172819, 1355, 1380, 1382)
    assert pages * 128 == len(b) and 128 < end < para_page * 128 < font_page * 128
    fonts, page, p = [], font_page, font_page * 128 + 2
    while True:
        n = u16(p)
        p += 2
        if n == 0:
            break
        if n == 0xffff:
            page += 1
            assert page < pages
            p = page * 128
            continue
        assert n > 1 and p + n <= (page + 1) * 128
        fonts.append(b[p + 1:p + n].rstrip(b"\0").decode("ascii"))
        p += n
    assert fonts == ["Arial", "Times New Roman", "Courier New", "Wingdings", "Symbol", "Century Gothic", "Desdemona", "Impact", "Playbill", "Wide Latin"]

    def fod(page, page_limit):
        start, ranges = 128, []
        while True:
            base = page * 128
            count = b[base + 127]
            assert 0 < count <= 20 and u32(base) == start
            for i in range(count):
                limit, offset = u32(base + 4 + 6 * i), u16(base + 8 + 6 * i)
                raw = b""
                if offset < 123:
                    size = b[base + 4 + offset]
                    assert offset + size + 4 < 128
                    raw = b[base + 5 + offset:base + 5 + offset + size]
                assert start < limit <= end
                ranges.append({"start": start, "end": limit, "propertyBytes": raw.hex(), "fodPage": page})
                start = limit
                if start == end:
                    return ranges
            page += 1
            assert page < page_limit
    chars = fod((end + 127) // 128, para_page)
    paras = fod(para_page, u16(20))
    assert len(chars) == 45 and len(paras) == 71
    for r in chars:
        raw = bytes.fromhex(r["propertyBytes"])
        ch = bytearray([0, 0, 24, 0, 0, 0])
        ch[:min(6, len(raw))] = raw[:6]
        index = (ch[1] >> 2) | ((ch[4] & 7) * 64)
        assert index < len(fonts)
        r["properties"] = {"family": fonts[index], "halfPoints": ch[2], "bold": bool(ch[1] & 1),
            "italic": bool(ch[1] & 2), "underline": bool(ch[3] & 1),
            "script": "sub" if ch[5] & 0x80 else "super" if ch[5] else "baseline"}
    objects, headers = [], []
    for i, r in enumerate(paras):
        raw = bytes.fromhex(r["propertyBytes"])
        prop = (raw + bytes(78))[:78]
        r["index"] = i
        r["graphics"] = bool(prop[16] & 0x10)
        r["location"] = "footer" if prop[16] & 6 and prop[16] & 1 else "header" if prop[16] & 6 else "body"
        r["justification"] = ["left", "center", "right", "both"][prop[1] & 3]
        r["rawIndentTwips"] = list(struct.unpack_from("<3h", prop, 4))
        raw_text = b[r["start"]:r["end"]]
        r["payloadSha256"] = sha(raw_text)
        if r["graphics"]:
            assert raw_text[:2] == b"\xe4\x00"
            objects.append({"paragraph": i, "start": r["start"], "end": r["end"], "bytes": len(raw_text), "sha256": sha(raw_text)})
        elif r["location"] != "body":
            headers.append(i)
    assert headers == [0, 1, 2] and [o["paragraph"] for o in objects] == [62, 66, 69]

    def paragraph(index):
        r = paras[index]
        assert not r["graphics"] and r["location"] == "body"
        start, stop = r["start"], r["end"]
        assert b[stop - 2:stop] == b"\r\n"
        stop -= 2  # Original PAP-bounded logical paragraph terminator, not hidden text trimming.
        text = b[start:stop].decode("ascii")
        assert all(c == "\t" or 32 <= ord(c) < 127 for c in text)
        properties = []
        for offset in range(start, stop):
            c = next(c for c in chars if c["start"] <= offset < c["end"])
            assert c["properties"]["family"] not in ("Symbol", "Wingdings")
            properties.append(c["properties"])
        return {"nativeIndex": index, "start": start, "end": r["end"], "text": text,
                "characterProperties": properties, "justification": r["justification"]}
    prefix = [paragraph(i) for i in range(3, 20)]
    anchors = [paragraph(i) for i in [22, 23, 24, 25, 26, 46, 47, 48]]
    assert prefix[0]["text"] == "Test document for Write conversion" and len(prefix) == 17
    assert prefix[-1]["text"] == "3. Courier size 11"
    expected = [p["text"] for p in prefix]
    edited = list(expected)
    edited[0] = CONFIG["edit"]["text"] + edited[0]
    return {"source": CONFIG["source"], "header": {"ident": "BE32", "tool": "AB00", "fcMac": end, "paragraphPage": para_page, "fontPage": font_page, "pages": pages},
        "fontTable": fonts, "characterRanges": chars, "paragraphRanges": paras, "opaqueObjects": objects,
        "headerFooterParagraphIndices": headers, "prefix": prefix, "anchors": anchors,
        "expected": {"texts": expected, "editedTexts": edited, "edit": CONFIG["edit"]},
        "method": "Own original header/FOD/font/property/ASCII reader with complete contiguous bounds and fixed pre-conversion ordinary-paragraph selection; no third-party parser/Office output oracle",
        "fullFormatAcceptance": False, "limits": CONFIG["source"]["coverageLimit"]}


def source(out):
    out.mkdir(parents=True, exist_ok=True)
    p = out / "source.wri"
    if not p.exists():
        p.write_bytes(fetch(CONFIG["source"]["url"]))
    b = source_bytes(p)
    for item in CONFIG["source"]["notices"]:
        data = fetch(item["url"])
        assert len(data) == item["bytes"] and sha(data) == item["sha256"]
        (out / ("source-" + item["path"])).write_bytes(data)
    oracle = native(b)
    write_json(out / "source-oracle.json", oracle)
    print(json.dumps({"sourceSha256": sha(b), "charactersRuns": 45, "paragraphRanges": 71, "fonts": 10,
        "opaqueObjects": 3, "acceptedPrefixParagraphs": 17, "acceptedLaterAnchors": 8, "fullFormatAcceptance": False}))


def docx(path, out, edited, observe):
    oracle = json.loads((out / "source-oracle.json").read_text(encoding="utf-8"))
    source_bytes(out / "source.wri")
    with zipfile.ZipFile(path) as z:
        body = ET.fromstring(z.read("word/document.xml")).find(W + "body")
        styles = ET.fromstring(z.read("word/styles.xml"))
    by_style = {s.get(W + "styleId"): s for s in styles.findall(W + "style")}
    default = next((s for s in styles.findall(W + "style") if s.get(W + "default") == "1" and s.get(W + "type") == "paragraph"), None)
    def inherited(p, r, tag, paragraph=False):
        roots = [p.find(W + "pPr")] if paragraph else [r.find(W + "rPr"), p.find(W + "pPr/" + W + "rPr")]
        ps = p.find(W + "pPr/" + W + "pStyle")
        name = ps.get(W + "val") if ps is not None else default.get(W + "styleId") if default is not None else None
        seen = set()
        while name and name in by_style and name not in seen:
            seen.add(name)
            s = by_style[name]
            roots.append(s.find(W + ("pPr" if paragraph else "rPr")))
            parent = s.find(W + "basedOn")
            name = parent.get(W + "val") if parent is not None else None
        if not paragraph:
            roots.append(styles.find(W + "docDefaults/" + W + "rPrDefault/" + W + "rPr"))
        return next((x.find(W + tag) for x in roots if x is not None and x.find(W + tag) is not None), None)
    def boolean(e):
        return e is not None and e.get(W + "val", "true") not in ("false", "0", "off")
    ps, texts, attributes, justifications = list(body.iter(W + "p")), [], [], []
    for p in ps:
        text, properties = [], []
        for r in p.iter(W + "r"):
            # Symbol/object semantics are not accepted. Their raw nodes are retained in DOCX.
            t = "".join(e.text or "" if e.tag == W + "t" else "\t" if e.tag == W + "tab" else "\n" if e.tag in (W + "br", W + "cr") else "" for e in r.iter())
            f, sz = inherited(p, r, "rFonts"), inherited(p, r, "sz")
            family = (f.get(W + "ascii") or f.get(W + "hAnsi")) if f is not None else None
            half = int(sz.get(W + "val")) if sz is not None else None
            u, script, position = inherited(p, r, "u"), inherited(p, r, "vertAlign"), inherited(p, r, "position")
            sc = script.get(W + "val") if script is not None else "baseline"
            sc = "super" if sc == "superscript" else "sub" if sc == "subscript" else "baseline"
            if sc == "baseline" and position is not None:
                pos = int(position.get(W + "val"))
                sc = "super" if pos > 0 else "sub" if pos < 0 else "baseline"
            prop = {"family": family, "halfPoints": half, "bold": boolean(inherited(p, r, "b")),
                "italic": boolean(inherited(p, r, "i")), "underline": u is not None and u.get(W + "val", "single") not in ("none", "0", "false"), "script": sc}
            text.append(t)
            properties.extend([prop] * len(t))
        texts.append("".join(text))
        attributes.append(properties)
        jc = inherited(p, p, "jc", True)
        justifications.append(jc.get(W + "val") if jc is not None else "left")
    mismatches, checks = [], []
    def check(index, expected, role):
        t, props = expected["text"], expected["characterProperties"]
        if edited and role == "prefix" and index == 0:
            prefix = CONFIG["edit"]["text"]
            t = prefix + t
            props = [props[0]] * len(prefix) + props
        if index >= len(texts) or texts[index] != t:
            mismatches.append({"kind": "ordinary-paragraph-text", "role": role, "paragraph": index, "expected": t, "actual": texts[index] if index < len(texts) else None})
            return
        diffs = [{"character": i, "expected": a, "actual": b} for i, (a, b) in enumerate(zip(props, attributes[index])) if a != b]
        if len(props) != len(attributes[index]) or diffs:
            mismatches.append({"kind": "native-character-properties", "role": role, "paragraph": index, "differences": diffs})
        if justifications[index] != expected["justification"]:
            mismatches.append({"kind": "native-justification", "paragraph": index, "expected": expected["justification"], "actual": justifications[index]})
        checks.append({"role": role, "nativeIndex": expected["nativeIndex"], "docxParagraph": index, "characters": len(t)})
    for i, p in enumerate(oracle["prefix"]):
        check(i, p, "prefix")
    previous = 16
    for p in oracle["anchors"]:
        found = [i for i, t in enumerate(texts) if t == p["text"]]
        if len(found) != 1 or found[0] <= previous:
            mismatches.append({"kind": "ordinary-anchor-order", "nativeIndex": p["nativeIndex"], "matches": found})
        else:
            check(found[0], p, "anchor")
            previous = found[0]
    report = {"file": str(path), "sha256": sha(path.read_bytes()), "edited": edited, "paragraphTexts": texts,
        "checkedOrdinaryCases": checks, "mismatches": mismatches, "boundedSourceAcceptance": not mismatches,
        "fullFormatAcceptance": False, "unacceptedSymbolObjectContent": True, "limits": oracle["limits"]}
    write_json(out / (path.stem + "-xml-report.json"), report)
    if not observe:
        assert not mismatches, json.dumps(mismatches, ensure_ascii=True)
    print(json.dumps({"file": str(path), "physicalParagraphs": len(texts), "checkedOrdinaryCases": len(checks),
        "mismatchKinds": sorted(set(m["kind"] for m in mismatches)), "boundedSourceAcceptance": not mismatches}))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("mode", choices=["source", "docx"])
    p.add_argument("--out", type=Path, default=OUT)
    p.add_argument("--docx", type=Path)
    p.add_argument("--edited", action="store_true")
    p.add_argument("--observe", action="store_true")
    args = p.parse_args()
    source(args.out) if args.mode == "source" else docx(args.docx, args.out, args.edited, args.observe)
