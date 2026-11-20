"""Operate only an owned X11 native Save dialog in our disposable CI session."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import time


def run(*args, required=True):
    return subprocess.run(args, check=required, capture_output=True, text=True, timeout=10)


def operate(a):
    assert not a.save.exists()
    deadline = time.monotonic() + 35
    window = None
    titles = {"Save as", "Save As", "Opslaan als", "Save a copy", "Kopie opslaan"}
    while time.monotonic() < deadline:
        assert Path(f"/proc/{a.pid}").exists(), "Owned app exited before native Save"
        result = run("xdotool", "search", "--onlyvisible", "--pid", str(a.pid), required=False)
        candidates = []
        for candidate in result.stdout.split():
            title = run("xdotool", "getwindowname", candidate).stdout.strip()
            if title in titles:
                candidates.append(candidate)
        assert len(candidates) <= 1, "Ambiguous owned file chooser"
        if candidates:
            window = candidates[0]
            break
        time.sleep(.25)
    assert window, "BLOCKED: no native Save dialog tied to the owned app PID; portal attribution must be reviewed"
    run("import", "-window", "root", str(a.report.with_suffix(".png")))
    assert int(run("xdotool", "getwindowpid", window).stdout.strip()) == a.pid
    run("xdotool", "windowfocus", "--sync", window)
    run("xdotool", "key", "--clearmodifiers", "ctrl+l")
    run("xdotool", "type", "--clearmodifiers", "--delay", "0", str(a.save.resolve()))
    run("xdotool", "key", "--clearmodifiers", "Return")
    time.sleep(.7)
    if not a.save.exists():
        assert run("xdotool", "getwindowfocus").stdout.strip() == window
        run("xdotool", "key", "--clearmodifiers", "alt+s")
    a.report.write_text(json.dumps({"ownedPid": a.pid, "windowId": window, "nativeSaveInvoked": True, "target": str(a.save)}, indent=2))


def inventory():
    result = []
    found = run("xdotool", "search", "--onlyvisible", "--name", ".*", required=False)
    for window in found.stdout.split()[:50]:
        result.append({"windowId": window, "pid": run("xdotool", "getwindowpid", window, required=False).stdout.strip(),
                       "title": run("xdotool", "getwindowname", window, required=False).stdout.strip(),
                       "properties": run("xprop", "-id", window, "WM_CLASS", "WM_TRANSIENT_FOR", required=False).stdout.strip()})
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--pid", type=int, required=True)
    p.add_argument("--save", type=Path, required=True)
    p.add_argument("--report", type=Path, required=True)
    a = p.parse_args()
    assert os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("DISPLAY"), "Isolated CI display required"
    try:
        operate(a)
    except Exception as error:
        report = {"status": "blocked" if "BLOCKED:" in str(error) else "failed", "ownedPid": a.pid,
                  "target": str(a.save), "reason": str(error)}
        try:
            report["windowInventory"] = inventory()
            run("import", "-window", "root", str(a.report.with_suffix(".png")))
        except Exception as capture_error:
            report["diagnosticsError"] = str(capture_error)
        a.report.write_text(json.dumps(report, indent=2))
        raise SystemExit(2)


if __name__ == "__main__":
    main()
