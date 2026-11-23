"""Read-only source-build resource inventory; no checkout/install/cleanup/build."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys


def version(path, argument):
    if not path or not Path(path).is_file():
        return {"path": path, "available": False}
    p = subprocess.run([str(path), argument], capture_output=True, text=True, timeout=15)
    return {"path": str(path), "available": p.returncode == 0,
            "output": (p.stdout + p.stderr).strip()[:3000]}


def main():
    assert sys.platform.startswith("linux")
    own = Path(__file__).resolve().parent
    patchset = json.loads((own / "runtime-patch/manifest.json").read_text())
    assert hashlib.sha256((own / "runtime-patch/375-solid-rgb-import.patch").read_bytes()).hexdigest() == patchset["patchSHA256"]
    memory = {line.split(":")[0]: int(line.split()[1]) * 1024
              for line in Path("/proc/meminfo").read_text().splitlines() if line.startswith(("MemTotal:", "MemAvailable:"))}
    candidates = []
    for path in [Path.cwd(), Path(os.environ.get("RUNNER_TEMP", "/tmp")), Path("/mnt")]:
        if path.is_dir():
            real = path.resolve()
            usage = shutil.disk_usage(real)
            candidates.append({"path": str(real), "filesystemDevice": real.stat().st_dev,
                               "freeBytes": usage.free, "totalBytes": usage.total,
                               "writableByCurrentUser": os.access(real, os.W_OK)})
    java_home = os.environ.get("JAVA_HOME_17_X64")
    tools = {"gcc13": version("/usr/bin/gcc-13", "--version"),
             "g++13": version("/usr/bin/g++-13", "--version"),
             "jdk17": version(Path(java_home) / "bin/javac" if java_home else None, "-version"),
             "make": version(shutil.which("make"), "--version")}
    cpus = len(os.sched_getaffinity(0))
    failures = []
    if cpus < 4: failures.append("Fewer than 4 available CPUs")
    if memory["MemTotal"] < 15 * 1024**3: failures.append("Less than 15 GiB physical RAM")
    if not any(c["freeBytes"] >= 65 * 1024**3 and c["writableByCurrentUser"] for c in candidates):
        failures.append("No current-user-writable candidate filesystem with 65 GiB free")
    if not all(t["available"] for t in tools.values()): failures.append("Required preinstalled toolchain component missing")
    if tools["jdk17"]["available"] and not re.search(r"javac 17(?:\.|\s)", tools["jdk17"]["output"]):
        failures.append("JAVA_HOME_17_X64 does not identify JDK 17")
    report = {"issue": 375, "kind": "resource inventory only", "buildReadyByPlanGates": not failures,
              "failures": failures, "upstreamCommit": patchset["upstreamCommit"], "patchSHA256": patchset["patchSHA256"],
              "imageVersion": os.environ.get("ImageVersion"), "imageOS": os.environ.get("ImageOS"),
              "kernel": os.uname().release, "availableCPUs": cpus, "memoryBytes": memory,
              "candidateFilesystems": candidates, "toolchain": tools,
              "largeSourceCheckout": False, "packagesInstalled": False, "buildStarted": False,
              "systemCleanup": False, "runtimeChanged": False}
    out = Path(".local/presentation-375-build-preflight")
    out.mkdir(parents=True, exist_ok=True)
    (out / "build-preflight.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: report[k] for k in ("buildReadyByPlanGates", "failures", "availableCPUs", "memoryBytes", "candidateFilesystems")}))
    if failures:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
