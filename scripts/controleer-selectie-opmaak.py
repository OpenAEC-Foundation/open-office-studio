#!/usr/bin/env python3
"""Test de prototypepatch boven de actieve bronpatches, zonder een WASM te vervangen."""
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import urllib.request


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    repo = Path(__file__).resolve().parents[1]
    metadata = json.loads((repo / "patches/rekenbladengine-lange-ketens.json").read_text())
    prototype = json.loads((repo / "patches/rekenbladengine-selectie-opmaak.json").read_text())
    if prototype["bronCommit"] != metadata["commit"]:
        raise SystemExit("Het prototype en de productiekern hebben verschillende bronversies.")
    patches = [metadata, *metadata.get("extraPatches", []), prototype]
    for item in patches:
        if sha256(repo / "patches" / item["patch"]) != item["patchSha256"]:
            raise SystemExit("Afwijkende bronpatch: " + item["patch"])
    source = repo / ".local/selectie-opmaak-bron"
    if source.exists():
        raise SystemExit("Kies een nieuwe, lege native testomgeving.")
    source.parent.mkdir(exist_ok=True)
    archive = source.with_suffix(".tar.gz")
    if not archive.exists():
        with urllib.request.urlopen(metadata["bronarchiefUrl"], timeout=60) as response:
            with archive.open("xb") as target:
                while chunk := response.read(1024 * 1024):
                    target.write(chunk)
    if sha256(archive) != metadata["bronarchiefSha256"]:
        raise SystemExit("Het bronarchief wijkt af van de vastgezette checksum.")
    source.mkdir()
    with tarfile.open(archive) as tar:
        for member in tar:
            parts = Path(member.name).parts[1:]
            if not parts:
                continue
            relative = Path(*parts)
            if relative.is_absolute() or ".." in relative.parts:
                raise SystemExit("Onveilig archiefpad.")
            target = source / relative
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(member) as opened, target.open("xb") as output:
                    while chunk := opened.read(1024 * 1024):
                        output.write(chunk)
            else:
                raise SystemExit("Onverwacht archieflid.")
    for item in patches:
        patch = repo / "patches" / item["patch"]
        subprocess.run(["patch", "-p1", "--fuzz=0", "--batch", "--forward", "-i", str(patch)], cwd=source, check=True)
    print("Native prototypebron voorbereid; geen productie-WASM gewijzigd.")


if __name__ == "__main__":
    main()
