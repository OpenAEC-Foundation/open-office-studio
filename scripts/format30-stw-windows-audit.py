"""Read-only independent audit of the existing native Windows STW execution artifact."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import zipfile

spec = importlib.util.spec_from_file_location("oracle", Path(__file__).with_name("format30-stw-oracle.py"))
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)
SOURCE = "dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b"
TREE = "5a644e397ecc6af5452a49b6404edf953687d1b2"
HARNESS = "9b5ea56223b645d558ed3f4a61959590b4561834"
MARKER = " -- STW30 EDIT 2026-11-23"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    meta = json.loads((args.root / "artifact-metadata.json").read_bytes())
    run = json.loads((args.root / "run.json").read_bytes())
    assert meta["id"] == 14807501063 and run["id"] == 45152204418
    assert run["head_sha"] == HARNESS and run["conclusion"] == "success"
    assert meta["workflow_run"]["id"] == run["id"] and meta["workflow_run"]["head_sha"] == HARNESS
    assert meta["digest"] == "sha256:" + sha((args.root / "artifact.zip").read_bytes())
    files = args.root / "files"
    with zipfile.ZipFile(args.root / "artifact.zip") as archive:
        names = [e.filename for e in archive.infolist() if not e.is_dir()]
        assert len(names) == len(set(names))
        assert set(names) == {p.relative_to(files).as_posix() for p in files.rglob("*") if p.is_file()}
        assert all(archive.read(name) == (files / name).read_bytes() for name in names)
    folder = files / ".local/windows-stw-native"
    report = json.loads((folder / "report.json").read_bytes())
    identity = json.loads((files / ".github/windows-stw-native-candidate.json").read_bytes())
    assert report["identity"] == identity
    assert report["status"] == "passed" and not report["errors"] and report["harnessCommit"] == HARNESS
    assert (identity["applicationCommit"], identity["applicationTree"], identity["version"]) == (SOURCE, TREE, "2026.48.1")
    assert (identity["runId"], identity["producerJobId"], identity["producerRunAttempt"]) == (45143305147, 137586342967, 1)
    assert identity["developmentBuild"] is True and identity["signingRequired"] is False
    assert report["fileVersion"] == "2026.48.1"
    assert report["executableSha256"] == report["payloadExecutableSha256"] == "feab08d3bc09895745c75653b2f8c806e04efa7fc36101debff8b278da599a67"
    assert report["packageSha256"] == identity["packageSha256"] == "85d5155a0322ce296eb4f57485235cdb725f4f293c7642bc562971ff924357ce"
    assert all(report["cleanup"][key] is True for key in ("ownedAppsClosed", "policyRestored", "privateInstallRemoved"))
    processes = report["processes"]
    assert len(processes) == 2 and processes[0]["pid"] != processes[1]["pid"]
    for process in processes:
        assert process["exit"]["code"] == 0 and not process.get("forcedCleanup")
        runtime = process["runtimeStatus"]
        assert runtime["bron"] == "meegeleverd" and runtime["gevonden"] and runtime["profiel"] == "veilig" and runtime["gekozen"] is None
        assert "installed\\kantoorruntime\\program\\soffice.com" in runtime["pad"]
    for path, title in (("open-stw-dialog.json", "Open file"), ("save-docx-dialog.json", "Save as")):
        dialog = json.loads((folder / path).read_bytes())
        assert dialog["pid"] == processes[0]["pid"] and dialog["title"] == title
        assert any(c["type"] == "Edit" and c["name"] == "File name:" for c in dialog["controls"])
    original = folder / "original.stw"
    expected = oracle.source_oracle(original)
    assert expected == json.loads((folder / "source-oracle.json").read_bytes())
    assert sha(original.read_bytes()) == report["fixtureSha256"]
    audit = oracle.docx_audit(folder / "STW native roundtrip.docx", expected, MARKER)
    assert audit["fileSha256"] == report["reopenedSaveAudit"]["fileSha256"]
    for file, key in (("saved-oracle.json", "savedAudit"), ("reopened-oracle.json", "reopenedAudit"), ("reopened-resaved-oracle.json", "reopenedSaveAudit")):
        stage = json.loads((folder / file).read_bytes())
        assert stage == report[key] and stage["passed"] and stage["marker"] == MARKER
        assert stage["matched"] == audit["matched"]
    for file in ("stw-opened.png", "stw-edited.png", "saved.png", "reopened.png"):
        assert (folder / file).read_bytes().startswith(b"\x89PNG\r\n\x1a\n")
    result = {"status": "passed-native-io-with-open-visual-observation", "source": SOURCE, "tree": TREE,
              "nativeRun": run["id"], "harness": HARNESS, "artifact": {"id": meta["id"], "digest": meta["digest"]},
              "identity": identity, "installedExecutableEqualsNsisPayloadSha256": report["executableSha256"],
              "processes": [{"pid": p["pid"], "normalExitCode": p["exit"]["code"], "bundledRuntime": p["runtimeStatus"]["versie"]} for p in processes],
              "nativeFileDialogOwnersVerified": True, "sourceUnchangedSha256": report["fixtureSha256"],
              "independentFinalDocxAudit": audit, "producerStageAuditsConsistent": 3, "cleanup": report["cleanup"],
              "visualObservation": {"status": "open; screenshot observation, not an independently executed new GUI reproduction",
                  "actual": "Opened title is clear; edited and reopened title field/cache visibly overlaps following inserted text",
                  "images": ["stw-opened.png", "stw-edited.png", "reopened.png"], "cause": "not established"},
              "limits": ["Unsigned ordinary P2 suite NSIS; no final signed/standalone installer claim",
                         "Final reopened/resaved DOCX independently audited; earlier save-stage bytes were overwritten, so only their recorded CI audits can be checked",
                         "Native I/O pass is distinct from unresolved title-rendering screenshot observation", "No Linux/macOS native pass inferred"]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("status", "nativeRun", "artifact", "processes", "visualObservation")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
