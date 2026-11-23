"""Download only the canonical P2 Windows suite for native XLSB QA in CI."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import zipfile

APP = 'dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b'
TREE = '5a644e397ecc6af5452a49b6404edf953687d1b2'
RUN = 45143305147
ARTIFACT = 14804672476
DIGEST = 'ecce5a188abbb5b17e52c4097d7add95ddeaaa8c24a9a4e6c492049d16902733'
JOB = 137586342967
REPORT_ARTIFACT = 14804637474
REPORT_DIGEST = '99185caa31f249f6d198aef67a8c1cca6acbc18012d90f2ebec7c5f2d2fed4a0'

def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def main():
    assert os.environ.get('GITHUB_ACTIONS') == 'true'
    assert os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted'
    root = Path(sys.argv[1]); root.mkdir(parents=True, exist_ok=False)
    repo = 'repos/OpenAEC-Foundation/open-office-studio/'
    def api(path):
        return json.loads(subprocess.check_output(['gh', 'api', repo + path]))
    run = api(f'actions/runs/{RUN}')
    commit = api(f'git/commits/{APP}')
    job = api(f'actions/jobs/{JOB}')
    artifact = api(f'actions/artifacts/{ARTIFACT}')
    assert run['id'] == RUN and run['head_sha'] == APP and run['conclusion'] == 'success'
    assert run['run_attempt'] == 1 and run['path'] == '.github/workflows/desktop.yml'
    assert commit['tree']['sha'] == TREE
    assert job['id'] == JOB and job['run_id'] == RUN and job['run_attempt'] == 1
    assert job['name'] == 'desktop (windows-latest)' and job['conclusion'] == 'success'
    steps = {s['name']: s for s in job['steps']}
    for name in ('Windows-pakket bouwen', 'Windows-installer werkelijk uitpakken en controleren'):
        assert steps[name]['status'] == 'completed' and steps[name]['conclusion'] == 'success'
    assert artifact['id'] == ARTIFACT and artifact['name'] == 'open-office-studio-Windows'
    assert artifact['workflow_run']['id'] == RUN and artifact['workflow_run']['head_sha'] == APP
    assert not artifact['expired'] and artifact['digest'] == 'sha256:' + DIGEST
    archive = root / 'canonical-windows.zip'
    with archive.open('xb') as stream:
        subprocess.run(['gh', 'api', repo + f'actions/artifacts/{ARTIFACT}/zip'], stdout=stream, check=True)
    assert sha(archive) == DIGEST and archive.stat().st_size == artifact['size_in_bytes']
    report_meta = api(f'actions/artifacts/{REPORT_ARTIFACT}')
    assert report_meta['name'] == 'pakketcontrole-Windows' and not report_meta['expired']
    assert report_meta['digest'] == 'sha256:' + REPORT_DIGEST
    assert report_meta['workflow_run']['id'] == RUN and report_meta['workflow_run']['head_sha'] == APP
    report_zip = root / 'canonical-package-report.zip'
    with report_zip.open('xb') as stream:
        subprocess.run(['gh', 'api', repo + f'actions/artifacts/{REPORT_ARTIFACT}/zip'], stdout=stream, check=True)
    assert sha(report_zip) == REPORT_DIGEST
    with zipfile.ZipFile(report_zip) as package_report:
        assert package_report.namelist() == ['pakketcontrole-Windows.json']
        report_bytes = package_report.read('pakketcontrole-Windows.json')
    canonical_report = json.loads(report_bytes)
    assert canonical_report['platform'] == 'windows' and canonical_report['versie'] == '2026.48.1'
    assert canonical_report['programma'] == 'open-office-studio' and len(canonical_report['pakketten']) == 1
    (root / 'canonical-package-report.json').write_bytes(report_bytes)
    installers = []; ancillary = []
    with zipfile.ZipFile(archive) as bundle:
        names = [e.filename for e in bundle.infolist()]
        assert len(names) == len(set(names)) and len(names) < 10000
        for entry in bundle.infolist():
            path = PurePosixPath(entry.filename)
            assert not path.is_absolute() and '..' not in path.parts and '\\' not in entry.filename
            assert not stat.S_ISLNK(entry.external_attr >> 16)
            if entry.is_dir(): continue
            if len(path.parts) != 2 or path.parts[0] != 'nsis':
                ancillary.append(entry.filename); continue
            assert path.name == 'Open Office Studio_2026.48.1_x64-setup.exe'
            assert 1000000 < entry.file_size < 2 * 1024**3
            target = root / path.name
            with bundle.open(entry) as source, target.open('xb') as output:
                shutil.copyfileobj(source, output, 1024 * 1024)
            installers.append(dict(path=path.name, bytes=target.stat().st_size, sha256=sha(target)))
    assert len(installers) == 1
    packaged = canonical_report['pakketten'][0]
    assert packaged['naam'] == installers[0]['path'] and packaged['sha256'] == installers[0]['sha256']
    assert packaged['bytes'] == installers[0]['bytes'] == 384512913
    assert packaged['sha256'] == '85d5155a0322ce296eb4f57485235cdb725f4f293c7642bc562971ff924357ce'
    # Derive executable identity independently from installer payload before installation.
    sevenzip = shutil.which('7z') or shutil.which('7z.exe') or 'C:/Program Files/7-Zip/7z.exe'
    installer = root / installers[0]['path']
    listing = subprocess.check_output([sevenzip, 'l', '-slt', str(installer)], text=True, encoding='utf-8')
    members = [line[7:] for line in listing.splitlines() if line.startswith('Path = ')]
    exe_members = [m for m in members if PurePosixPath(m.replace('\\', '/')).name == 'open-office-studio.exe']
    assert len(exe_members) == 1 and not any(c in exe_members[0] for c in '*?')
    payload = root / 'independent-payload.exe'
    with payload.open('xb') as stream:
        subprocess.run([sevenzip, 'x', '-so', str(installer), exe_members[0]], stdout=stream, check=True)
    with payload.open('rb') as stream:
        header = stream.read(64); assert header[:2] == b'MZ'
        stream.seek(int.from_bytes(header[60:64], 'little'))
        pe = stream.read(26); assert pe[:6] == b'PE\x00\x00\x64\x86' and pe[24:26] == b'\x0b\x02'
    payload_receipt = dict(member=exe_members[0], bytes=payload.stat().st_size, sha256=sha(payload),
                           derivation='7-Zip extract-only stdout from whole-ZIP/report-bound NSIS before install', pe='x64')
    payload.unlink()
    receipt = dict(applicationCommit=APP, applicationTree=TREE, version='2026.48.1', desktopRun=RUN,
                   artifactId=ARTIFACT, archiveSha256=DIGEST, installer=installers[0],
                   executable='open-office-studio.exe', identifier='org.openaec.office-studio',
                   payloadExecutable=payload_receipt, sourceJob=JOB, sourceAttempt=1,
                   canonicalPackageReportSha256=hashlib.sha256(report_bytes).hexdigest(),
                   title='Open Office Studio', ancillaryNotExtracted=ancillary,
                   scope='Canonical suite native XLSB QA; not standalone or release-signing acceptance')
    for name, value in [('package.json', receipt), ('source-run.json', run),
                        ('artifact-metadata.json', artifact), ('source-job.json', job),
                        ('source-commit.json', commit), ('package-report-artifact-metadata.json', report_meta)]:
        (root / name).write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(receipt))

if __name__ == '__main__': main()
