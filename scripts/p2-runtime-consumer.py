"""Verify and unpack the shared P2 runtime input: DIR EXPECTED_TAR_SHA DESTINATION."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import tarfile
import tempfile
import zipfile


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
    assert sha(converter) == descriptor["converterLauncherSha256"]
    binary = destination / descriptor["converterElfPath"]
    assert binary.resolve(strict=True).is_relative_to(destination.resolve())
    assert sha(binary) == descriptor["converterElfMetadata"]["sha256"]
    return {"status": "verified", "converter": str(converter), "resources": str(destination / descriptor["resourcesPath"]), "sourceCommit": descriptor["parent"]["sourceCommit"], "tarSha256": expected_sha}


def verify_download(archive, delivery_descriptor, expected_descriptor_sha, destination):
    """Common outer ZIP + pinned delivery descriptor + existing tar verifier."""
    assert sha(delivery_descriptor) == expected_descriptor_sha, "Coordinator delivery descriptor SHA256"
    delivery = json.loads(delivery_descriptor.read_text())
    artifact = delivery["publishedArtifacts"]["p2-linux-private-runtime-only"]
    assert sha(archive) == artifact["zipSha256"], "Exact immutable QA artifact ZIP"
    allowed = {"descriptor.json", "entry-manifest.json", "canary-report.json", "canary-execve.log", "canary.fodt",
               "soffice-bin-ldd.txt", "package-verification-Linux.json", "p2-runtime-consumer.py", "consumer-verification.json", delivery["tar"]["name"]}
    with tempfile.TemporaryDirectory(prefix="p2-runtime-verified-input-") as temp:
        root = Path(temp)
        with zipfile.ZipFile(archive) as bundle:
            names = bundle.namelist()
            assert len(names) == len(set(names))
            assert set(names) == allowed, "Only the runtime-only input and its QA evidence; no Office installer/app files"
            for name in names:
                assert len(PurePosixPath(name).parts) == 1
                with bundle.open(name) as source, (root / name).open("wb") as target:
                    while chunk := source.read(1024 * 1024): target.write(chunk)
        assert sha(root / "descriptor.json") == delivery["runtimeBaseDescriptorSha256"]
        result = verify(root, delivery["tar"]["sha256"], destination)
        result.update(artifactId=artifact["id"], artifactZipSha256=artifact["zipSha256"], deliveryDescriptorSha256=expected_descriptor_sha)
        return result


if __name__ == "__main__":
    if len(sys.argv) == 6 and sys.argv[1] == "--archive":
        print(json.dumps(verify_download(Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve(), sys.argv[4], Path(sys.argv[5]).resolve())))
    else:
        assert len(sys.argv) == 4, __doc__ + " OR --archive ZIP DELIVERY_DESCRIPTOR DESCRIPTOR_SHA NEW_DESTINATION"
        print(json.dumps(verify(Path(sys.argv[1]).resolve(), sys.argv[2], Path(sys.argv[3]).resolve())))
