"""Inventory existing private UNO client components before any listener or installs."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile


def sha(path):
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def main():
    assert sys.platform.startswith("linux"), "Private runtime consumption is Linux CI only"
    out = Path(".local/presentation-375-runtime")
    binding = json.loads((out / "runtime-binding.json").read_text())
    program = Path(binding["program"])
    assert program.is_relative_to(Path(binding["privateRoot"]))
    assert sha(program) == binding["programSha256"]
    runtime = program.parent.parent
    required_classes = {
        "com/sun/star/comp/helper/Bootstrap.class",
        "com/sun/star/bridge/XUnoUrlResolver.class",
        "com/sun/star/uno/UnoRuntime.class",
        "com/sun/star/frame/XComponentLoader.class",
        "com/sun/star/drawing/XDrawPagesSupplier.class",
        "com/sun/star/util/XComplexColor.class",
    }
    found = set()
    jars = []
    for jar in sorted(runtime.rglob("*.jar")):
        assert jar.resolve().is_relative_to(runtime.resolve())
        with zipfile.ZipFile(jar) as z:
            classes = sorted(required_classes.intersection(z.namelist()))
        found.update(classes)
        jars.append({"path": str(jar.relative_to(runtime)), "sha256": sha(jar),
                     "requiredClasses": classes})
    native = [{"path": str(p.relative_to(runtime)), "sha256": sha(p)}
              for p in runtime.rglob("libjpipe.so") if p.resolve().is_relative_to(runtime.resolve())]
    versions = {}
    for tool in ("java", "javac"):
        executable = shutil.which(tool)
        versions[tool] = {"path": executable}
        if executable:
            p = subprocess.run([executable, "-version"], capture_output=True, text=True, timeout=15)
            versions[tool].update(exitCode=p.returncode, version=(p.stdout + p.stderr).strip())
    missing = sorted(required_classes - found)
    ready = not missing and bool(native) and all(v.get("exitCode") == 0 for v in versions.values())
    report = {"issue": 375, "componentPreflightReady": ready, "binding": binding,
              "jars": jars, "nativeJavaPipeLibraries": native, "jdk": versions,
              "missingClasses": missing, "officeExecuted": False, "listenerStarted": False,
              "extraComponentsInstalled": False,
              "nextStep": "Eligible for isolated diagnostic client" if ready else
                          "Report concrete missing component before installation or runtime changes"}
    (out / "uno-component-preflight.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: report[k] for k in ("componentPreflightReady", "missingClasses", "nextStep")}))
    if not ready:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
