"""Run one real STI conversion with the verified P2 private Linux runtime."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

APPLICATION = "dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b"
TAR_SHA = "f3308bea282aedc444a10a039ec2c4e3904915d4c6c0b5607b088108407fb2e3"

def sha(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def execute(program, profile, arguments):
    profile.mkdir(parents=True)
    (profile / "user").mkdir()
    safe = subprocess.check_output(["git", "show", APPLICATION + ":src-tauri/src/conversieprofiel.xcu"])
    assert safe == Path("src-tauri/src/conversieprofiel.xcu").read_bytes()
    (profile / "user/registrymodifications.xcu").write_bytes(safe)
    args = [str(program), "-env:UserInstallation=" + profile.as_uri(), "--headless", *arguments]
    environment = os.environ.copy()
    environment.update(SAL_DISABLE_DEFAULTPRINTER="1", SAL_DISABLE_PRINTERLIST="1")
    start = time.monotonic()
    process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, env=environment, start_new_session=True)
    try:
        output, _ = process.communicate(timeout=45)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        output, _ = process.communicate()
        raise RuntimeError("Private conversion process exceeded its production 45-second limit")
    result = {"arguments": args, "exitCode": process.returncode, "elapsedSeconds": time.monotonic() - start,
        "output": output.decode("utf-8", errors="replace"), "safeProfileSha256": hashlib.sha256(safe).hexdigest(),
        "printerEnvironment": {k: environment[k] for k in ("SAL_DISABLE_DEFAULTPRINTER", "SAL_DISABLE_PRINTERLIST")}}
    assert process.returncode == 0, result
    return result

def main():
    assert sys.platform == "linux" and os.environ.get("GITHUB_ACTIONS") == "true"
    parser = argparse.ArgumentParser()
    parser.add_argument("--binding", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    binding = json.loads(Path(args.binding).read_text())
    descriptor = binding["descriptor"]
    assert binding["artifact"]["id"] == 14805600515
    assert binding["artifactZipSha256"] == "bac1a37b55deff80cabd4670c1bf65d76266285275c0552436dcc13fcdafa487"
    assert binding["verification"]["status"] == "verified"
    assert binding["verification"]["sourceCommit"] == APPLICATION
    assert binding["verification"]["tarSha256"] == TAR_SHA
    destination = Path(binding["destination"]).resolve(strict=True)
    assert destination.is_relative_to(Path(".local/qa-sti-runtime-0c73").resolve())
    program = Path(binding["verification"]["converter"]).resolve(strict=True)
    assert program.is_relative_to(destination) and sha(program) == descriptor["converterLauncherSha256"]
    binary = destination / descriptor["converterElfPath"]
    assert binary.resolve(strict=True).is_relative_to(destination)
    assert sha(binary) == descriptor["converterElfMetadata"]["sha256"]
    assert program.name == "soffice"
    out = Path(args.out).resolve(strict=True)
    assert out.is_relative_to(Path(".local/qa-sti-p2-0c73").resolve())
    source = out / "prs-strategy.sti"
    oracle = json.loads((out / "source-oracle.json").read_text())
    assert sha(source) == oracle["fixture"]["sha256"]
    converted = out / "converted"
    converted.mkdir()  # Never reuse an old output as conversion evidence.
    profiles = out / "private-profiles"
    version = execute(program, profiles / "version", ["--version"])
    assert "26.8.2.2" in version["output"]
    catalog = json.loads(Path("src/formaten.json").read_text())
    filter_name = catalog["pptx"]["uitvoer"]["pptx"]["filter"]
    assert filter_name == "Impress MS PowerPoint 2007 XML"
    conversion = execute(program, profiles / "conversion", ["--nologo", "--nodefault", "--norestore",
        "--nolockcheck", "--convert-to", "pptx:" + filter_name, "--outdir", str(converted), str(source)])
    results = list(converted.iterdir())
    assert len(results) == 1 and results[0].name == "prs-strategy.pptx"
    target = results[0]
    assert 0 < target.stat().st_size < 40_000_000 and sha(source) == oracle["fixture"]["sha256"]
    report = {"applicationCommit": APPLICATION, "runtimeArtifact": 14805600515,
        "parentDebSha256": descriptor["parent"]["deb"]["sha256"], "runtimeTarSha256": TAR_SHA,
        "sourceSha256": sha(source), "outputSha256": sha(target), "outputBytes": target.stat().st_size,
        "converterLauncherSha256": sha(program), "converterElfSha256": sha(binary),
        "versionProbe": version, "conversion": conversion, "sourceUnchanged": True,
        "qualification": "Production filter/arguments/safe profile; private CLI transport, no native Tauri dispatcher or GUI."}
    (out / "conversion-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"converted": str(target), "bytes": target.stat().st_size, "sha256": sha(target)}))

if __name__ == "__main__":
    main()
