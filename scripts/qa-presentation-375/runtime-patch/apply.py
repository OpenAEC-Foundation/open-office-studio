"""Check/apply only the reviewed #375 patchset to the exact upstream Git checkout.

Default is read-only validation. --apply changes two source files and adds two
fixtures; it never checks out a different commit, builds, downloads or packages.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("checkout", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    root = args.checkout.resolve(strict=True)
    own = Path(__file__).resolve().parent
    manifest = json.loads((own / "manifest.json").read_text())
    git = lambda *a: subprocess.check_output(["git", "-C", str(root), *a], text=True).strip()
    assert Path(git("rev-parse", "--show-toplevel")).resolve() == root
    assert git("rev-parse", "HEAD") == manifest["upstreamCommit"], "Wrong upstream source point"
    assert not git("diff", "--name-only", "HEAD"), "Tracked source edits already exist; never overwrite them"
    patch = own / "375-solid-rgb-import.patch"
    assert sha(patch) == manifest["patchSHA256"]
    for entry in manifest["sourceFiles"]:
        target = root / entry["path"]
        assert target.resolve(strict=True).is_relative_to(root)
        assert sha(target) == entry["sourceSHA256"], "Source file bytes differ: " + entry["path"]
    for entry in manifest["fixtures"]:
        assert sha(own / entry["file"]) == entry["sha256"]
        target = root / entry["destination"]
        assert target.parent.resolve(strict=True).is_relative_to(root) and not target.exists()
    subprocess.run(["git", "-c", "core.autocrlf=false", "-C", str(root), "apply", "--check", "--whitespace=error", str(patch)], check=True)
    if args.apply:
        subprocess.run(["git", "-c", "core.autocrlf=false", "-C", str(root), "apply", "--whitespace=error", str(patch)], check=True)
        for entry in manifest["sourceFiles"]:
            assert sha(root / entry["path"]) == entry["patchedSHA256"]
        for entry in manifest["fixtures"]:
            target = root / entry["destination"]
            with target.open("xb") as stream:
                stream.write((own / entry["file"]).read_bytes())
            assert sha(target) == entry["sha256"]
    print(json.dumps({"sourceCommit": manifest["upstreamCommit"], "patchSHA256": manifest["patchSHA256"],
                      "applied": args.apply, "compiled": False, "runtimeBuilt": False}))


if __name__ == "__main__":
    main()
