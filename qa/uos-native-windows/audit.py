"""Recheck genuine native UOS artifacts, source UOF1 XML and actual saved XLSX."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import re
import zipfile

BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('uos_stage_oracle', BASE / 'stage_oracle.py')
oracle = importlib.util.module_from_spec(spec); spec.loader.exec_module(oracle)
APP = 'dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b'
TREE = '5a644e397ecc6af5452a49b6404edf953687d1b2'

def read(path): return json.loads(path.read_bytes())
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def audit(root, binding):
    run = read(root / 'run.json'); meta = read(root / 'artifact-metadata.json')
    assert run['id'] == binding['nativeRun'] and run['head_sha'] == binding['harnessCommit']
    assert run['conclusion'] == 'success' and meta['id'] == binding['proofArtifact']
    assert meta['name'] == 'uos-native-Windows-proof'
    assert sha(root / 'artifact.zip') == binding['proofZipSha256']
    assert meta['digest'] == 'sha256:' + binding['proofZipSha256']
    files = root / 'files'
    with zipfile.ZipFile(root / 'artifact.zip') as archive:
        names = [e.filename for e in archive.infolist() if not e.is_dir()]
        assert len(names) == len(set(names))
        assert set(names) == {p.relative_to(files).as_posix() for p in files.rglob('*') if p.is_file()}
        for name in names:
            assert archive.read(name) == (files / name).read_bytes(), name
    proof = files / 'uos-native-proof'; packages = files / 'uos-native-package'
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
    assert report['status'] == 'passed-native-uos-scoped' and report['sourceUnchanged']
    assert report['baseline']['profiles'] == report['baseline']['apps'] == report['baseline']['suitePaths'] == []
    phases = report['phases']; assert [p['phase'] for p in phases] == ['preflight-initial', 'editing', 'reopened']
    assert [p['status'] for p in phases] == ['passed-short-preflight-initial', 'passed-initial-ui-sum-undo-redo', 'passed-three-sheets-reopened']
    assert phases[0]['pid'] != phases[1]['pid'] and phases[1]['pid'] != phases[2]['pid']
    for phase in phases:
        assert phase['normalFullExit'] and phase['ownedWebviewsExited'] and not phase['pageErrors']
        assert phase['nativeMetadata']['identifier'] == 'org.openaec.office-studio' and phase['nativeMetadata']['version'] == '2026.48.1'
        assert phase['runtime']['bron'] == 'meegeleverd' and phase['runtime']['profiel'] == 'veilig'
    preflight = report['shortPreflight']
    assert preflight['status'] == 'passed' and preflight['focus'] and preflight['actualNativeSave'] and preflight['normalFullQuit']
    assert preflight['newProcessPid'] == phases[1]['pid'] and preflight['previousPid'] == phases[0]['pid']
    steps = report['steps']; opened = [s for s in steps if s.get('nativeOpenInvoked')]
    assert len(opened) == 3 and all(s['status'] == 'passed' and s['pathReadbackMatches'] for s in opened)
    assert [s['actualDefaultSaveProposal'] for s in steps if 'actualDefaultSaveProposal' in s] == ['xlsx', 'xlsx']
    ui = [s for s in steps if 'actualSourceUi' in s]
    assert [len(s['actualSourceUi']) for s in ui] == [2, 2, 12, 12, 12]
    assert [s['edited'] for s in ui] == [False, False, False, True, True]
    source = proof / 'ffc_1.uos'; source_oracle = oracle.original.parse_source(source)
    cfg = source_oracle['expected']['edit']; before = int(source_oracle['expected']['before']); after = int(source_oracle['expected']['after'])
    assert source_oracle['formulaCount'] == 0 and len(source_oracle['sheets']) == 3
    assert sum(len(s['cells']) for s in source_oracle['sheets']) == 156
    meta_source = source_oracle['source']
    assert sha(source) == meta_source['sha256'] == 'ac80140bd5d7fa6ef4a0afdaa34c36e8e2988a46737f9a66e0478e0fec8cb20c'
    assert sha(proof / 'source-LICENSE.txt') == meta_source['licenseSha256']
    assert sha(proof / 'source-README.md') == meta_source['readmeSha256']
    calculated = [s for s in steps if 'calculationStage' in s]
    names = ['sum-before', 'sum-after', 'sum-undo', 'sum-redo', 'uos-reopened-result']
    values = [before, after, before, after, after]
    original_a2 = int(source_oracle['sheets'][0]['cells'][cfg['cell']]['value'])
    a2s = [original_a2, cfg['value'], original_a2, cfg['value'], cfg['value']]
    assert [s['calculationStage'] for s in calculated] == names
    for entry, expected, a2 in zip(calculated, values, a2s):
        assert entry['formula'] == cfg['formula'] and entry['expectedResult'] == expected and entry['actualA2'] == a2
        assert re.search(r'(^|[^A-Za-z0-9_.])' + str(expected) + r'($|[^A-Za-z0-9_.])', entry['actualProductionCellLabel'])
    history = [s for s in steps if 'platformKey' in s]
    assert [s['platformKey'] for s in history] == ['Control+z', 'Control+y']
    assert all(s['actualGridFocus']['gridOwns'] and s['physicalCanvasPoint']['x'] > 0 and s['physicalCanvasPoint']['y'] > 0 for s in history)
    actual = []
    cases = [('uos-original.xlsx', 'original', 156), ('uos-sum-before.xlsx', 'sum', 157),
             ('uos-working.xlsx', 'final', 158), ('uos-edited.xlsx', 'final', 158), ('uos-reopened.xlsx', 'final', 158)]
    for name, stage, count in cases:
        check = oracle.check(source, proof / name, stage)
        assert check['passed'] and check['checkedPopulatedCells'] == count and check['sheets'] == 3
        actual.append(dict(name=name, sha256=sha(proof / name), stage=stage, checkedPopulatedCells=count))
    snapshots = [s for s in steps if 'actualNativeSaveSnapshot' in s]
    expected_snapshots = {'uos-original.xlsx': 'original', 'uos-sum-before.xlsx': 'sum', 'uos-edited.xlsx': 'final'}
    assert {s['actualNativeSaveSnapshot']: s['stage'] for s in snapshots} == expected_snapshots
    assert all(s['sha256'] == sha(proof / s['actualNativeSaveSnapshot']) for s in snapshots)
    assert actual[0]['sha256'] != actual[1]['sha256'] != actual[2]['sha256']
    cleanup = report['cleanup']
    assert not any(k.endswith('Error') for k in cleanup) and not cleanup.get('forcedOwnedProcessTree')
    assert cleanup['residualOwnedWebviews'] == []
    for key in ('policyRestored', 'ownedInstallUninstalled', 'ownedAppExited', 'ownedNativeProfilesDisposed', 'ownedTemporaryProfileDisposed'):
        assert cleanup[key]
    return dict(status='passed', source=APP, tree=TREE, sourceUosSha256=meta_source['sha256'],
        nativeRun=run['id'], harness=run['head_sha'], sourceFormulaCount=0, nativeChooserCases=3,
        normalFullExits=3, newProcessReopens=2, actualSavedXlsx=actual,
        calculationResults=values, addedFormula=cfg['formula'], finalPopulatedCells=158,
        nativeDefaultSaveProposal='xlsx', originalUnchanged=True,
        scope='One native Windows UOF1/UOS source; screenshots separately reviewed. No UOF2/UOS-export/pre-existing formula import/other-OS/signing/standalone approval.')

if __name__ == '__main__':
    binding = read(BASE / 'result-binding.json')
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else BASE / 'evidence/passed'
    print(json.dumps(audit(target, binding)))
