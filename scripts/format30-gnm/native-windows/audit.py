"""Independent downloaded-byte audit of native GNM source, receipt and XLSX."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import zipfile

spec = importlib.util.spec_from_file_location('gnm_oracle', Path(__file__).resolve().parents[1] / 'oracle.py')
oracle = importlib.util.module_from_spec(spec); spec.loader.exec_module(oracle)
APP = 'dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b'
TREE = '5a644e397ecc6af5452a49b6404edf953687d1b2'

def audit(root):
    proof = root / 'gnm-native-proof'; packages = root / 'gnm-native-package'
    report = json.loads((proof / 'report.json').read_bytes())
    receipt = json.loads((packages / 'package.json').read_bytes())
    source_run = json.loads((packages / 'source-run.json').read_bytes())
    source_job = json.loads((packages / 'source-job.json').read_bytes())
    source_commit = json.loads((packages / 'source-commit.json').read_bytes())
    assert source_run['head_sha'] == APP and source_run['id'] == 45143305147
    assert source_run['run_attempt'] == 1 and source_run['conclusion'] == 'success'
    assert source_job['id'] == 137586342967 and source_job['run_id'] == source_run['id']
    assert source_job['run_attempt'] == 1 and source_job['conclusion'] == 'success'
    assert source_commit['sha'] == APP and source_commit['tree']['sha'] == TREE
    assert receipt['applicationCommit'] == report['applicationCommit'] == APP
    assert receipt['applicationTree'] == report['applicationTree'] == TREE
    assert receipt == report['package'] and receipt['version'] == report['version'] == '2026.48.1'
    assert receipt['archiveSha256'] == 'ecce5a188abbb5b17e52c4097d7add95ddeaaa8c24a9a4e6c492049d16902733'
    assert receipt['installer']['sha256'] == '85d5155a0322ce296eb4f57485235cdb725f4f293c7642bc562971ff924357ce'
    assert receipt['installer']['bytes'] == 384512913
    canonical_report = packages / 'canonical-package-report.json'
    assert hashlib.sha256(canonical_report.read_bytes()).hexdigest() == receipt['canonicalPackageReportSha256']
    with zipfile.ZipFile(packages / 'canonical-package-report.zip') as archive:
        assert archive.namelist() == ['pakketcontrole-Windows.json']
        assert archive.read('pakketcontrole-Windows.json') == canonical_report.read_bytes()
    assert hashlib.sha256((packages / 'canonical-package-report.zip').read_bytes()).hexdigest() == '99185caa31f249f6d198aef67a8c1cca6acbc18012d90f2ebec7c5f2d2fed4a0'
    assert report['payloadEqualsInstalled'] and report['executable']['sha256'] == receipt['payloadExecutable']['sha256']
    assert report['status'] == 'passed-native-gnm-scoped' and report['sourceUnchanged']
    assert report['baseline']['profiles'] == report['baseline']['apps'] == report['baseline']['suitePaths'] == []
    phases = report['phases']
    assert [p['phase'] for p in phases] == ['gnm-initial', 'gnm-reopened', 'gnumeric-initial', 'gnumeric-reopened']
    for phase in phases:
        assert phase['status'] == 'passed' and phase['normalFullExit'] and phase['ownedWebviewsExited']
        assert not phase['pageErrors'] and phase['nativeMetadata']['identifier'] == 'org.openaec.office-studio'
        assert phase['nativeMetadata']['version'] == '2026.48.1'
        assert phase['runtime']['bron'] == 'meegeleverd' and phase['runtime']['profiel'] == 'veilig'
    for start, reopen in ((phases[0], phases[1]), (phases[2], phases[3])):
        assert start['pid'] != reopen['pid'] and start['focusCtrlSavePreflight']
    dialogs = [s for s in report['steps'] if s.get('nativeOpenInvoked')]
    assert len(dialogs) == 4 and all(s['status'] == 'passed' and s['pathReadbackMatches'] for s in dialogs)
    original = (proof / 'source.gnumeric').read_bytes(); expected = oracle.source_contents(original)
    files = []
    for ext in ('gnm', 'gnumeric'):
        assert (proof / f'GNM30-{ext}.{ext}').read_bytes() == original
        for stage in ('native', 'reopened'):
            path = proof / f'{ext}-{stage}.xlsx'; data = path.read_bytes()
            oracle.check(data, expected, True)
            files.append(dict(name=path.name, sha256=hashlib.sha256(data).hexdigest()))
    cleanup = report['cleanup']
    assert not any(k.endswith('Error') for k in cleanup)
    assert not cleanup.get('forcedOwnedProcessTree') and cleanup['residualOwnedWebviews'] == []
    for key in ('policyRestored', 'ownedInstallUninstalled', 'ownedAppExited',
                'ownedNativeProfilesDisposed', 'ownedTemporaryProfileDisposed'):
        assert cleanup[key]
    return dict(status='passed', source=APP, tree=TREE, platform='Windows', actualSavedXlsx=files,
                nativeChooserCases=4, fullNormalExits=4, newProcessReopens=2, originalSourceUnchanged=True,
                scope='Native Windows suite only; visual screenshot review separate, no other OS/standalone/signing approval')

if __name__ == '__main__':
    print(json.dumps(audit(Path(sys.argv[1]))))
