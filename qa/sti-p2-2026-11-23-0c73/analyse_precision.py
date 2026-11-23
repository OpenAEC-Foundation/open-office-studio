"""Explain #373 from pinned upstream source and existing STI/PPTX evidence only."""
import argparse
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

COMMIT = "9dea406ab7695df6325b11b0e19fdca8db4b7276"
BASE = "https://github.com/LibreOffice/core/blob/" + COMMIT + "/"
SOURCES = {
    "sd/source/filter/eppt/pptx-epptbase.cxx": "ee04b82a5302d45be1b550c8b75330489aaf6f0abd204f607571f4244b5be891",
    "sd/source/filter/eppt/pptx-epptooxml.cxx": "50f99423289257e37232c2fc242c88a4af4185ff927c435149b43f1cdcbea14f",
    "include/oox/export/utils.hxx": "9d220421ef1ae24d41176cd052b436dd341775642fc853d39e9838edca9de3da",
    "include/o3tl/unit_conversion.hxx": "8d60b600da7e679b41db0452e126863feb6b9b283c579e1c8c3431f3a0e5a19b",
    "vcl/source/outdev/map.cxx": "c6c0d2cbb8b7cc24eba6217977b0145eb286adb8d6ed674593b5c9501d015739",
}
NS = {"draw": "http://openoffice.org/2000/drawing", "style": "http://openoffice.org/2000/style",
      "fo": "http://www.w3.org/1999/XSL/Format"}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def nearest_positive(value):
    assert value >= 0
    return (2 * value.numerator + value.denominator) // (2 * value.denominator)

def source_mm100(length):
    match = re.fullmatch(r"(\d+(?:\.\d+)?)cm", length)
    assert match
    return Fraction(match[1]) * 1000

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    source_provenance = []
    for path, expected in SOURCES.items():
        data = (args.source_dir / path).read_bytes()
        assert sha(data) == expected
        source_provenance.append({"url": BASE + path, "sha256": expected, "bytes": len(data)})
    fixture = (args.evidence / "prs-strategy.sti").read_bytes()
    assert sha(fixture) == "9b29e5fcec3f947a8a626cb2a448488508cb596087b018fa5d34a7ee02cd5340"
    with zipfile.ZipFile(args.evidence / "prs-strategy.sti") as z:
        content = ET.fromstring(z.read("content.xml"))
        styles = ET.fromstring(z.read("styles.xml"))
        pages = content.findall(".//draw:page", NS)
        assert len(pages) == 7
        master_names = {p.get("{" + NS["draw"] + "}master-page-name") for p in pages}
        assert master_names == {"prs-strategy"}
        masters = styles.findall(".//style:master-page", NS)
        master = next(m for m in masters if m.get("{" + NS["style"] + "}name") == "prs-strategy")
        page_master_name = master.get("{" + NS["style"] + "}page-master-name")
        page_master = next(m for m in styles.findall(".//style:page-master", NS)
            if m.get("{" + NS["style"] + "}name") == page_master_name)
        properties = page_master.find("style:properties", NS)
        source_lengths = {"widthEmu": properties.get("{" + NS["fo"] + "}page-width"),
            "heightEmu": properties.get("{" + NS["fo"] + "}page-height")}
    calculations = {}
    for axis, length in source_lengths.items():
        mm100 = source_mm100(length)
        assert mm100.denominator == 1
        raw_master = mm100 * Fraction(576, 2540)
        integer_master = nearest_positive(raw_master)
        exact_emu = mm100 * 360
        predicted_emu = nearest_positive(integer_master * Fraction(914400, 576))
        calculations[axis] = {"sourceLength": length, "sourceMm100": int(mm100),
            "sourceExactEmu": int(exact_emu), "unroundedMasterUnits": str(raw_master),
            "roundedMasterUnits": integer_master, "predictedPptxEmu": predicted_emu,
            "deltaEmu": predicted_emu - int(exact_emu),
            "deltaMm": str(Fraction(predicted_emu - exact_emu, 36000))}
    checks = []
    for name in ["converted/prs-strategy.pptx", "edited.pptx", "reopened.pptx"]:
        raw = (args.evidence / name).read_bytes()
        with zipfile.ZipFile(args.evidence / name) as z:
            root = ET.fromstring(z.read("ppt/presentation.xml"))
            size = root.find("{http://schemas.openxmlformats.org/presentationml/2006/main}sldSz")
            actual = {"widthEmu": int(size.get("cx")), "heightEmu": int(size.get("cy"))}
        match = all(actual[axis] == calc["predictedPptxEmu"] for axis, calc in calculations.items())
        assert match, "Converter dimensions must equal the source-derived upstream calculation exactly"
        checks.append({"file": name, "sha256": sha(raw), "actualDimensions": actual,
            "matchesSourceDerivedMasterUnitPredictionExactly": match,
            "matchesExactSourceDimensions": all(actual[axis] == calc["sourceExactEmu"] for axis, calc in calculations.items())})
    result = {"issue": 373, "applicationCommit": "dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b",
        "runtimeSourceCommit": COMMIT, "upstreamSourceFiles": source_provenance,
        "fixtureSha256": sha(fixture), "sourceMasterPage": page_master_name,
        "masterUnitInches": "1/576", "masterUnitEmu": "3175/2",
        "calculation": "round-half-up(round-half-up(sourceMm100 * 576 / 2540) * 914400 / 576)",
        "axes": calculations, "existingArtifactChecks": checks,
        "interpretation": "The pinned upstream PPTX-export master-unit step predicts the observed drift exactly. This is source/numeric attribution, not an instrumented UNO import measurement.",
        "policyStatus": "Awaiting integration coordinator decision; original strict source-size failures remain failed.",
        "scope": "Only this seven-slide factory STI and pinned P2 runtime. No product correction, general format tolerance or GUI/platform fidelity claim.",
        "execution": "XML, source hash and rational arithmetic audit of existing Linux evidence; no runtime/engine/GUI/capture execution and no additional CI run."}
    args.report.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"issue": 373, "predictionMatchesAllThreeFiles": True,
        "sourceMm100": [v["sourceMm100"] for v in calculations.values()],
        "masterUnits": [v["roundedMasterUnits"] for v in calculations.values()],
        "predictedEmu": [v["predictedPptxEmu"] for v in calculations.values()],
        "policyStatus": result["policyStatus"]}))

if __name__ == "__main__":
    main()
