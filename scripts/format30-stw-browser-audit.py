"""Independently audit downloaded STW browser evidence and retained DOCX XML."""
import argparse
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

SOURCE = "dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b"
TREE = "5a644e397ecc6af5452a49b6404edf953687d1b2"
FIXTURE = "5a5b633ee371836a48c7496fc35ae261f35025d7edb3ec74439c5f58b369f1e2"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    metadata = json.loads((args.root / "artifact-metadata.json").read_bytes())
    run = json.loads((args.root / "run.json").read_bytes())
    assert metadata["digest"] == "sha256:" + sha((args.root / "artifact.zip").read_bytes())
    assert metadata["workflow_run"]["id"] == run["id"]
    assert run["conclusion"] == "success" and run["path"] == ".github/workflows/format30-stw-browser.yml"
    files = args.root / "files"
    with zipfile.ZipFile(args.root / "artifact.zip") as archive:
        names = [e.filename for e in archive.infolist() if not e.is_dir()]
        assert len(names) == len(set(names))
        assert set(names) == {p.relative_to(files).as_posix() for p in files.rglob("*") if p.is_file()}
        for name in names:
            assert archive.read(name) == (files / name).read_bytes(), name
    fixture = (files / "original.stw").read_bytes()
    assert len(fixture) == 11186 and sha(fixture) == FIXTURE
    overall = json.loads((files / "report.json").read_bytes())
    assert overall["source"] == SOURCE and overall["tree"] == TREE and overall["status"] == "passed"
    assert overall["harnessCommit"] == run["head_sha"]
    assert len(overall["reports"]) == 2
    checked = []
    for variant, route in (("normal", "/"), ("hosted", "/office/")):
        folder = files / variant
        report = json.loads((folder / "report.json").read_bytes())
        assert report in overall["reports"]
        assert (report["source"], report["tree"], report["route"], report["platform"], report["status"]) == (SOURCE, TREE, route, "linux", "passed")
        assert report["sourceSha256"] == FIXTURE and report["sourceUnchanged"] and report["noTauri"]
        assert report["documentXmlPreserved"] and not report["errors"] and not report["externalRequests"]
        assert len(report["cases"]) == 1
        case = report["cases"][0]
        assert case["ext"] == "stw" and "STW" in case["message"] and "desktop" in case["message"].lower() and "DOCX" in case["message"]
        assert all(case[k] for k in ("tabsPreserved", "activePreserved", "messageImage"))
        for name in ("stw-visible-message.png", "retained-document.png"):
            assert (folder / name).read_bytes().startswith(b"\x89PNG\r\n\x1a\n")
        assert not report["cleanup"]["errors"]
        assert all(report["cleanup"][k] for k in ("contextClosed", "browserClosed", "serverClosed"))
        receipt = (folder / "build-receipt.json").read_bytes()
        assert sha(receipt) == report["buildReceiptSha256"]
        build = json.loads(receipt)
        assert (build["source"], build["tree"], build["route"]) == (SOURCE, TREE, route)
        assert len(build["files"]) == report["buildFiles"]
        documents = []
        for stage in ("before", "after"):
            path = folder / (stage + ".docx")
            assert sha(path.read_bytes()) == report[stage + "Sha256"]
            with zipfile.ZipFile(path) as package:
                xml = package.read("word/document.xml")
                text = "".join(ET.fromstring(xml).itertext())
                assert "STW30 BROWSER PRESERVE" in text
                assert not any("vbaproject" in name.lower() for name in package.namelist())
                documents.append(xml)
        assert documents[0] == documents[1] and sha(documents[0]) == report["documentXmlSha256"]
        checked.append({"route": route, "actualStwUpload": True, "visibleDesktopDocxAdvice": case["message"],
                        "tabsAndSelectionPreserved": True, "savedDocxXmlEqual": True, "savedFiles": 2, "cleanupConfirmed": True})
    result = {"status": "passed", "source": SOURCE, "tree": TREE, "run": run["id"], "harnessCommit": run["head_sha"],
              "artifactId": metadata["id"], "artifactDigest": metadata["digest"], "routes": checked,
              "scope": "Actual Linux Chromium browser limitation; no native app/runtime support claim"}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
