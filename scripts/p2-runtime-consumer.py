"""Verify and unpack the shared P2 runtime input: DIR EXPECTED_TAR_SHA DESTINATION."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import tarfile


def sha(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def verify(artifact, expected_sha, destination):
    descriptor = json.loads((artifact / "descriptor.json").read_text())
    assert descriptor["parent"]["sourceCommit"] == "dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b"
    assert descriptor["parent"]["sourceTree"] == "5a644e397ecc6af5452a49b6404edf953687d1b2"
    assert descriptor["parent"]["appVersion"] == "2026.48.1"
    assert descriptor["parent"]["job"] == 137586343061 and descriptor["parent"]["jobConclusion"] == "success"
    archive = artifact / descriptor["tar"]["name"]
    assert archive.parent == artifact
    assert expected_sha == descriptor["tar"]["sha256"] == sha(archive), "Pin the tar SHA supplied by the coordinator"
    manifest = artifact / descriptor["entryManifest"]["name"]
    assert manifest.parent == artifact and sha(manifest) == descriptor["entryManifest"]["sha256"]
    expected = json.loads(manifest.read_text())
    assert len(expected) == descriptor["entryManifest"]["entries"]
    assert not destination.exists(), "Use a new isolated destination"
    destination.mkdir(parents=True)
    with tarfile.open(archive, "r:gz") as bundle:
        for item in bundle.getmembers():
            name = PurePosixPath(item.name)
            assert not name.is_absolute() and ".." not in name.parts and name.parts[0] == "payload"
            if item.issym():
                assert not PurePosixPath(item.linkname).is_absolute()
                link = (destination / item.name).parent / item.linkname
                assert link.resolve(strict=False).is_relative_to(destination.resolve())
        bundle.extractall(destination, filter="data")
    actual = []
    for path in [destination / "payload"] + sorted((destination / "payload").rglob("*")):
        entry = {"path": path.relative_to(destination).as_posix(), "mode": f"{stat.S_IMODE(path.lstat().st_mode):04o}"}
        if path.is_symlink():
            target = os.readlink(path)
            resolved = path.resolve(strict=True)
            assert resolved.is_relative_to(destination.resolve())
            entry.update(type="symlink", linkTarget=target, linkTargetSha256=hashlib.sha256(os.fsencode(target)).hexdigest(), resolvedPath=resolved.relative_to(destination).as_posix())
        elif path.is_file():
            entry.update(type="file", bytes=path.stat().st_size, sha256=sha(path))
        else:
            assert path.is_dir()
            entry.update(type="directory")
        actual.append(entry)
    assert actual == [{k: v for k, v in entry.items() if k != "debMetadata"} for entry in expected]
    converter = destination / descriptor["canonicalConverterPath"]
    assert converter.resolve(strict=True).is_relative_to(destination.resolve()) and os.access(converter, os.X_OK)
    return {"status": "verified", "converter": str(converter), "resources": str(destination / descriptor["resourcesPath"]), "sourceCommit": descriptor["parent"]["sourceCommit"], "tarSha256": expected_sha}


if __name__ == "__main__":
    assert len(sys.argv) == 4, __doc__
    print(json.dumps(verify(Path(sys.argv[1]).resolve(), sys.argv[2], Path(sys.argv[3]).resolve())))
