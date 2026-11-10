"""Positive control for our generated harmless fixture, only on an isolated CI host."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import runpy


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
    with helpers["own_temp"]() as root:
        user = root / "profile/user"
        user.mkdir(parents=True)
        (user / "registrymodifications.xcu").write_text(positive, encoding="utf-8")
        output = root / "output"
        output.mkdir()
        timing = helpers["measured_process"]([
            options.program.resolve(), "-env:UserInstallation=" + (root / "profile").as_uri(),
            "--headless", "--nologo", "--nodefault", "--norestore", "--nolockcheck",
            "--convert-to", "docx:Office Open XML Text", "--outdir", output, fixture,
        ], options.report.with_suffix(".log"))
        assert (output / "macro-guard.docx").is_file()
        assert marker.is_file(), "The on-load fixture must actually execute in its positive control"
        assert marker.read_text(encoding="utf-8").strip() == "unexpected macro execution"
        marker.unlink()  # This generated marker must be absent for the safe-profile test.
    assert hashlib.sha256(fixture.read_bytes()).hexdigest() == before
    options.report.write_text(json.dumps({"positiveControl": True, "fixtureSha256": before,
        "markerResetForSafeProfile": True, "timing": timing}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
