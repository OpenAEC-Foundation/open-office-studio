"""Download only the canonical P2 Windows suite for native GNM QA in CI."""
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
    artifact = api(f'actions/artifacts/{ARTIFACT}')
    assert run['id'] == RUN and run['head_sha'] == APP and run['conclusion'] == 'success'
    assert commit['tree']['sha'] == TREE
    assert artifact['id'] == ARTIFACT and artifact['name'] == 'open-office-studio-Windows'
    assert artifact['workflow_run']['id'] == RUN and artifact['workflow_run']['head_sha'] == APP
    assert not artifact['expired'] and artifact['digest'] == 'sha256:' + DIGEST
    archive = root / 'canonical-windows.zip'
    with archive.open('xb') as stream:
        subprocess.run(['gh', 'api', repo + f'actions/artifacts/{ARTIFACT}/zip'], stdout=stream, check=True)
    assert sha(archive) == DIGEST and archive.stat().st_size == artifact['size_in_bytes']
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
    receipt = dict(applicationCommit=APP, applicationTree=TREE, version='2026.48.1', desktopRun=RUN,
                   artifactId=ARTIFACT, archiveSha256=DIGEST, installer=installers[0],
                   executable='open-office-studio.exe', identifier='org.openaec.office-studio',
                   title='Open Office Studio', ancillaryNotExtracted=ancillary,
                   scope='Canonical suite native GNM QA; not standalone or release-signing acceptance')
    for name, value in [('package.json', receipt), ('source-run.json', run),
                        ('artifact-metadata.json', artifact)]:
        (root / name).write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(receipt))

if __name__ == '__main__': main()
