"""Consume ONLY the coordinator-approved runtime ZIP, then run this one XLSB case."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile

REPO = "OpenAEC-Foundation/open-office-studio"
BASE = Path(__file__).resolve().parent


def sha(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main():
    assert sys.platform == "linux" and os.environ.get("GITHUB_ACTIONS") == "true", "Isolated Linux CI only"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    config = json.loads(args.input.read_text())
    delivery_path = BASE / config["deliveryDescriptor"]
    verifier = BASE / config["sharedVerifier"]
    assert sha(delivery_path) == config["deliveryDescriptorSha256"]
    assert sha(verifier) == config["sharedVerifierSha256"]
    delivery = json.loads(delivery_path.read_text())
    parent_pin = json.loads((BASE / "p2-parent-package.json").read_text())
    parent = delivery["parent"]
    assert config["applicationCommit"] == parent["sourceCommit"] == parent_pin["applicationCommit"]
    assert parent["sourceTree"] == parent_pin["applicationTree"]
    assert parent["run"] == parent_pin["producerRun"] and parent["job"] == parent_pin["producerLinuxJob"]
    assert parent["installerArchive"]["id"] == parent_pin["parentInstallerArtifact"]["id"]
    assert "sha256:" + parent["installerArchive"]["sha256"] == parent_pin["parentInstallerArtifact"]["digest"]
    assert parent["deb"]["sha256"] == parent_pin["expectedDeb"]["sha256"]
    assert parent["deb"]["bytes"] == parent_pin["expectedDeb"]["bytes"]
    artifact = delivery["publishedArtifacts"]["p2-linux-private-runtime-only"]
    assert artifact["id"] == delivery["formatWorkersDownloadOnlyArtifactId"] == 14805600515
    report = {"status": "running", "phase": "verify-runtime-input", "runtimeArtifact": artifact,
              "deliveryDescriptorSha256": sha(delivery_path), "sharedVerifierSha256": sha(verifier),
              "parent": parent, "scope": "Private-runtime TS/WASM content test; no Office install/native UI or other-platform acceptance"}
    try:
        metadata = json.loads(subprocess.check_output(["gh", "api", f"repos/{REPO}/actions/artifacts/{artifact['id']}"]))
        assert metadata["id"] == artifact["id"] and metadata["name"] == artifact["name"]
        assert metadata["workflow_run"]["id"] == artifact["run"] == delivery["qaRun"]
        assert metadata["workflow_run"]["head_sha"] == delivery["harnessCommit"]
        assert metadata["digest"] == "sha256:" + artifact["zipSha256"]
        assert metadata["size_in_bytes"] == artifact["zipBytes"] and not metadata["expired"]
        with tempfile.TemporaryDirectory(prefix="oos-xlsb35-runtime-") as temporary:
            root = Path(temporary)
            archive = root / "runtime.zip"
            with archive.open("wb") as output:
                subprocess.run(["gh", "api", f"repos/{REPO}/actions/artifacts/{artifact['id']}/zip"],
                               stdout=output, check=True, timeout=180)
            assert archive.stat().st_size == artifact["zipBytes"]
            assert sha(archive) == artifact["zipSha256"], "Full ZIP checksum, not a warning-only downloader check"
            extracted = root / "artifact"
            extracted.mkdir()
            allowed = {"descriptor.json", "entry-manifest.json", "canary-report.json", "canary-execve.log", "canary.fodt",
                       "soffice-bin-ldd.txt", "package-verification-Linux.json", "p2-runtime-consumer.py", "consumer-verification.json", delivery["tar"]["name"]}
            with zipfile.ZipFile(archive) as package:
                names = package.namelist()
                assert len(names) == len(set(names)) and set(names) == allowed
                for name in names:
                    assert Path(name).name == name
                    with package.open(name) as source, (extracted / name).open("wb") as target:
                        shutil.copyfileobj(source, target)
            assert sha(extracted / "descriptor.json") == delivery["runtimeBaseDescriptorSha256"]
            assert sha(extracted / "p2-runtime-consumer.py") == config["sharedVerifierSha256"]
            assert sha(extracted / "canary-report.json") == delivery["canary"]["reportSha256"]
            report["verification"] = json.loads(subprocess.check_output([
                sys.executable, str(verifier), str(extracted), delivery["tar"]["sha256"], str(root / "runtime")], text=True))
            assert report["verification"]["status"] == "verified"
            for source, name in [(delivery_path, "runtime-delivery.json"), (args.input, "runtime-input.json"),
                                 (BASE / "p2-parent-package.json", "p2-parent-package.json"),
                                 (extracted / "canary-report.json", "runtime-canary-report.json")]:
                shutil.copyfile(source, args.output / name)
            report["phase"] = "production-engine-content"
            program = Path(report["verification"]["converter"])
            assert sha(program) == delivery["converterLauncherSha256"]
            subprocess.run(["node", str(BASE / "engine.mjs"), str(program), str(delivery_path), str(args.output)],
                           env=dict(os.environ, OOS_XLSB_RUNTIME_EXECUTABLE_SHA256=delivery["converterLauncherSha256"]),
                           check=True, timeout=180)
            report["status"] = "passed"
            report["phase"] = "complete"
    except Exception as error:
        report["status"] = "failed"
        report["error"] = str(error)
        raise
    finally:
        (args.output / "consumer-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
