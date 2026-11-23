"""Bind the canonical P5 Suite transfer to this short #377 native consumer."""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

HERE = Path(__file__).resolve().parent
OUT = Path('.local/xlsb377-input').resolve()
SOURCE = 'b696ab86bd1c128729a079b68c0082e6df3d36a5'
TREE = 'e30879fd772871e690847c061ef66e6b81808a05'
DESCRIPTOR_SHA = '0c82ca92eaa74a5e631aaf2b8990b40bd24d04830049ed9f48b1cbd3f22e4a03'

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()

def command(*args):
    return subprocess.check_output(args, text=True).strip()

def api(route):
    return json.loads(command('gh', 'api', 'repos/OpenAEC-Foundation/open-office-studio/' + route))

def main():
    assert os.name == 'posix' and os.environ.get('GITHUB_ACTIONS') == 'true'
    assert command('git', 'rev-parse', 'HEAD') == SOURCE
    assert command('git', 'rev-parse', 'HEAD^{tree}') == TREE
    assert command('git', 'status', '--porcelain', '--untracked-files=no') == ''
    assert json.loads(Path('package.json').read_text())['version'] == '2026.48.1'
    descriptor = HERE / 'office-deb-descriptor.json'
    assert sha(descriptor) == DESCRIPTOR_SHA
    d = json.loads(descriptor.read_bytes())
    shared = HERE / 'shared/package'
    pins = json.loads((shared / 'pins.json').read_text())
    assert len(pins) == 2
    for pin in pins:
        assert pin['commit'] == '67d95a1c27bc597ca8c6be62528db21789ebceb6'
        assert sha(shared / pin['path']) == pin['sha256']
    assert sha(shared / 'verify-linux-suite-input-p5.py') == '28742ba3d9a6ba5faca360255ad7de6b5ab9f2c144faa4eb3c0dd17b30ea88e6'
    assert not OUT.exists()
    OUT.mkdir(parents=True)
    raw = descriptor.read_bytes()
    (OUT / 'office-deb-descriptor.json').write_bytes(raw)
    a = d['artifact']
    assert (a['id'], a['run'], a['zipSha256'], a['zipBytes']) == (14823809980, 45188332685, '8a63334448a548c7d90923c659ce99082c7a5360d156ce791c3a2d3a62ba0eec', 383831912)
    metadata = api('actions/artifacts/' + str(a['id']))
    assert metadata['digest'] == 'sha256:' + a['zipSha256'] and metadata['size_in_bytes'] == a['zipBytes']
    assert metadata['workflow_run']['head_sha'] == d['qaPin']['producerCommit']
    prep = api('actions/runs/' + str(a['run']))
    job = api('actions/jobs/137739713476')
    assert prep['head_sha'] == d['qaPin']['producerCommit'] == '86fe2d5c8bde47005fd40b3059d6fa92d98e7b4c'
    assert prep['run_attempt'] == job['run_attempt'] == 1
    assert job['run_id'] == a['run'] and job['status'] == 'completed' and job['conclusion'] == 'success'
    (OUT / 'api-input.json').write_text(json.dumps(dict(artifact=metadata, preparationRun=prep, preparationJob=job), indent=2) + '\n')
    archive = OUT / 'suite-input.zip'
    with archive.open('wb') as stream:
        subprocess.run(['gh', 'api', 'repos/OpenAEC-Foundation/open-office-studio/actions/artifacts/' + str(a['id']) + '/zip'], stdout=stream, check=True)
    assert archive.stat().st_size == a['zipBytes'] and sha(archive) == a['zipSha256'], 'Full official child ZIP digest before extraction'
    verified = OUT / 'verified'
    subprocess.run([sys.executable, str(shared / 'verify-linux-suite-input-p5.py'), '--descriptor', str(descriptor), '--zip', str(archive), '--out', str(verified)], check=True)
    receipt = json.loads((verified / 'verified-input.json').read_text())
    assert receipt['status'] == 'verified-original-Suite-input-only' and receipt['descriptorSha256'] == DESCRIPTOR_SHA
    assert receipt['package'] == d['package'] and receipt['actualPayloadElf'] == d['package']['payloadElf']
    installer = verified / d['package']['member']
    with (OUT / 'apt-install.log').open('w') as log:
        subprocess.run(['sudo', 'apt-get', 'install', '-y', '--no-install-recommends', str(installer)], stdout=log, stderr=subprocess.STDOUT, check=True)
    assert command('dpkg-query', '-W', '-f=${Version}', 'open-office-studio') == '2026.48.1'
    assert command('dpkg-query', '-W', '-f=${Status}', 'open-office-studio') == 'install ok installed'
    assert command('dpkg-query', '-W', '-f=${Status}', 'zenity') == 'install ok installed', 'Resolved by the actual DEB dependency, never a hidden manual install'
    expected = d['package']['payloadElf']
    installed = Path('/') / expected['path']
    info = installed.lstat()
    assert stat.S_ISREG(info.st_mode) and not installed.is_symlink()
    assert (sha(installed), info.st_size, stat.S_IMODE(info.st_mode)) == (expected['sha256'], expected['bytes'], expected['mode'])
    actual = dict(executablePath=str(installed), executableSha256=sha(installed), bytes=info.st_size, mode=stat.S_IMODE(info.st_mode))
    identity = dict(issue=377, executionApproved=True, sourceCommit=SOURCE, sourceTree=TREE, version='2026.48.1', **actual,
        parent=d['parent'], transfer=a, package=d['package'], descriptorSha256=DESCRIPTOR_SHA,
        verifierPins=pins, installedEqualsVerifiedPayload=True, installation='normal apt dependency resolver',
        publicationAuthorized=False, signatureCertified=False)
    (OUT / 'identity.json').write_text(json.dumps(identity, indent=2) + '\n')
    archive.unlink()
    print(json.dumps(identity))

if __name__ == '__main__':
    main()
