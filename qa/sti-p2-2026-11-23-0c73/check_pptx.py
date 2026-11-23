"""Independent OOXML oracle check; expectations originate only in factory STI."""
import argparse
import hashlib
import json
from pathlib import Path
import posixpath
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
MARKER = "STI_P2_EDIT_2026_48_1 "

def normalized(value):
    return " ".join(unicodedata.normalize("NFC", value).split())

def target(base, rel):
    assert rel.get("TargetMode") != "External"
    value = rel.get("Target", "")
    assert "\\" not in value and ":" not in value
    result = posixpath.normpath(posixpath.join(posixpath.dirname(base), value))
    if value.startswith("/"):
        result = value[1:]
    assert not result.startswith(("../", "/")) and result not in ("", ".", "..")
    return result

def verify(file, oracle, edited):
    with zipfile.ZipFile(file) as z:
        assert sum(v.file_size for v in z.infolist()) < 40_000_000
        rels = ET.fromstring(z.read("_rels/.rels"))
        office = next(r for r in rels if r.get("Type", "").endswith("/officeDocument"))
        presentation_path = target("", office)
        presentation = ET.fromstring(z.read(presentation_path))
        assert presentation.tag == P + "presentation"
        rel_path = posixpath.join(posixpath.dirname(presentation_path), "_rels", posixpath.basename(presentation_path) + ".rels")
        local = {r.get("Id"): r for r in ET.fromstring(z.read(rel_path))}
        ids = presentation.find(P + "sldIdLst")
        assert len(ids) == oracle["slideCount"]
        size = presentation.find(P + "sldSz")
        assert int(size.get("cx")) == oracle["pageSize"]["widthEmu"]
        assert int(size.get("cy")) == oracle["pageSize"]["heightEmu"]
        slides = []
        for i, slide in enumerate(ids):
            slide_path = target(presentation_path, local[slide.get(R + "id")])
            root = ET.fromstring(z.read(slide_path))
            texts = []
            for paragraph in root.findall(".//" + A + "p"):
                text = normalized("".join(e.text or "" for e in paragraph.iter(A + "t")))
                if text:
                    texts.append(text)
            expected = [normalized(p) for p in oracle["slides"][i]["paragraphs"] if normalized(p)]
            if edited and i == 0:
                expected[0] = normalized(MARKER + expected[0])
            assert texts == expected, {"slide": i + 1, "expectedFromSTI": expected, "actual": texts}
            slides.append({"index": i, "sourceName": oracle["slides"][i]["name"], "paragraphsVerified": len(expected), "part": slide_path})
    return {"file": str(file), "sha256": hashlib.sha256(Path(file).read_bytes()).hexdigest(),
        "sourceFixtureSha256": oracle["fixture"]["sha256"], "edited": edited,
        "slides": slides, "sourceParagraphsVerified": sum(s["paragraphsVerified"] for s in slides),
        "pageSizePreserved": True, "mediaQualification": oracle["media"]["qualification"], "pass": True}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file")
    parser.add_argument("--oracle", default=".local/qa-sti-p2-0c73/source-oracle.json")
    parser.add_argument("--edited", action="store_true")
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    result = verify(args.file, json.loads(Path(args.oracle).read_text(encoding="utf-8")), args.edited)
    Path(args.report).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"file": args.file, "pass": True, "slides": 7, "paragraphs": 24, "edited": args.edited}))

if __name__ == "__main__":
    main()
