"""Try real packaged WKWebView interaction on our CI host; report AX denial honestly."""
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
    processes = runpy.run_path(str(Path(__file__).with_name("proef-macos-openen.py")))["processen"]
    assert not processes(program), "Our extracted app must not already be running"
    document = options.document.resolve()
    before = hashlib.sha256(document.read_bytes()).hexdigest()
    report = {"status": "failed", "packagedApp": str(app), "originalSha256": before}
    labels = [json.loads(path.read_text(encoding="utf-8"))["saveAs"]["sourceBundled"]
              for path in Path("src/i18n/locales").glob("*/backstage.json")]
    started = False

    def applescript(pid, body):
        script = ('tell application "System Events"\ntell (first application process whose unix id is '
                  + str(pid) + ')\n' + body + '\nend tell\nend tell')
        return subprocess.run(["osascript", "-e", script], text=True, capture_output=True, timeout=15)

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
        shortcut = applescript(pid, 'set frontmost to true\nkeystroke "s" using {command down, shift down}')
        if shortcut.returncode:
            report.update(status="blocked", reason="System Events could not operate the packaged app", details=shortcut.stderr.strip())
            return
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            texts = applescript(pid, '''set collectedTexts to {}
repeat with uiElement in (entire contents of window 1)
try
set end of collectedTexts to (name of uiElement) as string
end try
try
set end of collectedTexts to (value of uiElement) as string
end try
end repeat
return collectedTexts as string''')
            if texts.returncode:
                report.update(status="blocked", reason="WKWebView Accessibility content is unavailable", details=texts.stderr.strip())
                return
            if any(label in texts.stdout for label in labels):
                report.update(status="passed", odtNativeWindow=True, saveAsShowsBundledRuntime=True)
                break
            time.sleep(.5)
        else:
            raise RuntimeError("Native Save As did not expose the bundled runtime source")
    except subprocess.TimeoutExpired:
        report.update(status="blocked", reason="The CI host did not answer the native Accessibility request within its limit")
    finally:
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
        options.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        assert report["ownedAppClosed"] and report["originalUnchanged"]
        print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
