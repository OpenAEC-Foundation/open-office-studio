"""Validate a frozen #361 native manifest, then fetch its immutable artifact.

No application is built or launched here. The caller must explicitly approve
execution. The artifact run's head SHA, archive bytes and package bytes must match.
"""
import argparse
import base64
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


def verify_root_candidate(value):
    """Preserve and verify the coordinator's exact bytes, not a reserialized copy."""
    try:
        if value.get("qaScope") == "find-baseline-only":
            raw = base64.b64decode(value["rootBaselineProofBase64"], validate=True)
            if digest(raw) != value["rootBaselineProofSha256"]:
                raise ValueError("G baseline proof byte hash differs")
            proof = json.loads(raw)
            if proof.get("diagnosticOnly") is not True or proof.get("doesNotReplaceI3Acceptance") is not True or proof.get("previousActualSourceCheckoutVerified") is not True or proof.get("previousGAndI3DriverBytesIdentical") is not True:
                raise ValueError("Root must identify the older G proof as diagnostic only")
            for source, target in [("sourceCommit", "sourceCommit"), ("sourceTree", "sourceTree"), ("canonicalRun", "artifactRun"), ("artifactId", "artifactId"), ("archiveSha256", "archiveSha256"), ("packageMember", "packageMember"), ("packageSha256", "packageSha256"), ("packagedExecutableSha256", "executableSha256"), ("expectedDriverSha256", "expectedDriverSha256"), ("expectedWebkitPackages", "expectedWebkitPackages")]:
                if proof.get(source) != value.get(target):
                    raise ValueError("G baseline identity differs: " + source)
            return raw, {"name": "open-office-studio-Linux"}
        raw = base64.b64decode(value["rootFrozenCandidateBase64"], validate=True)
        expected = value["rootFrozenCandidateSha256"]
        if not re.fullmatch("[a-f0-9]{64}", expected) or digest(raw) != expected:
            raise ValueError("Root frozen candidate byte hash differs")
        candidate = json.loads(raw)
        if candidate.get("schemaVersion") != 1 or candidate.get("frozen") is not True or candidate.get("applicationCommit") != value["sourceCommit"] or candidate.get("desktopRun") != value["artifactRun"]:
            raise ValueError("Root frozen candidate source/run differs")
        artifact = candidate["artifacts"][value["platform"]]
        matches = [p for p in artifact["packages"] if p["path"] == value["packageMember"]]
        if artifact["archiveSha256"] != value["archiveSha256"] or len(matches) != 1 or matches[0]["sha256"] != value["packageSha256"]:
            raise ValueError("Root frozen candidate archive/package differs")
        return raw, artifact
    except (KeyError, TypeError) as error:
        raise ValueError("Exact coordinator candidate bytes and selected identity required") from error


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
    executable_sha = value.get("executableSha256")
    if executable_sha is not None and not re.fullmatch("[a-f0-9]{64}", executable_sha):
        raise ValueError("Invalid canonical executable hash")
    if profile == "macos" and executable_sha is None and value.get("deriveExecutableFromVerifiedDmg") is not True:
        raise ValueError("Canonical macOS executable hash or explicit verified-DMG derivation required")
    for field in ["ribbonHarness", "stylesHarness"]:
        module = value.get(field)
        if module is not None:
            if profile != "linux" or not isinstance(module, dict) or not re.fullmatch("[a-f0-9]{40}", module.get("commit", "")) or not re.fullmatch("[a-f0-9]{64}", module.get("sha256", "")):
                raise ValueError("Optional native module needs its own full commit/hash on Linux: " + field)
    scope = value.get("qaScope")
    if scope == "find-baseline-only":
        if profile != "linux" or value.get("diagnosticOnly") is not True or value.get("doesNotReplaceI3Acceptance") is not True or any(value.get(k) is not None for k in ["remainingCoverage", "ribbonHarness", "stylesHarness"]) or value.get("originalI3Find", {}).get("status") != "failed":
            raise ValueError("G Find baseline is diagnostic only, with I3 failure retained and no acceptance/module reuse")
    elif scope is not None and (profile != "linux" or scope != "362-only" or value.get("remainingCoverage") is None or value.get("ribbonHarness") is None or value.get("stylesHarness") is not None):
        raise ValueError("362-only needs Linux, inherited failure, a362 pin and no363 pin")
    viewport = value.get("macViewportSetup")
    if viewport is not None and (profile != "macos" or viewport != {"mode": "native-maximize-once", "executionApproved": True}):
        raise ValueError("One native Mac viewport setup requires its own exact release")
    remaining = value.get("remainingCoverage")
    if remaining is not None:
        if profile != "linux" or not isinstance(remaining, dict) or remaining.get("executionApproved") is not True:
            raise ValueError("Remaining Linux coverage requires its own explicit execution release")
        if type(remaining.get("run")) is not int or remaining["run"] <= 0 or not re.fullmatch("[a-f0-9]{64}", remaining.get("reportSha256", "")) or not re.fullmatch("[a-f0-9]{40}", remaining.get("harnessCommit", "")) or not isinstance(remaining.get("reportBase64"), str):
            raise ValueError("Remaining coverage needs an immutable previous report identity")
    verify_root_candidate(value)
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
    root_raw, root_artifact = verify_root_candidate(value)
    run = api(f"actions/runs/{value['artifactRun']}")
    artifact = api(f"actions/artifacts/{value['artifactId']}")
    if run["status"] != "completed" or run["conclusion"] != "success" or artifact["name"] != root_artifact["name"] or run["head_sha"] != value["sourceCommit"] or artifact["expired"] or artifact["workflow_run"]["id"] != value["artifactRun"] or artifact["workflow_run"]["head_sha"] != value["sourceCommit"]:
        raise RuntimeError("Canonical artifact is expired or belongs to another source/run")
    folder = args.manifest.parent / "input"
    folder.mkdir(exist_ok=False)
    proof_name = "root-baseline-proof.json" if value.get("diagnosticOnly") else "root-frozen-candidate.json"
    (folder / proof_name).write_bytes(root_raw)
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
    (folder / "artifact-origin.json").write_text(json.dumps({"sourceCommit": run["head_sha"], "run": value["artifactRun"], "artifactId": artifact["id"], "artifactName": artifact["name"], ("rootBaselineProofSha256" if value.get("diagnosticOnly") else "rootFrozenCandidateSha256"): digest(root_raw), "archiveSha256": digest(archive.read_bytes()), "packageSha256": digest(package)}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
