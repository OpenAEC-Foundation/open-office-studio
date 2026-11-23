"""Split standalone apps from one checksum-verified release artifact download.

The complete artifact stays in RUNNER_TEMP, outside the isolated app HOME. Office
payloads are never extracted. A successful build is not treated as native proof.
"""
import hashlib
from datetime import datetime
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import zipfile

REPO = "OpenAEC-Foundation/open-office-studio"
SOURCE = 'dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b'
TREE = '5a644e397ecc6af5452a49b6404edf953687d1b2'
HERE = Path(__file__).resolve().parent.parent
REQUIRED_GATES = [
    'Pakket bouwen (onondertekend)',
    'Linux-installers werkelijk uitpakken en controleren',
    'Meet- en inhoudscontrole voor de meegeleverde runtime',
    'Standaardinstaller controleren met uitsluitend de private runtime',
    'Linux native WebKit-interface en private installer controleren',
    'Run actions/upload-artifact@v4',
]

def verify_intake(pin, run, job, artifact):
    assert pin['purpose']=='P2-baseline-only' and pin['sourceCommit']==SOURCE and pin['sourceTree']==TREE and pin['version']=='2026.48.1'
    assert pin['run']==run['id']==45150438420 and run['head_sha']==SOURCE and run['path']=='.github/workflows/release.yml'
    assert pin['attempt']==run['run_attempt']==job['run_attempt']==1
    assert pin['job']==job['id']==137610274931 and job['run_id']==run['id'] and job['name']=='Bouwen – Linux'
    assert job['status']=='completed' and job['conclusion']=='success'
    for name in REQUIRED_GATES:
        gates=[s for s in job['steps'] if s['name']==name]
        assert len(gates)==1 and gates[0]['status']=='completed' and gates[0]['conclusion']=='success',name
    assert artifact['id']==pin['artifact']['id'] and artifact['name']==pin['artifact']['name']=='uitgave-Linux' and not artifact['expired']
    assert artifact['workflow_run']['id']==run['id'] and artifact['workflow_run']['head_sha']==SOURCE
    assert artifact['digest']==pin['artifact']['digest'] and artifact['size_in_bytes']==pin['artifact']['bytes']
    assert artifact['created_at']==pin['artifact']['createdAt'] and artifact['updated_at']==pin['artifact']['updatedAt']
    assert job['started_at']==pin['window']['jobStartedAt'] and job['completed_at']==pin['window']['jobCompletedAt']
    utc=lambda text:datetime.fromisoformat(text.replace('Z','+00:00'))
    assert utc(run['run_started_at'])<=utc(job['started_at'])<=utc(artifact['created_at'])<=utc(artifact['updated_at'])<=utc(job['completed_at'])
    assert re.fullmatch(r'sha256:[0-9a-f]{64}',pin['artifact']['digest']) and pin['artifact']['bytes']>0

def pinned_request():
    raw=(HERE/'docs/tests/standalone-linux-final-p2-intake.json').read_bytes()
    pin=json.loads(raw)
    go_raw=(HERE/'docs/tests/standalone-linux-final-p2-request.json').read_bytes()
    go=json.loads(go_raw)
    assert go['go'] is True and go['purpose']=='P2-baseline-only' and go['sourceCommit']==SOURCE
    assert go['intakeSha256']==hashlib.sha256(raw).hexdigest() and go['publicationAuthorized'] is False
    return pin,dict(intakeSha256=hashlib.sha256(raw).hexdigest(),goSha256=hashlib.sha256(go_raw).hexdigest(),intake=pin)


def api(route):
    return json.loads(subprocess.check_output(["gh", "api", f"repos/{REPO}/{route}"]))


def digest(path):
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            checksum.update(chunk)
    return checksum.hexdigest()


