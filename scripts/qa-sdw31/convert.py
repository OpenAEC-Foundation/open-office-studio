"""Run the approved private Linux converter with P2's exact conversion profile.

This is a CLI adapter, not a claim of native GUI or Tauri IPC acceptance.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

from oracle import CONFIG, source_bytes, write_json

PROFILE_SHA256 = "847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40"


def file_sha(path):
    with Path(path).open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--binding", required=True, type=Path)
    p.add_argument("--source", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args()
    assert sys.platform.startswith("linux"), "Office runtime execution is restricted to Linux CI"
    binding = json.loads(args.binding.read_text(encoding="utf-8"))
    assert binding["application"] == CONFIG["application"], "Wrong application binding"
    assert binding["artifact"] and binding["package"], "Artifact/package provenance is required"
    program = Path(binding["program"]).resolve()
    private_root = Path(binding["privateRoot"]).resolve()
    assert program.is_relative_to(private_root) and program.is_file(), "Not a private payload program"
    assert file_sha(program) == binding["programSha256"], "Converter executable identity differs"
    profile = Path("src-tauri/src/conversieprofiel.xcu")
    assert file_sha(profile) == PROFILE_SHA256, "P2 profile changed"
    source = source_bytes(args.source)
    args.out.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env.pop("OPENAEC_CONVERSIE_PROGRAMMA", None)
    env.pop("OPENAEC_CONVERSIE_PROFIEL", None)
    for name in ("GH_TOKEN", "GITHUB_TOKEN", "ACTIONS_RUNTIME_TOKEN", "ACTIONS_ID_TOKEN_REQUEST_TOKEN"):
        env.pop(name, None)
    env.update(SAL_DISABLE_DEFAULTPRINTER="1", SAL_DISABLE_PRINTERLIST="1")
    with tempfile.TemporaryDirectory(prefix="sdw31-p2-") as temp:
        work = Path(temp)
        isolated_profile = work / "profiel"
        (isolated_profile / "user").mkdir(parents=True)
        shutil.copyfile(profile, isolated_profile / "user/registrymodifications.xcu")
        input_path = work / "invoer.sdw"
        input_path.write_bytes(source)
        output_path = work / "uit"
        output_path.mkdir()
        argv = [str(program), "-env:UserInstallation=" + isolated_profile.as_uri(),
                "--headless", "--nologo", "--nodefault", "--norestore", "--nolockcheck",
                "--convert-to", "docx:MS Word 2007 XML", "--outdir", str(output_path), str(input_path)]
        started = time.monotonic()
        with (args.out / "converter.log").open("wb") as log:
            completed = subprocess.run(argv, env=env, stdin=subprocess.DEVNULL, stdout=log,
                                       stderr=subprocess.STDOUT, timeout=45, check=False)
        assert completed.returncode == 0, "Converter failed; inspect converter.log"
        results = list(output_path.glob("*.docx"))
        assert len(results) == 1 and results[0].stat().st_size, "Expected one usable DOCX"
        assert input_path.read_bytes() == source
        destination = args.out / "converted.docx"
        shutil.copyfile(results[0], destination)
        report = {"binding": binding, "method": "private CLI using production arguments/profile",
                  "profileSha256": PROFILE_SHA256, "sourceSha256": file_sha(args.source),
                  "sourceUnchanged": True, "outputSha256": file_sha(destination),
                  "outputBytes": destination.stat().st_size, "exitCode": completed.returncode,
                  "seconds": time.monotonic() - started, "timeoutSeconds": 45,
                  "output": str(destination.resolve()), "argv": argv}
        write_json(args.out / "converter-report.json", report)
        print(json.dumps(report))


if __name__ == "__main__":
    main()
