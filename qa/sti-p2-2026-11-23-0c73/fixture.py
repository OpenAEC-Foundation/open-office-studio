"""Fetch one original factory STI; derive expectations before any conversion."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

APPLICATION = "dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b"
TREE = "5a644e397ecc6af5452a49b6404edf953687d1b2"
PACKAGE_URL = "https://archive.debian.org/debian/pool/main/o/openoffice.org/openoffice.org-l10n-en_1.1.3-9sarge8_all.deb"
PACKAGE_SHA256 = "37dfb7683269d8a80f89b730fad4b831d8f5cad8801f21bdcd111db1da594adb"
MEMBER = "./usr/lib/openoffice/share/template/english/presnt/prs-strategy.sti"
FIXTURE_SHA256 = "9b29e5fcec3f947a8a626cb2a448488508cb596087b018fa5d34a7ee02cd5340"
FIXTURE_MD5 = "73a4a6cec6de64d607b1abd5924384ea"
N = {"office": "http://openoffice.org/2000/office", "draw": "http://openoffice.org/2000/drawing",
     "text": "http://openoffice.org/2000/text", "style": "http://openoffice.org/2000/style",
     "presentation": "http://openoffice.org/2000/presentation", "fo": "http://www.w3.org/1999/XSL/Format",
     "xlink": "http://www.w3.org/1999/xlink", "svg": "http://www.w3.org/2000/svg"}

def tag(prefix, local):
    return "{" + N[prefix] + "}" + local

def digest(data):
    return hashlib.sha256(data).hexdigest()

def ar_members(data):
    assert data[:8] == b"!<arch>\n"
    offset, result = 8, {}
    while offset + 60 <= len(data):
        header = data[offset:offset + 60]
        assert header[-2:] == b"`\n"
        size = int(header[48:58])
        assert 0 <= size <= len(data) - offset - 60
        name = header[:16].decode("ascii").strip().rstrip("/")
        assert name not in result
        result[name] = data[offset + 60:offset + 60 + size]
        offset += 60 + size + size % 2
    assert offset == len(data)
    return result

def paragraph(element):
    text = element.text or ""
    for child in element:
        if child.tag == tag("text", "s"):
            count = int(child.get(tag("text", "c"), "1"))
            assert 0 < count < 10000
            text += " " * count
        elif child.tag in (tag("text", "tab-stop"), tag("text", "tab")):
            text += "\t"
        elif child.tag == tag("text", "line-break"):
            text += "\n"
        else:
            text += paragraph(child)
        text += child.tail or ""
    return text

def paragraphs(element):
    return [paragraph(e) for e in element.iter() if e.tag in (tag("text", "p"), tag("text", "h"))]

def build_oracle(raw):
    assert len(raw) == 10141 and digest(raw) == FIXTURE_SHA256
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        assert sum(info.file_size for info in z.infolist()) < 2_000_000
        content = ET.fromstring(z.read("content.xml"))
        styles = ET.fromstring(z.read("styles.xml"))
        assert content.tag == tag("office", "document-content")
        assert content.get(tag("office", "class")) == "presentation"
        assert content.get(tag("office", "version")) == "1.0"
        assert z.read("mimetype") == b"application/vnd.sun.xml.impress"
        assert b"urn:oasis:names:tc:opendocument" not in z.read("content.xml")
        body = content.find(tag("office", "body"))
        slides = []
        for index, page in enumerate(body.findall(tag("draw", "page"))):
            shapes, texts = [], []
            for child in page:
                if child.tag == tag("presentation", "notes"):
                    assert not any(t.strip() for t in paragraphs(child))
                    continue
                values = paragraphs(child)
                texts.extend(values)
                shapes.append({"type": child.tag.rsplit("}", 1)[-1],
                    "class": child.get(tag("presentation", "class")), "paragraphs": values,
                    "geometry": {k: child.get(tag("svg", k)) for k in ("x", "y", "width", "height")}})
            slides.append({"index": index, "name": page.get(tag("draw", "name")),
                "master": page.get(tag("draw", "master-page-name")), "paragraphs": texts, "shapes": shapes})
        assert len(slides) == 7 and sum(len(s["paragraphs"]) for s in slides) == 24
        master = next(e for e in styles.iter(tag("style", "master-page")) if e.get(tag("style", "name")) == slides[0]["master"])
        layout = next(e for e in styles.iter(tag("style", "page-master")) if e.get(tag("style", "name")) == master.get(tag("style", "page-master-name")))
        props = layout.find(tag("style", "properties"))
        width, height = props.get(tag("fo", "page-width")), props.get(tag("fo", "page-height"))
        assert (width, height) == ("28cm", "21cm")
        all_elements = [*content.iter(), *styles.iter()]
        active_images = [e for e in all_elements if e.tag == tag("draw", "image")]
        active_bitmap_fills = [e for e in all_elements if e.get(tag("draw", "fill")) == "bitmap"]
        plugins = [e for e in all_elements if e.tag == tag("draw", "plugin")]
        assert not active_images and not active_bitmap_fills and not plugins
        return {"schemaVersion": 1, "applicationCommit": APPLICATION, "applicationTree": TREE,
            "applicationVersion": "2026.48.1", "fixture": {"name": "prs-strategy.sti", "sha256": digest(raw),
                "size": len(raw), "factoryPackageMember": MEMBER, "internalMime": "application/vnd.sun.xml.impress",
                "legacyNamespace": N["office"], "officeVersion": "1.0",
                "mimeQualification": "Original factory STI carries document MIME; bytes were not renamed or rewritten."},
            "package": {"url": PACKAGE_URL, "sha256": PACKAGE_SHA256, "version": "1.1.3-9sarge8"},
            "slideCount": len(slides), "paragraphCount": 24, "slides": slides,
            "pageSize": {"width": width, "height": height, "widthEmu": 10080000, "heightEmu": 7560000},
            "media": {"activeSlideImageReferences": 0, "activeBitmapFills": 0, "audioVideoPlugins": 0,
                "inactiveDeclaredParts": [{"path": name, "size": len(z.read(name)), "sha256": digest(z.read(name))}
                    for name in z.namelist() if name.startswith("Pictures/")],
                "qualification": "One PNG belongs to an unused fill-image declaration; no active bitmap or AV preservation claim."},
            "sourcePartSha256": {name: digest(z.read(name)) for name in z.namelist()}}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=".local/qa-sti-p2-0c73")
    parser.add_argument("--package")
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    package = Path(args.package) if args.package else out / "source-package.deb"
    if not package.is_file():
        with urllib.request.urlopen(PACKAGE_URL, timeout=45) as response:
            data = response.read(4_000_001)
        assert len(data) <= 4_000_000
        package.write_bytes(data)
    data = package.read_bytes()
    assert len(data) == 3527534 and digest(data) == PACKAGE_SHA256
    parts = ar_members(data)
    with tarfile.open(fileobj=io.BytesIO(parts["control.tar.gz"]), mode="r:gz") as t:
        control = t.extractfile("./control").read()
        assert b"Package: openoffice.org-l10n-en\n" in control and b"Version: 1.1.3-9sarge8\n" in control
        sums = t.extractfile("./md5sums").read().decode().splitlines()
        assert f"{FIXTURE_MD5}  {MEMBER[2:]}" in sums
    with tarfile.open(fileobj=io.BytesIO(parts["data.tar.gz"]), mode="r:gz") as t:
        member = t.getmember(MEMBER)
        assert member.isfile() and member.size == 10141
        raw = t.extractfile(member).read()
        copyright_text = t.extractfile("./usr/share/doc/openoffice.org-l10n-en/copyright").read()
    assert hashlib.md5(raw).hexdigest() == FIXTURE_MD5
    oracle = build_oracle(raw)
    encoded = (json.dumps(oracle, ensure_ascii=True, indent=2, sort_keys=True) + "\n").encode()
    (out / "prs-strategy.sti").write_bytes(raw)
    (out / "source-oracle.json").write_bytes(encoded)
    (out / "source-package-copyright.txt").write_bytes(copyright_text)
    provenance = {"applicationCommit": APPLICATION, "applicationTree": TREE,
        "packageSha256": digest(data), "packageSize": len(data), "packageUrl": PACKAGE_URL,
        "member": MEMBER, "fixtureSha256": digest(raw), "fixtureSize": len(raw),
        "packageMemberMd5Verified": FIXTURE_MD5, "oracleSha256": digest(encoded),
        "copyrightSha256": digest(copyright_text), "conversionPerformed": False}
    (out / "source-provenance.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**provenance, "slides": 7, "paragraphs": 24}))

if __name__ == "__main__":
    main()
