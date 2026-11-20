"""Validate a frozen #361 native manifest, then fetch its immutable artifact.

No application is built or launched here. The caller must explicitly approve
execution. The artifact run's head SHA, archive bytes and package bytes must match.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import zipfile

REPO = "OpenAEC-Foundation/open-office-studio"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def validate(value, profile):
    expected = {"linux": "Linux", "macos": "macOS"}
    if profile not in expected or value.get("platform") != expected[profile]:
        raise ValueError("Manifest platform must match the selected native profile")
    for name, size in [("sourceCommit", 40), ("sourceTree", 40),
                       ("archiveSha256", 64), ("packageSha256", 64)]:
        if not re.fullmatch("[a-f0-9]{" + str(size) + "}", value.get(name, "")):
            raise ValueError("Missing immutable identity: " + name)
    for name in ["artifactRun", "artifactId"]:
        if type(value.get(name)) is not int or value[name] <= 0:
            raise ValueError("Positive immutable artifact IDs required")
    member = PurePosixPath(value.get("packageMember", ""))
    if not member.name or member.is_absolute() or ".." in member.parts or "\\" in str(member) or "\n" in str(member):
        raise ValueError("One safe exact package member required")
    if member.suffix != (".deb" if profile == "linux" else ".dmg"):
        raise ValueError("Unexpected native package type")
    if value.get("executionApproved") is not True:
        raise ValueError("Frozen integration execution approval required")
    if profile == "macos" and not re.fullmatch("[a-f0-9]{64}", value.get("executableSha256", "")):
        raise ValueError("Canonical macOS executable hash required")
    for field in ["ribbonHarness", "stylesHarness"]:
        module = value.get(field)
        if module is not None:
            if profile != "linux" or not isinstance(module, dict) or not re.fullmatch("[a-f0-9]{40}", module.get("commit", "")) or not re.fullmatch("[a-f0-9]{64}", module.get("sha256", "")):
                raise ValueError("Optional native module needs its own full commit/hash on Linux: " + field)
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["plan", "fetch"])
    parser.add_argument("profile", choices=["linux", "macos"])
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    if os.environ.get("EXECUTE_NATIVE") != "true":
        raise RuntimeError("Manual native execution gate is disabled")
    raw = os.environ.get("FROZEN_MANIFEST", "")
    value = validate(json.loads(raw), args.profile)
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    if digest(canonical) != os.environ.get("FROZEN_MANIFEST_SHA256"):
        raise RuntimeError("Frozen canonical manifest SHA256 differs")
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_bytes(canonical)
    if args.mode == "plan":
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write("source_commit=" + value["sourceCommit"] + "\n")
            output.write("runner=" + ("ubuntu-22.04" if args.profile == "linux" else "macos-latest") + "\n")
            output.write("ribbon_commit=" + (value.get("ribbonHarness") or {}).get("commit", "") + "\n")
            output.write("styles_commit=" + (value.get("stylesHarness") or {}).get("commit", "") + "\n")
        return
    git = lambda *parts: subprocess.check_output(["git", *parts], text=True).strip()
    if git("rev-parse", "HEAD") != value["sourceCommit"] or git("rev-parse", "HEAD^{tree}") != value["sourceTree"]:
        raise RuntimeError("Application checkout is not the frozen codepoint")
    def api(route):
        return json.loads(subprocess.check_output(["gh", "api", f"repos/{REPO}/{route}"], text=True))
    run = api(f"actions/runs/{value['artifactRun']}")
    artifact = api(f"actions/artifacts/{value['artifactId']}")
    if run["head_sha"] != value["sourceCommit"] or artifact["expired"] or artifact["workflow_run"]["id"] != value["artifactRun"] or artifact["workflow_run"]["head_sha"] != value["sourceCommit"]:
        raise RuntimeError("Canonical artifact is expired or belongs to another source/run")
    folder = args.manifest.parent / "input"
    folder.mkdir(exist_ok=False)
    archive = folder / "canonical.zip"
    with archive.open("wb") as output:
        subprocess.run(["gh", "api", f"repos/{REPO}/actions/artifacts/{value['artifactId']}/zip"], stdout=output, check=True, timeout=180)
    if digest(archive.read_bytes()) != value["archiveSha256"]:
        raise RuntimeError("Downloaded artifact archive SHA256 differs")
    with zipfile.ZipFile(archive) as bundle:
        package = bundle.read(value["packageMember"])
    if digest(package) != value["packageSha256"]:
        raise RuntimeError("Canonical package SHA256 differs")
    package_path = folder / PurePosixPath(value["packageMember"]).name
    package_path.write_bytes(package)
    identity = dict(value, packagePath=str(package_path.resolve()))
    (folder / "identity.json").write_text(json.dumps(identity, indent=2), encoding="utf-8")
    (folder / "artifact-origin.json").write_text(json.dumps({"sourceCommit": run["head_sha"], "run": value["artifactRun"], "artifactId": artifact["id"], "artifactName": artifact["name"], "archiveSha256": digest(archive.read_bytes()), "packageSha256": digest(package)}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
