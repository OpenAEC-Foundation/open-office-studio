"""Bounded unchanged-G macOS capture comparison. Collect evidence, never infer visual pass."""
import hashlib
import json
import os
from pathlib import Path
import plistlib
import runpy
import signal
import subprocess
import sys
import tempfile
import time


def run(args, **kwargs):
    return subprocess.run(args, check=True, text=True, capture_output=True, timeout=30, **kwargs)


def main():
    assert sys.platform == "darwin" and os.environ.get("GITHUB_ACTIONS") == "true"
    output = Path(".local/writer359").resolve()
    output.mkdir(parents=True, exist_ok=True)
    packages = list(Path(".local/installers").rglob("*.dmg"))
    assert len(packages) == 1
    package = packages[0]
    digest = hashlib.sha256(package.read_bytes()).hexdigest()
    assert digest == "af83cdd95ff21fafa4c1757cc9cd2a0abb47afb794dd53c6e1014c9b15ee612b"
    documents = list(Path(".local/previous").glob("*/native/Ontwerpnotitie.odt"))
    assert len(documents) == 1
    document = documents[0].resolve()
    before = hashlib.sha256(document.read_bytes()).hexdigest()
    report = {"status": "collecting", "applicationCommit": "9e0ad565402815082e8edf11a4c23943455fb6ce",
              "driverCommit": os.environ["GITHUB_SHA"], "packageSha256": digest,
              "documentSha256": before, "host": run(["sw_vers"]).stdout,
              "phases": [], "visualAcceptance": "pending independent image review",
              "physicalMacObservation": "unavailable", "fontReadyTiming": "not observable outside WKWebView"}
    process_list = runpy.run_path("scripts/proef-macos-openen.py")["processen"]
    labels = output / "labels.json"
    labels.write_text(json.dumps({"source": [], "saveAs": ["Save as", "Opslaan als"]}), encoding="utf-8")
    ax = output / "ax-helper"
    capture = output / "capture-helper"
    subprocess.run(["xcrun", "swiftc", "scripts/runtime-macos-ax.swift", "-o", str(ax)], check=True, timeout=120)
    subprocess.run(["xcrun", "swiftc", "-parse-as-library", "scripts/writer359-window-capture.swift", "-o", str(capture)], check=True, timeout=120)

    def script(pid, body):
        result = run(["osascript", "-e", f'tell application "System Events"\ntell (first application process whose unix id is {pid})\n{body}\nend tell\nend tell'])
        return result.stdout.strip()

    with tempfile.TemporaryDirectory(prefix="oos359-") as temporary:
        payload = output / "package.json"
        subprocess.run([sys.executable, "scripts/pak-runtimeproef-uit.py", str(package), str(Path(temporary) / "payload"), str(payload)], check=True, timeout=150)
        resources = Path(json.loads(payload.read_text())["resources"])
        app = resources.parent.parent
        info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
        program = app / "Contents/MacOS" / info["CFBundleExecutable"]
        assert not process_list(program)
        previous_pid = None

        def close():
            for pid in process_list(program):
                os.kill(pid, signal.SIGTERM)
            deadline = time.monotonic() + 8
            while process_list(program) and time.monotonic() < deadline:
                time.sleep(.2)
            for pid in process_list(program):
                os.kill(pid, signal.SIGKILL)
            assert not process_list(program)

        try:
            for name in ["initial", "fresh-process-reopen"]:
                phase = {"name": name, "captures": []}
                report["phases"].append(phase)
                start = time.monotonic()
                run(["open", "-a", str(app), str(document)])
                deadline = start + 90
                while time.monotonic() < deadline:
                    pids = process_list(program)
                    if len(pids) == 1:
                        pid = pids[0]
                        state = json.loads(run([str(ax), str(pid), str(labels), "inspect"]).stdout)
                        if document.stem in state.get("windowTitle", ""):
                            break
                    time.sleep(.5)
                else:
                    raise RuntimeError("Owned document window did not become inspectable")
                assert pid != previous_pid
                previous_pid = pid
                phase["pid"] = pid
                phase["windowFit"] = script(pid, 'set frontmost to true\nset position of front window to {12, 30}\nset size of front window to {1000, 668}\nreturn {position of front window, size of front window}')
                while time.monotonic() < deadline:
                    state = json.loads(run([str(ax), str(pid), str(labels), "inspect"]).stdout)
                    if any(b.get("enabled") and b.get("title") in ["Save as", "Opslaan als"] for b in state.get("buttons", [])):
                        break
                    time.sleep(.5)
                else:
                    raise RuntimeError("Save As readiness deadline")
                phase["readyAtSeconds"] = time.monotonic() - start
                phase["readyState"] = state

                def snapshot(label):
                    prefix = output / f"{name}-{label}"
                    item = {"label": label, "atSeconds": time.monotonic() - start}
                    phase["captures"].append(item)
                    run(["screencapture", "-x", str(prefix) + "-display.png"])
                    try:
                        item["windowCapture"] = json.loads(run([str(capture), str(pid), str(prefix) + "-window.png"]).stdout)
                    except subprocess.CalledProcessError as error:
                        item["windowCaptureBlocked"] = error.stderr
                    item["files"] = [{"name": p.name, "bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in output.glob(prefix.name + "-*.png")]

                snapshot("ready")
                time.sleep(8)
                snapshot("wait8")
                phase["ordinaryResize"] = script(pid, 'set size of front window to {980, 650}\nreturn {position of front window, size of front window}')
                time.sleep(1)
                snapshot("resize")
                close()
                phase["ownedAppClosed"] = True
                phase["originalUnchanged"] = hashlib.sha256(document.read_bytes()).hexdigest() == before
                assert phase["originalUnchanged"]
            report["status"] = "collected-not-visual-pass"
        finally:
            close()
            report["ownedAppClosed"] = not process_list(program)
            report["originalUnchanged"] = hashlib.sha256(document.read_bytes()).hexdigest() == before
            (output / "result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            assert report["ownedAppClosed"] and report["originalUnchanged"]


if __name__ == "__main__":
    main()
