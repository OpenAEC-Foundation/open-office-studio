"""Consume only the coordinator's pinned runtime-only Linux artifact; no app build."""
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import zipfile

from oracle import CONFIG, write_json


def gh(endpoint):
    return json.loads(subprocess.check_output(["gh", "api", endpoint], text=True))


def sha(path):
    with Path(path).open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def main():
    assert sys.platform.startswith("linux"), "Private runtime payloads are consumed only in Linux CI"
    pin = json.loads(Path("scripts/qa-uot/runtime-input.json").read_text())
    assert re.fullmatch(r"[0-9a-f]{64}", pin["tarSha256"])
    assert pin["application"] == CONFIG["application"]
    repo = "repos/OpenAEC-Foundation/open-office-studio"
    git_descriptor = gh(f"{repo}/contents/docs/tests/p2-runtime-input-2026-11-23/runtime-input-descriptor.json?ref={pin['coordinatorDescriptorCommit']}")
    coordinator_bytes = base64.b64decode(git_descriptor["content"])
    assert hashlib.sha256(coordinator_bytes).hexdigest() == pin["descriptorSha256"], "Coordinator Git descriptor identity differs"
    coordinator = json.loads(coordinator_bytes)
    published = coordinator["publishedArtifacts"]["p2-linux-private-runtime-only"]
    assert (published["id"], published["run"], published["zipSha256"]) == (pin["artifactId"], pin["producerRun"], pin["zipSha256"])
    assert coordinator["sharedConsumerPin"]["sha256"] == pin["consumerSha256"]
    assert coordinator["tar"]["sha256"] == pin["tarSha256"]
    run = gh(f"{repo}/actions/runs/{pin['producerRun']}")
    assert run["head_sha"] == pin["producerCommit"] and run["conclusion"] == "success"
    parent = gh(f"{repo}/actions/jobs/{pin['parentJob']}")
    assert parent["head_sha"] == CONFIG["application"]["commit"]
    assert parent["run_id"] == pin["parentRun"] and parent["conclusion"] == "success"
    artifact = gh(f"{repo}/actions/artifacts/{pin['artifactId']}")
    assert artifact["workflow_run"]["id"] == pin["producerRun"]
    assert artifact["name"] == "p2-linux-private-runtime-only" and not artifact["expired"]
    assert artifact["digest"] == "sha256:" + pin["zipSha256"]
    work = Path(".local/uot-runtime-input").resolve()
    work.mkdir(parents=True, exist_ok=True)
    archive = work / "runtime-input.zip"
    with archive.open("wb") as out:
        subprocess.run(["gh", "api", "--method", "GET", f"{repo}/actions/artifacts/{pin['artifactId']}/zip"], stdout=out, check=True)
    assert archive.stat().st_size == pin["zipBytes"] and sha(archive) == pin["zipSha256"]
    extracted = work / "artifact"
    assert not extracted.exists()
    with zipfile.ZipFile(archive) as z:
        for entry in z.infolist():
            p = PurePosixPath(entry.filename)
            assert not p.is_absolute() and ".." not in p.parts
        z.extractall(extracted)
    consumer = extracted / "p2-runtime-consumer.py"
    assert sha(consumer) == pin["consumerSha256"]
    private = work / "private"
    out = Path(".local/uot-qa")
    out.mkdir(parents=True, exist_ok=True)
    (out / "runtime-coordinator-descriptor.json").write_bytes(coordinator_bytes)
    (out / "runtime-base-descriptor.json").write_bytes((extracted / "descriptor.json").read_bytes())
    assert sha(extracted / "descriptor.json") == coordinator["runtimeBaseDescriptorSha256"], "Original artifact descriptor does not match the Git descriptor's base pin"
    descriptor = json.loads((extracted / "descriptor.json").read_text())
    assert descriptor["entryManifest"]["sha256"] == pin["manifestSha256"]
    assert descriptor["entryManifest"]["entries"] == pin["manifestEntries"]
    assert descriptor["converterLauncherSha256"] == pin["launcherSha256"]
    assert descriptor["converterElfMetadata"]["sha256"] == pin["elfSha256"]
    assert descriptor["parent"]["deb"]["sha256"] == pin["parentDebSha256"]
    assert descriptor["parent"]["installerArchive"]["id"] == pin["parentZipArtifact"]
    assert descriptor["parent"]["installerArchive"]["sha256"] == pin["parentZipSha256"]
    verified = json.loads(subprocess.check_output([sys.executable, str(consumer), str(extracted), pin["tarSha256"], str(private)], text=True))
    assert verified["status"] == "verified" and verified["sourceCommit"] == CONFIG["application"]["commit"]
    assert descriptor["parent"]["run"] == pin["parentRun"]
    assert descriptor["parent"]["job"] == pin["parentJob"]
    assert descriptor["parent"]["deb"]["control"]["Version"] == CONFIG["application"]["version"]
    binding = {
        "application": CONFIG["application"], "artifact": pin,
        "package": descriptor["parent"], "privateRoot": str(private),
        "program": verified["converter"], "programSha256": descriptor["converterLauncherSha256"],
        "converterElf": descriptor["converterElfMetadata"], "runtimeReceipt": descriptor["runtimeReceipt"],
        "entryManifest": descriptor["entryManifest"],
        "method": "Pinned ZIP/tar and coordinator consumer contract; inherited producer DEB verification, not a new installer/GUI test",
    }
    write_json(out / "runtime-binding.json", binding)
    write_json(out / "runtime-consumer-verification.json", verified)
    write_json(out / "runtime-descriptor.json", descriptor)
    print(json.dumps({"source": verified["sourceCommit"], "artifactId": pin["artifactId"], "zipSha256": sha(archive), "tarSha256": pin["tarSha256"], "entryCount": descriptor["entryManifest"]["entries"], "programSha256": binding["programSha256"]}, indent=2))


if __name__ == "__main__":
    main()
