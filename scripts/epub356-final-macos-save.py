"""Complete only the owned native NSSavePanel after the app's custom Save."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time


class CapabilityBlocked(RuntimeError):
    """Observed native accessibility/panel capability is unavailable."""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--save", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if sys.platform != "darwin" or os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("Native saving is restricted to the isolated macOS CI runner")
    target, report_path = args.save.resolve(), args.report.resolve()
    assert target.is_relative_to(report_path.parent) and target.suffix == ".docx"
    assert args.pid > 0 and not target.exists()
    target.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report = {"status": "failed", "ownedPid": args.pid, "target": str(target), "snapshots": [], "nativeSaveInvoked": False}
    helper = report_path.with_name("epub356-save-ax-helper")

    def alive():
        os.kill(args.pid, 0)

    def snapshot(action):
        alive()
        result = subprocess.run([str(helper), str(args.pid), target.name, action, str(target.parent)],
                                check=True, capture_output=True, text=True, timeout=12)
        state = json.loads(result.stdout)
        report["snapshots"].append(state)
        return state

    def capture(name):
        try:
            result = subprocess.run(["screencapture", "-x", str(report_path.with_name(name))], capture_output=True, text=True, timeout=10)
            if result.returncode:
                report.setdefault("captureErrors", []).append(result.stderr.strip())
        except Exception as error:
            report.setdefault("captureErrors", []).append(str(error))

    def wait_ready():
        end = time.monotonic() + 35
        while time.monotonic() < end:
            state = snapshot("inspect")
            if state.get("status") == "ready":
                return state
            if state.get("trusted") is not True:
                raise CapabilityBlocked("Native Save panel Accessibility is unavailable")
            time.sleep(.3)
        raise CapabilityBlocked("Native Save panel could not be uniquely attributed to the owned app")

    try:
        if not helper.exists():
            # A workflow may precompile the same helper here before starting
            # the app. No capture/AX permission is requested during compilation.
            source = Path(__file__).with_name("epub356-final-macos-save-ax.swift")
            subprocess.run(["xcrun", "swiftc", str(source), "-o", str(helper)], check=True, capture_output=True, text=True, timeout=120)
        alive()
        report["processCommand"] = subprocess.check_output(["ps", "-p", str(args.pid), "-o", "comm="], text=True, timeout=10).strip()
        wait_ready()
        capture("native-os-save-before-folder.png")
        # Normal native keyboard action opens Go to Folder, scoped to the app
        # whose NSSavePanel/filename has just been identified outside WKWebView.
        script = ('tell application "System Events"\ntell (first application process whose unix id is '
                  + str(args.pid) + ')\nset frontmost to true\nkeystroke "g" using {command down, shift down}\nend tell\nend tell')
        subprocess.run(["osascript", "-e", script], check=True, capture_output=True, text=True, timeout=15)
        end = time.monotonic() + 15
        while time.monotonic() < end:
            state = snapshot("go")
            if state.get("status") == "acted":
                break
            time.sleep(.3)
        else:
            raise CapabilityBlocked("Native Go-to-Folder path field/button is unavailable")
        wait_ready()
        capture("native-os-save-target-folder.png")
        state = snapshot("save")
        if state.get("status") != "acted":
            raise CapabilityBlocked("Native Save button did not accept the owned dialog")
        report["nativeSaveInvoked"] = True
        end = time.monotonic() + 30
        previous, stable = None, 0
        while time.monotonic() < end:
            alive()
            info = target.stat() if target.exists() else None
            signature = (info.st_size, info.st_mtime_ns) if info and info.st_size else None
            stable = stable + 1 if signature and signature == previous else 0
            if stable >= 3:
                report.update(status="saved-awaiting-independent-content-oracle", savedBytes=info.st_size)
                break
            previous = signature
            time.sleep(.25)
        else:
            raise RuntimeError("Native Save did not produce the requested stable filesystem DOCX")
    except Exception as error:
        report["status"] = "blocked" if isinstance(error, CapabilityBlocked) else "failed"
        report["reason"] = str(error)
        if isinstance(error, subprocess.CalledProcessError):
            report["commandDetails"] = {"stdout": str(error.stdout or "")[-8000:], "stderr": str(error.stderr or "")[-8000:]}
        capture("native-os-save-blocked.png")
    finally:
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": report["status"], "report": str(report_path)}))
    return 0 if report["status"] == "saved-awaiting-independent-content-oracle" else 2


if __name__ == "__main__":
    sys.exit(main())
