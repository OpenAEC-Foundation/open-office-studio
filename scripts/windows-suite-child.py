"""Strict consumer of8020's Suite-only transfer, never of the large parent ZIP."""
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import zipfile

REPO = "OpenAEC-Foundation/open-office-studio"
WORKFLOW = ".github/workflows/standalone-windows-p4.yml"
PREP_GATE = "One canonical download, source/job/archive/report/NSIS/payload gates"
BIND_GATE = "Bind official child ZIP digests; separate Suite consumer contract"


def positive(value):
    assert type(value) is int and value > 0
    return value


def sha(value):
    return hashlib.sha256(value).hexdigest()


def file_sha(path):
    with Path(path).open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def stamp(value):
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def descriptor(plan):
    assert plan["requireSigned"] is True and plan["testTitleOverlap"] is True
    for key in ("runId", "producerRunAttempt", "producerJobId", "artifactId"):
        positive(plan[key])
    raw = base64.b64decode(plan["suiteDescriptorBase64"], validate=True)
    assert sha(raw) == plan["suiteDescriptorSha256"], "Raw frozen descriptor differs"
    d = json.loads(raw)
    assert d["schemaVersion"] == 1 and d["consumer"] == "750b"
    assert isinstance(d["contract"], str) and d["contract"].strip()
    source, suite = d["source"], d["suite"]
    assert (source["producer"], source["attempt"], source["job"], source["commit"], source["tree"], source["version"], source["parentArtifact"], source["parentZipSha256"]) == (
        plan["runId"], plan["producerRunAttempt"], plan["producerJobId"], plan["applicationCommit"], plan["applicationTree"], plan["version"], plan["artifactId"], plan["archiveSha256"])
    expected = dict(applicationCommit=plan["applicationCommit"], applicationTree=plan["applicationTree"], version=plan["version"], artifactRun=plan["runId"], platformJobId=plan["producerJobId"], sourceAttempt=plan["producerRunAttempt"], artifactId=plan["artifactId"], archiveSha256=plan["archiveSha256"], preparerRun=plan["suitePreparerRun"], preparerHarness=plan["suitePreparerCommit"])
    for key, value in expected.items():
        assert suite[key] == value, f"Suite {key} differs from frozen input"
    for key in ("suitePreparerRun", "suitePreparerAttempt", "suitePreparerJobId"):
        positive(plan[key])
    positive(suite["archiveBytes"])
    assert isinstance(suite["boundary"], str) and suite["boundary"].strip()
    assert re.fullmatch("[a-f0-9]{40}", suite["preparerHarness"])
    app = suite["application"]
    assert (app["key"], app["title"], app["identifier"], app["executable"]) == ("office", "Open Office Studio", "org.openaec.office-studio", "open-office-studio.exe")
    assert app["packagePath"] == plan["packageMember"]
    assert app["sha256"] == plan["packageSha256"] and re.fullmatch("[a-f0-9]{64}", app["sha256"])
    positive(app["bytes"])
    assert app["signature"] == "valid" and app["timestampRequired"] is True
    assert app["payloadExecutable"]["sha256"] == plan["expectedPackagedExecutableSha256"]
    assert re.fullmatch("[a-f0-9]{64}", app["payloadExecutable"]["sha256"])
    positive(app["payloadExecutable"]["bytes"])
    assert app["payloadExecutable"]["pe"] == "x64"
    for key in ("member", "derivation"):
        assert isinstance(app["payloadExecutable"][key], str) and app["payloadExecutable"][key].strip()
    assert suite["installer"] == f"Open Office Studio_{plan['version']}_x64-setup.exe"
    assert PurePosixPath(app["packagePath"]).name == suite["installer"]
    assert app["packagePath"].startswith("dist-installers/office/nsis/")
    for value in (suite["packageReceiptSha256"], suite["canonicalPackageReport"]["sha256"]):
        assert re.fullmatch("[a-f0-9]{64}", value)
    assert PurePosixPath(suite["canonicalPackageReport"]["parentMember"]).name == "pakketcontrole-Windows.json"
    positive(suite["canonicalPackageReport"]["bytes"])
    child = suite["childArtifact"]
    positive(child["id"]); positive(child["bytes"])
    assert child["name"] == "standalone-windows-p5-office-package"
    assert re.fullmatch("sha256:[a-f0-9]{64}", child["digest"])
    return d


def producer_metadata(plan, suite, run, job, child, parent):
    assert run["id"] == job["run_id"] == suite["preparerRun"]
    assert run["head_sha"] == job["head_sha"] == suite["preparerHarness"]
    assert run["path"] == WORKFLOW and run["head_repository"]["full_name"] == REPO
    assert run["run_attempt"] >= plan["suitePreparerAttempt"] == job["run_attempt"]
    assert job["id"] == plan["suitePreparerJobId"] and job["name"] == "prepare"
    assert job["status"] == "completed" and job["conclusion"] == "success"
    gates = {}
    for name in (PREP_GATE, BIND_GATE):
        steps = [s for s in job["steps"] if s["name"] == name]
        assert len(steps) == 1 and steps[0]["conclusion"] == "success" and steps[0]["status"] == "completed"
        gates[name] = steps[0]
    expected = suite["childArtifact"]
    assert (child["id"], child["name"], child["size_in_bytes"], child["digest"]) == (expected["id"], expected["name"], expected["bytes"], expected["digest"])
    assert not child["expired"] and child["workflow_run"]["id"] == suite["preparerRun"]
    assert child["workflow_run"]["head_sha"] == suite["preparerHarness"]
    created = stamp(child["created_at"])
    assert stamp(job["started_at"]) <= created <= stamp(job["completed_at"])
    assert stamp(gates[PREP_GATE]["completed_at"]) <= created <= stamp(gates[BIND_GATE]["started_at"])
    assert parent["id"] == suite["artifactId"] and parent["name"] == "uitgave-Windows" and not parent["expired"]
    assert parent["digest"] == "sha256:" + suite["archiveSha256"] and parent["size_in_bytes"] == suite["archiveBytes"]
    assert parent["workflow_run"]["id"] == plan["runId"] and parent["workflow_run"]["head_sha"] == plan["applicationCommit"]
    return {"preparerJobId": job["id"], "preparerAttempt": job["run_attempt"], "childCreatedAt": child["created_at"], "gates": gates}


