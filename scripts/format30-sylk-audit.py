"""Recheck downloaded real files, original typed cells and immutable identities."""
import hashlib
import importlib.util
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

spec = importlib.util.spec_from_file_location("sylk_oracle", Path(__file__).with_name("format30-sylk-oracle.py"))
oracle = importlib.util.module_from_spec(spec); spec.loader.exec_module(oracle)
base = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/tests/formatendekking/2026-11-20-sylk-proof/ci")
downloads = json.loads((base / "download-receipt.json").read_bytes())
APP = "7f126f4b8e5269a54388cf78c48c78d2acc0daa1"
TREE = "8bc608488760e48919d7fb4e72a42569175b52a4"
HARNESS = "81f4dbeb426a75c4aaa845650d2209886f34b8c6"
assert downloads["run"] == 44728178415 and downloads["harnessCommit"] == HARNESS
summary = dict(applicationCommit=APP, applicationTree=TREE, harnessCommit=HARNESS, run=44728178415,
               sourceSha256=oracle.SOURCE_SHA, scope="Source-level production dispatch + real private runtime + production engine save/reopen; not native UI", platforms=[], checkedFiles=0)
for platform in ("Windows", "Linux", "macOS"):
    root = base / platform / "files"
    artifact = next(a for a in downloads["artifacts"] if a["platform"] == platform)
    archive = (base / platform / "artifact.zip").read_bytes()
    assert len(archive) == artifact["archiveBytes"]
    assert hashlib.sha256(archive).hexdigest() == artifact["archiveSha256"]
    report = json.loads((root / "report.json").read_bytes())
    assert report["applicationCommit"] == APP and report["applicationTree"] == TREE and report["harnessCommit"] == HARNESS
    assert report["desktopRun"] == 44715026752 and report["status"] == "passed" and report["loaderClosed"] is True
    assert report["browserLimitation"]["noTauriGuard"] and report["browserLimitation"]["desktopAlternative"]
    expected = oracle.source_cells((root / "original.sylk").read_bytes())
    assert {case["kind"] for case in report["cases"]} == {"Windows": {"nsis"}, "Linux": {"appimage", "deb"}, "macOS": {"dmg"}}[platform]
    for case in report["cases"]:
        assert case["status"] == "passed" and case["temporaryDisposed"] is True
        assert "26.8.2.2" in case["runtimeVersion"]
        assert [entry["ext"] for entry in case["extensions"]] == ["slk", "sylk"]
        for ext in case["extensions"]:
            assert ext["status"] == "passed" and ext["expectedCellsChecked"] == 12 and ext["originalUnchanged"] and ext["markerSavedReopened"]
            for stage in ("converted", "saved", "reopened"):
                data = (root / case["kind"] / ext["ext"] / (stage + ".xlsx")).read_bytes()
                assert hashlib.sha256(data).hexdigest() == ext[stage + "Sha256"]
                oracle.check(data, expected, stage != "converted")
                summary["checkedFiles"] += 1
    summary["platforms"].append(dict(platform=platform, status="passed", reportSha256=hashlib.sha256((root / "report.json").read_bytes()).hexdigest(), cases=report["cases"], browserLimitation=report["browserLimitation"]))
summary["artifacts"] = downloads["artifacts"]
assert summary["checkedFiles"] == 24
assert summary == json.loads((base / "independent-audit.json").read_bytes()), "Archived audit differs from current independent check"
proof_root = base.parent
inventory = json.loads((proof_root / "sha256.json").read_bytes())
for name, identity in inventory.items():
    path = proof_root / name
    assert path.resolve().is_relative_to(proof_root.resolve()), "Archive path escapes proof root"
    data = path.read_bytes()
    assert len(data) == identity["bytes"] and hashlib.sha256(data).hexdigest() == identity["sha256"], name
for variant, route in (("normal", "/"), ("hosted", "/office/")):
    root = proof_root / "browser" / variant
    report = json.loads((root / "report.json").read_bytes())
    assert report["applicationCommit"] == APP and report["applicationTree"] == TREE and report["route"] == route
    assert report["status"] == "passed" and report["noTauri"] and report["documentXmlPreserved"]
    assert report["tabsPreserved"] and report["activeTabPreserved"] and report["sourceUnchanged"]
    assert not report["errors"] and not report["externalRequests"] and not report["cleanup"]["errors"]
    assert all(report["cleanup"][key] for key in ("contextClosed", "browserClosed", "serverClosed"))
    assert "SYLK" in report["message"] and "desktopversie" in report["message"] and "XLSX" in report["message"]
    assert hashlib.sha256((root / "build-receipt.json").read_bytes()).hexdigest() == report["buildReceiptSha256"]
    documents = []
    for stage in ("before", "after"):
        file = root / (stage + ".docx")
        assert hashlib.sha256(file.read_bytes()).hexdigest() == report[stage + "Sha256"]
        with zipfile.ZipFile(file) as z:
            documents.append(z.read("word/document.xml"))
            assert report["marker"] in "".join(ET.fromstring(documents[-1]).itertext())
    assert documents[0] == documents[1]
    assert hashlib.sha256(documents[0]).hexdigest() == report["documentXmlSha256"]
print(json.dumps({"platforms":len(summary["platforms"]), "actualXlsxFilesIndependentlyChecked":summary["checkedFiles"], "status":"passed"}))
