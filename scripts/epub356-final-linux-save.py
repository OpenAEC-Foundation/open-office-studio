"""Operate only an owned X11 native Save dialog in our disposable CI session."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import time

spec = importlib.util.spec_from_file_location("epub356_linux_portal", Path(__file__).with_name("epub356-final-linux-portal.py"))
portal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portal)


def attributed_portal(a):
    if not a.portal.exists():
        return None
    state = json.loads(a.portal.read_text(encoding="utf-8"))
    if state.get("status") in ("failed", "blocked"):
        raise RuntimeError("BLOCKED: portal observer: " + state.get("reason", "unavailable"))
    if state.get("status") != "attributed":
        return None
    correlation = state["correlation"]
    assert state["readyBeforeSave"] is True and state["ownedPid"] == a.pid
    assert correlation["ownedPid"] == a.pid
    assert portal.bus_call("GetId") == state["busId"], "Private bus identity changed"
    assert portal.bus_call("GetConnectionUnixProcessID", correlation["frontend"]["sender"]) == a.pid
    assert portal.bus_call("GetNameOwner", portal.BROKER) == correlation["brokerUniqueName"]
    assert portal.bus_call("GetNameOwner", portal.GTK) == correlation["backendUniqueName"]
    assert portal.bus_call("GetConnectionUnixProcessID", correlation["backendUniqueName"]) == correlation["backendPid"]
    assert Path(f"/proc/{correlation['backendPid']}/exe").resolve().name == "xdg-desktop-portal-gtk"
    return correlation


def run(*args, required=True):
    return subprocess.run(args, check=required, capture_output=True, text=True, timeout=10)


def operate(a):
    assert not a.save.exists()
    assert a.save.resolve().is_relative_to(a.report.parent.resolve())
    deadline = time.monotonic() + 35
    window = None
    ownership = None
    titles = {"Save as", "Save As", "Opslaan als", "Save a copy", "Kopie opslaan"}
    while time.monotonic() < deadline:
        assert Path(f"/proc/{a.pid}").exists(), "Owned app exited before native Save"
        correlation = attributed_portal(a)
        expected_pid = correlation["backendPid"] if correlation else a.pid
        result = run("xdotool", "search", "--onlyvisible", "--pid", str(expected_pid), required=False)
        candidates = []
        for candidate in result.stdout.split():
            title = run("xdotool", "getwindowname", candidate).stdout.strip()
            if title in titles:
                candidates.append(candidate)
        assert len(candidates) <= 1, "Ambiguous owned file chooser"
        if candidates:
            window = candidates[0]
            ownership = {"method": "credential-bound-portal-request" if correlation else "owned-app-pid",
                         "windowPid": expected_pid, "correlation": correlation}
            break
        time.sleep(.25)
    assert window, "BLOCKED: no native Save dialog tied to owned app PID or credential-bound portal request"
    run("import", "-window", "root", str(a.report.with_name("native-os-save-before-input.png")))
    assert int(run("xdotool", "getwindowpid", window).stdout.strip()) == ownership["windowPid"]
    if ownership["correlation"]:
        assert attributed_portal(a) == ownership["correlation"], "Portal ownership changed before input"
    run("xdotool", "windowfocus", "--sync", window)
    assert run("xdotool", "getwindowfocus").stdout.strip() == window, "Owned chooser did not receive focus"
    run("xdotool", "key", "--clearmodifiers", "ctrl+l")
    # GTK can leave only the name stem selected, with its old .docx suffix
    # outside that selection. Replace the complete native entry; never rename
    # the saved file afterwards to manufacture a requested-path result.
    run("xdotool", "key", "--clearmodifiers", "ctrl+a")
    run("xdotool", "type", "--clearmodifiers", "--delay", "0", str(a.save.resolve()))
    run("import", "-window", "root", str(a.report.with_name("native-os-save-after-input.png")))
    run("xdotool", "key", "--clearmodifiers", "Return")
    time.sleep(.7)
    if not a.save.exists():
        assert run("xdotool", "getwindowfocus").stdout.strip() == window
        run("xdotool", "key", "--clearmodifiers", "alt+s")
    a.report.write_text(json.dumps({"ownedPid": a.pid, "windowId": window, "ownership": ownership,
                                   "nativeSaveInvoked": True, "target": str(a.save)}, indent=2))


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
    p.add_argument("--portal", type=Path, required=True)
    a = p.parse_args()
    assert os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("DISPLAY"), "Isolated CI display required"
    try:
        operate(a)
    except Exception as error:
        report = {"status": "blocked" if "BLOCKED:" in str(error) else "failed", "ownedPid": a.pid,
                  "target": str(a.save), "reason": str(error)}
        try:
            report["windowInventory"] = inventory()
            run("import", "-window", "root", str(a.report.with_name("native-os-save-blocked.png")))
        except Exception as capture_error:
            report["diagnosticsError"] = str(capture_error)
        a.report.write_text(json.dumps(report, indent=2))
        raise SystemExit(2)


if __name__ == "__main__":
    main()
