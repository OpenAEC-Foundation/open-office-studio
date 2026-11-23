"""Fetch one Mac package independently of unrelated platform jobs; never launch it."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys
import zipfile

REPO = "OpenAEC-Foundation/open-office-studio"


def package_member(value, names):
    pinned = value.get("packageMember")
    if value.get("requireExactPackageMember") is True and not isinstance(pinned, str):
        raise RuntimeError("This producer requires an explicitly pinned DMG member")
    if pinned is not None and (not isinstance(pinned, str) or not pinned.endswith(".dmg")):
        raise RuntimeError("Exact DMG member pin required")
    candidates = [n for n in names if n.endswith(".dmg") and (pinned is None or n == pinned)]
    if len(candidates) != 1:
        raise RuntimeError("Expected one exact DMG member in the canonical archive")
    member = PurePosixPath(candidates[0])
    if member.is_absolute() or ".." in member.parts or "\\" in str(member) or value["declaredVersion"] not in member.name:
        raise RuntimeError("DMG member identity/version differs")
    return str(member)


def verify_platform_origin(value, run, artifact, job):
    source = value["sourceCommit"]
    if (run["id"] != value["artifactRun"] or run["head_sha"] != source
            or artifact["id"] != value["artifactId"] or artifact["expired"]
            or artifact["name"] != value["artifactName"]
            or artifact["workflow_run"]["id"] != run["id"]
            or artifact["workflow_run"]["head_sha"] != source
            or artifact.get("digest") != "sha256:" + value["archiveSha256"]
            or job["id"] != value["successfulPlatformJob"]
            or job["run_id"] != run["id"] or job["head_sha"] != source
            or job["name"] != value["successfulPlatformJobName"]
            or job["status"] != "completed" or job["conclusion"] != "success"
            or "macos-latest" not in job["labels"]):
        raise RuntimeError("Exact successful Mac job / artifact / source identity differs")
    if value.get("artifactAttempt") is not None and (run.get("run_attempt") != value["artifactAttempt"]
            or job.get("run_attempt") != value["artifactAttempt"]):
        raise RuntimeError("Official Mac producer attempt differs")


def main():
    request_path, output = Path(sys.argv[1]), Path(sys.argv[2])
    request_bytes = request_path.read_bytes()
    value = json.loads(request_bytes)
    if value.get("executionApproved") is not True or value.get("derivePackageIdentityFromVerifiedArchive") is not True:
        raise RuntimeError("Explicit frozen package derivation required")
    git = lambda *args: subprocess.check_output(["git", *args], text=True).strip()
    if (git("rev-parse", "HEAD") != value["sourceCommit"]
            or git("rev-parse", "HEAD^{tree}") != value["sourceTree"]
            or git("status", "--porcelain", "--untracked-files=no")):
        raise RuntimeError("Clean exact application checkout required")
    api = lambda route: json.loads(subprocess.check_output(["gh", "api", f"repos/{REPO}/" + route], text=True))
    run = api(f"actions/runs/{value['artifactRun']}")
    artifact = api(f"actions/artifacts/{value['artifactId']}")
    job = api(f"actions/jobs/{value['successfulPlatformJob']}")
    verify_platform_origin(value, run, artifact, job)
    output.mkdir(parents=True, exist_ok=False)
    archive = output / "canonical.zip"
    with archive.open("wb") as handle:
        subprocess.run(["gh", "api", f"repos/{REPO}/actions/artifacts/{value['artifactId']}/zip"], stdout=handle, check=True, timeout=300)
    sha = lambda data: hashlib.sha256(data).hexdigest()
    if sha(archive.read_bytes()) != value["archiveSha256"]:
        raise RuntimeError("Canonical artifact ZIP differs")
    with zipfile.ZipFile(archive) as bundle:
        member = PurePosixPath(package_member(value, bundle.namelist()))
        package = bundle.read(str(member))
    if value.get("packageSha256") is not None and sha(package) != value["packageSha256"]:
        raise RuntimeError("Canonical DMG differs from its independent expected hash")
    package_path = output / member.name
    package_path.write_bytes(package)
    identity = dict(value, packageMember=str(member), packageSha256=sha(package), packagePath=str(package_path.resolve()))
    (output / "identity.json").write_text(json.dumps(identity, indent=2), encoding="utf-8")
    (output / "request.json").write_bytes(request_bytes)
    origin = {"requestSha256": sha(request_bytes), "wholeRunConclusion": run["conclusion"],
              "successfulPlatformJob": job, "artifact": artifact, "identity": identity,
              "packageHashOrigin": "Derived read-only from independently pinned and verified canonical ZIP before native launch"}
    (output / "artifact-origin.json").write_text(json.dumps(origin, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
