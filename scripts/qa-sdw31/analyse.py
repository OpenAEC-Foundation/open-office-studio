"""Offline original-byte/XML replay; confirms observations, not full acceptance."""
import hashlib
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

from oracle import CONFIG, W, native, write_json

ROOT = Path("docs/tests/sdw31-2026-11-23")


def sha(b):
    return hashlib.sha256(b).hexdigest()


def main():
    for stem, archive in [("initial", "initial-runtime-result.zip"), ("replay", "engine-replay-result.zip"), ("browser", "browser-limit.zip")]:
        meta = json.loads((ROOT / (stem + "-artifact.json")).read_text())
        b = (ROOT / "retained" / archive).read_bytes()
        assert sha(b) == meta["verifiedZipSha256"] == meta["digest"].removeprefix("sha256:")
        assert len(b) == meta["downloadBytes"]
    with zipfile.ZipFile(ROOT / "retained/engine-replay-result.zip") as outer:
        original = outer.read("source.sdw")
        assert sha(original) == CONFIG["source"]["sha256"]
        source = native(original)
        engine = json.loads(outer.read("engine-report.json"))
        assert engine["downstreamEnginePassed"] and not engine["strictSourceAcceptance"] and not engine["passed"]
        stages = []
        for filename, edited in [("converted.docx", False), ("saved.docx", True), ("reopened-saved.docx", True)]:
            blob = outer.read(filename)
            with zipfile.ZipFile(io.BytesIO(blob)) as docx:
                body = ET.fromstring(docx.read("word/document.xml")).find(W + "body")
                numbering = ET.fromstring(docx.read("word/numbering.xml"))
            ps = list(body.iter(W + "p"))
            text = ["".join(e.text or "" if e.tag == W + "t" else "\t" if e.tag == W + "tab" else "\n" if e.tag in (W + "br", W + "cr") else "" for r in p.iter(W + "r") for e in r.iter()) for p in ps]
            expected = source["expected"]["editedTexts" if edited else "texts"]
            assert len(ps) == 28 and text[:27] == expected and text[27] == ""
            p = ps[27]
            assert len(p) == 1 and p[0].tag == W + "pPr" and len(p[0]) == 1 and p[0][0].tag == W + "sectPr"
            assert not list(body.iter(W + "tbl"))
            nums = {e.get(W + "numId"): e for e in numbering.findall(W + "num")}
            abstracts = {e.get(W + "abstractNumId"): e for e in numbering.findall(W + "abstractNum")}
            checked = {}
            for index, level in source["expected"]["explicitListLevels"].items():
                np = ps[int(index)].find(W + "pPr/" + W + "numPr")
                assert np is not None
                nid = np.find(W + "numId").get(W + "val")
                lev = np.find(W + "ilvl")
                actual = int(lev.get(W + "val")) if lev is not None else 0
                assert actual == level and nid in nums
                aid = nums[nid].find(W + "abstractNumId").get(W + "val")
                assert aid in abstracts
                assert any(int(e.get(W + "ilvl")) == level for e in abstracts[aid].findall(W + "lvl"))
                checked[index] = level
            stages.append({"file": filename, "bytes": len(blob), "sha256": sha(blob),
                "originalParagraphSequenceAndSpacesPreserved": True, "explicitListLevelsAndReferencesVerified": checked,
                "nativeTextNodes": 27, "physicalDocxParagraphs": 28, "pureSectionPropertyCarrierIndices": [27],
                "strictOriginalParagraphCountAccepted": False, "renderedLayoutOrExtraPageAccepted": False})
    report = {"method": "Offline own source-byte decoder plus independent OOXML replay of full-ZIP-verified actual CI outputs; no Office/Word engine execution",
              "sourceSha256": sha(original), "stages": stages, "downstreamEnginePassed": True,
              "strictSourceAcceptance": False, "fullFormatAcceptance": False,
              "meaning": "All original paragraphs/list levels survive; an extra pure section-property carrier is observed in all three outputs. Its normative/layout significance remains unresolved, not a confirmed product bug or strict source pass."}
    write_json(ROOT / "offline-analysis.json", report)
    print(json.dumps({"originalParagraphs": 27, "explicitListLevels": 11, "stages": len(stages), "strictSourceAcceptance": False, "downstreamEnginePassed": True}))


if __name__ == "__main__":
    main()
