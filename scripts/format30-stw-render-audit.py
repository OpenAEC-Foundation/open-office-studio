"""Audit byte/source/font bindings for the completed browser field-layout observation."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    root = args.root
    meta = json.loads((root / "artifact-metadata.json").read_bytes())
    run = json.loads((root / "run.json").read_bytes())
    raw = (root / "artifact.zip").read_bytes()
    assert meta["id"] == 14806409519 and run["id"] == 45154167386
    assert meta["digest"] == "sha256:" + sha(raw)
    assert meta["workflow_run"]["id"] == run["id"] and run["conclusion"] == "success"
    files = root / "files"
    with zipfile.ZipFile(root / "artifact.zip") as archive:
        names = [e.filename for e in archive.infolist() if not e.is_dir()]
        assert len(names) == len(set(names))
        assert set(names) == {p.relative_to(files).as_posix() for p in files.rglob("*") if p.is_file()}
        assert all(archive.read(name) == (files / name).read_bytes() for name in names)
    report = json.loads((files / "report.json").read_bytes())
    receipt = json.loads((files / "build-receipt.json").read_bytes())
    inputs = json.loads((Path(__file__).parent.parent / "docs/tests/format30-stw/render-inputs/manifest.json").read_bytes())
    assert report["status"] == "captured-for-visual-triage" and report["harnessCommit"] == run["head_sha"]
    assert (receipt["source"], receipt["tree"], receipt["route"]) == (inputs["applicationCommit"], inputs["applicationTree"], "/")
    assert not report["errors"] and not report["externalRequests"] and not report["cleanup"]["errors"]
    assert all(report["cleanup"][k] for k in ("contextsClosed", "browserClosed", "serverClosed"))
    assert len(report["cases"]) == 3
    for case in report["cases"]:
        assert (case["sha256"], case["bytes"]) == (inputs["inputs"][case["name"]]["sha256"], inputs["inputs"][case["name"]]["bytes"])
        assert case["noEditsOrSaves"] and case["contextClosed"]
    native = json.loads((files / "windows-native-resaved/environment.json").read_bytes())
    flat = json.loads((files / "diagnostic-title-as-text/environment.json").read_bytes())
    assert sorted(json.dumps(f, sort_keys=True) for f in native["fonts"]) == sorted(json.dumps(f, sort_keys=True) for f in flat["fonts"])
    assert native["messages"] == flat["messages"]
    result = {"status": "independently-reproduced-editor-field-overlap", "applicationCommit": receipt["source"], "applicationTree": receipt["tree"],
              "route": "/", "harnessCommit": run["head_sha"], "run": run["id"], "artifact": {"id": meta["id"], "digest": meta["digest"], "bytes": len(raw)},
              "browser": "Chrome Headless Shell 151.0.7922.34, Playwright Chromium revision1234, Linux ubuntu22.04 (CI installation log)",
              "viewport": {"width": 1400, "height": 1100, "scale": 1}, "buildReceiptSha256": sha((files / "build-receipt.json").read_bytes()),
              "buildFiles": len(receipt["files"]), "inputs": report["cases"], "diagnosticSourceAudit": "render-diagnostic-audit.json",
              "fonts": {"registeredFacesEqual": True, "faces": len(native["fonts"]), "fallbackMessagesEqual": True, "messages": native["messages"]},
              "visualReview": {"method": "Agent visually inspected all three actual browser screenshots; not inferred from CI success",
                  "unmodifiedConverterControl": "Title clear",
                  "unchangedWindowsDocx": "Cached title overlaps following STW30 EDIT run; wrong line breaking",
                  "diagnosticSameStylesAndFonts": "Same visible text wraps cleanly on three title lines when only Title field becomes identical cached plain text",
                  "inference": "Field representation affects layout; identical style/font parts,42 registered faces and fallback advice exclude a font-set change in this comparison. Exact implementation cause not established."},
              "cleanup": report["cleanup"], "limits": ["Independently executed browser DOCX-render reproduction; Windows native observations belong to tester750b",
                  "Derived flat-field copy is diagnostic only; no fix or native acceptance claim", "No new converter/engine roundtrip or native Linux/macOS run; no full font matrix"]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("status", "run", "artifact")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
