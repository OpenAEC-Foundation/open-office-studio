"""Positive control for our generated harmless fixture, only on an isolated CI host."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import runpy
import subprocess
import time

import psutil


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("program", type=Path)
    parser.add_argument("fixture", type=Path)
    parser.add_argument("marker", type=Path)
    parser.add_argument("report", type=Path)
    options = parser.parse_args()
    if os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("Macro positive control is restricted to our disposable CI host")
    fixture, marker = options.fixture.resolve(), options.marker.resolve()
    if fixture.name != "macro-guard.odt" or marker.name != "macro-was-executed.txt" or fixture.parent != marker.parent:
        raise RuntimeError("Only the generated probe fixture and its own marker are allowed")
    assert not marker.exists()
    before = hashlib.sha256(fixture.read_bytes()).hexdigest()
    helpers = runpy.run_path(str(Path(__file__).with_name("meet-kantoorruntime.py")))
    profile = Path("src-tauri/src/conversieprofiel.xcu").read_text(encoding="utf-8")
    # Deliberately enable macros ONLY for this generated positive control. The
    # production profile is never changed and the next Rust probe uses it verbatim.
    positive = profile.replace('name="MacroSecurityLevel" oor:op="fuse"><value>3',
                               'name="MacroSecurityLevel" oor:op="fuse"><value>0')
    positive = positive.replace('name="DisableMacrosExecution" oor:op="fuse"><value>true',
                                'name="DisableMacrosExecution" oor:op="fuse"><value>false')
    positive = positive.replace('name="BlockUntrustedRefererLinks" oor:op="fuse"><value>true',
                                'name="BlockUntrustedRefererLinks" oor:op="fuse"><value>false')
    with helpers["own_temp"]() as root:
        user = root / "profile/user"
        user.mkdir(parents=True)
        (user / "registrymodifications.xcu").write_text(positive, encoding="utf-8")
        # LibreOffice's conversion request opens a hidden/silent view without
        # MacroExecutionMode::USE_CONFIG. Use a normal headless OPEN request for
        # the positive control; the production negative control still converts.
        started = time.monotonic()
        children = []
        with options.report.with_suffix(".log").open("wb") as log:
            process = psutil.Popen([
                str(options.program.resolve()), "-env:UserInstallation=" + (root / "profile").as_uri(),
                "--headless", "--nologo", "--nodefault", "--norestore", "--nolockcheck", str(fixture),
            ], stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                env=dict(os.environ, SAL_DISABLE_DEFAULTPRINTER="1", SAL_DISABLE_PRINTERLIST="1"),
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                start_new_session=os.name != "nt")
            try:
                while not marker.is_file() and time.monotonic() - started < 45:
                    try:
                        children = process.children(recursive=True)
                    except psutil.NoSuchProcess:
                        pass
                    if process.poll() is not None:
                        break
                    time.sleep(.05)
            finally:
                for child in reversed(children + [process]):
                    try:
                        child.kill()
                    except psutil.NoSuchProcess:
                        pass
                psutil.wait_procs(children + [process], timeout=10)
        timing = {"ms": round((time.monotonic() - started) * 1000), "mode": "headless-open-positive-control"}
        assert marker.is_file(), "The on-load fixture must actually execute in its positive control"
        assert marker.read_text(encoding="utf-8").strip() == "unexpected macro execution"
        marker.unlink()  # This generated marker must be absent for the safe-profile test.
    assert hashlib.sha256(fixture.read_bytes()).hexdigest() == before
    options.report.write_text(json.dumps({"positiveControl": True, "fixtureSha256": before,
        "markerResetForSafeProfile": True, "timing": timing}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
