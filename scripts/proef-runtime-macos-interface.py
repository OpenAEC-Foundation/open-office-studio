"""Operate packaged WKWebView with bounded native AX calls on isolated CI."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import runpy
import signal
import subprocess
import sys
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resources", type=Path)
    parser.add_argument("document", type=Path)
    parser.add_argument("report", type=Path)
    options = parser.parse_args()
    if sys.platform != "darwin" or os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("This UI probe is restricted to our isolated macOS CI host")
    app = options.resources.resolve().parent.parent
    info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
    assert app.suffix == ".app" and info["CFBundleIdentifier"] == "org.openaec.office-studio"
    program = app / "Contents/MacOS" / info["CFBundleExecutable"]
    crash = runpy.run_path(str(Path(__file__).with_name("runtime-macos-crash.py")))
    crash_before = crash["snapshot"]()
    runtime_program = app / "Contents/Helpers/LibreOffice.app/Contents/MacOS/soffice"
    processes = runpy.run_path(str(Path(__file__).with_name("proef-macos-openen.py")))["processen"]
    assert not processes(program), "Our extracted app must not already be running"
    document = options.document.resolve()
    before = hashlib.sha256(document.read_bytes()).hexdigest()
    report = {"status": "failed", "packagedApp": str(app), "originalSha256": before}
    labels = {"source": [], "saveAs": []}
    for path in Path("src/i18n/locales").glob("*/backstage.json"):
        locale = json.loads(path.read_text(encoding="utf-8"))
        labels["source"].append(locale["saveAs"]["sourceBundled"])
        shell = json.loads(path.with_name("shell.json").read_text(encoding="utf-8"))
        labels["saveAs"].append(shell["header"]["saveAs"])
    label_file = options.report.with_name("ax-labels.json")
    label_file.write_text(json.dumps(labels, ensure_ascii=False), encoding="utf-8")
    helper = options.report.with_name("runtime-ax-helper")
    subprocess.run(["xcrun", "swiftc", str(Path(__file__).with_name("runtime-macos-ax.swift")),
                    "-o", str(helper)], check=True, timeout=120)
    report["snapshots"] = []
    started = False

    def applescript(pid, body):
        script = ('tell application "System Events"\ntell (first application process whose unix id is '
                  + str(pid) + ')\n' + body + '\nend tell\nend tell')
        return subprocess.run(["osascript", "-e", script], text=True, capture_output=True, timeout=15)

    def inspect(pid, action):
        result = subprocess.run([str(helper), str(pid), str(label_file), action],
                                check=True, text=True, capture_output=True, timeout=25)
        snapshot = json.loads(result.stdout)
        report["snapshots"].append(snapshot)
        return snapshot

    try:
        started = True
        subprocess.run(["open", "-a", str(app), str(document)], check=True, timeout=20)
        deadline = time.monotonic() + 90
        pid = None
        while time.monotonic() < deadline:
            owned = processes(program)
            if len(owned) == 1:
                pid = owned[0]
                title = applescript(pid, "return (name of every window) as string")
                if title.returncode:
                    # Do not grant or bypass Accessibility permissions. The native
                    # converter/content result stays separate from this UI result.
                    report.update(status="blocked", reason="System Events could not inspect the packaged WKWebView", details=title.stderr.strip())
                    return
                if document.stem in title.stdout:
                    report["windowTitle"] = title.stdout.strip()
                    break
            time.sleep(.5)
        else:
            raise RuntimeError("The converted ODT did not appear in the packaged app window title")
        applescript(pid, 'set frontmost to true')
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            state = inspect(pid, "press")
            if state["status"] == "blocked":
                report.update(status="blocked", reason=state["reason"])
                return
            if state["pressed"]:
                break
            time.sleep(.5)
        else:
            raise RuntimeError("Converted Writer document did not enable the native Save As button")
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            state = inspect(pid, "inspect")
            if state["status"] == "blocked":
                report.update(status="blocked", reason=state["reason"])
                return
            if any(label in text for label in labels["source"] for text in state.get("texts", [])):
                report.update(status="passed", odtNativeWindow=True, saveAsShowsBundledRuntime=True,
                              interaction="enabled-save-as-native-AXPress")
                break
            time.sleep(.5)
        else:
            raise RuntimeError("Native Save As did not expose the bundled runtime source")
    except subprocess.TimeoutExpired:
        report.update(status="blocked", reason="The CI host did not answer the native Accessibility request within its limit")
    except Exception as error:
        report.update(status="failed", error=str(error))
    finally:
        report["runtimeCrashEvidence"] = crash["collect"](runtime_program, crash_before, 5)
        if report["runtimeCrashEvidence"].get("newReports"):
            report.update(status="failed", reason="A soffice crash report appeared during native UI operation")
        alert = report["runtimeCrashEvidence"].get("systemAlerts", {})
        if alert.get("status") != "read":
            report.update(status="blocked", reason="System crash-alert inspection was unavailable")
        if "soffice" in alert.get("windowTitles", "").lower():
            report.update(status="blocked", reason="A soffice system alert obstructs native visual acceptance")
        try:
            subprocess.run(["screencapture", "-x", str(options.report.with_suffix(".png"))], capture_output=True, timeout=10)
        except subprocess.TimeoutExpired:
            report["screenshot"] = "timed-out"
        if started:
            for pid in processes(program):
                os.kill(pid, signal.SIGTERM)
            deadline = time.monotonic() + 10
            while processes(program) and time.monotonic() < deadline:
                time.sleep(.25)
            for pid in processes(program):
                os.kill(pid, signal.SIGKILL)
        report["ownedAppClosed"] = not processes(program)
        report["originalUnchanged"] = hashlib.sha256(document.read_bytes()).hexdigest() == before
        if not report["ownedAppClosed"] or not report["originalUnchanged"]:
            report.update(status="failed", reason="Owned app cleanup or original-file preservation failed")
        options.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        assert report["ownedAppClosed"] and report["originalUnchanged"]
        print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
