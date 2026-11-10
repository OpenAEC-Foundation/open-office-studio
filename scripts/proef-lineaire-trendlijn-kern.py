"""Build a private trendline candidate while preserving the shared kernel pin."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys


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
    try:
        metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        subprocess.run([sys.executable, str(repo / "scripts/bouw-rekenbladkern.py"), *sys.argv[1:]], cwd=repo, check=True)
    finally:
        metadata_path.write_bytes(original)


if __name__ == "__main__":
    main()
