"""Recheck genuine native XLSB artifacts, source BIFF12 and actual saved XLSX."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import zipfile

BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('xlsb_source_oracle', BASE / 'fixture/oracle.py')
oracle = importlib.util.module_from_spec(spec); spec.loader.exec_module(oracle)
APP = 'dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b'
TREE = '5a644e397ecc6af5452a49b6404edf953687d1b2'

def read(path): return json.loads(path.read_bytes())
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def audit(root, binding):
    run = read(root / 'run.json'); meta = read(root / 'artifact-metadata.json')
    assert run['id'] == binding['nativeRun'] and run['head_sha'] == binding['harnessCommit']
    assert run['conclusion'] == 'success' and meta['id'] == binding['proofArtifact']
    assert meta['name'] == 'xlsb35-native-Windows-proof'
    assert sha(root / 'artifact.zip') == binding['proofZipSha256']
    assert meta['digest'] == 'sha256:' + binding['proofZipSha256']
    files = root / 'files'
    with zipfile.ZipFile(root / 'artifact.zip') as archive:
        names = [e.filename for e in archive.infolist() if not e.is_dir()]
        assert len(names) == len(set(names))
        assert set(names) == {p.relative_to(files).as_posix() for p in files.rglob('*') if p.is_file()}
        for name in names:
            assert archive.read(name) == (files / name).read_bytes(), name
    proof = files / 'xlsb35-native-proof'; packages = files / 'xlsb35-native-package'
    report = read(proof / 'report.json'); receipt = read(packages / 'package.json')
    source_run = read(packages / 'source-run.json'); source_job = read(packages / 'source-job.json')
    source_commit = read(packages / 'source-commit.json')
    assert source_run['id'] == source_job['run_id'] == 45143305147 and source_run['head_sha'] == APP
    assert source_run['run_attempt'] == source_job['run_attempt'] == 1
    assert source_run['conclusion'] == source_job['conclusion'] == 'success'
    assert source_job['id'] == 137586342967 and source_commit['sha'] == APP and source_commit['tree']['sha'] == TREE
    assert report['package'] == receipt and report['harnessCommit'] == run['head_sha']
    assert receipt['applicationCommit'] == report['applicationCommit'] == APP
    assert receipt['applicationTree'] == report['applicationTree'] == TREE
    assert receipt['version'] == report['version'] == '2026.48.1'
    assert receipt['archiveSha256'] == 'ecce5a188abbb5b17e52c4097d7add95ddeaaa8c24a9a4e6c492049d16902733'
    assert receipt['installer']['sha256'] == report['installer']['sha256'] == '85d5155a0322ce296eb4f57485235cdb725f4f293c7642bc562971ff924357ce'
    assert receipt['installer']['bytes'] == 384512913
    assert receipt['payloadExecutable']['sha256'] == report['executable']['sha256'] == 'feab08d3bc09895745c75653b2f8c806e04efa7fc36101debff8b278da599a67'
    assert report['payloadEqualsInstalled']
    assert sha(packages / 'canonical-package-report.json') == receipt['canonicalPackageReportSha256']
    assert sha(packages / 'canonical-package-report.zip') == '99185caa31f249f6d198aef67a8c1cca6acbc18012d90f2ebec7c5f2d2fed4a0'
    with zipfile.ZipFile(packages / 'canonical-package-report.zip') as archive:
        assert archive.namelist() == ['pakketcontrole-Windows.json']
        assert archive.read('pakketcontrole-Windows.json') == (packages / 'canonical-package-report.json').read_bytes()
    assert report['status'] == 'passed-native-xlsb-scoped' and report['sourceUnchanged']
    assert report['baseline']['profiles'] == report['baseline']['apps'] == report['baseline']['suitePaths'] == []
    phases = report['phases']; assert [p['phase'] for p in phases] == ['initial', 'reopened']
    assert phases[0]['status'] == 'passed-short-preflight-initial'
    assert phases[1]['status'] == 'passed-all30-native-formulas'
    assert phases[0]['pid'] != phases[1]['pid']
    for phase in phases:
        assert phase['normalFullExit'] and phase['ownedWebviewsExited'] and not phase['pageErrors']
        assert phase['nativeMetadata']['identifier'] == 'org.openaec.office-studio'
        assert phase['nativeMetadata']['version'] == '2026.48.1'
        assert phase['runtime']['bron'] == 'meegeleverd' and phase['runtime']['profiel'] == 'veilig'
    preflight = report['shortPreflight']
    assert preflight['status'] == 'passed' and preflight['focus'] and preflight['actualSaveAndCtrlS'] and preflight['normalFullQuit']
    assert preflight['newProcessPid'] == phases[1]['pid'] and preflight['previousPid'] == phases[0]['pid']
    steps = report['steps']
    opened = [s for s in steps if s.get('nativeOpenInvoked')]
    assert len(opened) == 2 and all(s['status'] == 'passed' and s['pathReadbackMatches'] for s in opened)
    assert [s['actualDefaultSaveProposal'] for s in steps if 'actualDefaultSaveProposal' in s] == ['xlsx', 'xlsx']
    ui = [s for s in steps if 'actualUiCells' in s]
    assert [len(s['actualUiCells']) for s in ui] == [3, 3, 3, 30]
    all_cells = ui[-1]['actualUiCells']
    assert [c['address'] for c in all_cells] == [f'A{r}' for r in range(1, 31)]
    for cell in all_cells:
        assert cell['formula'].replace(' ', '') == ('=40+2' if cell['address'] == 'A15' else '=1+2')
    assert (proof / 'shared_formula.xlsb').read_bytes() == (BASE / 'fixture/shared_formula.xlsb').read_bytes()
    source = oracle.source_oracle(); actual = []
    for name, edited in [('xlsb35-before-edit.xlsx', False), ('xlsb35-edited.xlsx', True), ('xlsb35-reopened.xlsx', True)]:
        check = oracle.inspect_xlsx(proof / name, edited)
        actual.append(dict(name=name, sha256=check['sha256'], formulas=check['formulaCount'], edited=edited))
    assert report['beforeEditSnapshot']['sha256'] == actual[0]['sha256']
    assert report['beforeEditSnapshot']['copiedUnmodifiedActualNativeSave']
    initial_save = [s for s in steps if s.get('nativeSaved')][0]
    assert initial_save['sha256'] == actual[0]['sha256'] and not initial_save['edited']
    assert actual[0]['sha256'] != actual[1]['sha256']
    cleanup = report['cleanup']
    assert not any(k.endswith('Error') for k in cleanup) and not cleanup.get('forcedOwnedProcessTree')
    assert cleanup['residualOwnedWebviews'] == []
    for key in ('policyRestored', 'ownedInstallUninstalled', 'ownedAppExited', 'ownedNativeProfilesDisposed', 'ownedTemporaryProfileDisposed'):
        assert cleanup[key]
    return dict(status='passed', source=APP, tree=TREE, sourceXlsbSha256=source['source']['sha256'],
        nativeRun=run['id'], harness=run['head_sha'], nativeChooserCases=2, normalFullExits=2,
        newProcessReopens=1, actualUiFormulasAfterReopen=30, actualSavedXlsx=actual,
        nativeDefaultSaveProposal='xlsx', originalUnchanged=True,
        scope='One native Windows XLSB source; screenshot review separate. No XLS/XLT/date/chart/XLSB-writing/other-OS/signing/standalone approval.')

if __name__ == '__main__':
    binding = read(BASE / 'result-binding.json')
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else BASE / 'evidence/passed'
    print(json.dumps(audit(target, binding)))
