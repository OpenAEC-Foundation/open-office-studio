"""Read crash evidence for this probe's private runtime; never dismiss dialogs."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def files():
    if sys.platform != "darwin" or os.environ.get("GITHUB_ACTIONS") != "true":
        return []
    root = Path.home() / "Library/Logs/DiagnosticReports"
    return [p for p in root.glob("*.ips") if "soffice" in p.name.lower() or "libreoffice" in p.name.lower()]


def snapshot():
    return {str(p): p.stat().st_mtime_ns for p in files()}


def alerts():
    script = '''tell application "System Events"
set found to {}
repeat with candidate in {"UserNotificationCenter", "CoreServicesUIAgent", "ReportCrash"}
if exists application process candidate then
tell application process candidate
try
set end of found to (name of every window) as string
end try
end tell
end if
end repeat
return found as string
end tell'''
    try:
        result = subprocess.run(["osascript", "-e", script], text=True, capture_output=True, timeout=8)
        return {"status": "read" if result.returncode == 0 else "unavailable",
                "windowTitles": result.stdout.strip(), "error": result.stderr.strip()}
    except subprocess.TimeoutExpired:
        return {"status": "timed-out"}


def collect(program, before, wait_seconds=0):
    if sys.platform != "darwin" or os.environ.get("GITHUB_ACTIONS") != "true":
        return {"applicable": False}
    program = Path(program).resolve()
    deadline = time.monotonic() + wait_seconds
    records = []
    while True:
        records = []
        for path in files():
            if before.get(str(path)) == path.stat().st_mtime_ns:
                continue
            raw = path.read_text(encoding="utf-8", errors="replace")
            try:
                # Apple .ips files have a one-line JSON header and a JSON body.
                header, body = raw.split("\n", 1)
                data = json.loads(body)
                location = data.get("procPath", "")
                matched = bool(location) and Path(location).resolve().parent == program.parent
                records.append({"file": path.name, "pid": data.get("pid"), "program": location,
                                "matchesPrivateRuntime": matched,
                                "exception": data.get("exception"), "termination": data.get("termination")})
            except (ValueError, OSError) as error:
                records.append({"file": path.name, "parseError": str(error)})
        if records or time.monotonic() >= deadline:
            break
        time.sleep(.25)
    return {"applicable": True, "newReports": records, "systemAlerts": alerts()}
