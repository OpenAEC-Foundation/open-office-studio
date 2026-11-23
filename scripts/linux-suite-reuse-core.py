"""Reuse a verified same-source/package/probe native core proof; never rerun it."""
import hashlib
import importlib.util
import json
from pathlib import Path, PurePosixPath
import subprocess
import zipfile

HERE = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("consumer", HERE / "scripts/linux-suite-native-package.py")
consumer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(consumer)


def validate_core(report, request, identity, probe_sha):
    assert report["source"] == dict(commit=request["candidate"]["commit"], tree=request["candidate"]["tree"])
    assert report["origin"]["packageSha256"] == identity["packageSha256"]
    assert report["origin"]["executableSha256"] == identity["executableSha256"]
    assert report["harnessSha256"] == probe_sha, "Actual unchanged core probe bytes"
    assert report["harnessCommit"] == request["reusedCore"]["harnessCommit"]
    assert report["issue368"].startswith("passed bounded") and report["issue369"].startswith("passed tested")
    assert report["cleanup"]["ownedApplicationClosed"] is True and report["cleanup"]["driverExited"] is True
    assert report["cleanup"]["remainingApplicationPids"] == [] and len(report["checks"]) == 64


def main():
    request = json.loads((HERE / "qa/linux-suite-final/request.json").read_bytes())
    assert request["go"] is True
    pin = request["reusedCore"]
    actual = consumer.api(f"actions/artifacts/{pin['artifact']['id']}")
    consumer.verify_artifact(actual, pin["artifact"], pin["run"], pin["harnessCommit"], transfer=True)
    job = consumer.api(f"actions/jobs/{pin['job']}")
    assert job["run_id"] == pin["run"] and job["head_sha"] == pin["harnessCommit"] and job["run_attempt"] == 1
    assert job["status"] == "completed" and job["conclusion"] == "failure", "Original downstream-failed job is never relabelled"
    core, = [s for s in job["steps"] if s["name"] == "Actual DEB core368/369 and vertical362"]
    assert core["conclusion"] == "success"
    archive = Path(".local/linux-suite-final-input/reused-core.zip")
    with archive.open("xb") as target:
        subprocess.run(["gh", "api", f"repos/{consumer.REPO}/actions/artifacts/{actual['id']}/zip"], stdout=target, check=True)
    assert archive.stat().st_size == actual["size_in_bytes"] and consumer.digest(archive) == pin["artifact"]["zipSha256"]
    prefix = "linux-p2-native/suite-final-core/"
    out = Path(".local/linux-p2-native/suite-final-core")
    assert not out.exists()
    hashes = {}
    with zipfile.ZipFile(archive) as bundle:
        names = bundle.namelist()
        assert len(names) == len(set(names))
        for name in names:
            consumer.safe_member(name)
            if not name.startswith(prefix) or name.endswith("/"):
                continue
            relative = PurePosixPath(name.removeprefix(prefix))
            target = out / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            raw = bundle.read(name)
            target.write_bytes(raw)
            hashes[str(relative)] = hashlib.sha256(raw).hexdigest()
    assert hashes["report.json"] == pin["reportSha256"] and hashes["ribbon/report.json"] == pin["ribbonReportSha256"]
    report = json.loads((out / "report.json").read_bytes())
    identity = json.loads(Path(".local/linux-suite-final-input/deb-identity.json").read_bytes())
    validate_core(report, request, identity, consumer.digest(HERE / "scripts/proef-linux-suite-final-core.mjs"))
    Path(".local/linux-suite-final-input/reused-core.json").write_text(json.dumps(dict(status="reused-valid-same-source-package-probe",pin=pin,artifact=actual,originalJobConclusion=job["conclusion"],files=hashes),indent=2)+"\n")
    print(json.dumps(dict(status="reused-valid-same-source-package-probe",checks=len(report["checks"]),originalJobConclusion=job["conclusion"])))


if __name__ == "__main__":
    main()
