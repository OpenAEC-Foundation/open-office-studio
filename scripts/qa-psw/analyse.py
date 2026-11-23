"""Offline source/XML replay; confirms a bounded result, not a source pass."""
import hashlib
import json
from pathlib import Path
import zipfile

from oracle import CONFIG, native, docx, write_json

ROOT = Path("docs/tests/psw-2026-11-23")


def main():
    for kind, filename in [("runtime", "psw-runtime-result.zip"), ("browser", "psw-browser-limit.zip")]:
        metadata = json.loads((ROOT / (kind + "-artifact.json")).read_text())
        data = (ROOT / "retained" / filename).read_bytes()
        assert hashlib.sha256(data).hexdigest() == metadata["verifiedZipSha256"] == metadata["digest"].removeprefix("sha256:")
        assert len(data) == metadata["downloadBytes"]
        assert metadata["workflow_run"]["id"] == 45192485858
        assert metadata["workflow_run"]["head_sha"] == "fe55bde7978f5f3b58bc90e6a823680b5e44ae87"
    out = Path(".local/psw-offline-analysis")
    out.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ROOT / "retained/psw-runtime-result.zip") as package:
        source = package.read("source.psw")
        assert hashlib.sha256(source).hexdigest() == CONFIG["source"]["sha256"]
        oracle = native(source)
        (out / "source.psw").write_bytes(source)
        write_json(out / "source-oracle.json", oracle)
        engine = json.loads(package.read("engine-report.json"))
        assert engine["downstreamEnginePassed"] and not engine["strictSourceAcceptance"] and not engine["passed"]
        stages = []
        for filename, edited in [("converted.docx", False), ("saved.docx", True), ("reopened-saved.docx", True)]:
            data = package.read(filename)
            path = out / filename
            path.write_bytes(data)
            docx(path, out, edited, True)
            r = json.loads((out / (path.stem + "-xml-report.json")).read_text(encoding="utf-8"))
            assert [m["kind"] for m in r["mismatches"]] == ["original-text-with-raw-LF"]
            assert len(r["paragraphTexts"]) == 1
            original = oracle["expected"]["editedTexts" if edited else "texts"][0]
            actual = r["paragraphTexts"][0]
            # Character accounting ONLY: does not alter any acceptance expectation.
            assert actual == original.replace("\n", "") and len(original) - len(actual) == 2
            assert all(f["family"] == "Courier New" and f["points"] == 10 for f in r["fonts"])
            assert not r["boundedSourceAcceptance"]
            stages.append({"file": filename, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                "sourceCodepointsIncludingEdit": len(original), "actualCodepointsIncludingEdit": len(actual),
                "paragraphs": 1, "originalPrintableCharactersPreserved": True,
                "courierNew10ptPreserved": True, "missingOriginalRawLfBytes": 2,
                "strictSourceAcceptance": False, "nativeLfSemanticsIndependentlyProven": False})
    report = {"method": "Offline own source-byte and DOCX XML replay of complete-ZIP-verified actual CI results; no Office/Word engine execution",
              "sourceSha256": CONFIG["source"]["sha256"], "sourceRawLfOffsets": oracle["rawLfOffsets"],
              "stages": stages, "downstreamEnginePassed": True, "strictSourceAcceptance": False, "fullFormatAcceptance": False,
              "meaning": "All printable symbols and font/paragraph structure survive. Two original 0x0a bytes are absent at conversion and remain absent after Word save/freshreopen; native semantics are not independently established, so no confirmed whitespace/layout bug or strict pass is claimed."}
    write_json(ROOT / "offline-analysis.json", report)
    print(json.dumps({"stages": len(stages), "sourceRawLfBytesAbsent": 2, "strictSourceAcceptance": False, "downstreamEnginePassed": True}))


if __name__ == "__main__":
    main()
