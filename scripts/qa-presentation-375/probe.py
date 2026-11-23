"""Isolated Linux-only UNO counterfactual; never a shipped repair or format pass."""
import base64
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import uuid
import zipfile

EVIDENCE = "e280e9521cfad3b2c61c26d19fbb5df8b5b74a42"
ZIP_SHA = "e5e3ae456b1c30eb01215797dcc465ba0f3913fb9c2b7794fe965ee814e38839"
SOURCE_SHA = "7d204f66f3e15a76176145f917089b204f1160ff819a898aa0dd61e977c39c7d"
PROFILE_SHA = "847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40"


def sha(path):
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def unchanged_payload(private):
    manifest = Path(".local/presentation-375-runtime-input/artifact/entry-manifest.json")
    assert sha(manifest) == "79204b36527a7fed0f073b5290df26a86c6a610ba4f78ddf36883507b28da029"
    expected = json.loads(manifest.read_text())
    paths = [private / "payload"] + sorted((private / "payload").rglob("*"))
    actual_names = {p.relative_to(private).as_posix() for p in paths}
    expected_names = {e["path"] for e in expected}
    changed = []
    for entry in expected:
        path = private / entry["path"]
        if entry["path"] not in actual_names:
            continue
        actual = {"mode": f"{stat.S_IMODE(path.lstat().st_mode):04o}"}
        if entry["type"] == "file":
            actual.update(type="symlink" if path.is_symlink() else "file", bytes=path.stat().st_size, sha256=sha(path))
        elif entry["type"] == "symlink":
            actual.update(type="symlink" if path.is_symlink() else "file", linkTarget=os.readlink(path) if path.is_symlink() else None,
                          resolvedPath=path.resolve().relative_to(private).as_posix())
        else:
            actual.update(type="directory" if path.is_dir() and not path.is_symlink() else "other")
        difference = {k: {"expected": entry.get(k), "actual": v} for k, v in actual.items() if entry.get(k) != v}
        if difference:
            changed.append({"path": entry["path"], "differences": difference})
    added, missing = sorted(actual_names - expected_names), sorted(expected_names - actual_names)
    return {"entries": len(expected), "allFilesModesAndLinksUnchanged": not (added or missing or changed),
            "addedPaths": added, "missingPaths": missing, "changedEntries": changed}


