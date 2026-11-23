"""Own read-only mount namespace, with an explicit capability boundary and no installs."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

OUT = Path(".local/presentation-375-runtime").resolve()


def write(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(data, indent=2) + "\n")


def namespace():
    return os.readlink("/proc/self/ns/mnt")


def child(target, parent_ns, capability):
    current = namespace()
    assert current != parent_ns, "Refuse to mount in the parent's namespace"
    target = Path(target).resolve(strict=True)
    assert target.is_dir() and not target.is_symlink()
    if not capability:
        binding = json.loads((OUT / "runtime-binding.json").read_text())
        private = Path(binding["privateRoot"]).resolve(strict=True)
        assert private == Path(".local/presentation-375-runtime-input/private").resolve(strict=True)
        assert target == private / "payload"
    shared = [line for line in Path("/proc/self/mountinfo").read_text().splitlines()
              if any(part.startswith(("shared:", "master:")) for part in line.split(" - ")[0].split()[6:])]
    assert not shared, "Expected recursively private mount propagation"
    result = {"parentMountNamespace": parent_ns, "childMountNamespace": current,
              "target": str(target), "privatePropagation": True, "officeExecuted": False}
    mounted = False
    try:
        subprocess.run(["mount", "--bind", str(target), str(target)], check=True, capture_output=True, text=True)
        mounted = True
        subprocess.run(["mount", "-o", "remount,bind,ro", str(target)], check=True, capture_output=True, text=True)
        result["readOnlyMountVerified"] = bool(os.statvfs(target).f_flag & os.ST_RDONLY)
        assert result["readOnlyMountVerified"]
        if not capability:
            result["officeExecuted"] = True
            env = dict(os.environ)
            env["PYTHONDONTWRITEBYTECODE"] = "1"
            completed = subprocess.run([sys.executable, "scripts/qa-presentation-375/probe.py"], env=env,
                                       timeout=240)
            result.update(probeExitCode=completed.returncode)
            assert completed.returncode == 0, "Inspect the separate UNO diagnosis"
    finally:
        if mounted:
            assert namespace() == current and current != parent_ns
            subprocess.run(["umount", "--", str(target)], check=True, capture_output=True, text=True)
            result["ownBindUnmounted"] = True
        write("namespace-capability-child.json" if capability else "namespace-child.json", result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capability-only", action="store_true")
    parser.add_argument("--inside", action="store_true")
    parser.add_argument("--target")
    parser.add_argument("--parent-namespace")
    args = parser.parse_args()
    assert sys.platform.startswith("linux")
    if args.inside:
        child(args.target, args.parent_namespace, args.capability_only)
        return
    parent_ns = namespace()
    env = dict(os.environ)
    for name in tuple(env):
        if name in ("GH_TOKEN", "GITHUB_TOKEN") or name.startswith("ACTIONS_"):
            env.pop(name, None)
    report = {"parentMountNamespace": parent_ns, "capabilityOnly": args.capability_only,
              "installations": False, "globalMountChanges": False, "officeExecuted": False}
    OUT.mkdir(parents=True, exist_ok=True)
    if not all(shutil.which(t) for t in ("unshare", "mount", "umount")):
        report.update(available=False, error="Existing util-linux namespace/mount tools missing")
        write("namespace-capability.json", report)
        raise SystemExit(2)
    with tempfile.TemporaryDirectory(prefix="presentation-375-mount-capability-") as temp:
        if args.capability_only:
            target = Path(temp) / "empty-owned-payload"
            target.mkdir()
        else:
            binding = json.loads((OUT / "runtime-binding.json").read_text())
            target = Path(binding["privateRoot"]) / "payload"
        command = ["unshare", "--user", "--map-root-user", "--mount", "--propagation", "private", "--fork",
                   sys.executable, "scripts/qa-presentation-375/namespace_probe.py", "--inside",
                   "--target", str(target), "--parent-namespace", parent_ns]
        if args.capability_only:
            command.append("--capability-only")
        completed = subprocess.run(command, env=env, capture_output=True, text=True, timeout=300)
    report.update(available=completed.returncode == 0, childExitCode=completed.returncode,
                  stdout=completed.stdout[-6000:], stderr=completed.stderr[-6000:],
                  parentNamespaceUnchanged=namespace() == parent_ns)
    if not args.capability_only:
        # Whether Office ran is recorded inside the namespace, never inferred from a namespace failure.
        child_report = OUT / "namespace-child.json"
        if child_report.exists():
            report["officeExecuted"] = json.loads(child_report.read_text())["officeExecuted"]
    write("namespace-capability.json" if args.capability_only else "namespace-guard.json", report)
    assert report["parentNamespaceUnchanged"]
    if completed.returncode:
        print(json.dumps({"namespaceReady": False, "error": report["stderr"][-1200:]}))
        raise SystemExit(2)
    print(json.dumps({"namespaceReady": True, "officeExecuted": report["officeExecuted"]}))


if __name__ == "__main__":
    main()
