"""Fail-closed source/package contracts; no GUI or application imports."""
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
import hashlib
import re

VERSION = "2026.48.1"
APPS = {
    "writer": ("Open Writer Studio", "open-writer-studio", "org.openaec.writer-studio"),
    "spreadsheet": ("Open Spreadsheet Studio", "open-spreadsheet-studio", "org.openaec.spreadsheet-studio"),
    "presentation": ("Open Presentation Studio", "open-presentation-studio", "org.openaec.presentation-studio"),
    "email": ("Open Email Studio", "open-email-studio", "org.openaec.email-studio"),
    "notition": ("Open Notition Studio", "open-notition-studio", "org.openaec.notition-studio"),
    "database": ("Open Database Studio", "open-database-studio", "org.openaec.database-studio"),
}
SUITE_ID = "org.openaec.office-studio"


def digest(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def hex_value(value, length):
    return isinstance(value, str) and re.fullmatch("[0-9a-f]{" + str(length) + "}", value) is not None


def validate_request(value, now=None):
    now = now or datetime.now(timezone.utc)
    if value.get("schemaVersion") != 1 or value.get("scope") != "macos-standalone-six":
        raise ValueError("Unexpected standalone request scope")
    if value.get("executionApproved") is not True:
        raise PermissionError("Coordinator has not released native package execution")
    source = value.get("source", {})
    if source.get("version") != VERSION or not all(hex_value(source.get(k), 40) for k in ("commit", "tree")):
        raise ValueError("Exact new48.1 commit/tree/version required")
    cutoff = datetime.fromisoformat(value["expiresAt"].replace("Z", "+00:00"))
    if cutoff.tzinfo is None or now >= cutoff:
        raise PermissionError("Native request expired")
    parent = value.get("parentArtifact", {})
    if not all(type(parent.get(k)) is int and parent[k] > 0 for k in ("id", "run", "producerJobId")):
        raise ValueError("Exact producer artifact/run/job identity required")
    if not hex_value(parent.get("sha256"), 64) or not isinstance(parent.get("name"), str) or not parent["name"]:
        raise ValueError("Immutable parent name and archive digest required")
    packages = value.get("packages", {})
    if set(packages) != set(APPS):
        raise ValueError("Exactly six dedicated apps required; suite must not be selected")
    members = set()
    for key, package in packages.items():
        member = package.get("member", "")
        path = PurePosixPath(member)
        expected = APPS[key][0] + "_" + VERSION + "_aarch64.dmg"
        if (not member or "\\" in member or path.is_absolute() or ".." in path.parts
                or path.name.replace(".", " ").split("_", 1)[0] != APPS[key][0]
                or path.name not in (expected, expected.replace(" ", "."))):
            raise ValueError("Wrong/unsafe per-app DMG member: " + key)
        parent_bound = package.get("sha256") is None and package.get("hashBinding") == "verified-parent-archive"
        if member in members or not (hex_value(package.get("sha256"), 64) or parent_bound):
            raise ValueError("Duplicate member or missing package digest")
        members.add(member)
    files = value.get("harnessFiles", {})
    if not files or any(not p.startswith("scripts/standalone-macos/") or ".." in PurePosixPath(p).parts
                        or not hex_value(h, 64) for p, h in files.items()):
        raise ValueError("Exact own QA-file digest map required")
    if "reuseTransfersFromRun" in value and (type(value["reuseTransfersFromRun"]) is not int or value["reuseTransfersFromRun"]<=0):
        raise ValueError("Exact previous own transfer run identity required")
    return value


def verify_package(request,proof,folder,app):
    """Same app bytes/source chain on every fresh host or QA-only driver retry."""
    folder=Path(folder).resolve()
    if proof.get("app")!=app or proof.get("source")!=request["source"] or proof.get("parentArtifact")!=request["parentArtifact"]:
        raise ValueError("Transferred app proof differs from coordinator source/parent")
    if proof.get("member")!=request["packages"][app]["member"]:
        raise ValueError("Transferred archive member differs")
    candidates=list(folder.glob("*.dmg"))
    if len(candidates)!=1:raise ValueError("Exactly one standalone DMG permitted on app host")
    dmg=candidates[0]
    if dmg.is_symlink() or not dmg.resolve().is_relative_to(folder):raise ValueError("Transferred DMG must be an own regular file")
    expected=request["packages"][app]["sha256"]
    if (dmg.name!=Path(proof["member"]).name or proof.get("package",{}).get("filename")!=dmg.name
        or proof["package"].get("bytes")!=dmg.stat().st_size or digest(dmg)!=proof["package"].get("sha256")
        or (expected is not None and proof["package"].get("sha256")!=expected)
        or (expected is None and proof.get("memberSHA256DerivedFromVerifiedParent") is not True)):
        raise ValueError("Transferred DMG bytes/name/hash differ")
    return dmg


def validate_bundle(info, app, executable_sha=None):
    if app not in APPS:
        raise ValueError("Only standalone applications are accepted")
    name, binary, identifier = APPS[app]
    if info.get("CFBundleIdentifier") != identifier or info.get("CFBundleExecutable") != binary:
        raise ValueError("Actual bundle identifier/executable differs")
    if info.get("CFBundleShortVersionString") != VERSION:
        raise ValueError("Actual installed app is not new48.1")
    if info.get("CFBundleName") not in (name, binary, None):
        raise ValueError("Unexpected actual product name")
    if executable_sha is not None and not hex_value(executable_sha, 64):
        raise ValueError("Actual executable hash unavailable")


def verify_under(path, owned_root):
    path, owned_root = Path(path).resolve(), Path(owned_root).resolve()
    if path == owned_root or not path.is_relative_to(owned_root):
        raise ValueError("Target escapes owned resource root")
    return path


def validate_producer(request, run, artifact, job):
    """Platform completion is sufficient; unrelated platforms need not finish."""
    parent = request["parentArtifact"]
    if run.get("id") != parent["run"] or run.get("head_sha") != request["source"]["commit"]:
        raise ValueError("Producer run source differs")
    if (artifact.get("id") != parent["id"] or artifact.get("name") != parent["name"]
            or artifact.get("expired") is not False
            or artifact.get("workflow_run", {}).get("id") != parent["run"]
            or artifact.get("workflow_run", {}).get("head_sha") != request["source"]["commit"]):
        raise ValueError("Artifact source/identity differs or is expired")
    if artifact.get("digest") not in (None, "sha256:" + parent["sha256"]):
        raise ValueError("Published artifact digest differs")
    if job.get("id") != parent["producerJobId"] or job.get("status") != "completed" or job.get("conclusion") != "success":
        raise PermissionError("Own Mac producer job has not completed successfully")
    if job.get("run_id") != parent["run"]:
        raise ValueError("Producer job belongs to another run")


def acceptance_from_evidence(value):
    required = ("identityVerified", "suiteAbsent", "freshProfileVerified", "ownCwdEnvironmentVerified",
                "nativeFocusVerified", "nativeSaveVerified", "outputOraclePassed", "fullQuitVerified",
                "newPidReopenVerified", "resourceObservationsReviewed", "resourceIndependencePassed",
                "functionalCaseCompleted", "visualReviewPassed", "cleanupPassed")
    if value.get("app") not in APPS or value.get("failure") or not all(value.get(key) is True for key in required):
        return False
    return value["app"] not in ("writer","spreadsheet","presentation") or value.get("ownConverterChildObserved") is True
