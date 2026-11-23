"""One canonical download, six untouched installers, no suite files on app hosts."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import zipfile

APPS = ('writer', 'spreadsheet', 'presentation', 'email', 'notition', 'database')

def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''): digest.update(block)
    return digest.hexdigest()

def validate(plan):
    assert plan['schemaVersion'] == 1 and type(plan['frozen']) is bool
    if not plan['frozen']: return
    for key in ('applicationCommit', 'applicationTree'): assert re.fullmatch('[0-9a-f]{40}', plan[key])
    assert re.fullmatch(r'20\d{2}\.\d{1,2}\.\d+', plan['version'])
    assert type(plan['artifactRun']) is int and plan['artifactRun'] > 0
    assert type(plan['platformJobId']) is int and plan['platformJobId'] > 0
    assert re.fullmatch('[0-9a-f]{64}', plan['archiveSha256'])
    assert plan['artifactName'] and {a['key'] for a in plan['applications']} == set(APPS)
    assert len(plan['applications']) == 6
    for app in plan['applications']:
        assert app['executable'] == 'open-' + app['key'] + '-studio.exe'
        assert app['identifier'] == 'org.openaec.' + app['key'] + '-studio'
        assert app['title'] and app['packagePath'].endswith('-setup.exe')
        path = PurePosixPath(app['packagePath'])
        assert not path.is_absolute() and '..' not in path.parts and '\\' not in app['packagePath']
        assert re.fullmatch('[0-9a-f]{64}', app['sha256'])
        assert type(app['bytes']) is int and 0 < app['bytes'] < 2 * 1024 ** 3
        assert app.get('signature', 'record') in ('valid', 'record')

def main():
    command, plan_path, *rest = sys.argv[1:]
    plan = json.loads(Path(plan_path).read_bytes()); validate(plan)
    if command == 'plan':
        values = 'frozen=' + str(plan['frozen']).lower() + '\napps=' + json.dumps(APPS) + '\nhostProbe=' + str(plan.get('hostProbe', False)).lower() + '\nwriterPreflight=' + str(plan.get('writerPreflight', False)).lower() + '\n'
        if os.environ.get('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as out: out.write(values)
        print(values, end=''); return
    assert command == 'split' and plan['frozen']
    root = Path(rest[0]); root.mkdir(parents=True, exist_ok=False)
    repo = os.environ['GH_REPO']; assert re.fullmatch(r'[\w.-]+/[\w.-]+', repo)
    def api(endpoint): return json.loads(subprocess.check_output(['gh', 'api', f'repos/{repo}/{endpoint}']))
    run = api(f"actions/runs/{plan['artifactRun']}")
    commit = api(f"git/commits/{plan['applicationCommit']}")
    assert commit['tree']['sha'] == plan['applicationTree'], 'Frozen tree differs from actual application commit'
    assert run['head_sha'] == plan['applicationCommit'], 'Canonical build source differs from frozen manifest'
    # Windows may start as soon as its own canonical build/upload is complete.
    # Do not wait for the unrelated macOS/Linux jobs or require a green whole run.
    job = api(f"actions/jobs/{plan['platformJobId']}")
    assert job['run_id'] == plan['artifactRun'] and job['status'] == 'completed' and job['conclusion'] == 'success', 'Canonical Windows package job not successfully completed'
    artifacts = api(f"actions/runs/{plan['artifactRun']}/artifacts?per_page=100")['artifacts']
    candidates = [a for a in artifacts if a['name'] == plan['artifactName'] and not a['expired']]
    assert len(candidates) == 1
    artifact = candidates[0]
    if artifact.get('digest'): assert artifact['digest'] == 'sha256:' + plan['archiveSha256']
    archive = root / 'canonical.zip'
    with archive.open('xb') as stream:
        subprocess.run(['gh', 'api', f"repos/{repo}/actions/artifacts/{artifact['id']}/zip"], stdout=stream, check=True)
    assert sha(archive) == plan['archiveSha256'], 'Canonical whole ZIP hash mismatch'
    with zipfile.ZipFile(archive) as bundle:
        names = bundle.namelist(); assert len(names) == len(set(names)) and len(names) < 10000
        for name in names:
            path = PurePosixPath(name)
            assert not path.is_absolute() and '..' not in path.parts and '\\' not in name
        for app in plan['applications']:
            entry = bundle.getinfo(app['packagePath']); assert entry.file_size == app['bytes']
            target = root / app['key']; target.mkdir()
            installer = target / PurePosixPath(app['packagePath']).name
            with bundle.open(entry) as source, installer.open('xb') as out: shutil.copyfileobj(source, out, 1024 * 1024)
            assert sha(installer) == app['sha256'], app['key']
            receipt = {key: plan[key] for key in ('applicationCommit', 'applicationTree', 'version', 'artifactRun', 'archiveSha256')}
            receipt.update(artifactId=artifact['id'], platformJobId=plan['platformJobId'], upstreamRunStatus=run['status'], upstreamRunConclusion=run['conclusion'], application=app, installer=installer.name,
                           boundary='Only this unchanged app installer and this manifest are transferred to its fresh host; no suite package/resources/profile')
            (target / 'package.json').write_text(json.dumps(receipt, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'source': plan['applicationCommit'], 'applications': list(APPS), 'oneCanonicalDownload': True}))

if __name__ == '__main__': main()
