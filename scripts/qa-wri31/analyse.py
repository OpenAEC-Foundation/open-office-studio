"""Offline original-byte/XML and receipt audit; no Office or Word execution."""
import hashlib
import json
from pathlib import Path
import zipfile

from oracle import CONFIG, native, docx, write_json

ROOT = Path("docs/tests/wri31-2026-11-23")


def digest(b):
    return hashlib.sha256(b).hexdigest()


def main():
    for kind, filename, run in [("runtime", "wri31-targeted-result.zip", 45198852740),
                                ("fresh", "wri31-new-process-result.zip", 45352073903)]:
        meta = json.loads((ROOT / (kind + "-artifact.json")).read_text())
        b = (ROOT / "retained" / filename).read_bytes()
        assert digest(b) == meta["verifiedZipSha256"] == meta["digest"].removeprefix("sha256:")
        assert len(b) == meta["downloadBytes"] and meta["workflow_run"]["id"] == run
    out = Path(".local/wri31-offline-audit")
    out.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ROOT / "retained/wri31-targeted-result.zip") as original, zipfile.ZipFile(ROOT / "retained/wri31-new-process-result.zip") as fresh:
        source = original.read("source.wri")
        assert digest(source) == CONFIG["source"]["sha256"] and fresh.read("source.wri") == source
        oracle = native(source)
        assert oracle == json.loads(original.read("source-oracle.json"))
        assert oracle == json.loads((ROOT / "native-source-oracle-WIP.json").read_text(encoding="utf-8"))
        (out / "source.wri").write_bytes(source)
        write_json(out / "source-oracle.json", oracle)
        for item in CONFIG["source"]["notices"]:
            b = original.read("source-" + item["path"])
            assert len(b) == item["bytes"] and digest(b) == item["sha256"]
        engine = json.loads(original.read("engine-report.json"))
        assert engine["application"] == CONFIG["application"] and engine["harnessCommit"] == "d463a8c30a70e97ebbbf925b56489d6b1bf5cb66"
        assert engine["passed"] and engine["strictSourceAcceptance"] and engine["downstreamEnginePassed"]
        assert not engine["fullFormatAcceptance"]
        verification = json.loads(original.read("runtime-consumer-verification.json"))
        assert verification["status"] == "verified" and verification["sourceCommit"] == CONFIG["application"]["commit"]
        pin = json.loads(Path("scripts/qa-wri31/runtime-input.json").read_text())
        binding = json.loads(original.read("runtime-binding.json"))
        assert binding["application"] == CONFIG["application"] and binding["artifact"] == pin
        converter = json.loads(original.read("converter-report.json"))
        assert converter["sourceUnchanged"] and converter["sourceSha256"] == digest(source)
        assert converter["profileSha256"] == "847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40"
        assert converter["outputSha256"] == digest(original.read("converted.docx"))
        assert json.loads(original.read("capacity-report.json"))["noCriticalP5LinuxJobQueued"]
        assert json.loads(original.read("route-report.json"))["passed"]
        new = json.loads(fresh.read("fresh-process-report.json"))
        assert new["passed"] and new["boundedSourceAcceptance"] and not new["fullFormatAcceptance"]
        assert new["engine"] == engine["engine"]
        assert new["cleanup"]["sessionDestroyed"] and new["cleanup"]["productionLoaderClosed"]
        assert not new["newOfficeExecution"] and not new["input"]["privateRuntimeRedownloaded"]
        assert new["input"]["savedDocxSha256"] == digest(original.read("saved.docx"))
        stages = []
        for package, filename, edited in [(original, "converted.docx", False), (original, "saved.docx", True),
                                          (original, "reopened-saved.docx", True), (fresh, "fresh-process-saved.docx", True)]:
            data = package.read(filename)
            p = out / filename
            p.write_bytes(data)
            docx(p, out, edited, False)
            result = json.loads((out / (p.stem + "-xml-report.json")).read_text(encoding="utf-8"))
            assert result["boundedSourceAcceptance"] and not result["mismatches"]
            assert len(result["checkedOrdinaryCases"]) == 25
            assert not result["fullFormatAcceptance"] and result["unacceptedSymbolObjectContent"]
            stages.append({"file": filename, "bytes": len(data), "sha256": digest(data), "edited": edited,
                           "checkedOrdinaryCases": 25, "mismatches": 0, "boundedSourceAcceptance": True,
                           "fullFormatAcceptance": False})
    report = {"method": "Offline own original FOD/header/font decoder plus independent OOXML and receipt audit; no Office/Word runtime",
        "sourceSha256": digest(source), "preConversionWipOracleMatches": True, "sourceAndPackageBindingsPassed": True,
        "stages": stages, "totalBoundedCaseEvaluations": 100, "originalEngineChecksPassed": True,
        "separateNewProcessReopenPassed": True, "newProcessReusesOriginalSavedDocx": True,
        "newProcessCleanupRecorded": True, "boundedSourceAcceptance": True, "fullFormatAcceptance": False,
        "limits": CONFIG["source"]["coverageLimit"]}
    write_json(ROOT / "offline-analysis.json", report)
    print(json.dumps({"stages": 4, "boundedCaseEvaluations": 100, "separateNewProcess": True,
                      "boundedSourceAcceptance": True, "fullFormatAcceptance": False}))


if __name__ == "__main__":
    main()
