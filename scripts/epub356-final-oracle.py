"""Independent stdlib oracle for the synthetic #356 EPUB -> native-saved DOCX."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

SOURCE_SHA256 = "8e48dc46db4058f4539cece9564f090e2385ebb006454b51bcb261b6dcf73bae"
IMAGE_SHA256 = "f132d26c2c3b6ccd9beb0583a4fbf360ae0461c0a4c0b9f3a973fe3dd247ce33"
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def package(data):
    require(len(data) <= 100 * 1024 * 1024, "Saved package exceeds the acceptance limit")
    z = zipfile.ZipFile(io.BytesIO(data))
    try:
        entries = z.infolist()
        names = [i.filename for i in entries]
        require(len(entries) <= 5000 and len(set(names)) == len(names), "Invalid or duplicate package entries")
        require(all(not n.startswith(("/", "\\")) and "\\" not in n and not any(p in (".", "..") for p in n.split("/")) for n in names), "Non-relative package entry")
        require(sum(i.file_size for i in entries) <= 100 * 1024 * 1024 and all(i.file_size <= 32 * 1024 * 1024 for i in entries), "Expanded package exceeds the acceptance limit")
        require(not any(i.flag_bits & 1 for i in entries), "Unexpected encrypted DOCX package")
        return z
    except Exception:
        z.close()
        raise


def xml(z, name):
    data = z.read(name)
    require(b"<!doctype" not in data.lower() and b"<!entity" not in data.lower(), "Unexpected DTD/entity in saved fixture")
    return ET.fromstring(data)


def validate(source_bytes, saved_bytes):
    require(sha(source_bytes) == SOURCE_SHA256, "The original EPUB fixture hash changed")
    with package(source_bytes) as source:
        expected_image = source.read("Boek/media/beeld een.png")
        require(sha(expected_image) == IMAGE_SHA256, "The EPUB fixture image changed")
    with package(saved_bytes) as saved:
        names = saved.namelist()
        require("word/document.xml" in names and "[Content_Types].xml" in names, "Not a Word document package")
        content_types = xml(saved, "[Content_Types].xml")
        require(not any("macroenabled" in n.attrib.get("ContentType", "").lower() or "vbaproject" in n.attrib.get("ContentType", "").lower() for n in content_types), "Unexpected macro content type")
        require(not any("vbaproject" in n.lower() or n.lower().startswith("word/activex/") or n.lower().startswith("word/embeddings/") for n in names), "Unexpected active/embedded object in saved fixture")
        document = xml(saved, "word/document.xml")
        require(not any(next(document.iter(W + tag), None) is not None for tag in ("object", "control", "altChunk")), "Unexpected active/imported content in saved fixture")
        paragraphs = ["".join(t.text or "" for t in p.iter(W + "t")) for p in document.iter(W + "p")]
        text = "\n".join(paragraphs)
        first, second = "EPUB EERSTE HOOFDSTUK", "EPUB TWEEDE HOOFDSTUK"
        require(first in text and second in text and text.index(first) < text.index(second), "Chapter text/order was not preserved")
        for marker in ["Café & ideeën", "Vette tekst", "cursieve tekst", "Eerste lijstpunt"]:
            require(marker in text, "Expected book content is missing: " + marker)
        require(any({"Hout", "42"}.issubset({"".join(t.text or "" for t in cell.iter(W + "t")).strip() for cell in row.findall(W + "tc")}) for table in document.iter(W + "tbl") for row in table.iter(W + "tr")), "Expected Hout/42 cells in the same table row are missing")
        relationships = {}
        for name in names:
            if name.endswith(".rels"):
                for rel in xml(saved, name):
                    require(rel.tag == REL + "Relationship", "Invalid relationship entry")
                    require(rel.attrib.get("TargetMode", "Internal").lower() != "external", "Unexpected external resource in this local-only fixture")
                    if name == "word/_rels/document.xml.rels":
                        relationships[rel.attrib.get("Id")] = rel.attrib
        embedded = set()
        drawing = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
        office_rel = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
        for blip in document.iter(drawing + "blip"):
            relation = relationships.get(blip.attrib.get(office_rel + "embed"))
            if relation:
                require(relation.get("Type") == office_rel[1:-1] + "/image", "Referenced PNG does not have an image relationship")
                target = relation.get("Target", "")
                require(not target.startswith(("/", "\\")) and "\\" not in target and not any(p == ".." for p in target.split("/")), "Invalid embedded-image target")
                path = "word/" + target.removeprefix("./")
                if path in names:
                    embedded.add(sha(saved.read(path)))
        require(IMAGE_SHA256 in embedded, "The exact PNG is missing or no longer referenced by the document")
    return {"status": "passed", "scope": "independent saved-file content, not native visual acceptance", "sourceSha256": SOURCE_SHA256,
            "savedSha256": sha(saved_bytes), "savedBytes": len(saved_bytes), "chapterOrder": True, "textMarkers": True,
            "tableCells": True, "referencedImageSha256": IMAGE_SHA256, "noMacrosOrExternalResources": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--saved", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    require(args.report.resolve() not in (args.source.resolve(), args.saved.resolve()), "Report must not overwrite an input")
    try:
        source = args.source.read_bytes()
        saved = args.saved.read_bytes()
        report = validate(source, saved)
        require(sha(args.source.read_bytes()) == sha(source), "Original source changed during verification")
        require(sha(args.saved.read_bytes()) == sha(saved), "Saved document changed during verification")
        report["originalUnchanged"] = True
    except Exception as error:
        report = {"status": "failed", "error": str(error)}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "report": str(args.report)}))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
