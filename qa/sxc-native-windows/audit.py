"""Recheck downloaded native evidence; preserve a strict negative outcome honestly."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import zipfile

BASE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('sxc_source_oracle',BASE/'oracle.py')
oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
APP='dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b'
TREE='5a644e397ecc6af5452a49b6404edf953687d1b2'
read=lambda path:json.loads(path.read_bytes())
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()

def audit(root,binding):
    run=read(root/'run.json');meta=read(root/'artifact-metadata.json')
    assert run['id']==binding['nativeRun'] and run['head_sha']==binding['harnessCommit']
    assert run['conclusion']==binding['nativeConclusion'] and meta['id']==binding['proofArtifact']
    jobs=read(root/'jobs.json')['jobs'];assert len(jobs)==1
    assert jobs[0]['id']==binding['nativeJob'] and jobs[0]['run_id']==run['id']
    assert jobs[0]['run_attempt']==run['run_attempt']==1 and jobs[0]['conclusion']==run['conclusion']
    assert meta['name']=='sxc-native-Windows-proof'
    assert sha(root/'artifact.zip')==binding['proofZipSha256']
    assert meta['digest']=='sha256:'+binding['proofZipSha256']
    files=root/'files'
    with zipfile.ZipFile(root/'artifact.zip') as archive:
        names=[e.filename for e in archive.infolist() if not e.is_dir()]
        assert len(names)==len(set(names))
        assert set(names)=={p.relative_to(files).as_posix() for p in files.rglob('*') if p.is_file()}
        for name in names:assert archive.read(name)==(files/name).read_bytes(),name
    proof=files/'sxc-native-proof';packages=files/'sxc-native-package'
    report=read(proof/'report.json');receipt=read(packages/'package.json')
    producer=read(packages/'source-run.json');job=read(packages/'source-job.json');commit=read(packages/'source-commit.json')
    assert producer['id']==job['run_id']==45143305147 and producer['head_sha']==APP
    assert producer['run_attempt']==job['run_attempt']==1
    assert producer['conclusion']==job['conclusion']=='success' and job['id']==137586342967
    assert commit['sha']==APP and commit['tree']['sha']==TREE
    assert report['package']==receipt and report['harnessCommit']==run['head_sha']
    assert receipt['applicationCommit']==report['applicationCommit']==APP
    assert receipt['applicationTree']==report['applicationTree']==TREE
    assert receipt['version']==report['version']=='2026.48.1'
    assert receipt['archiveSha256']=='ecce5a188abbb5b17e52c4097d7add95ddeaaa8c24a9a4e6c492049d16902733'
    assert receipt['installer']['sha256']==report['installer']['sha256']=='85d5155a0322ce296eb4f57485235cdb725f4f293c7642bc562971ff924357ce'
    assert receipt['installer']['bytes']==384512913
    assert receipt['payloadExecutable']['sha256']==report['executable']['sha256']=='feab08d3bc09895745c75653b2f8c806e04efa7fc36101debff8b278da599a67'
    assert report['payloadEqualsInstalled']
    assert sha(packages/'canonical-package-report.json')==receipt['canonicalPackageReportSha256']
    assert sha(packages/'canonical-package-report.zip')=='99185caa31f249f6d198aef67a8c1cca6acbc18012d90f2ebec7c5f2d2fed4a0'
    with zipfile.ZipFile(packages/'canonical-package-report.zip') as archive:
        assert archive.namelist()==['pakketcontrole-Windows.json']
        assert archive.read('pakketcontrole-Windows.json')==(packages/'canonical-package-report.json').read_bytes()
    assert report['baseline']['profiles']==report['baseline']['apps']==report['baseline']['suitePaths']==[]
    source=proof/'calcshapes.sxc';source_oracle=oracle.read_source(source)
    assert source_oracle==read(BASE/'source-oracle-before-import.json')==read(proof/'source-oracle.json')
    for name,digest in oracle.CONFIG['licenses'].items():assert sha(proof/('upstream-'+name))==digest
    assert report['nativeOperationsPassed'] and report['sourceUnchanged']
    phases=report['phases']
    assert [p['phase'] for p in phases]==['preflight-initial','editing','reopened']
    assert [p['status'] for p in phases]==['passed-original-cell-native-save','passed-native-cell-edit-undo-redo','passed-native-cell-persistence']
    assert phases[0]['pid']!=phases[1]['pid'] and phases[1]['pid']!=phases[2]['pid']
    for phase in phases:
        assert phase['normalFullExit'] and phase['ownedWebviewsExited'] and not phase['pageErrors']
        assert phase['nativeMetadata']['identifier']=='org.openaec.office-studio' and phase['nativeMetadata']['version']=='2026.48.1'
        assert phase['runtime']['bron']=='meegeleverd' and phase['runtime']['profiel']=='veilig'
    preflight=report['shortPreflight']
    assert preflight['status']=='passed' and preflight['focus'] and preflight['actualNativeSave'] and preflight['normalFullQuit']
    assert preflight['newProcessPid']==phases[1]['pid'] and preflight['previousPid']==phases[0]['pid']
    steps=report['steps'];opened=[s for s in steps if s.get('nativeOpenInvoked')]
    assert len(opened)==3 and all(s['status']=='passed' and s['pathReadbackMatches'] for s in opened)
    assert [s['actualDefaultSaveProposal'] for s in steps if 'actualDefaultSaveProposal' in s]==['xlsx','xlsx']
    originals=[s for s in steps if 'actualSourceCell' in s]
    assert len(originals)==3 and all(s['actualSourceCell']=='Sheet1!C13' and s['actualValue']=='Note attached' for s in originals)
    edits=[s for s in steps if 'editStage' in s]
    assert [s['editStage'] for s in edits]==['edit-applied','edit-undo','edit-redo','edit-reopened']
    assert [s['actualText'] for s in edits]==[oracle.CONFIG['edit']['text'],'',oracle.CONFIG['edit']['text'],oracle.CONFIG['edit']['text']]
    assert all(s['actualFormula']=='=40+2' and s['expectedValue']==42 for s in edits)
    history=[s for s in steps if 'platformKey' in s]
    assert [s['platformKey'] for s in history]==['Control+z','Control+y']
    assert all(s['actualGridFocus']['gridOwns'] for s in history)
    actual=[]
    for name,edited in [('sxc-original.xlsx',False),('sxc-working.xlsx',True),('sxc-edited.xlsx',True),('sxc-reopened.xlsx',True)]:
        result=oracle.audit(source,proof/name,edited)
        assert result['cells']['passed']
        actual.append(dict(name=name,sha256=result['sha256'],edited=edited,cells=result['cells'],preservation=result['preservation']))
    # The working file is overwritten by Ctrl+S. Its earlier read-only save
    # oracle is bound to the separately retained original byte-identical snapshot.
    for case in report['preservationCases']:
        candidates=[a for a in actual if a['sha256']==case['sha256'] and a['edited']==case['edited']]
        assert candidates,(case['file'],case['sha256'])
        result=candidates[0]
        assert case['cellsPassed'] and case['preservationPassed']==result['preservation']['passed']
        assert case['differences']==result['preservation']['differences']
    preserved=all(a['preservation']['passed'] for a in actual)
    assert report['strictPreservationPassed']==preserved
    assert report['status']==('passed-native-sxc-selected-preservation' if preserved else 'failed-strict-preservation')
    assert run['conclusion']==('success' if preserved else 'failure')
    assert actual[0]['sha256']!=actual[1]['sha256']
    cleanup=report['cleanup']
    assert not any(k.endswith('Error') for k in cleanup) and not cleanup.get('forcedOwnedProcessTree')
    assert cleanup['residualOwnedWebviews']==[]
    for key in ('policyRestored','ownedInstallUninstalled','ownedAppExited','ownedNativeProfilesDisposed','ownedTemporaryProfileDisposed'):assert cleanup[key]
    return dict(auditStatus='verified-actual-native-outcome',nativeStatus=report['status'],nativeOperationsPassed=True,strictPreservationPassed=preserved,
                application=APP,tree=TREE,nativeRun=run['id'],harness=run['head_sha'],sourceSha256=sha(source),sourceCells=1,sourceFormulas=0,
                nativeChooserCases=3,normalFullExits=3,newProcessReopens=2,originalUnchanged=True,actualSavedXlsx=actual,
                scope='One ordinary P2 Windows SXC; strict differences remain negative. No full drawing/style/control behavior, other platform, signing or standalone approval.')

if __name__=='__main__':
    binding=read(BASE/'result-binding.json');root=Path(sys.argv[1]) if len(sys.argv)>1 else BASE/'evidence/native'
    print(json.dumps(audit(root,binding)))
