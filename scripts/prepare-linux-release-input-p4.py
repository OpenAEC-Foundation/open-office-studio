"""One P4 parent download; six isolated app inputs and two separate Suite inputs.

Only the Suite ELF is inspected without extracting its runtime. No native claim.
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
import tarfile
import tempfile
import stat
import struct


def inspect_suite_elf(package):
    """Read only the actual Suite executable, never unpack its runtime/app tree."""
    member = 'usr/bin/open-office-studio'
    with tempfile.TemporaryDirectory(prefix='suite-elf-', dir=os.environ['RUNNER_TEMP']) as tmp:
        target = Path(tmp) / 'elf'
        if package.suffix == '.deb':
            proc = subprocess.Popen(['dpkg-deb', '--fsys-tarfile', str(package)], stdout=subprocess.PIPE)
            found = []
            with tarfile.open(fileobj=proc.stdout, mode='r|') as archive:
                for entry in archive:
                    if entry.name.removeprefix('./') == member:
                        assert entry.isfile() and not entry.issym() and not entry.islnk()
                        found.append(entry)
                        with archive.extractfile(entry) as src, target.open('wb') as dst:
                            shutil.copyfileobj(src, dst)
                        mode = entry.mode
            assert proc.wait() == 0 and len(found) == 1
        else:
            with package.open('rb') as stream:
                header = stream.read(4 * 1024 * 1024)
            assert header[:4] == b'\x7fELF' and header[8:11] == b'AI\x02'
            positions = [i for i in range(len(header)-32) if header[i:i+4] == b'hsqs' and struct.unpack_from('<HH', header, i+28) == (4,0)]
            assert len(positions) == 1
            root = Path(tmp) / 'payload'
            subprocess.run(['unsquashfs','-no-progress','-no-xattrs','-d',str(root),'-o',str(positions[0]),str(package),member],check=True)
            target = root/member
            assert target.is_file() and not target.is_symlink()
            mode = stat.S_IMODE(target.stat().st_mode)
        with target.open('rb') as stream: header = stream.read(64)
        assert header[:6] == b'\x7fELF\x02\x01' and struct.unpack_from('<H',header,18)[0] == 62 and mode & 0o111
        return dict(path=member,sha256=digest(target),bytes=target.stat().st_size,mode=mode,elfClass=2,machine=62)


def prepare_suite_transfers(artifact, job, binding):
    suite = Path('.local/standalone-linux-prepared/office')
    origin = json.loads((suite/'origin.json').read_text(encoding='utf-8'))
    metadata = Path('.local/linux-release-input-p4-metadata');metadata.mkdir(exist_ok=True)
    dependencies=[]
    for appdir in sorted(suite.parent.iterdir()):
        if not appdir.is_dir():continue
        apporigin=json.loads((appdir/'origin.json').read_text(encoding='utf-8'))
        dependencies.append(dict(app=apporigin['studio']['sleutel'],sourceCommit=SOURCE,sourceTree=TREE,version=apporigin['version'],parentArtifact=apporigin['artifact'],packageReportSha256=apporigin['packageReportSha256'],debControl=apporigin['debControl']))
    assert len(dependencies)==7
    (metadata/'all-seven-deb-controls.json').write_text(json.dumps(dependencies,indent=2)+'\n',encoding='utf-8')
    for kind in ['deb','appimage']:
        package, = [p for p in origin['packages'] if p['path'].lower().endswith('.'+kind)]
        src = suite/package['path']
        descriptor = json.loads((HERE/f'docs/tests/linux-release-input-p4/office-{kind}-input-descriptor.template.json').read_text(encoding='utf-8'))
        out = Path(f'.local/suite-input-office-{kind}-p4');out.mkdir()
        normalized = descriptor['package']['member']
        shutil.move(src,out/normalized)
        dst = out/normalized
        control = None
        if kind == 'deb':
            control = {key:subprocess.check_output(['dpkg-deb','--field',str(dst),key],text=True).strip() for key in ['Package','Version','Architecture','Depends']}
            assert control['Package']=='open-office-studio' and control['Version']=='2026.48.1' and control['Architecture']=='amd64'
            assert re.search(r'(^|[, ])zenity([ (,]|$)',control['Depends']), 'P4 must declare its native dialog dependency'
        descriptor.update(purpose='P4 frozen source, verified original package transfer; no native acceptance claim',executionApproved=False)
        descriptor['parent'].update(jobConclusion=job['conclusion'],installerArchive=dict(id=artifact['id'],name=artifact['name'],sha256=artifact['digest'].removeprefix('sha256:'),bytes=artifact['size_in_bytes']),packageReportSha256=origin['packageReportSha256'],packageReportMember=next(n for n in binding['members'] if Path(n).name==origin['packageReport']),packageMember=package['canonicalMember'])
        descriptor['artifact']['run']=int(os.environ['GITHUB_RUN_ID'])
        descriptor['qaPin']['producerCommit']=os.environ['GITHUB_SHA']
        descriptor['package'].update(sha256=package['sha256'],bytes=package['bytes'],control=control,payloadElf=inspect_suite_elf(dst))
        descriptor['signatureBinding'].update(status='Original package hashes verified; no Linux signature certification; publication disabled')
        descriptor['signatureBinding']['members']=[s for s in origin.get('signatures',[]) if s['packagePath']==package['path']]
        for signature in descriptor['signatureBinding']['members']:
            shutil.copyfile(suite/signature['path'],out/signature['path'])
        shutil.copyfile(suite/origin['packageReport'],out/origin['packageReport'])
        (out/'descriptor.json').write_text(json.dumps(descriptor,indent=2)+'\n',encoding='utf-8')
        shutil.copyfile(out/'descriptor.json',metadata/f'office-{kind}-descriptor.json')
    shutil.copyfile(suite/'origin.json',metadata/'office-origin.json')
    shutil.copyfile(suite/origin['packageReport'],metadata/origin['packageReport'])

REPO = "OpenAEC-Foundation/open-office-studio"
SOURCE = '04fa6cd43b84e3f59fb9d5055bb2d00dde351a47'
TREE = '94fa38c20b51a73e4912964f37f0e1a659b0fb1b'
HERE = Path(__file__).resolve().parent.parent
REQUIRED_GATES = [
    'Pakket bouwen (onondertekend)',
    'Linux-installers werkelijk uitpakken en controleren',
    'Meet- en inhoudscontrole voor de meegeleverde runtime',
    'Linux native WebKit-interface en private installer controleren',
    'Run actions/upload-artifact@v4',
]
NON_LINUX_GATE = 'Standaardinstaller controleren met uitsluitend de private runtime'

def verify_intake(pin, run, job, artifact):
    assert pin['purpose']=='P4-frozen-candidate' and pin['sourceCommit']==SOURCE and pin['sourceTree']==TREE and pin['version']=='2026.48.1'
    assert pin['run']==run['id']==45172070275 and run['head_sha']==SOURCE and run['path']=='.github/workflows/release.yml'
    assert pin['attempt']==run['run_attempt']==job['run_attempt']==1
    assert pin['job']==job['id']==137683944835 and job['run_id']==run['id'] and job['name']=='Bouwen – Linux'
    assert job['status']=='completed' and job['conclusion']=='success'
    for name in REQUIRED_GATES:
        gates=[s for s in job['steps'] if s['name']==name]
        assert len(gates)==1 and gates[0]['status']=='completed' and gates[0]['conclusion']=='success',name
    # P2 release.yml runs this variant only when runner.os != Linux. The real
    # Linux native alternative above is mandatory and must be SUCCESS.
    skipped=[s for s in job['steps'] if s['name']==NON_LINUX_GATE]
    assert len(skipped)==1 and skipped[0]['status']=='completed' and skipped[0]['conclusion']=='skipped'
    assert artifact['id']==pin['artifact']['id'] and artifact['name']==pin['artifact']['name']=='uitgave-Linux' and not artifact['expired']
    assert artifact['workflow_run']['id']==run['id'] and artifact['workflow_run']['head_sha']==SOURCE
    assert artifact['digest']==pin['artifact']['digest'] and artifact['size_in_bytes']==pin['artifact']['bytes']
    assert artifact['created_at']==pin['artifact']['createdAt'] and artifact['updated_at']==pin['artifact']['updatedAt']
    assert job['started_at']==pin['window']['jobStartedAt'] and job['completed_at']==pin['window']['jobCompletedAt']
    utc=lambda text:datetime.fromisoformat(text.replace('Z','+00:00'))
    assert utc(run['run_started_at'])<=utc(job['started_at'])<=utc(artifact['created_at'])<=utc(artifact['updated_at'])<=utc(job['completed_at'])
    assert re.fullmatch(r'sha256:[0-9a-f]{64}',pin['artifact']['digest']) and pin['artifact']['bytes']>0

def pinned_request():
    raw=(HERE/'docs/tests/linux-release-input-p4/intake.json').read_bytes()
    pin=json.loads(raw)
    go_raw=(HERE/'docs/tests/linux-release-input-p4/request.json').read_bytes()
    go=json.loads(go_raw)
    assert go['go'] is True and go['purpose']=='P4-frozen-candidate' and go['sourceCommit']==SOURCE
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
    assert os.environ.get('GITHUB_ACTIONS') == 'true' and os.name == 'posix'
    assert os.environ["GITHUB_REPOSITORY"] == REPO
    source = os.environ["STANDALONE_APP_COMMIT"]
    run_id = os.environ["STANDALONE_BUILD_RUN"]
    assert len(source) == 40 and run_id.isdecimal()
    assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == source
    studios = json.loads(Path("assets/studios.json").read_text())
    assert len(studios) == 7 and {s["sleutel"] for s in studios} == {"office","writer","spreadsheet","presentation","email","notition","database"}
    purpose = "P4-frozen-candidate"
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
    archive = Path(os.environ["RUNNER_TEMP"]) / "standalone-release.zip"
    with archive.open("wb") as target:
        subprocess.run(["gh", "api", f"repos/{REPO}/actions/artifacts/{artifact['id']}/zip"], stdout=target, check=True)
    archive_hash = digest(archive)
    assert artifact["digest"] == "sha256:" + archive_hash and archive.stat().st_size == artifact["size_in_bytes"]
    with zipfile.ZipFile(archive) as bundle:
        names = bundle.namelist()
        assert len(names) == len(set(names))
        assert all(not Path(n).is_absolute() and '..' not in Path(n).parts and '\\' not in n for n in names)
        binding['members'] = names
        for studio in studios:
            extract_app(bundle, studio, version, source, run_id, artifact, archive_hash,binding)
    manifest = Path('.local/standalone-linux-prepared/preparation-receipt.json')
    manifest.write_text(json.dumps(dict(source=source,tree=subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip(),run=int(run_id),linuxJob=job,artifact=artifact,intake=binding,archiveLocallyHashVerified=True,officeSuitePackagesPreservedSeparately=True,officeAppRuntimeExtracted=False,apps=[s['sleutel'] for s in studios]),indent=2)+'\n')
    archive.unlink()
    prepare_suite_transfers(artifact,job,binding)


def extract_app(bundle, studio, version, source, run_id, artifact, archive_hash,binding=None):
    app = studio["sleutel"]
    out = Path(".local/standalone-linux-prepared") / app
    out.mkdir(parents=True, exist_ok=False)
    report_name = "pakketcontrole-Linux.json" if app == "office" else "pakketcontrole-Database-Linux.json" if app == "database" else f"pakketcontrole-{app}-Linux.json"
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
        expected, = [p for p in control["pakketten"] if p["naam"] == package.name]
        assert package.stat().st_size == expected["bytes"] and digest(package) == expected["sha256"]
    origin = {"sourceCommit": source, "sourceTree": subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], text=True).strip(),
              "version": version, "run": int(run_id), "linuxJob": int(os.environ.get('STANDALONE_LINUX_JOB','0')), "artifact": {"id": artifact["id"], "name":artifact.get('name'),"bytes":artifact.get('size_in_bytes'),"zipSha256": archive_hash},
              "purpose": "P4-frozen-candidate",
              "studio": studio, "packageReport": report_name, "packageReportSha256":digest(out/report_name),
              "packages": [{"path": p.name,"canonicalMember":members[p.name], "sha256": digest(p), "bytes": p.stat().st_size} for p in packages],
              "signatureStatus": "not signature-certified by this QA: detached Linux OpenPGP signing belongs to the publishing job, which is not authorized"}
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        deb, = [p for p in packages if p.suffix=='.deb']
        fields={key:subprocess.check_output(['dpkg-deb','--field',str(deb),key],text=True).strip() for key in ['Package','Version','Architecture','Depends']}
        assert fields['Package']==studio['programma'] and fields['Version']==version and fields['Architecture']=='amd64'
        assert re.search(r'(^|[, ])zenity([ (,]|$)',fields['Depends']), f'{app} DEB must declare zenity at P4'
        origin['debControl']=dict(path=deb.name,sha256=digest(deb),bytes=deb.stat().st_size,fields=fields,method='dpkg-deb --field on actual hash-verified original DEB; no install/native claim')
    if app == 'office':
        origin['signatures']=[]
        for package in packages:
            sig_member=members[package.name]+'.sig'
            if sig_member in bundle.namelist():
                sig=out/(package.name+'.sig')
                sig.write_bytes(bundle.read(sig_member))
                origin['signatures'].append(dict(path=sig.name,canonicalMember=sig_member,packagePath=package.name,sha256=digest(sig),bytes=sig.stat().st_size,status='present, not cryptographically certified by this QA'))
    if binding is not None:
        origin.update(intake=binding,preparedBy=dict(run=int(os.environ['GITHUB_RUN_ID']),qaCommit=os.environ['GITHUB_SHA']))
    (out / "origin.json").write_text(json.dumps(origin, indent=2) + "\n")
    print(json.dumps(origin))


if __name__ == '__main__':
    main()



