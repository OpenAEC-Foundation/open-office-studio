"""Fetch only the pinned shared QA artifact and verify its complete private tree."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import runpy
import shutil
import stat
import subprocess
import sys
import zipfile

REPO = "OpenAEC-Foundation/open-office-studio"
RUN = 45147346793
HARNESS = "22a8577d215911976400adca4c541f2636212918"
ARTIFACT = 14805600515
ZIP_SHA = "bac1a37b55deff80cabd4670c1bf65d76266285275c0552436dcc13fcdafa487"
TAR_SHA = "f3308bea282aedc444a10a039ec2c4e3904915d4c6c0b5607b088108407fb2e3"
VERIFIER_SHA = "5e17b69dc328e9491692b5e3a497f16977618afea08d259bbaf46063864874ca"
APPLICATION = "dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b"
TREE = "5a644e397ecc6af5452a49b6404edf953687d1b2"

def sha(file):
    with Path(file).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def api(route):
    return json.loads(subprocess.check_output(["gh", "api", f"repos/{REPO}/{route}"]))

def main():
    assert sys.platform == "linux" and os.environ.get("GITHUB_ACTIONS") == "true"
    root = Path(".local/qa-sti-runtime-0c73").resolve()
    assert not root.exists(), "Fresh private runtime destination required"
    root.mkdir(parents=True)
    run = api(f"actions/runs/{RUN}")
    assert run["head_sha"] == HARNESS and run["conclusion"] == "success"
    metadata = api(f"actions/artifacts/{ARTIFACT}")
    assert metadata["workflow_run"]["id"] == RUN and not metadata["expired"]
    assert metadata["name"] == "p2-linux-private-runtime-only"
    assert metadata["digest"] == "sha256:" + ZIP_SHA and metadata["size_in_bytes"] == 305620081
    archive = root / "shared.zip"
    with archive.open("wb") as stream:
        subprocess.run(["gh", "api", f"repos/{REPO}/actions/artifacts/{ARTIFACT}/zip"], stdout=stream, check=True, timeout=300)
    assert sha(archive) == ZIP_SHA and archive.stat().st_size == 305620081
    artifact = root / "artifact"
    artifact.mkdir()
    with zipfile.ZipFile(archive) as z:
        assert sum(i.file_size for i in z.infolist()) < 400_000_000
        for item in z.infolist():
            name = PurePosixPath(item.filename)
            assert not name.is_absolute() and ".." not in name.parts and "\\" not in item.filename
            assert not stat.S_ISLNK(item.external_attr >> 16)
            path = artifact / item.filename
            assert path.resolve().is_relative_to(artifact)
            if item.is_dir():
                path.mkdir(parents=True, exist_ok=True)
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                with z.open(item) as src, path.open("xb") as dst:
                    shutil.copyfileobj(src, dst)
    descriptor = json.loads((artifact / "descriptor.json").read_text())
    parent = descriptor["parent"]
    assert (parent["sourceCommit"], parent["sourceTree"], parent["appVersion"]) == (APPLICATION, TREE, "2026.48.1")
    assert (parent["run"], parent["job"], parent["jobConclusion"]) == (45143305147, 137586343061, "success")
    assert parent["installerArchive"]["id"] == 14804062140
    assert parent["installerArchive"]["sha256"] == "4704f7fdfe85a711a1c3f8a1da6114461bf17edde090d18f1665397ad23abbc6"
    assert parent["reportArchive"]["sha256"] == "3dffb92f7b2cc418c154d48fc2574f155e912113ec0265fc870ffcba8d0b5576"
    assert parent["packageReportSha256"] == "51f99b9955ed0116372c8b24527e153ebe9b91a2ee24c25b3dbf742294d85f8b"
    assert parent["deb"]["sha256"] == "23258ac32f9368a6512b04ffcfda9a3f2be50dafeee6d8c7ca36a3a525a5f5d1"
    assert descriptor["qaRun"] == RUN and descriptor["harnessCommit"] == HARNESS
    assert descriptor["entryManifest"]["sha256"] == "79204b36527a7fed0f073b5290df26a86c6a610ba4f78ddf36883507b28da029"
    assert descriptor["runtimeReceipt"]["version"] == "26.8.2.2"
    assert descriptor["runtimeReceipt"]["sourceSha256"] == "8290c8f46cb33d6df8f681cb796e0697461ea070f86ec55b63c94d7eb9d9a476"
    verifier = artifact / "p2-runtime-consumer.py"
    assert sha(verifier) == VERIFIER_SHA == descriptor["consumerVerifierSha256"]
    destination = root / "unpacked"
    verified = runpy.run_path(str(verifier))["verify"](artifact, TAR_SHA, destination)
    assert verified["status"] == "verified"
    assert sha(artifact / descriptor["canary"]["report"]) == descriptor["canary"]["reportSha256"]
    out = Path(".local/qa-sti-p2-0c73")
    evidence = {"artifact": metadata, "sharedHarnessCommit": HARNESS,
        "artifactZipSha256": sha(archive), "descriptorSha256": sha(artifact / "descriptor.json"),
        "verifierSha256": sha(verifier), "descriptor": descriptor, "verification": verified,
        "destination": str(destination), "artifactDirectory": str(artifact),
        "qualification": "Entire relocated runtime manifest verified; private CLI only, no installed application or GUI acceptance."}
    (out / "runtime-binding-evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps({"status": "verified", "artifact": ARTIFACT, "tarSha256": TAR_SHA,
        "manifestEntries": descriptor["entryManifest"]["entries"], "converter": verified["converter"]}))

if __name__ == "__main__":
    main()
