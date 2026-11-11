"""Build a private trendline candidate while preserving the shared kernel pin."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import urllib.request


def prepare(repo, target, metadata):
    target = Path(target).resolve()
    if target.exists():
        raise SystemExit("Choose a new source directory; existing files are never overwritten.")
    target.parent.mkdir(parents=True, exist_ok=True)
    archive = target.with_suffix(".tar.gz")
    if not archive.exists():
        with urllib.request.urlopen(metadata["bronarchiefUrl"], timeout=60) as response, archive.open("xb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != metadata["bronarchiefSha256"]:
        raise SystemExit("Pinned source archive checksum differs.")
    target.mkdir()
    with tarfile.open(archive) as tar:
        for member in tar:
            parts = Path(member.name).parts[1:]
            if not parts:
                continue
            relative = Path(*parts)
            if relative.is_absolute() or ".." in relative.parts:
                raise SystemExit("Unsafe archive member.")
            dest = target / relative
            if member.isdir():
                dest.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                dest.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(member) as source, dest.open("xb") as output:
                    while chunk := source.read(1024 * 1024):
                        output.write(chunk)
    subprocess.run(["git", "init", "--quiet", str(target)], check=True)
    subprocess.run(["git", "config", "core.autocrlf", "false"], cwd=target, check=True)
    for entry in [metadata, *metadata.get("extraPatches", [])]:
        patch = repo / "patches" / entry["patch"]
        if hashlib.sha256(patch.read_bytes()).hexdigest() != entry["patchSha256"]:
            raise SystemExit("Patch checksum differs: " + entry["patch"])
        subprocess.run(["git", "apply", "--check", str(patch)], cwd=target, check=True)
        subprocess.run(["git", "apply", str(patch)], cwd=target, check=True)
    if not (target / "crates/betteroffice-xlsx/tests/linear_trendlines.rs").is_file():
        raise SystemExit("The trendline patch was not applied to the isolated source.")


def main():
    repo = Path(__file__).resolve().parents[1]
    metadata = json.loads((repo / "patches/rekenbladengine-lange-ketens.json").read_bytes())
    chain = [metadata, *metadata.get("extraPatches", [])]
    if len(chain) != 15 or chain[-1]["patchSha256"] != "8a56f7cfe48ce1083de83cfd8864503d14411c868263c3a07772451557edbcdb":
        raise SystemExit("Expected the exact fourteen-patch base plus the verified trendline patch.")
    prepare(repo, sys.argv[1], metadata)

if __name__ == "__main__":
    main()