def main():
    assert os.environ["GITHUB_REPOSITORY"] == REPO
    source = os.environ["STANDALONE_APP_COMMIT"]
    run_id = os.environ["STANDALONE_BUILD_RUN"]
    assert len(source) == 40 and run_id.isdecimal()
    assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == source
    studios = json.loads(Path("assets/studios.json").read_text())
    studios = [s for s in studios if s["sleutel"] != "office"]
    assert len(studios) == 6
    purpose = os.environ.get("STANDALONE_PURPOSE", "frozen-candidate-acceptance")
    assert purpose in ("frozen-candidate-acceptance", "host-driver-preflight-NOT-final-acceptance")
    if purpose == "host-driver-preflight-NOT-final-acceptance":
        studios = [s for s in studios if s["sleutel"] == "notition"]
    version = json.loads(Path("package.json").read_text())["version"]
    run = api(f"actions/runs/{run_id}")
    assert run["head_sha"] == source
    assert run["path"] == ".github/workflows/release.yml"
    pin, binding = pinned_request()
    assert subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip()==pin['sourceTree'] and version==pin['version']
    job_id = os.environ["STANDALONE_LINUX_JOB"]
    assert job_id.isdecimal()
    job = api(f"actions/jobs/{job_id}")
    assert job["run_id"] == int(run_id) and job["name"].endswith("Linux")
    assert job["status"] == "completed" and job["conclusion"] == "success", "Only the own Linux job must be ready; other platforms are independent"
    artifacts = api(f"actions/runs/{run_id}/artifacts?per_page=100")["artifacts"]
    matches = [a for a in artifacts if a["name"] == "uitgave-Linux" and not a["expired"]]
    assert len(matches) == 1
    artifact = matches[0]
    assert artifact["workflow_run"]["head_sha"] == source
    verify_intake(pin,run,job,artifact)
    reuse = os.environ.get("STANDALONE_PREFLIGHT_REUSE_RUN", "")
    if reuse:
        assert purpose == "host-driver-preflight-NOT-final-acceptance" and reuse.isdecimal()
        qa_run = api(f"actions/runs/{reuse}")
        assert qa_run["path"] == ".github/workflows/standalone-linux-acceptance.yml"
        out = Path(".local/standalone-linux-prepared/notition")
        subprocess.run(["gh", "run", "download", reuse, "--repo", REPO, "--name", "standalone-input-notition", "--dir", str(out)], check=True)
        origin = json.loads((out / "origin.json").read_text())
        assert origin["purpose"] == purpose and origin["sourceCommit"] == source and origin["version"] == version
        assert origin["run"] == int(run_id) and origin["artifact"]["id"] == artifact["id"]
        assert "sha256:" + origin["artifact"]["zipSha256"] == artifact["digest"]
        assert origin["sourceTree"] == subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], text=True).strip()
        assert origin["studio"]["sleutel"] == "notition"
        for package in origin["packages"]:
            path = out / package["path"]
            assert path.parent == out and path.stat().st_size == package["bytes"] and digest(path) == package["sha256"]
        origin["reusedVerifiedInputRun"] = int(reuse)
        (out / "origin.json").write_text(json.dumps(origin, indent=2) + "\n")
        print(json.dumps(origin))
        return
    archive = Path(os.environ["RUNNER_TEMP"]) / "standalone-release.zip"
    with archive.open("wb") as target:
        subprocess.run(["gh", "api", f"repos/{REPO}/actions/artifacts/{artifact['id']}/zip"], stdout=target, check=True)
    archive_hash = digest(archive)
    assert artifact["digest"] == "sha256:" + archive_hash and archive.stat().st_size == artifact["size_in_bytes"]
    with zipfile.ZipFile(archive) as bundle:
        for studio in studios:
            extract_app(bundle, studio, version, source, run_id, artifact, archive_hash,binding)
    manifest = Path('.local/standalone-linux-prepared/preparation-receipt.json')
    manifest.write_text(json.dumps(dict(source=source,tree=subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip(),run=int(run_id),linuxJob=job,artifact=artifact,intake=binding,archiveLocallyHashVerified=True,officeExtracted=False,apps=[s['sleutel'] for s in studios]),indent=2)+'\n')
    archive.unlink()


def extract_app(bundle, studio, version, source, run_id, artifact, archive_hash,binding=None):
    app = studio["sleutel"]
    out = Path(".local/standalone-linux-prepared") / app
    out.mkdir(parents=True, exist_ok=False)
    report_name = "pakketcontrole-Database-Linux.json" if app == "database" else f"pakketcontrole-{app}-Linux.json"
    members = {}
    for member in bundle.namelist():
        name = Path(member).name
        is_app_package = f"/{app}/" in "/" + member and name.endswith((".deb", ".AppImage"))
        if not is_app_package and name != report_name:
            continue
        dest = out / name
        assert not dest.exists(), f"Duplicate artifact member: {name}"
        with bundle.open(member) as src, dest.open("wb") as target:
            shutil.copyfileobj(src, target)
        members[name] = member
    packages = sorted(p for p in out.iterdir() if p.suffix in (".deb", ".AppImage"))
    assert len(packages) == 2 and {p.suffix for p in packages} == {".deb", ".AppImage"}
    control = json.loads((out / report_name).read_text())
    assert control["programma"] == studio["programma"] and control["versie"] == version
    for package in packages:
        expected = next(p for p in control["pakketten"] if p["naam"] == package.name)
        assert package.stat().st_size == expected["bytes"] and digest(package) == expected["sha256"]
    origin = {"sourceCommit": source, "sourceTree": subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], text=True).strip(),
              "version": version, "run": int(run_id), "linuxJob": int(os.environ.get('STANDALONE_LINUX_JOB','0')), "artifact": {"id": artifact["id"], "name":artifact.get('name'),"bytes":artifact.get('size_in_bytes'),"zipSha256": archive_hash},
              "purpose": os.environ.get("STANDALONE_PURPOSE", "frozen-candidate-acceptance"),
              "studio": studio, "packageReport": report_name, "packageReportSha256":digest(out/report_name),
              "packages": [{"path": p.name,"canonicalMember":members[p.name], "sha256": digest(p), "bytes": p.stat().st_size} for p in packages],
              "signatureStatus": "not signature-certified by this QA: detached Linux OpenPGP signing belongs to the publishing job, which is not authorized"}
    if binding is not None:
        origin.update(intake=binding,preparedBy=dict(run=int(os.environ['GITHUB_RUN_ID']),qaCommit=os.environ['GITHUB_SHA']))
    (out / "origin.json").write_text(json.dumps(origin, indent=2) + "\n")
    print(json.dumps(origin))


if __name__ == "__main__":
    main()
