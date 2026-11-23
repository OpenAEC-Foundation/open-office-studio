"""Read-only #375 boundary diagnosis; a successful run confirms an existing failure.

No Office execution, product repair, runtime build or acceptance relabelling.
Requires lxml; exact source and retained converter bytes are verified first.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import platform
import subprocess
import urllib.request
import zipfile

from lxml import etree as ET

EVIDENCE = "e280e9521cfad3b2c61c26d19fbb5df8b5b74a42"
UPSTREAM = "9dea406ab7695df6325b11b0e19fdca8db4b7276"
SOURCE_SHA = "7d204f66f3e15a76176145f917089b204f1160ff819a898aa0dd61e977c39c7d"
ZIP_SHA = "e5e3ae456b1c30eb01215797dcc465ba0f3913fb9c2b7794fe965ee814e38839"
SOURCES = {
    "filter/source/xslt/import/uof/uof2odf_presentation.xsl": "a48f3e959a374f63a4418fe7d751ebd8d5a821d798669214bef6ef1dd30a6c87",
    "sd/source/core/drawdoc4.cxx": "3ed0e13c4c52fca023f68b3c21338795f7adbbed565b57581bcad8140c802c7f",
    "svx/source/xoutdev/xattr.cxx": "d37f9a8655a5736c825dad88e71ff9d45fd997f222368cb0c184e8b163158489",
    "oox/source/export/drawingml.cxx": "b91f8863559173ecbadc1fdfd8d707a59892638f618197fadc21fd48dfbaa4ed",
}
NS = {
    "u": "http://schemas.uof.org/cn/2003/uof",
    "g": "http://schemas.uof.org/cn/2003/graph",
    "v": "http://schemas.uof.org/cn/2003/uof-slideshow",
    "w": "http://schemas.uof.org/cn/2003/uof-wordproc",
    "d": "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
    "s": "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
    "t": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def xml(data):
    return ET.fromstring(data, ET.XMLParser(resolve_entities=False, no_network=True))


def one(items):
    assert len(items) == 1, f"Expected a unique association; got {len(items)}"
    return items[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workdir", type=Path, default=Path(".local/presentation-375-diagnosis"))
    args = parser.parse_args()
    args.workdir.mkdir(parents=True, exist_ok=True)
    bundle = subprocess.check_output([
        "git", "show", EVIDENCE + ":docs/tests/uop-2026-11-23/retained/uop-runtime-result.zip"
    ])
    assert len(bundle) == 85190 and sha(bundle) == ZIP_SHA
    with zipfile.ZipFile(io.BytesIO(bundle)) as z:
        source = z.read("source.uop")
        assert len(source) == 204509 and sha(source) == SOURCE_SHA
        outputs = {n: z.read(n) for n in ("converted.pptx", "saved.pptx", "reopened-saved.pptx")}
    upstream = {}
    bindings = []
    for path, digest in SOURCES.items():
        url = f"https://raw.githubusercontent.com/LibreOffice/core/{UPSTREAM}/{path}"
        cached = args.workdir / Path(path).name
        if not cached.exists():
            with urllib.request.urlopen(url, timeout=45) as response:
                data = response.read(2_000_001)
            assert len(data) <= 2_000_000 and sha(data) == digest
            cached.write_bytes(data)
        data = cached.read_bytes()
        assert sha(data) == digest, f"Upstream source identity mismatch: {path}"
        upstream[path] = data
        bindings.append({"path": path, "url": url, "sha256": digest})

    transform = ET.XSLT(xml(upstream[next(iter(SOURCES))]), access_control=ET.XSLTAccessControl(
        read_file=False, write_file=False, create_dir=False, read_network=False, write_network=False
    ))
    transformed = transform(xml(source))
    source_root = xml(source)
    slide = source_root.xpath("//v:幻灯片", namespaces=NS)[2]
    anchors = slide.xpath("./u:锚点", namespaces=NS)
    observations = []
    for object_id in ("gr4_0", "gr5_0"):
        anchor = one([a for a in anchors if a.get("{" + NS["u"] + "}图形引用") == object_id])
        obj = one(source_root.xpath("//g:图形[@g:标识符=$id]", namespaces=NS, id=object_id))
        assert one(obj.xpath("g:预定义图形/g:名称/text()", namespaces=NS)) == "Rectangle"
        expected = one(obj.xpath("g:预定义图形/g:属性/g:填充/g:颜色/text()", namespaces=NS))
        label = one(obj.xpath("g:文本内容//w:文本串/text()", namespaces=NS))
        rect = one(transformed.xpath("//d:page[3]/d:rect[@d:style-name=$id]", namespaces=NS, id=object_id))
        assert one(rect.xpath(".//t:p", namespaces=NS)).xpath("string(.)") == label
        style = one(transformed.xpath("//s:style[@s:name=$id]/s:graphic-properties", namespaces=NS, id=object_id))
        assert style.get("{" + NS["d"] + "}fill") == "solid"
        actual_odf = style.get("{" + NS["d"] + "}fill-color")
        assert actual_odf == expected
        assert not list(style), "Unexpected explicit complex-color child needs separate examination"
        converted = []
        for filename, data in outputs.items():
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                root = xml(z.read("ppt/slides/slide3.xml"))
                shape = one(root.xpath("//p:sp[.//a:t=$label]", namespaces=NS, label=label))
                fill = one(shape.xpath("./p:spPr/a:solidFill/a:schemeClr", namespaces=NS))
                assert fill.get("val") == "accent1" and len(fill) == 0
                converted.append({"file": filename, "sha256": sha(data), "schemeClr": fill.get("val")})
        observations.append({
            "sourceObject": object_id, "label": label, "sourceFill": expected,
            "xsltODFFill": actual_odf, "sourceAnchor": dict(anchor.attrib), "outputs": converted,
        })
    assert observations[0]["sourceFill"] != observations[1]["sourceFill"]
    report = {
        "issue": 375, "evidenceCommit": EVIDENCE, "upstreamCommit": UPSTREAM,
        "sourceSha256": SOURCE_SHA, "retainedZipSha256": ZIP_SHA, "upstreamSources": bindings,
        "execution": {"platform": platform.system(), "python": platform.python_version(),
                      "lxml": list(ET.LXML_VERSION), "libxslt": list(ET.LIBXSLT_VERSION)},
        "observations": observations,
        "result": "Confirmed: source and standalone pinned UOF XSLT preserve distinct RGB; retained actual PPTX outputs both use accent1",
        "sourceAcceptancePassed": False, "newRuntimeExecution": False, "productFix": False,
        "inference": "Inherited default FillComplexColor may survive RGB assignment and take precedence in DrawingML export; confirm live properties before claiming the precise runtime cause",
        "limits": ["Standalone lxml transform is not the production Office execution",
                   "Retained actual converter/engine outputs are reused, not rerun",
                   "No native/browser/visual acceptance, runtime build or product correction"],
    }
    output = args.workdir / "diagnosis.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"issue": 375, "boundaryDiagnosisVerified": True, "sourceAcceptancePassed": False,
                      "report": str(output)}, ensure_ascii=True))


if __name__ == "__main__":
    main()
