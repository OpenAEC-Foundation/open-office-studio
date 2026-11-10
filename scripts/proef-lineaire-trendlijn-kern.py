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
    metadata_path = repo / "patches/rekenbladengine-lange-ketens.json"
    original = metadata_path.read_bytes()
    metadata = json.loads(original)
    proposal = json.loads((repo / "patches/rekenbladengine-lineaire-trendlijnen.json").read_bytes())
    existing = [metadata, *metadata.get("extraPatches", [])]
    chain = [{"patch": p["patch"], "sha256": p["patchSha256"]} for p in existing]
    if metadata["commit"] != proposal["bronCommit"] or metadata["wasmSha256"] != proposal["basisWasmSha256"] or chain != proposal["basisPatches"]:
        raise SystemExit("The shared kernel base changed; coordinate the patch chain before building.")
    patch = repo / "patches" / proposal["patch"]
    if hashlib.sha256(patch.read_bytes()).hexdigest() != proposal["patchSha256"]:
        raise SystemExit("Trendline patch checksum differs from the candidate descriptor.")
    metadata.setdefault("extraPatches", []).append({key: proposal[key] for key in ["patch", "patchSha256", "tests"]})
    if len(sys.argv) == 3 and sys.argv[1] == "--prepare-only":
        prepare(repo, sys.argv[2], metadata)
        return
    try:
        metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        subprocess.run([sys.executable, str(repo / "scripts/bouw-rekenbladkern.py"), *sys.argv[1:]], cwd=repo, check=True)
    finally:
        metadata_path.write_bytes(original)


if __name__ == "__main__":
    main()