def main():
    assert sys.platform.startswith("linux"), "Only the explicitly assigned Linux CI runtime"
    out = Path(".local/presentation-375-runtime").resolve()
    preflight = json.loads((out / "uno-component-preflight.json").read_text())
    assert preflight["componentPreflightReady"]
    binding = preflight["binding"]
    private = Path(binding["privateRoot"])
    program = Path(binding["program"])
    assert program.resolve().is_relative_to(private) and sha(program) == binding["programSha256"]
    profile_source = Path("src-tauri/src/conversieprofiel.xcu")
    assert sha(profile_source) == PROFILE_SHA
    payload = subprocess.check_output(["git", "show", EVIDENCE + ":docs/tests/uop-2026-11-23/retained/uop-runtime-result.zip"])
    assert hashlib.sha256(payload).hexdigest() == ZIP_SHA
    with zipfile.ZipFile(io.BytesIO(payload)) as z:
        source = z.read("source.uop")
    assert hashlib.sha256(source).hexdigest() == SOURCE_SHA
    source_path = out / "source.uop"
    source_path.write_bytes(source)
    evidence = out / "independent-oracle"
    evidence.mkdir()
    oracle_bindings = []
    for name in ("oracle.py", "fixture.json"):
        data = subprocess.check_output(["git", "show", EVIDENCE + ":scripts/qa-uop/" + name])
        (evidence / name).write_bytes(data)
        oracle_bindings.append({"commit": EVIDENCE, "path": "scripts/qa-uop/" + name,
                                "sha256": hashlib.sha256(data).hexdigest()})
    oracle_code = runpy.run_path(str(evidence / "oracle.py"))
    oracle = oracle_code["parse_source"](source_path)
    write(out / "source-oracle.json", oracle)
    rows = []
    for index, shape in enumerate(oracle["slides"][2]["shapes"]):
        if shape["id"] in ("gr4_0", "gr5_0"):
            assert shape["kind"] == "Rectangle" and len(shape["texts"]) == 1
            coords = [shape["rectEMU"][key] for key in ("x", "y", "width", "height")]
            assert all(n % 360 == 0 for n in coords)
            rows.append("\t".join([shape["id"], str(index), shape["texts"][0], shape["fill"][1:],
                                    *[str(n // 360) for n in coords], SOURCE_SHA]))
    assert len(rows) == 2
    expectations = out / "expectations.tsv"
    expectations.write_text("\n".join(rows) + "\n")
    runtime = program.parent.parent
    jars = [runtime / j["path"] for j in preflight["jars"] if j["requiredClasses"]]
    assert jars and all(sha(runtime / j["path"]) == j["sha256"] for j in preflight["jars"] if j["requiredClasses"])
    classes = out / "client-classes"
    classes.mkdir()
    cp = os.pathsep.join(map(str, jars))
    env = dict(os.environ)
    for name in tuple(env):
        if name in ("GH_TOKEN", "GITHUB_TOKEN", "OPENAEC_CONVERSIE_PROGRAMMA", "OPENAEC_CONVERSIE_PROFIEL") or name.startswith("ACTIONS_"):
            env.pop(name, None)
    env.update(SAL_DISABLE_DEFAULTPRINTER="1", SAL_DISABLE_PRINTERLIST="1", SAL_USE_VCLPLUGIN="svp",
               LD_LIBRARY_PATH=str(program.parent), HOME=str(out / "owned-home"))
    Path(env["HOME"]).mkdir()
    report = {"issue": 375, "binding": binding, "sourceSha256": SOURCE_SHA, "profileSha256": PROFILE_SHA,
              "oracleCode": oracle_bindings, "sourceAcceptancePassed": False, "productFix": False,
              "listenerTransport": "random own local named pipe; no TCP/network listener",
              "extraComponentsInstalled": False}
    process = None
    error = None
    try:
        subprocess.run([preflight["jdk"]["javac"]["path"], "-cp", cp, "-d", str(classes),
                        "scripts/qa-presentation-375/FillProbe.java"], env=env, check=True, timeout=45)
        with tempfile.TemporaryDirectory(prefix="presentation-375-uno-") as temp:
            profile = Path(temp) / "profile"
            (profile / "user").mkdir(parents=True)
            shutil.copyfile(profile_source, profile / "user/registrymodifications.xcu")
            pipe = "p375_" + uuid.uuid4().hex
            argv = [str(program), "-env:UserInstallation=" + profile.as_uri(), "--headless", "--nologo",
                    "--nodefault", "--norestore", "--nolockcheck", "--nofirststartwizard",
                    "--accept=pipe,name=" + pipe + ";urp;StarOffice.ServiceManager"]
            report.update(ownedPipe=pipe, argv=argv, profile=str(profile))
            with (out / "office.log").open("wb") as log:
                process = subprocess.Popen(argv, env=env, stdin=subprocess.DEVNULL, stdout=log,
                                           stderr=subprocess.STDOUT, start_new_session=True)
                report["ownedProcessGroup"] = process.pid
                command = [preflight["jdk"]["java"]["path"], "-Djava.library.path=" + str(program.parent),
                           "-cp", str(classes) + os.pathsep + cp, "FillProbe", pipe,
                           str(source_path), str(expectations), str(out)]
                report["clientArgv"] = command
                with (out / "client.log").open("wb") as client_log:
                    result = subprocess.run(command, env=env, stdin=subprocess.DEVNULL, stdout=client_log,
                                            stderr=subprocess.STDOUT, timeout=90)
                report["clientExitCode"] = result.returncode
                assert result.returncode == 0, "UNO client failed; inspect properties.tsv/client.log"
                process.wait(timeout=15)
                assert process.returncode == 0
            report["ownedProfileRemoved"] = True
        report["ownedProfileRemoved"] = not profile.exists()
        lines = (out / "properties.tsv").read_text().splitlines()
        snapshots = {}
        for line in lines:
            phase, *values = line.split("\t")
            assert len(values) == 11
            values[3] = base64.b64decode(values[3]).decode("utf-8")
            snapshots.setdefault(phase, []).append(values)
        assert len(snapshots["control-before"]) == 8
        assert snapshots["control-before"] == snapshots["diagnostic-before"]
        normalized = copy.deepcopy(snapshots["diagnostic-after"])
        before = snapshots["diagnostic-before"]
        for i, row in enumerate(normalized):
            if row[:2] in (["2", "1"], ["2", "2"]):
                assert before[i][-2:] == ["4", "4"] and row[-1] == "-1"
                row[-2:] = before[i][-2:]
        assert normalized == before, "Something besides the two complex-color values changed"
        write(out / "live-property-snapshots.json", snapshots)
        controls = oracle_code["verify_pptx"](oracle, out / "control.pptx", False)
        diagnostic = oracle_code["verify_pptx"](oracle, out / "cleared-complex-color.pptx", False)
        write(out / "control-independent.json", controls)
        write(out / "diagnostic-independent.json", diagnostic)
        expected_control = copy.deepcopy(controls["observed"])
        for index in (1, 2):
            expected = oracle["slides"][2]["shapes"][index]["fill"]
            assert diagnostic["observed"]["slides"][2]["shapes"][index]["fill"] == expected
            expected_control["slides"][2]["shapes"][index]["fill"] = expected
        assert expected_control == diagnostic["observed"], "Unrelated observed document content changed"
        report.update(counterfactualProven=True, onlyTwoComplexColorsChanged=True,
                      scopedRectangleFillsPreserved=True, otherObservedContentUnchanged=True,
                      diagnosticStrictSourceFailures=diagnostic["failures"],
                      limits=["Diagnostic counterfactual only; no shipped import correction",
                              "Existing canvas/stroke gaps remain outside #375",
                              "No native/UI/visual/Windows/macOS acceptance or engine edit/save/reopen yet"])
    except Exception as exc:
        error = exc
        report.update(counterfactualProven=False, error=repr(exc))
    finally:
        if process is not None:
            # Only the new session created by this script, never a shared Office process.
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=10)
            remaining = []
            for pidpath in Path("/proc").iterdir():
                if pidpath.name.isdecimal():
                    try:
                        # comm may contain spaces; fields following the closing parenthesis start at state.
                        fields = (pidpath / "stat").read_text().rsplit(")", 1)[1].split()
                        if int(fields[2]) == process.pid: remaining.append(int(pidpath.name))
                    except (FileNotFoundError, ProcessLookupError):
                        pass
            report["remainingOwnedProcessGroupMembers"] = remaining
            assert not remaining, "Owned diagnostic process cleanup incomplete"
        report["sourceUnchanged"] = source_path.read_bytes() == source
        report["runtimeAfterProbe"] = unchanged_payload(private)
        write(out / "uno-diagnosis.json", report)
    assert report["runtimeAfterProbe"]["allFilesModesAndLinksUnchanged"], "Runtime changed; exact paths retained in diagnosis"
    if error:
        raise error
    print(json.dumps({k: report[k] for k in ("counterfactualProven", "scopedRectangleFillsPreserved", "sourceAcceptancePassed")}))


if __name__ == "__main__":
    main()
