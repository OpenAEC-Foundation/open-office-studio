"""Bounded native macOS initial-body font/structure diagnostic on a frozen canonical DMG.

Only disposable CI after explicit integration go. AX/CGEvent operates the actual
packaged app; missing Accessibility or native canvas-table evidence stays blocked.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import runpy
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
import zipfile

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
ROWS = [["alpha", "beta", ""], ["", "", "omega"], ["delta", "", ""]]


def temporary_ax_failure(snapshot, pid, owned_pids):
    """Same bounded CannotComplete readiness rule as the existing356 driver."""
    return (snapshot.get("status") == "blocked" and snapshot.get("trusted") is True
            and set(snapshot.get("errors", {})) == {"-25204"}
            and owned_pids == [pid])


def wait_for_native_grid(snapshot, columns, seconds=15, clock=time.monotonic, pause=time.sleep):
    """Wait for actual AX readiness; absence while loading is not a capability verdict."""
    started = clock()
    deadline = started + seconds
    attempts = 0
    while True:
        state = snapshot()
        attempts += 1
        tables = state.get("tables", [])
        inspectable = (len(tables) == 1 and tables[0].get("rowEvidenceAvailable")
                       and tables[0].get("columnEvidenceAvailable"))
        if inspectable and tables[0]["rows"] == 3 and tables[0]["columns"] == columns:
            return state, {"elapsedSeconds": round(clock() - started, 3), "attempts": attempts}
        if clock() >= deadline:
            if not inspectable:
                raise PermissionError("Native AX table evidence remained unavailable after the bounded readiness wait; manual acceptance remains open")
            raise AssertionError(f"Native table remained {tables[0]}, expected 3x{columns}")
        pause(.25)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("identity", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    identity = json.loads(args.identity.read_text(encoding="utf-8"))
    if sys.platform != "darwin" or os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("OOS_361_EXECUTE") != "1" or identity.get("executionApproved") is not True:
        raise RuntimeError("Frozen, explicitly released, disposable macOS execution only")
    git = lambda *parts: subprocess.check_output(["git", *parts], text=True).strip()
    if git("rev-parse", "HEAD") != identity["sourceCommit"] or git("rev-parse", "HEAD^{tree}") != identity["sourceTree"] or git("status", "--porcelain", "--untracked-files=no"):
        raise RuntimeError("Clean exact application source required before native launch")
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=False)
    report = {"issue": 359, "status": "running", "nativePass": False, "diagnosticOnly": True, "applicationModified": False, "identity": identity,
              "harnessCommit": subprocess.check_output(["git", "-C", str(Path(__file__).resolve().parent.parent), "rev-parse", "HEAD"], text=True).strip(),
              "sessionDriverSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "checks": [], "limits": ["No product correction or native acceptance; original failed attempts remain valid", "Font/structure fixture matrix with one ordinary Maximize per fixture; no body input, activation replay, theme change or canvas readback", "The saved EPUB356 DOCX is a route/content control, not a re-execution of the EPUB importer", "Physical Mac observation unavailable; original OS captures require independent visual inspection"], "cleanup": {}}
    app = program = pid = app_container = None
    mount = out / "mount"
    mounted = started = False
    counter = 0
    last_native = {}
    driver = Path(__file__).with_name("proef-writer-361-macos.py")
    local_identity = out / "identity.json"
    fixture = out / "writer361-macos-table.docx"

    def owned():
        if program is None:
            return []
        listing = subprocess.check_output(["ps", "-axww", "-o", "pid=", "-o", "comm="], text=True)
        return [int(parts[0]) for line in listing.splitlines() if len(parts := line.strip().split(None, 1)) == 2 and Path(parts[1]).resolve() == program]

    def wait(check, label, seconds=30):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            value = check()
            if value:
                return value
            time.sleep(.25)
        raise RuntimeError(label)

    def action(kind, target=""):
        nonlocal counter, last_native
        counter += 1
        path = out / f"action-{counter:03d}.json"
        result = subprocess.run([sys.executable, str(driver), str(local_identity), str(pid), kind, str(path), "--target", target], capture_output=True, text=True, timeout=150)
        if path.exists():
            snapshot = json.loads(path.read_text(encoding="utf-8"))["native"]
            last_native = snapshot
            if snapshot.get("status") == "blocked":
                raise PermissionError(snapshot.get("reason", "Native AX blocked"))
        else:
            raise RuntimeError("Native action produced no evidence: " + result.stderr[-1500:])
        if result.returncode:
            raise RuntimeError("Native action failed: " + result.stderr[-1500:])
        return snapshot

    def readiness_snapshot():
        deadline = time.monotonic() + 15
        while True:
            try:
                return action("snapshot")
            except PermissionError:
                if not temporary_ax_failure(last_native, pid, owned()) or time.monotonic() >= deadline:
                    raise
                report["transientAXRetries"] = report.get("transientAXRetries", 0) + 1
                time.sleep(.5)

    def grid(label, columns, readiness=False):
        state, timing = wait_for_native_grid(readiness_snapshot if readiness else lambda: action("snapshot"), columns, 90 if readiness else 15)
        report["checks"].append({"name": label, "native": state, "readiness": timing})

    def collect_additional():
        # Independent QA must survive a later unavailable canvas-cell mouse target.
        if "optionalMac362363" not in report:
            collector = runpy.run_path(str(Path(__file__).with_name("writer361-macos-ribbon-observation.py")))["collect_mac_ribbon_observations"]
            report["optionalMac362363"] = collector(action, out / "ribbon-observations", identity, pid)
            report["optionalMac362363"]["phase"] = "before-core-cell-target" if not report.get("coreUndoRedoPersistRestartPassed") else "after-core"

    def launch():
        nonlocal pid, started
        if owned():
            raise RuntimeError("Pinned test app already runs; refusing another owner")
        started = True
        subprocess.run(["open", "-a", str(app), str(fixture)], check=True, timeout=20)
        pid = wait(lambda: owned()[0] if len(owned()) == 1 else None, "Exactly one owned native process did not appear", 90)

    def quit_app():
        action("chord", "cmd-q")
        wait(lambda: not owned(), "Native CmdQ did not fully quit the owned process", 15)

    try:
        helper_source = Path(__file__).with_name("writer-361-macos-ax.swift")
        helper_sha = hashlib.sha256(helper_source.read_bytes()).hexdigest()
        helper = out / ("writer361-ax-" + helper_sha[:12])
        with (out / "swift-compile.log").open("wb") as log:
            subprocess.run(["xcrun", "swiftc", str(helper_source), "-o", str(helper)], stdout=log, stderr=subprocess.STDOUT, check=True, timeout=120)
        report["newSwiftHelperCompiledBeforeAppLaunch"] = True
        report["helperSourceSha256"] = helper_sha
        report["helperBinarySha256"] = hashlib.sha256(helper.read_bytes()).hexdigest()
        package = Path(identity["packagePath"]).resolve(strict=True)
        if hashlib.sha256(package.read_bytes()).hexdigest() != identity["packageSha256"]:
            raise RuntimeError("Canonical DMG SHA256 differs")
        mount.mkdir()
        subprocess.run(["hdiutil", "attach", "-readonly", "-nobrowse", "-mountpoint", str(mount), str(package)], check=True, timeout=60, capture_output=True)
        mounted = True
        apps = list(mount.glob("*.app"))
        if len(apps) != 1:
            raise RuntimeError("Canonical DMG must expose one application")
        payload_info = plistlib.loads((apps[0] / "Contents/Info.plist").read_bytes())
        payload_program = apps[0] / "Contents/MacOS" / payload_info["CFBundleExecutable"]
        payload_sha = hashlib.sha256(payload_program.read_bytes()).hexdigest()
        if identity.get("executableSha256") is not None:
            if payload_sha != identity["executableSha256"]:
                raise RuntimeError("Read-only canonical DMG program differs from pinned executable hash")
        elif identity.get("deriveExecutableFromVerifiedDmg") is True:
            identity["executableSha256"] = payload_sha
            report["executableHashOrigin"] = "Computed from read-only verified canonical DMG payload before launch, copied program must match"
        else:
            raise RuntimeError("No approved executable identity derivation")
        # Keep the owned package outside the proof directory; never upload a duplicate app.
        app_container = Path(tempfile.mkdtemp(prefix="writer361-owned-app-", dir=os.environ.get("RUNNER_TEMP")))
        report["ownedAppContainer"] = str(app_container)
        app = app_container / apps[0].name
        shutil.copytree(apps[0], app, symlinks=True)
        subprocess.run(["hdiutil", "detach", str(mount)], check=True, timeout=30, capture_output=True)
        mounted = False
        info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
        if info.get("CFBundleIdentifier") != "org.openaec.office-studio":
            raise RuntimeError("Unexpected native bundle identity")
        program = (app / "Contents/MacOS" / info["CFBundleExecutable"]).resolve(strict=True)
        if hashlib.sha256(program.read_bytes()).hexdigest() != identity["executableSha256"]:
            raise RuntimeError("Canonical native executable SHA256 differs")
        identity["executablePath"] = str(program)
        local_identity.write_text(json.dumps(identity), encoding="utf-8")
        preferences = Path.home() / "Library/Application Support/org.openaec.office-studio/voorkeuren.json"
        if preferences.exists():
            raise PermissionError("Runner app profile already exists; refusing to overwrite another owner's preferences")
        preferences.parent.mkdir(parents=True, exist_ok=True)
        preferences.write_text(json.dumps({"taal": "en", "updates": {"automatisch": False}}), encoding="utf-8")
        report["ownedRunnerProfileCreated"] = True
        with zipfile.ZipFile("public/templates/nieuw.docx") as template:
            parts = {name: template.read(name) for name in template.namelist()}
        xml = parts["word/document.xml"].decode("utf-8")
        cell = lambda text: '<w:tc><w:tcPr><w:tcW w:w="2880" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>' + text + '</w:t></w:r></w:p></w:tc>'
        table = '<w:tbl><w:tblPr><w:tblW w:w="8640" w:type="dxa"/></w:tblPr><w:tblGrid>' + '<w:gridCol w:w="2880"/>'*3 + '</w:tblGrid>' + ''.join('<w:tr>'+''.join(cell(text) for text in row)+'</w:tr>' for row in ROWS) + '</w:tbl><w:p/>'
        next_xml = re.sub(r'(<w:body>)[\s\S]*?(<w:sectPr)', lambda match: match[1]+table+match[2], xml, count=1)
        if next_xml == xml:
            raise RuntimeError("Known synthetic fixture replacement failed")
        parts["word/document.xml"] = next_xml.encode("utf-8")
        with zipfile.ZipFile(fixture, "w", zipfile.ZIP_DEFLATED) as output:
            for name, value in parts.items():
                output.writestr(name, value)
        observation = runpy.run_path(str(Path(__file__).with_name("writer361-macos-ribbon-observation.py")))
        viewport = runpy.run_path(str(Path(__file__).with_name("writer361-macos-viewport.py")))
        control = Path(__file__).parent / "proeven/mac-body-positive-356.docx"
        if hashlib.sha256(control.read_bytes()).hexdigest() != "c28b963a6094108cdf6cc412bca58302e731a7810ee81772831a0c621748e52d":
            raise RuntimeError("Positive control differs from the independently checked356 saved DOCX")
        table_fixture = fixture
        report["fixtures"] = []
        variants = [("table-inherited-font", table_fixture)]
        direct_font = '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/></w:rPr>'
        paragraph = '<w:p><w:r><w:t>alpha beta omega delta</w:t></w:r></w:p>'
        for variant_name, body_xml in [("table-direct-calibri", table.replace("<w:r>", "<w:r>"+direct_font)), ("paragraph-inherited-font", paragraph), ("paragraph-direct-calibri", paragraph.replace("<w:r>", "<w:r>"+direct_font))]:
            variant_parts = dict(parts)
            variant_parts["word/document.xml"] = re.sub(r'(<w:body>)[\s\S]*?(<w:sectPr)', lambda match: match[1]+body_xml+match[2], xml, count=1).encode("utf-8")
            variant_path = out / (variant_name + ".docx")
            with zipfile.ZipFile(variant_path,"w",zipfile.ZIP_DEFLATED) as bundle:
                for name,value in variant_parts.items(): bundle.writestr(name,value)
            variants.append((variant_name,variant_path))
        variants.append(("saved-epub356-control",control))
        matched_parts = dict(parts)
        styles_xml = matched_parts["word/styles.xml"].decode("utf-8")
        explicit_cambria = '<w:rFonts w:ascii="Cambria" w:hAnsi="Cambria" w:eastAsia="Cambria" w:cs="Cambria"/>'
        matched_styles, replacements = re.subn(r'(<w:docDefaults>[\s\S]*?)<w:rFonts\b[^>]*/>', lambda match: match[1]+explicit_cambria, styles_xml, count=1)
        if replacements != 1 or matched_styles == styles_xml:
            raise RuntimeError("Matched document-default Cambria replacement failed")
        matched_parts["word/styles.xml"] = matched_styles.encode("utf-8")
        matched_path = out / "table-defaults-direct-cambria.docx"
        with zipfile.ZipFile(matched_path,"w",zipfile.ZIP_DEFLATED) as bundle:
            for name,value in matched_parts.items(): bundle.writestr(name,value)
        variants = [("table-defaults-direct-cambria",matched_path)]
        report["experiment"] = "Only original361 table document-default rFonts changes from theme Cambria to explicit Cambria; same family/content/structure, no acceptance pass"
        report["controlRuns"] = [44750058759,44750921161]
        report["fixtureChangeScope"] = "Only word/styles.xml docDefaults/rPrDefault/rPr/rFonts; document.xml and every other uncompressed package part unchanged"
        for fixture_name, fixture_path in variants:
            fixture = fixture_path.resolve()
            fixture_hash = hashlib.sha256(fixture.read_bytes()).hexdigest()
            record = {"name": fixture_name, "sha256": fixture_hash, "phases": [], "nativePass": False}
            report["fixtures"].append(record)
            launch()
            record["pid"] = pid
            wait(lambda: fixture.name in readiness_snapshot().get("window",{}).get("title",""), "Owned native document title did not become ready", 90)
            if fixture_name.startswith("table-"):
                grid("native table loaded before diagnostic activation", 3, readiness=True)
            else:
                # Word-count/Save readiness is observed in raw AX; no edit is used.
                time.sleep(5)
            fixture_out = out / fixture_name
            fixture_out.mkdir()
            def capture_phase(phase):
                state = action("raw-snapshot")
                path = fixture_out / (phase + "-raw-ax.json")
                path.write_text(json.dumps(state, indent=2), encoding="utf-8")
                capture = observation["capture_original"](state, pid, fixture_out / (phase + ".png"))
                record["phases"].append({"name": phase, "timestamp": time.time(), "applicationActive": state.get("applicationActive"), "frontmostPid": state.get("frontmostPid"), "capture": capture, "tables": state.get("tables"), "rawSha256": hashlib.sha256(path.read_bytes()).hexdigest()})
                return state
            capture_phase("initial-ready")
            record["maximize"] = viewport["maximize_once"](action, fixture_out / "maximize", identity, pid)
            capture_phase("after-maximize")
            record["originalUnchanged"] = hashlib.sha256(fixture.read_bytes()).hexdigest() == fixture_hash
            if not record["originalUnchanged"]:
                raise AssertionError("Diagnostic changed the fixture bytes")
            quit_app()
            record["ownedProcessExitedNormally"] = not owned()
        report["status"] = "diagnostic-observed"
    except PermissionError as error:
        report.update(status="blocked", reason=str(error))
        raise
    except Exception as error:
        report.update(status="failed", error=str(error))
        raise
    finally:
        if mounted:
            try:
                result = subprocess.run(["hdiutil", "detach", str(mount)], timeout=30, capture_output=True)
                report["cleanup"]["mountDetached"] = result.returncode == 0
            except subprocess.TimeoutExpired:
                report["cleanup"]["mountDetached"] = False
        if started:
            for own_pid in owned():
                try:
                    os.kill(own_pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                report["cleanup"]["forcedTerminationRequired"] = True
            end = time.monotonic() + 10
            while owned() and time.monotonic() < end:
                time.sleep(.25)
        report["cleanup"]["ownedAppClosed"] = not owned()
        if app_container is not None and report["cleanup"]["ownedAppClosed"]:
            try:
                shutil.rmtree(app_container)
                report["cleanup"]["ownedAppContainerRemoved"] = not app_container.exists()
            except OSError as error:
                report["cleanup"]["ownedAppContainerRemoved"] = False
                report["cleanup"]["ownedAppContainerError"] = str(error)
        if not report["cleanup"]["ownedAppClosed"] or report["cleanup"].get("ownedAppContainerRemoved") is False:
            report["status"] = "cleanup-failed"
        (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        if not report["cleanup"]["ownedAppClosed"] or report["cleanup"].get("mountDetached") is False or report["cleanup"].get("ownedAppContainerRemoved") is False:
            raise RuntimeError("Owned native app/mount cleanup failed; see receipt")


if __name__ == "__main__":
    main()
