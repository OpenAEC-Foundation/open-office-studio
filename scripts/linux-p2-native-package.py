"""Consume the pinned recovered P2 Office DEB. No build or second Desktop ZIP."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import zipfile

REPO = "OpenAEC-Foundation/open-office-studio"
SOURCE = "dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b"
TREE = "5a644e397ecc6af5452a49b6404edf953687d1b2"
DESCRIPTOR_SHA = "fc296348a7029ecd9740575664a18ab4bbc0a501f6bc7d90a8657e91a9809a92"
DESCRIPTOR = Path(__file__).resolve().parent.parent / "tests/fixtures/linux-p2/native-input-descriptor.json"


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for data in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(data)
    return result.hexdigest()


def descriptor(bytes_value):
    assert hashlib.sha256(bytes_value).hexdigest() == DESCRIPTOR_SHA, "Exact coordinator descriptor bytes"
    value = json.loads(bytes_value)
    assert value["schemaVersion"] == 1
    assert value["parent"]["sourceCommit"] == SOURCE
    assert value["parent"]["sourceTree"] == TREE
    assert value["parent"]["appVersion"] == "2026.48.1"
    assert value["parent"]["run"] == 45143305147
    assert value["parent"]["job"] == 137586343061
    assert value["parent"]["jobConclusion"] == "success"
    assert value["debSha256"] == value["parent"]["deb"]["sha256"]
    assert value["expectedInstalledElfSha256"] == value["parent"]["officeExecutableMetadataOnly"]["sha256"]
    return value


def verify_artifact(actual, *, artifact_id, name, run, source, sha256, size):
    assert actual["id"] == artifact_id and actual["name"] == name
    assert actual["expired"] is False
    assert actual["digest"] == "sha256:" + sha256, "Official artifact digest"
    assert actual["size_in_bytes"] == size, "Official artifact size"
    assert actual["workflow_run"]["id"] == run, "Artifact run binding"
    assert actual["workflow_run"]["head_sha"] == source, "Artifact source binding"


def copy_verified_member(archive, destination, member, size, sha256):
    path = PurePosixPath(member)
    assert not path.is_absolute() and ".." not in path.parts and "\\" not in member
    with zipfile.ZipFile(archive) as bundle:
        matches = [info for info in bundle.infolist() if info.filename == member]
        assert len(matches) == 1, "Exactly one pinned DEB member"
        info = matches[0]
        assert not info.is_dir() and info.file_size == size
        with bundle.open(info) as source, destination.open("xb") as target:
            shutil.copyfileobj(source, target, 1024 * 1024)
    assert destination.stat().st_size == size
    assert digest(destination) == sha256, "Actual DEB bytes"


def api(path):
    return json.loads(subprocess.check_output(["gh", "api", f"repos/{REPO}/{path}"]))


def download(artifact_id, destination):
    with destination.open("xb") as stream:
        subprocess.run(["gh", "api", f"repos/{REPO}/actions/artifacts/{artifact_id}/zip"], stdout=stream, check=True)


def main():
    assert sys.platform == "linux" and os.environ.get("GITHUB_ACTIONS") == "true", "Disposable Linux runner only"
    git = lambda *args: subprocess.check_output(["git", *args], text=True).strip()
    assert git("rev-parse", "HEAD") == SOURCE
    assert git("rev-parse", "HEAD^{tree}") == TREE
    assert git("status", "--porcelain", "--untracked-files=no") == ""
    assert json.loads(Path("package.json").read_text())["version"] == "2026.48.1"
    value = descriptor(DESCRIPTOR.read_bytes())
    parent, recovered = value["parent"], value["artifact"]
    canonical = api(f"actions/runs/{parent['run']}")
    assert canonical["head_sha"] == SOURCE
    # Only this exact ready Linux job is required; do not wait for another platform.
    job = api(f"actions/jobs/{parent['job']}")
    assert job["run_id"] == parent["run"] and job["status"] == "completed" and job["conclusion"] == "success"
    parent_artifact = api(f"actions/artifacts/{parent['installerArchive']['id']}")
    report_artifact = api(f"actions/artifacts/{parent['reportArchive']['id']}")
    for actual, expected in [(parent_artifact, parent["installerArchive"]), (report_artifact, parent["reportArchive"])]:
        verify_artifact(actual, artifact_id=expected["id"], name=expected["name"], run=parent["run"],
                        source=SOURCE, sha256=expected["sha256"], size=expected["bytes"])
    recovery_run = api(f"actions/runs/{recovered['run']}")
    assert recovery_run["head_sha"] == value["qaPin"]["producerCommit"]
    artifact = api(f"actions/artifacts/{recovered['id']}")
    verify_artifact(artifact, artifact_id=recovered["id"], name=recovered["name"], run=recovered["run"],
                    source=value["qaPin"]["producerCommit"], sha256=recovered["zipSha256"], size=recovered["zipBytes"])
    out = Path(".local/linux-p2-input")
    out.mkdir(parents=True, exist_ok=False)
    (out / "native-input-descriptor.json").write_bytes(DESCRIPTOR.read_bytes())
    # Small independent report download, never the 811MB parent installer archive.
    report_zip = out / "canonical-package-report.zip"
    download(report_artifact["id"], report_zip)
    assert digest(report_zip) == parent["reportArchive"]["sha256"]
    with zipfile.ZipFile(report_zip) as bundle:
        reports = [bundle.read(i) for i in bundle.infolist() if not i.is_dir()]
    reports = [data for data in reports if hashlib.sha256(data).hexdigest() == parent["packageReportSha256"]]
    assert len(reports) == 1, "Exact canonical package report"
    (out / "canonical-package-report.json").write_bytes(reports[0])
    archive = out / "native-input.zip"
    download(recovered["id"], archive)
    assert archive.stat().st_size == recovered["zipBytes"] and digest(archive) == recovered["zipSha256"]
    package = out / "canonical-office.deb"
    copy_verified_member(archive, package, value["debMember"], parent["deb"]["bytes"], value["debSha256"])
    for field, expected in parent["deb"]["control"].items():
        assert subprocess.check_output(["dpkg-deb", "-f", str(package), field], text=True).strip() == expected, field
    extracted = out / "deb-payload"
    subprocess.run(["dpkg-deb", "--extract", str(package), str(extracted)], check=True)
    payload = extracted / "usr/bin/open-office-studio"
    assert payload.stat().st_size == parent["officeExecutableMetadataOnly"]["bytes"]
    with payload.open("rb") as stream:
        header = stream.read(20)
    assert header[:6] == b"\x7fELF\x02\x01" and int.from_bytes(header[18:20], "little") == 62
    assert digest(payload) == value["expectedInstalledElfSha256"]
    subprocess.run(["sudo", "dpkg", "--install", str(package)], check=True)
    installed = Path("/usr/bin/open-office-studio")
    assert installed.stat().st_size == payload.stat().st_size
    assert digest(installed) == value["expectedInstalledElfSha256"], "Mandatory actual installed ELF gate"
    identity = dict(sourceCommit=SOURCE, sourceTree=TREE, version=parent["appVersion"],
                    artifactRun=parent["run"], artifactId=parent_artifact["id"], artifactName=parent_artifact["name"],
                    archiveSha256=parent["installerArchive"]["sha256"], nativeInput=recovered,
                    descriptorSha256=DESCRIPTOR_SHA, descriptorGit="7c5c4d9f0084467f37f9c68a4181d0f1c9f0c79e",
                    packageMember=value["debMember"], packagePath=str(package.resolve()), packageSha256=value["debSha256"],
                    executableSha256=digest(installed), executionApproved=True,
                    scope="Actual P2 installed DEB; separate from 420 and from later release packages")
    (out / "identity.json").write_text(json.dumps(identity, indent=2) + "\n")
    (out / "api-run.json").write_text(json.dumps({"canonical": canonical, "linuxJob": job, "parentInstallerArtifact": parent_artifact,
                                                  "packageReportArtifact": report_artifact, "recoveryRun": recovery_run,
                                                  "inputArtifact": artifact}, indent=2) + "\n")
    print(json.dumps(identity, indent=2))


if __name__ == "__main__":
    main()
