"""Bounded native #361 action driver; not an automatic acceptance pass.

Caller owns opening the exact app/fixture and final cleanup. Each action requires
an immutable candidate identity and an exact matching PID, app and package hash.
Never launches apps, changes Accessibility settings, or touches unrelated PIDs.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("identity", type=Path)
    parser.add_argument("pid", type=int)
    parser.add_argument("action", choices=["snapshot", "raw-snapshot", "activate", "click-label", "click-input", "click-document-tab", "ax-press-label", "click-cell", "click-body-point", "type-test-character", "type-test-text", "chord"])
    parser.add_argument("report", type=Path)
    parser.add_argument("--target", default="")
    options = parser.parse_args()
    identity = json.loads(options.identity.read_text(encoding="utf-8"))
    for key, length in [("sourceCommit", 40), ("sourceTree", 40),
                        ("packageSha256", 64), ("executableSha256", 64)]:
        if not re.fullmatch("[a-f0-9]{" + str(length) + "}", identity.get(key, "")):
            raise ValueError("Missing exact provenance: " + key)
    if not all(type(identity.get(key)) is int and identity[key] > 0
               for key in ["artifactRun", "artifactId"]):
        raise ValueError("Positive artifact run and ID required")
    if identity.get("executionApproved") is not True or os.environ.get("OOS_361_EXECUTE") != "1":
        raise RuntimeError("Exact candidate execution must be released by integration")
    if sys.platform != "darwin" or os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("Disposable native macOS runner only")
    git = lambda *args: subprocess.check_output(["git", *args], text=True).strip()
    if git("rev-parse", "HEAD") != identity["sourceCommit"] or git("rev-parse", "HEAD^{tree}") != identity["sourceTree"]:
        raise RuntimeError("Application checkout differs from artifact identity")
    if git("status", "--porcelain", "--untracked-files=no"):
        raise RuntimeError("Application source checkout must be clean")
    program = Path(identity["executablePath"]).resolve(strict=True)
    app = program.parent.parent.parent
    info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
    if app.suffix != ".app" or info.get("CFBundleIdentifier") != "org.openaec.office-studio" or info.get("CFBundleExecutable") != program.name:
        raise RuntimeError("Pinned executable is not the expected packaged office app")
    if sha(identity["packagePath"]) != identity["packageSha256"] or sha(program) != identity["executableSha256"]:
        raise RuntimeError("Package or native executable differs from pinned artifact")
    running = subprocess.check_output(["ps", "-p", str(options.pid), "-o", "comm="], text=True).strip()
    if not running or Path(running).resolve() != program:
        raise RuntimeError("Requested PID does not own the pinned native executable")
    if options.report.exists():
        raise RuntimeError("Use a fresh report path; preserve earlier evidence")
    options.report.parent.mkdir(parents=True, exist_ok=True)
    source = Path(__file__).with_name("writer-361-macos-ax.swift")
    helper = options.report.parent / ("writer361-ax-" + sha(source)[:12])
    if not helper.exists():
        subprocess.run(["xcrun", "swiftc", str(source), "-o", str(helper)], check=True, timeout=120)
    result = subprocess.run([str(helper), str(options.pid), options.action, options.target],
                            capture_output=True, text=True, check=True, timeout=20)
    snapshot = json.loads(result.stdout)
    report = {"issue": 361, "identity": identity, "driverSha256": sha(__file__),
              "harnessCommit": subprocess.check_output(["git", "-C", str(Path(__file__).resolve().parent.parent), "rev-parse", "HEAD"], text=True).strip(),
              "helperSourceSha256": sha(source), "helperBinarySha256": sha(helper), "native": snapshot,
              "acceptance": "observation only; input-sent is not a functional pass",
              "cleanup": "caller owns app and must close its own app/capture after final checks"}
    options.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    if snapshot.get("status") == "blocked":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
