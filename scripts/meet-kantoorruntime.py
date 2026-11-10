"""Measure the actual private runtime with fresh safe profiles and a 45 s limit."""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

import psutil


@contextmanager
def own_temp():
    parent = Path(tempfile.gettempdir()).resolve()
    root = Path(tempfile.mkdtemp(prefix="oos-runtime-measure-", dir=parent))
    try:
        yield root
    finally:
        if root.exists():
            target = root.resolve()
            if target.parent != parent or not target.name.startswith("oos-runtime-measure-"):
                raise RuntimeError("Refusing unsafe temporary-profile cleanup")
            shutil.rmtree(target)


def measured_process(args, log_path):
    env = dict(os.environ, SAL_DISABLE_DEFAULTPRINTER="1", SAL_DISABLE_PRINTERLIST="1")
    started = time.perf_counter()
    peak = 0
    timed_out = False
    with log_path.open("wb") as log:
        process = subprocess.Popen(
            [str(a) for a in args], stdin=subprocess.DEVNULL, stdout=log, stderr=log,
            env=env, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            start_new_session=os.name != "nt",
        )
        main = psutil.Process(process.pid)
        children = []
        while process.poll() is None:
            try:
                children = [main] + main.children(recursive=True)
                peak = max(peak, sum(child.memory_info().rss for child in children if child.is_running()))
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
            if time.perf_counter() - started > 45:
                timed_out = True
                for child in reversed(children):
                    try:
                        child.kill()
                    except psutil.NoSuchProcess:
                        pass
                process.kill()
                break
            time.sleep(0.05)
        code = process.wait(timeout=10)
    result = {"ms": round((time.perf_counter() - started) * 1000), "peakSampledTreeRssBytes": peak, "exitCode": code, "timedOut": timed_out}
    if code != 0 or timed_out:
        raise RuntimeError(f"Runtime probe failed: {result}; see {log_path}")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program", type=Path, required=True)
    parser.add_argument("--runtime-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    options.output.mkdir(parents=True, exist_ok=True)
    profile = Path("src-tauri/src/conversieprofiel.xcu").read_bytes()
    cases = []
    specifications = [
        ("init-new-profile-1", None, None), ("init-new-profile-2", None, None),
        ("writer-to-odt", "odt", "writer8"), ("writer-to-pdf", "pdf", "writer_pdf_Export"),
    ]
    for name, extension, export_filter in specifications:
        with own_temp() as root:
            user = root / "profile/user"
            user.mkdir(parents=True)
            (user / "registrymodifications.xcu").write_bytes(profile)
            output = root / "output"
            output.mkdir()
            args = [options.program.resolve(), "-env:UserInstallation=" + (root / "profile").as_uri(), "--headless", "--nologo", "--nodefault", "--norestore", "--nolockcheck"]
            if extension:
                args += ["--convert-to", f"{extension}:{export_filter}", "--outdir", output, Path("docs/voorbeelden/Ontwerpnotitie.docx").resolve()]
            else:
                args += ["--terminate_after_init"]
            measurement = measured_process(args, options.output / f"{name}.log")
            if extension:
                result = output / f"Ontwerpnotitie.{extension}"
                if not result.is_file() or not result.stat().st_size:
                    raise RuntimeError(f"No actual {extension} output for {name}")
                shutil.copyfile(result, options.output / result.name)
                measurement["outputBytes"] = result.stat().st_size
            cases.append({"name": name, **measurement})
            print(json.dumps(cases[-1]), flush=True)
    files = [p for p in options.runtime_root.rglob("*") if not p.is_symlink() and p.is_file()]
    report = {
        "platform": os.name, "program": str(options.program.resolve()),
        "profileSha256": hashlib.sha256(profile).hexdigest(),
        "runtimeFiles": len(files), "runtimeFileBytes": sum(p.stat().st_size for p in files),
        "method": "New isolated profile per call; process-tree RSS sampled every 50 ms (shared pages may be counted more than once). Initialization includes first-profile setup, not a cold OS/disk boot. Conversion includes process startup. Unchanged 45-second limit.",
        "cases": cases,
    }
    (options.output / "performance.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
