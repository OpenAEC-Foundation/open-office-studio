"""Fetch only the Suite child, validating the pinned official-parent provenance chain."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import runpy
import subprocess
import sys
import zipfile

REPO = "OpenAEC-Foundation/open-office-studio"
PARENT = runpy.run_path(str(Path(__file__).with_name("mac-native-current-fetch.py")))
sha = lambda data: hashlib.sha256(data).hexdigest()


def exact_member(names, name, suffix):
    if (not isinstance(name, str) or not name.endswith(suffix) or "\\" in name
            or PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts
            or names.count(name) != 1):
        raise RuntimeError("One exact safe Suite transfer member required: "+str(name))
    return name


def child_members(value, names):
    descriptor = exact_member(names,value["transferDescriptorMember"],".json")
    dmg = exact_member(names,value["transferDmgMember"],".dmg")
    if [name for name in names if name.endswith(".dmg")] != [dmg]:
        raise RuntimeError("Suite child must contain only its one own DMG")
    return descriptor,dmg


def verify_transfer_origin(value, run, artifact, job):
    if (run["id"] != value["transferRun"] or run["head_sha"] != value["transferCommit"]
            or run["run_attempt"] != value["transferAttempt"]
            or artifact["id"] != value["transferArtifactId"] or artifact["name"] != value["transferArtifactName"]
            or artifact["expired"] or artifact["digest"] != "sha256:"+value["transferArchiveSha256"]
            or artifact["workflow_run"]["id"] != value["transferRun"]
            or artifact["workflow_run"]["head_sha"] != value["transferCommit"]
            or job["id"] != value["transferProducerJob"] or job["run_id"] != value["transferRun"]
            or job["head_sha"] != value["transferCommit"] or job["run_attempt"] != value["transferAttempt"]
            or job["name"] != value["transferProducerJobName"] or job["status"] != "completed"
            or job["conclusion"] != "success"):
        raise RuntimeError("Suite child / preparer job / source / attempt differs")


def verify_descriptor(value, descriptor, data):
    expected_source = {"commit": value["sourceCommit"], "tree": value["sourceTree"], "version": value["declaredVersion"]}
    parent = {"id": value["artifactId"], "run": value["artifactRun"], "producerJobId": value["successfulPlatformJob"],
              "name": value["artifactName"], "sha256": value["archiveSha256"], "attempt": value["artifactAttempt"]}
    member = PurePosixPath(value["packageMember"])
    package = descriptor.get("package", {})
    if (descriptor.get("schemaVersion") != 1 or descriptor.get("app") != "office"
            or descriptor.get("source") != expected_source or descriptor.get("parentArtifact") != parent
            or descriptor.get("member") != str(member) or descriptor.get("memberSHA256DerivedFromVerifiedParent") is not True
            or package.get("filename") != member.name or package.get("bytes") != len(data)
            or package.get("sha256") != sha(data)):
        raise RuntimeError("Suite child bytes do not match the exact verified-parent descriptor")
    if value.get("packageSha256") is not None and value["packageSha256"] != sha(data):
        raise RuntimeError("Suite DMG differs from integration's independent expected hash")


def main():
    request_path, output = Path(sys.argv[1]), Path(sys.argv[2])
    request = request_path.read_bytes(); value = json.loads(request)
    if (value.get("executionApproved") is not True or value.get("suiteChildTransferApproved") is not True
            or value.get("derivePackageIdentityFromVerifiedArchive") is not True
            or value.get("requireSignedNotarized") is not True or value.get("requireExactPackageMember") is not True):
        raise RuntimeError("Explicit official signed Suite child release is required before any download")
    git = lambda *args: subprocess.check_output(["git", *args], text=True).strip()
    if (git("rev-parse", "HEAD") != value["sourceCommit"] or git("rev-parse", "HEAD^{tree}") != value["sourceTree"]
            or git("status", "--porcelain", "--untracked-files=no")):
        raise RuntimeError("Clean exact application source required")
    api = lambda route: json.loads(subprocess.check_output(["gh", "api", f"repos/{REPO}/"+route]))
    official = [api(f"actions/runs/{value['artifactRun']}"), api(f"actions/artifacts/{value['artifactId']}"),
                api(f"actions/jobs/{value['successfulPlatformJob']}")]
    PARENT["verify_platform_origin"](value, *official)
    transfer = [api(f"actions/runs/{value['transferRun']}"), api(f"actions/artifacts/{value['transferArtifactId']}"),
                api(f"actions/jobs/{value['transferProducerJob']}")]
    verify_transfer_origin(value, *transfer)
    output.mkdir(parents=True, exist_ok=False)
    archive = output/"suite-child.zip"
    with archive.open("wb") as handle:
        subprocess.run(["gh", "api", f"repos/{REPO}/actions/artifacts/{value['transferArtifactId']}/zip"], stdout=handle, check=True, timeout=300)
    if sha(archive.read_bytes()) != value["transferArchiveSha256"]:
        raise RuntimeError("Complete Suite child ZIP differs")
    with zipfile.ZipFile(archive) as bundle:
        descriptor_member,dmg_member = child_members(value,bundle.namelist())
        descriptor_bytes = bundle.read(descriptor_member)
        descriptor = json.loads(descriptor_bytes)
        data = bundle.read(dmg_member)
    PARENT["package_member"](value, [value["packageMember"]])
    verify_descriptor(value, descriptor, data)
    package_path = output/PurePosixPath(value["packageMember"]).name; package_path.write_bytes(data)
    identity = dict(value, packageSha256=sha(data), packagePath=str(package_path.resolve()))
    (output/"identity.json").write_text(json.dumps(identity, indent=2), encoding="utf-8")
    (output/"request.json").write_bytes(request)
    (output/"transfer-provenance.json").write_bytes(descriptor_bytes)
    (output/"artifact-origin.json").write_text(json.dumps({"identity": identity, "requestSha256": sha(request),
        "officialRun": official[0], "officialArtifact": official[1], "officialMacJob": official[2],
        "transferRun": transfer[0], "transferArtifact": transfer[1], "transferPreparerJob": transfer[2],
        "descriptorSha256": sha(descriptor_bytes), "parentZipDownloadedByThisRunner": False,
        "scope": "Owner preparer verifies complete official parent ZIP; this runner independently verifies the complete pinned child ZIP and actual Suite DMG before its own native/signature checks"}, indent=2), encoding="utf-8")


if __name__ == "__main__": main()
