"""Extract our installer without installing an app or changing the live desktop."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("report", type=Path)
    options = parser.parse_args()
    package = options.package.resolve()
    destination = options.destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    helpers = runpy.run_path(str(Path(__file__).with_name("controleer-installers.py")))
    if package.suffix == ".exe":
        helpers["windows"](package, destination)
    elif package.suffix == ".deb":
        version = json.loads(Path("package.json").read_text(encoding="utf-8"))["version"]
        helpers["deb"](package, destination, version)
    elif package.suffix == ".AppImage":
        helpers["appimage"](package, destination)
    elif package.suffix == ".dmg":
        mount = destination.parent / "mount"
        mount.mkdir()
        subprocess.run(["hdiutil", "attach", "-readonly", "-nobrowse", "-mountpoint", str(mount), str(package)], check=True, capture_output=True)
        try:
            apps = list(mount.glob("*.app"))
            if len(apps) != 1:
                raise RuntimeError("Expected one app in the DMG")
            shutil.copytree(apps[0], destination / apps[0].name, symlinks=True)
        finally:
            subprocess.run(["hdiutil", "detach", str(mount)], check=True, capture_output=True)
    else:
        raise RuntimeError("Unsupported installer type")
    receipts = list(destination.rglob("kantoorruntime/meta/receipt.json"))
    if len(receipts) != 1:
        raise RuntimeError(f"Expected one bundled-runtime receipt, found {len(receipts)}")
    resources = receipts[0].parents[2]
    receipt = json.loads(receipts[0].read_text(encoding="utf-8"))
    if package.suffix == ".dmg":
        runtime = resources.parent / "Helpers/LibreOffice.app"
        program = runtime / "Contents/MacOS/soffice"
        # The original helper signature must survive copying and packaging.
        subprocess.run(["codesign", "--verify", "--deep", "--strict", str(runtime)], check=True, capture_output=True)
    else:
        runtime = resources / "kantoorruntime"
        program = runtime / receipt["executable"]
    if not program.is_file():
        raise RuntimeError("The actual installer omits its private runtime executable")
    with package.open("rb") as file:
        digest = hashlib.file_digest(file, "sha256").hexdigest()
    options.report.parent.mkdir(parents=True, exist_ok=True)
    options.report.write_text(json.dumps({"package": package.name, "packageBytes": package.stat().st_size,
        "packageSha256": digest, "resources": str(resources), "runtime": str(runtime),
        "program": str(program), "receipt": receipt}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
