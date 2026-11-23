"""Recheck native STC artifacts, original Sun XML and actual saved XLSX."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import re
import math
import zipfile

BASE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('stc_source_oracle', BASE / 'fixture/oracle.py')
oracle = importlib.util.module_from_spec(spec); spec.loader.exec_module(oracle)
APP = 'dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b'
TREE = '5a644e397ecc6af5452a49b6404edf953687d1b2'

def read(path): return json.loads(path.read_bytes())
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def audit(root, binding):
    run = read(root / 'run.json'); meta = read(root / 'artifact-metadata.json')
    assert run['id'] == binding['nativeRun'] and run['head_sha'] == binding['harnessCommit']
    assert run['conclusion'] == 'success' and meta['id'] == binding['proofArtifact']
    assert meta['name'] == 'stc-native-Windows-proof'
    assert sha(root / 'artifact.zip') == binding['proofZipSha256']
    assert meta['digest'] == 'sha256:' + binding['proofZipSha256']
    files = root / 'files'
    with zipfile.ZipFile(root / 'artifact.zip') as archive:
        names = [e.filename for e in archive.infolist() if not e.is_dir()]
        assert len(names) == len(set(names))
        assert set(names) == {p.relative_to(files).as_posix() for p in files.rglob('*') if p.is_file()}
        for name in names:
            assert archive.read(name) == (files / name).read_bytes(), name
    proof = files / 'stc-native-proof'; packages = files / 'stc-native-package'
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
    assert report['status']=='passed-native-stc-scoped' and report['sourceUnchanged']
    assert report['baseline']['profiles']==report['baseline']['apps']==report['baseline']['suitePaths']==[]
    source=proof/'carnet de notes.stc'; source_oracle=oracle.parse_source(source)
    source_oracle['expected']=oracle.derive_expected(source_oracle); expected=source_oracle['expected']; cfg=expected['edit']
    assert sha(source)==source_oracle['source']['sha256']=='ff735a1a20c28e39e8349d46e5a531e6e6cde24f50f7aaa8d92e408e4a344d4c'
    counts=[sum(c['formula'] is not None for c in s['cells'].values()) for s in source_oracle['sheets']]
    assert len(counts)==6 and sum(counts)==854
    template=report['templateAsNew']
    assert template['newUntitledName'] and template['firstCtrlSRequiredSaveAs']
    assert template['originalFilename']=='carnet de notes.stc' and template['sourceSha256']==sha(source)
    assert re.fullmatch(r'(Untitled|Naamloos) [1-9][0-9]*\.xlsx',template['actualTabName'])
    phases=report['phases'];assert [p['phase'] for p in phases]==['template-preflight','editing','reopened']
    assert [p['status'] for p in phases]==['passed-template-new-save-preflight','passed-weighted-name-undo-redo','passed-six-sheets-reopened']
    assert phases[0]['pid']!=phases[1]['pid'] and phases[1]['pid']!=phases[2]['pid']
    for phase in phases:
        assert phase['normalFullExit'] and phase['ownedWebviewsExited'] and not phase['pageErrors']
        assert phase['nativeMetadata']['identifier']=='org.openaec.office-studio' and phase['nativeMetadata']['version']=='2026.48.1'
        assert phase['runtime']['bron']=='meegeleverd' and phase['runtime']['profiel']=='veilig'
    preflight=report['shortPreflight']
    assert preflight['status']=='passed' and preflight['focus'] and preflight['actualNativeSave'] and preflight['normalFullQuit'] and preflight['templateAsNew']
    assert preflight['newProcessPid']==phases[1]['pid'] and preflight['previousPid']==phases[0]['pid']
    steps=report['steps']; opened=[s for s in steps if s.get('nativeOpenInvoked')]
    assert len(opened)==3 and all(s['status']=='passed' and s['pathReadbackMatches'] for s in opened)
    assert [s['actualDefaultSaveProposal'] for s in steps if 'actualDefaultSaveProposal' in s]==['xlsx','xlsx']
    saves=[s for s in steps if 'nativeSaved' in s]
    assert [s['saveKey'] for s in saves]==['Control+s','Control+Shift+s']
    headers=[s for s in steps if 'nativeSourceHeaders' in s]; assert len(headers)==3 and all(s['sheetCount']==6 for s in headers)
    weights=[s for s in steps if 'weightedStage' in s]
    assert [s['weightedStage'] for s in weights]==['weighted-edited','weighted-redo','weighted-reopened']
    numeric={**cfg['coefficients'],**cfg['grades']}
    def displayed(label,address,wanted):
        value=re.sub(r'^'+address+r',\s*','',label)
        value=re.sub(r', (selected|geselecteerd)$','',value)
        value=float(re.sub(r'\s','',value).replace(',','.'))
        assert math.isfinite(value)
        assert abs(value-wanted)<1e-10 or value in [round(wanted,p) for p in range(1,13)]
        return value
    for entry in weights:
        assert {v['address']:float(v['actual']) for v in entry['actualInputs']}==numeric
        assert entry['expectedWeighted']==expected['weighted']['value'] and entry['expectedRounded']==expected['rounded']['value']
        assert 'SUMPRODUCT' in entry['hFormula'].upper() and 'SUMIF' in entry['hFormula'].upper() and 'MROUND' in entry['iFormula'].upper()
        assert displayed(entry['hLabel'],cfg['weightedCell'],expected['weighted']['value'])==entry['hDisplay']
        assert displayed(entry['iLabel'],cfg['roundedCell'],expected['rounded']['value'])==entry['iDisplay']
    names=[s for s in steps if 'nameStage' in s]
    assert [s['nameStage'] for s in names]==['name-edited','name-undo','name-redo','name-reopened']
    original_name=next(s for s in source_oracle['sheets'] if s['name']==cfg['nameSheet'])['cells'][cfg['nameCell']]['text']
    for entry,wanted in zip(names,[cfg['nameValue'],original_name,cfg['nameValue'],cfg['nameValue']]):
        assert entry['actualNameInput']==wanted and wanted in entry['directCellLabel'] and wanted in entry['linkedCellLabel']
    history=[s for s in steps if 'platformKey' in s]
    assert [s['platformKey'] for s in history]==['Control+z','Control+y']
    assert all(s['actualGridFocus']['gridOwns'] and s['physicalCanvasPoint']['x']>0 and s['physicalCanvasPoint']['y']>0 for s in history)
    actual=[]
    for name,edited in [('stc-original.xlsx',False),('stc-working.xlsx',True),('stc-edited.xlsx',True),('stc-reopened.xlsx',True)]:
        check=oracle.verify_xlsx(source_oracle,proof/name,edited)
        assert check['passed'] and check['sheets']==6 and check['sourceFormulaCellsRetained']==counts
        actual.append(dict(name=name,sha256=check['sha256'],sourceFormulaPositionsRetained=sum(counts),edited=edited))
    snapshots=[s for s in steps if 'actualNativeSaveSnapshot' in s]
    assert {s['actualNativeSaveSnapshot']:s['edited'] for s in snapshots}=={'stc-original.xlsx':False,'stc-edited.xlsx':True}
    assert all(s['sha256']==sha(proof/s['actualNativeSaveSnapshot']) for s in snapshots)
    assert actual[0]['sha256']!=actual[1]['sha256']
    cleanup = report['cleanup']
    assert not any(k.endswith('Error') for k in cleanup) and not cleanup.get('forcedOwnedProcessTree')
    assert cleanup['residualOwnedWebviews'] == []
    for key in ('policyRestored', 'ownedInstallUninstalled', 'ownedAppExited', 'ownedNativeProfilesDisposed', 'ownedTemporaryProfileDisposed'):
        assert cleanup[key]
    return dict(status='passed',source=APP,tree=TREE,sourceStcSha256=sha(source),nativeRun=run['id'],harness=run['head_sha'],
        templateAsNew=True,firstCtrlSRequiredSaveAs=True,nativeChooserCases=3,normalFullExits=3,newProcessReopens=2,
        sourceFormulaPositionsRetained=854,sheets=6,weightedResult=expected['weighted']['value'],roundedResult=expected['rounded']['value'],
        nameUndoRedo=[cfg['nameValue'],original_name,cfg['nameValue']],actualSavedXlsx=actual,originalUnchanged=True,
        scope='One native Windows STC source and chosen arithmetic/name case. Formula-position retention is not all854 expression/result validation; original blank-input error caches are separate. No other-platform/signing/standalone approval.')

if __name__ == '__main__':
    binding = read(BASE / 'result-binding.json')
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else BASE / 'evidence/passed'
    print(json.dumps(audit(target, binding)))
