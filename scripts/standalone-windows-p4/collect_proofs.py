"""Collect small official QA artifacts; recheck saved bytes, never infer visual pass."""
import argparse
import json
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import zipfile
from intake import APPS, APP, TREE, RUN, JOB, digest, write
from oracle import inspect


def collect(gh, repo, run, target):
    def api(endpoint):
        return json.loads(subprocess.check_output([gh, 'api', f'repos/{repo}/{endpoint}']))
    metadata = api(f'actions/runs/{run}')
    jobs = api(f'actions/runs/{run}/jobs?per_page=100')['jobs']
    artifacts = api(f'actions/runs/{run}/artifacts?per_page=100')['artifacts']
    target.mkdir(parents=True, exist_ok=False)
    write(target/'run.json', metadata)
    write(target/'jobs.json', jobs)
    write(target/'artifacts.json', artifacts)
    fetched = {}
    for artifact in artifacts:
        name = artifact['name']
        if name != 'standalone-windows-p5-binding' and name not in [f'standalone-windows-p5-{app}-proof' for app in APPS]:
            continue
        assert name not in fetched and not artifact['expired']
        assert artifact['workflow_run']['id'] == run
        assert artifact['workflow_run']['head_sha'] == metadata['head_sha']
        assert re.fullmatch(r'sha256:[0-9a-f]{64}', artifact.get('digest', ''))
        assert 0 < artifact['size_in_bytes'] < 100*1024**2, 'Only small QA evidence, no installer transfers'
        archive = target/(name+'.zip')
        with archive.open('xb') as stream:
            subprocess.run([gh, 'api', f"repos/{repo}/actions/artifacts/{artifact['id']}/zip"], stdout=stream, check=True)
        assert archive.stat().st_size == artifact['size_in_bytes']
        assert digest(archive) == artifact['digest'].removeprefix('sha256:')
        directory = target/name
        directory.mkdir()
        with zipfile.ZipFile(archive) as z:
            entries = z.infolist()
            assert len(entries) == len({e.filename for e in entries}) < 10000
            assert sum(e.file_size for e in entries) < 500*1024**2
            for entry in entries:
                path = PurePosixPath(entry.filename)
                assert not path.is_absolute() and '..' not in path.parts
                assert '\\' not in entry.filename and ':' not in entry.filename
                assert not stat.S_ISLNK(entry.external_attr >> 16)
                assert path.suffix.lower() not in ('.exe', '.dll', '.msi'), 'Evidence artifact must not contain product binaries'
            z.extractall(directory)
        fetched[name] = directory
    return metadata, jobs, fetched


def exactly(root, relative):
    found = [p for p in root.rglob(Path(relative).name) if p.as_posix().endswith('/'+relative)]
    assert len(found) == 1, (relative, found)
    return found[0]