def unpack(archive, root, suite):
    assert file_sha(archive) == suite["childArtifact"]["digest"].removeprefix("sha256:")
    assert archive.stat().st_size == suite["childArtifact"]["bytes"]
    with zipfile.ZipFile(archive) as z:
        names = z.namelist()
        assert len(names) == len(set(names)) == 3
        assert set(names) == {suite["installer"], "canonical-package-report.json", "package.json"}
        for info in z.infolist():
            p = PurePosixPath(info.filename)
            assert len(p.parts) == 1 and not p.is_absolute() and ".." not in p.parts and "\\" not in info.filename
            assert not info.is_dir() and stat.S_IFMT(info.external_attr >> 16) in (0, stat.S_IFREG)
        assert z.getinfo(suite["installer"]).file_size == suite["application"]["bytes"]
        assert z.getinfo("canonical-package-report.json").file_size == suite["canonicalPackageReport"]["bytes"] < 5 * 1024**2
        assert z.getinfo("package.json").file_size < 100 * 1024
        receipt_raw = z.read("package.json")
        assert sha(receipt_raw) == suite["packageReceiptSha256"]
        receipt = json.loads(receipt_raw)
        # Two final post-upload fields are absent from the original raw receipt.
        for key in ("applicationCommit", "applicationTree", "version", "artifactRun", "platformJobId", "sourceAttempt", "artifactId", "archiveSha256", "archiveBytes", "preparerRun", "preparerHarness", "installer", "application", "canonicalPackageReport"):
            assert receipt[key] == suite[key], f"Original receipt field {key} differs"
        report_raw = z.read("canonical-package-report.json")
        assert sha(report_raw) == suite["canonicalPackageReport"]["sha256"]
        report = json.loads(report_raw)
        assert (report["programma"], report["platform"], report["versie"]) == ("open-office-studio", "windows", suite["version"])
        assert len(report["pakketten"]) == 1
        package = report["pakketten"][0]
        assert (package["naam"], package["bytes"], package["sha256"]) == (suite["installer"], suite["application"]["bytes"], suite["application"]["sha256"])
        for info in z.infolist():
            with z.open(info) as src, (root / info.filename).open("xb") as dest:
                shutil.copyfileobj(src, dest, 1024 * 1024)
    installer = root / suite["installer"]
    assert installer.stat().st_size == suite["application"]["bytes"] and file_sha(installer) == suite["application"]["sha256"]
    return receipt


def main():
    assert os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted"
    plan = json.loads(Path(sys.argv[1]).read_bytes())
    d = descriptor(plan); suite = d["suite"]
    def api(path):
        return json.loads(subprocess.check_output(["gh", "api", f"repos/{REPO}/{path}"]))
    run = api(f"actions/runs/{suite['preparerRun']}")
    jobs = api(f"actions/runs/{suite['preparerRun']}/attempts/{plan['suitePreparerAttempt']}/jobs?per_page=100")
    job = next(j for j in jobs["jobs"] if j["id"] == plan["suitePreparerJobId"])
    child = api(f"actions/artifacts/{suite['childArtifact']['id']}")
    parent = api(f"actions/artifacts/{suite['artifactId']}")
    metadata = producer_metadata(plan, suite, run, job, child, parent)
    root = Path(sys.argv[2]); root.mkdir(parents=True, exist_ok=False)
    archive = root / "suite-child.zip"
    with archive.open("xb") as f:
        subprocess.run(["gh", "api", f"repos/{REPO}/actions/artifacts/{child['id']}/zip"], stdout=f, check=True)
    receipt = unpack(archive, root, suite)
    proof = {"status": "verified", "descriptorSha256": plan["suiteDescriptorSha256"], "source": d["source"], "parentArchiveVerification": "Official API digest and size + pinned preparer full-parent-download attestation; consumer did not download parent", "preparer": metadata, "childArtifact": child, "downloadedChildSha256": file_sha(archive), "downloadedChildBytes": archive.stat().st_size, "packageReceiptSha256": suite["packageReceiptSha256"], "installer": suite["installer"], "suite": suite, "receipt": receipt}
    (root / "suite-child-binding.json").write_text(json.dumps(proof, indent=2) + "\n", encoding="utf8")
    print(json.dumps({"status": "verified", "childArtifactId": child["id"], "parentDownloadedByConsumer": False}))


if __name__ == "__main__":
    main()
