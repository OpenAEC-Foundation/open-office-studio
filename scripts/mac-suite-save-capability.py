"""One CI-only metadata probe. Never launches, attaches to or operates the app."""
import argparse
from datetime import datetime, timezone, timedelta
import hashlib
import json
import os
from pathlib import Path
import platform
import plistlib
import shutil
import signal
import subprocess
import tempfile

REPO = "OpenAEC-Foundation/open-office-studio"
BRANCH = "codex/mac-suite-save-capability-20261124"
APP = "b696ab86bd1c128729a079b68c0082e6df3d36a5"
TREE = "e30879fd772871e690847c061ef66e6b81808a05"
DMG_SHA = "1d0cb79f23e1e082d1aa4e32aa1dd3997c297fb0cb2629aa530a3e29e685c4af"
EXE_SHA = "0c6a58c7438f1ba2b3b9b1e74ea23e29fb9a93523723bc5694bb3727702a9d87"
PRODUCTS = ("Office", "Writer", "Spreadsheet", "Presentation", "Email", "Notition", "Database")
sha = lambda b: hashlib.sha256(b).hexdigest()


def moment(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.utcoffset() is None:
        raise ValueError("Timezone required")
    return result


def validate_request(value, now):
    if (value.get("executionApproved") is not True or value.get("metadataCapabilityApproved") is not True
            or value.get("metadataOnly") is not True or value.get("maximumHosts") != 1
            or value.get("maximumWorkflowMinutes") != 15 or value.get("allowedBranch") != BRANCH
            or value.get("sourceCommit") != APP or value.get("sourceTree") != TREE or value.get("declaredVersion") != "2026.48.1"
            or value.get("packageSha256") != DMG_SHA or value.get("executableSha256") != EXE_SHA):
        raise PermissionError("Exact single-host metadata-only authorization required")
    for key in ("nativeBodyAcceptanceApproved", "saveTransportDifferentialApproved", "appLaunchApproved",
                "inputApproved", "captureApproved", "attachApproved", "instrumentationApproved"):
        if value.get(key) is not False:
            raise PermissionError("Forbidden or ambiguous action authorization: " + key)
    issued, expiry = moment(value["issuedAtUTC"]), moment(value["expiresAtUTC"])
    if not issued <= now < expiry or not timedelta(0) < expiry-issued <= timedelta(hours=2):
        raise PermissionError("Capability request expired, future-dated or overlong")
    required = {"scripts/mac-suite-save-capability.py", "scripts/mac-suite-save-privacy.swift",
                "scripts/mac-native-suite-transfer-fetch.py", "scripts/mac-native-current-fetch.py",
                "scripts/mac-native-producer-source.py", ".github/workflows/mac-suite-save-capability.yml"}
    if set(value.get("probeSourceSha256", {})) != required:
        raise PermissionError("Complete exact probe/dependency/workflow source manifest required")


def entitlement_plist(stdout):
    # codesign puts explanatory metadata on stderr; stdout must be the full plist.
    if not stdout.strip():
        return {"status": "empty-stdout-no-declared-entitlements-returned", "value": None}
    value = plistlib.loads(stdout)
    if not isinstance(value, dict):
        raise ValueError("Entitlements must be a dictionary")
    return {"status": "parsed", "value": value}


def check_identity(info, program_bytes):
    expected = {"CFBundleIdentifier": "org.openaec.office-studio", "CFBundleExecutable": "open-office-studio",
                "CFBundleShortVersionString": "2026.48.1"}
    if any(info.get(k) != v for k, v in expected.items()) or sha(program_bytes) != EXE_SHA:
        raise ValueError("Suite identity/version/executable differs from frozen signed P5")


def assigned_host_start(job, created):
    # GitHub can fill job.started_at while it is queued and unassigned. Only a
    # completed actual setup step demonstrates that this host started executing.
    steps = [s for s in job.get("steps", []) if s.get("name") == "Set up job"
             and s.get("status") == "completed" and s.get("conclusion") == "success"]
    if job.get("status") != "in_progress" or not job.get("runner_id") or not job.get("runner_name") or len(steps) != 1:
        raise PermissionError("Actual assigned running host/setup step not proven")
    started = moment(steps[0]["started_at"])
    if not timedelta(0) <= started-moment(created) <= timedelta(minutes=30):
        raise PermissionError("Queue interval exceeds frozen30minute limit")
    return started


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def command_runner(out, report, deadline):
    def run(name, argv, required=False, seconds=60, cleanup=False):
        remaining = int((deadline - datetime.now(timezone.utc)).total_seconds()) - 90
        if remaining <= 0 and not cleanup:
            raise TimeoutError("Reserve cleanup/upload time; no more probe commands")
        started = datetime.now(timezone.utc).isoformat()
        try:
            result = subprocess.run(argv, capture_output=True, timeout=seconds if cleanup else min(seconds, remaining), check=False)
        except subprocess.TimeoutExpired as error:
            result = subprocess.CompletedProcess(argv, 124, error.stdout or b"", error.stderr or b"")
        except OSError as error:
            result = subprocess.CompletedProcess(argv, 127, b"", str(error).encode())
        record = {"name": name, "argv": argv, "startedAtUTC": started,
                  "endedAtUTC": datetime.now(timezone.utc).isoformat(), "returncode": result.returncode}
        for kind in ("stdout", "stderr"):
            payload = getattr(result, kind)
            p = out / (name + "." + kind)
            p.write_bytes(payload)
            record[kind] = {"file": p.name, "bytes": len(payload), "sha256": sha(payload)}
        report["commands"].append(record)
        save(out / "report.json", report)
        if required and result.returncode != 0:
            raise RuntimeError("Required metadata command failed: " + name)
        return result
    return run


def guard(request, out):
    value = json.loads(request.read_bytes()); now = datetime.now(timezone.utc)
    validate_request(value, now)
    if (platform.system() != "Darwin" or platform.machine() != "arm64"
            or os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("RUNNER_ENVIRONMENT") != "github-hosted"
            or os.environ.get("GITHUB_REPOSITORY") != REPO or os.environ.get("GITHUB_REF") != "refs/heads/"+BRANCH
            or os.environ.get("GITHUB_RUN_ATTEMPT") != "1"):
        raise PermissionError("Fresh hosted ARM64 Mac, exact branch and attempt1 only")
    harness = Path(__file__).resolve().parent.parent
    actual = subprocess.check_output(["git", "-C", str(harness), "rev-parse", "HEAD"], text=True).strip()
    if actual != os.environ.get("GITHUB_SHA"):
        raise PermissionError("Actual QA checkout differs from this workflow run")
    if subprocess.check_output(["git", "-C", str(harness), "status", "--porcelain", "--untracked-files=no"], text=True):
        raise PermissionError("QA tracked tree is modified")
    for name, expected in value["probeSourceSha256"].items():
        if sha((harness/name).read_bytes()) != expected:
            raise PermissionError("Frozen probe source changed: " + name)
    run_id = os.environ["GITHUB_RUN_ID"]
    api = lambda route: json.loads(subprocess.check_output(["gh", "api", "repos/"+REPO+"/"+route], timeout=45))
    current = api("actions/runs/"+run_id+"/attempts/1")
    jobs = api("actions/runs/"+run_id+"/attempts/1/jobs")["jobs"]
    if (current["head_sha"] != actual or current["head_branch"] != BRANCH or current["event"] != "push"
            or current["path"] != ".github/workflows/mac-suite-save-capability.yml"
            or current["run_attempt"] != 1 or len(jobs) != 1
            or jobs[0]["name"] != "metadata-only" or jobs[0]["run_attempt"] != 1):
        raise PermissionError("Exact one-job workflow source/run/attempt binding differs")
    started = assigned_host_start(jobs[0], current["created_at"])
    deadline = started + timedelta(minutes=15)
    if now > deadline-timedelta(minutes=10):
        raise PermissionError("Insufficient time for acquisition, probe and cleanup")
    if any((Path("/Applications")/("Open "+p+" Studio.app")).exists() for p in PRODUCTS):
        raise PermissionError("Unexpected preinstalled Office component on dedicated host")
    profile = Path.home()/"Library/Application Support/org.openaec.office-studio"
    if profile.exists():
        raise PermissionError("Unexpected existing Suite profile; do not touch it")
    report = {"status": "guard-passed", "requestSha256": sha(request.read_bytes()), "qaCommit": actual,
              "run": current, "job": jobs[0], "workflowDeadlineUTC": deadline.isoformat(),
              "noExistingSuiteProfile": True, "noExistingOfficeApplications": True,
              "scope": "Metadata only; no app/input/capture/attach/instrumentation/security mutation"}
    out.mkdir(parents=True, exist_ok=False); save(out/"guard.json", report)


def inspect(identity_path, request, out):
    value = json.loads(request.read_bytes()); validate_request(value, datetime.now(timezone.utc))
    identity = json.loads(identity_path.read_bytes())
    preflight = json.loads((out/"guard.json").read_bytes())
    if identity.get("sourceCommit") != APP or identity.get("sourceTree") != TREE:
        raise PermissionError("Acquired Suite source differs")
    if (identity.get("metadataCapabilityApproved") is not True or identity.get("nativeBodyAcceptanceApproved") is not False
            or sha(request.read_bytes()) != preflight["requestSha256"]):
        raise PermissionError("Acquisition changed metadata-only request")
    package = Path(identity["packagePath"]).resolve(strict=True)
    if sha(package.read_bytes()) != DMG_SHA:
        raise ValueError("Acquired package hash differs")
    report = {"status": "running", "nativePass": False, "causalTracePerformed": False,
              "originalSaveCause": "OPEN", "identity": identity, "qaCommit": preflight["qaCommit"],
              "runId": os.environ["GITHUB_RUN_ID"], "attempt": 1, "commands": [], "cleanup": {},
              "noAppLaunch": True, "noInputCaptureAttachInjectionOrSecurityChange": True,
              "limits": ["Metadata and declared capabilities only; no target debugger/inspector/session attempted",
                         "Absent observer or grant is not universal proof of impossibility",
                         "No original save re-test, receiver acknowledgement or serializer capture"]}
    deadline = moment(preflight["workflowDeadlineUTC"])
    run = command_runner(out, report, deadline)
    private = Path(tempfile.mkdtemp(prefix="mac-save-metadata-", dir=os.environ["RUNNER_TEMP"]))
    mount = private/"mount"; mount.mkdir(); mounted = False
    report["ownedTemporaryDirectory"] = str(private)
    try:
        # A failed attach may still leave a partial mount: observe it in finally.
        mounted = True
        run("mount", ["hdiutil", "attach", "-readonly", "-nobrowse", "-mountpoint", str(mount), str(package)], True)
        apps = list(mount.glob("*.app"))
        if len(apps) != 1:
            raise ValueError("One Suite app required on authenticated DMG")
        raw = (apps[0]/"Contents/Info.plist").read_bytes(); info = plistlib.loads(raw)
        check_identity(info, (apps[0]/"Contents/MacOS/open-office-studio").read_bytes())
        report["payloadInfoSha256"] = sha(raw)
        run("copy-own-bundle", ["/bin/cp", "-R", str(apps[0]), str(private)], True, 90)
        app = private/apps[0].name; program = app/"Contents/MacOS/open-office-studio"
        copied = (app/"Contents/Info.plist").read_bytes(); check_identity(plistlib.loads(copied), program.read_bytes())
        if copied != raw:
            raise ValueError("Copied Info.plist differs")
        report["bundleIdentity"] = {k:info.get(k) for k in ("CFBundleIdentifier", "CFBundleExecutable", "CFBundleName", "CFBundleShortVersionString", "CFBundleVersion")}
        report["executableSha256"] = sha(program.read_bytes())
        run("detach-before-metadata", ["hdiutil", "detach", str(mount)], True, 30); mounted = False
        run("codesign-verify", ["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(app)], True, 90)
        detail = run("codesign-display", ["codesign", "--display", "--verbose=4", str(app)], True)
        text = (detail.stdout+detail.stderr).decode("utf-8", "replace")
        if ("Identifier=org.openaec.office-studio" not in text.splitlines()
                or "Authority=Developer ID Application: " not in text or "flags=0x10000(runtime)" not in text):
            raise ValueError("Developer ID/Hardened Runtime identity differs")
        gate = run("gatekeeper", ["spctl", "--assess", "--type", "execute", "--verbose=4", str(app)], True, 90)
        if "source=Notarized Developer ID" not in (gate.stdout+gate.stderr).decode().splitlines():
            raise ValueError("Notarized Developer ID not proven")
        run("stapled-ticket", ["xcrun", "stapler", "validate", str(app)], True, 90)
        ent = run("complete-entitlements", ["codesign", "--display", "--entitlements", ":-", str(app)], True)
        report["entitlements"] = entitlement_plist(ent.stdout)
        declared = report["entitlements"]["value"] or {}
        report["declaredInspectionRelatedEntitlements"] = {
            key:{"present":key in declared, "value":declared.get(key)} for key in (
                "com.apple.security.get-task-allow", "com.apple.security.cs.debugger",
                "com.apple.security.cs.disable-library-validation", "com.apple.security.cs.allow-jit")}
        report["declaredInspectionRelatedEntitlements"]["actualTargetAttachOrInspectorTested"] = False
        maps = [str(p.relative_to(app)) for p in app.rglob("*.map")]
        symbols = [str(p.relative_to(app)) for p in app.rglob("*.dSYM")]
        report["bundledMappingInventory"] = {"sourceMapCount":len(maps), "sourceMapPaths":maps[:200],
            "debugSymbolBundleCount":len(symbols), "debugSymbolBundlePaths":symbols[:200],
            "pathListLimitedTo200":True, "mappingToSaveFunctionsNotEstablished":True}
        for name, argv in [
                ("system-version", ["sw_vers"]), ("identity", ["id"]),
                ("developer-tools-status", ["/usr/sbin/DevToolsSecurity", "-status"]),
                ("sip-status", ["/usr/bin/csrutil", "status"]),
                ("lldb-location-only", ["xcrun", "--find", "lldb"]),
                ("mach-o-kind", ["file", str(program)]),
                ("mach-o-header", ["otool", "-hv", str(program)]),
                ("mach-o-uuid", ["dwarfdump", "--uuid", str(program)])]:
            run(name, argv, seconds=20)
        report["toolLocationsOnly"] = {name:shutil.which(name) for name in ("dtrace", "fs_usage", "lldb", "codesign", "log")}
        swift = Path(__file__).with_name("mac-suite-save-privacy.swift")
        binary = private/"privacy-query"
        compiled = run("compile-passive-privacy-query", ["xcrun", "swiftc", str(swift), "-o", str(binary)], seconds=90)
        report["privacyQuery"] = {"sourceSha256": sha(swift.read_bytes()), "scope": "This nonprompting CLI helper only; no app receiver/attach grant inferred"}
        if compiled.returncode == 0:
            query = run("passive-privacy-query", [str(binary)], seconds=10)
            if query.returncode == 0:
                report["privacyQuery"]["value"] = json.loads(query.stdout)
        report["fourPointObservability"] = {"receiver": "not established", "handler": "not established",
            "serializerBytes": "not established", "nativeWrite": "external own-file effects possible; internal IPC/path/write trace not attempted"}
        if sha(program.read_bytes()) != EXE_SHA or sha(package.read_bytes()) != DMG_SHA:
            raise ValueError("Program or package changed during metadata inspection")
        report["originalDmgAndCopiedExecutableUnchangedAfterInspection"] = True
        report["status"] = "metadata-inspection-completed-no-causal-native-test"
    except BaseException as error:
        report.update(status="failed", error={"type":type(error).__name__, "message":str(error)})
        raise
    finally:
        if mounted:
            run("cleanup-detach", ["hdiutil", "detach", str(mount)], seconds=30, cleanup=True)
            mounts = run("cleanup-mount-inventory", ["hdiutil", "info", "-plist"], seconds=15, cleanup=True)
            if mounts.returncode == 0:
                inventory = plistlib.loads(mounts.stdout)
                mounted = any(part.get("mount-point") == str(mount)
                              for image in inventory.get("images", []) for part in image.get("system-entities", []))
            else:
                mounted = True
        report["cleanup"]["mountDetached"] = not mounted
        if not mounted:
            # Only the exact freshly created own directory, never a user path.
            if private.parent.resolve() != Path(os.environ["RUNNER_TEMP"]).resolve() or not private.name.startswith("mac-save-metadata-"):
                raise PermissionError("Own cleanup directory outside runner temp")
            shutil.rmtree(private)
        report["cleanup"]["ownBundleAndHelperRemoved"] = not private.exists()
        report["cleanup"]["appWasNeverLaunched"] = True
        save(out/"report.json", report)
        if mounted or private.exists():
            raise RuntimeError("Own metadata mount/bundle cleanup incomplete")


def cleanup_acquisition(folder, out):
    root = Path.cwd()/".local/mac-save-capability-input"
    if folder.resolve() != root.resolve() or folder.is_symlink():
        raise PermissionError("Only exact own acquisition directory may be cleaned")
    removed = []
    for name in ("suite-child.zip", "suite-support-descriptor.zip", "Open Office Studio_2026.48.1_aarch64.dmg"):
        p = folder/name
        if p.exists():
            if p.is_symlink() or p.resolve().parent != root.resolve() or not p.is_file():
                raise PermissionError("Unexpected acquisition cleanup target")
            removed.append({"name":name,"bytes":p.stat().st_size}); p.unlink()
    out.mkdir(parents=True, exist_ok=True)
    save(out/"acquisition-cleanup.json", {"status":"own-archives-and-dmg-removed", "removed":removed,
         "noOtherFilesOrProcessesTouched":True})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["guard", "inspect", "cleanup-acquisition"])
    parser.add_argument("request", type=Path); parser.add_argument("out", type=Path)
    parser.add_argument("--identity", type=Path)
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(TimeoutError("CI requested bounded shutdown")))
    if args.mode == "guard":
        try:
            guard(args.request, args.out)
        except Exception as error:
            args.out.mkdir(parents=True, exist_ok=True)
            save(args.out/"guard-failure.json", {"status":"blocked-before-acquisition", "error":str(error),
                "platform":platform.system(), "architecture":platform.machine(), "appNeverLaunched":True})
            raise
    elif args.mode == "inspect": inspect(args.identity, args.request, args.out)
    else: cleanup_acquisition(args.request, args.out)


if __name__ == "__main__": main()