def audit(run, metadata, jobs, fetched, target):
    binding_path = exactly(fetched['standalone-windows-p5-binding'], 'binding.json')
    binding = json.loads(binding_path.read_bytes())
    assert (binding['applicationCommit'], binding['applicationTree']) == (APP, TREE)
    assert (binding['artifactRun'], binding['platformJobId'], binding['sourceAttempt']) == (RUN, JOB, 1)
    assert binding['preparerRun'] == run and binding['preparerHarness'] == metadata['head_sha']
    result = dict(source=APP, tree=TREE, version='2026.48.1', preparerRun=run, apps={})
    for app in APPS:
        name = f'standalone-windows-p5-{app}-proof'
        own_jobs = [j for j in jobs if j['name'] == f'Native {app} Windows app-only']
        entry = dict(visualAcceptance='pending actual completed screenshot review', job=own_jobs)
        result['apps'][app] = entry
        if name not in fetched:
            entry['status'] = 'missing-proof'
            continue
        root = fetched[name]
        reports = list(root.rglob(f'p4-native-{app}/report.json'))
        if len(reports) != 1:
            entry['status'] = 'missing-native-report'
            continue
        report_path = reports[0]
        proof = report_path.parent
        report = json.loads(report_path.read_bytes())
        entry['nativeStatus'] = report['status']
        if report['status'] != 'passed-scoped-native-function':
            entry.update(status='native-failure-preserved', error=report.get('error'))
            continue
        try:
            assert len(own_jobs) == 1 and own_jobs[0]['conclusion'] == 'success'
            receipt_path = exactly(root, 'standalone-windows-package/package.json')
            augmented = binding['products'][app]
            assert digest(receipt_path) == augmented['packageReceiptSha256']
            receipt = json.loads(receipt_path.read_bytes())
            assert receipt == {k:v for k,v in augmented.items() if k not in ('childArtifact','packageReceiptSha256')}
            package_report = exactly(root, 'standalone-windows-package/canonical-package-report.json')
            assert digest(package_report) == receipt['canonicalPackageReport']['sha256']
            assert package_report.stat().st_size == receipt['canonicalPackageReport']['bytes']
            consumed = json.loads(exactly(root, 'standalone-windows-package/consumer-binding.json').read_bytes())
            assert consumed['status'] == 'strict-own-child-zip-nsis-report-source-receipt-verified'
            assert consumed['childArtifact']['id'] == augmented['childArtifact']['id']
            assert consumed['childArtifact']['digest'] == augmented['childArtifact']['digest']
            assert consumed['receiptSha256'] == augmented['packageReceiptSha256']
            assert report['package'] == receipt
            assert (report['applicationCommit'], report['applicationTree'], report['version']) == (APP, TREE, '2026.48.1')
            assert report['payloadEqualsInstalled'] is True
            executable = report['executable']
            payload = receipt['application']['payloadExecutable']
            assert (executable['sha256'], executable['bytes']) == (payload['sha256'], payload['bytes'])
            assert executable['productVersion'] == '2026.48.1'
            for identity in (executable, report['installer']):
                assert identity['signature'] == 'Valid' and identity['timestampSigner']
            assert all(report['baseline'][key] == [] for key in ('profiles','apps','suitePaths'))
            phases = report['phases']
            assert [p['phase'] for p in phases] == ['initial','reopened']
            assert phases[0]['pid'] != phases[1]['pid']
            for phase in phases:
                assert phase['status'] == 'passed-scoped-function'
                assert phase['normalFullExit'] and phase['ownedWebviewsExited'] and not phase['pageErrors']
                assert phase['nativeMetadata']['identifier'] == receipt['application']['identifier']
                assert phase['nativeMetadata']['version'] == '2026.48.1'
                assert phase['ownWebviewProfile']['createdByNativeWebview'] and phase['ownWebviewProfile']['entries']
                for suffix in ('ready','completed'):
                    assert (proof/(phase['phase']+'-'+suffix+'.png')).stat().st_size > 0
                if app in ('writer','spreadsheet','presentation','email'):
                    assert phase['runtime']['bron'] == 'meegeleverd' and phase['runtime']['profiel'] == 'veilig'
                    relative = phase['runtimeOwnInstallRelative']
                    assert relative and not relative.startswith(('..','\\','/')) and ':' not in relative
            cleanup = report['cleanup']
            assert not any(k.endswith('Error') for k in cleanup)
            assert not cleanup.get('forcedOwnedProcessTree') and cleanup['residualOwnedWebviews'] == []
            assert all(cleanup[k] for k in ('policyRestored','ownedInstallUninstalled','ownedAppExited','ownedNativeProfilesDisposed','ownedTemporaryProfileDisposed'))
            oracles = []
            ext = {'writer':'docx','spreadsheet':'xlsx','presentation':'pptx','notition':'openaec-notities'}.get(app)
            if ext:
                oracles = [inspect(app, proof/(phase+'.'+ext)) for phase in ('initial','reopened')]
            elif app == 'email':
                assert cleanup['loopbackServerClosed']
                oracles = [inspect('email', proof/'mail')]
            else:
                oracles = [inspect('database', exactly(proof/'fixtures', 'Standalone23.sqlite'))]
            if report['originalInput']:
                assert report['originalInput']['unchanged']
                original_name = report['originalInput']['path'].replace('\\','/').split('/')[-1]
                assert digest(exactly(proof/'fixtures', original_name)) == report['originalInput']['sha256']
            entry.update(status='independently-rechecked-functional-only', savedByteOracles=oracles)
        except Exception as error:
            entry.update(status='proof-audit-failed', error=repr(error))
    write(target/'independent-audit.json', result)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('repo')
    parser.add_argument('run', type=int)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--gh', default='gh')
    args = parser.parse_args()
    metadata, jobs, fetched = collect(args.gh, args.repo, args.run, args.destination)
    result = audit(args.run, metadata, jobs, fetched, args.destination)
    print(json.dumps(result, indent=2))
