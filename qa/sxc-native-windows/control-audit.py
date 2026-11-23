"""Bind a completed converter-only control and compare actual native outputs."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile
import oracle

BASE=Path(__file__).resolve().parent
read=lambda p:json.loads(p.read_bytes())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def audit(root,binding,native):
    run=read(root/'run.json');meta=read(root/'artifact-metadata.json')
    assert run['id']==binding['run'] and run['head_sha']==binding['harness'] and run['conclusion']=='success'
    assert meta['id']==binding['artifact'] and meta['name']=='sxc-converter-control-Windows-proof'
    assert sha(root/'artifact.zip')==binding['zipSha256'] and meta['digest']=='sha256:'+binding['zipSha256']
    jobs=read(root/'jobs.json')['jobs'];assert len(jobs)==1
    assert jobs[0]['id']==binding['job'] and jobs[0]['run_id']==run['id'] and jobs[0]['conclusion']=='success'
    assert run['run_attempt']==jobs[0]['run_attempt']==1
    files=root/'files'
    with zipfile.ZipFile(root/'artifact.zip') as z:
        names=[n for n in z.namelist() if not n.endswith('/')]
        assert len(names)==len(set(names))
        assert set(names)=={p.relative_to(files).as_posix() for p in files.rglob('*') if p.is_file()}
        for n in names:assert z.read(n)==(files/n).read_bytes()
    proof=files/'sxc-control-proof';package=files/'sxc-control-package'
    report=read(proof/'report.json');receipt=read(package/'package.json')
    assert receipt==read(native/'files/sxc-native-package/package.json')==report['package']
    assert report['harness']==run['head_sha']
    assert report['status']=='completed-control-with-recorded-differences' and report['sourceUnchanged'] and report['cellsPassed']
    assert report['kind']=='supplementary-converter-control-not-native-acceptance'
    assert report['installedExecutable']['sha256']==receipt['payloadExecutable']['sha256']
    assert report['converter']['signature']=='Valid' and report['converter']['sha256']=='4f133aba4d8db66122ec34bc17eeaa8b274cfa5ded03feb384953f6ae357d4cf'
    producer=read(package/'source-run.json');job=read(package/'source-job.json');commit=read(package/'source-commit.json')
    assert producer['id']==job['run_id']==45143305147 and job['id']==137586342967
    assert producer['head_sha']==commit['sha']==oracle.CONFIG['applicationCommit']
    assert commit['tree']['sha']==oracle.CONFIG['applicationTree']
    assert producer['run_attempt']==job['run_attempt']==1 and producer['conclusion']==job['conclusion']=='success'
    assert sha(package/'canonical-package-report.zip')==sha(native/'files/sxc-native-package/canonical-package-report.zip')
    assert sha(package/'canonical-package-report.json')==receipt['canonicalPackageReportSha256']
    source=proof/'calcshapes.sxc';assert oracle.read_source(source)==read(BASE/'source-oracle-before-import.json')
    profile=subprocess.check_output(['git','show',oracle.CONFIG['applicationCommit']+':src-tauri/src/conversieprofiel.xcu'])
    assert (proof/'exact-p2-profile.xcu').read_bytes()==profile and sha(proof/'exact-p2-profile.xcu')==report['profileSha256']
    args=report['command'];assert args[args.index('--convert-to')+1]=='xlsx:Calc MS Excel 2007 XML'
    assert all(s in args for s in ('--headless','--nologo','--nodefault','--norestore','--nolockcheck'))
    observed=oracle.audit(source,proof/'converted/calcshapes.xlsx',False)
    recorded=read(proof/'converter-oracle.json')
    assert {k:v for k,v in observed.items() if k!='file'}=={k:v for k,v in recorded.items() if k!='file'}
    assert observed['sha256']==report['outputSha256'] and observed['cells']['passed']
    assert observed['preservation']['passed']==report['preservationPassed']
    assert observed['preservation']['differences']==report['differences']
    assert report['cleanup']==dict(ownedInstallUninstalled=True,residualOwnedProcesses=[],ownedTemporaryProfileDisposed=True)
    def signature(book):
        return [{k:s[k] for k in ('name','annotations','drawings','controls','worksheetControlCount')} for s in book['sheets']]
    keys=lambda book:{k:v for k,v in book['parts'].items() if k.startswith(('xl/drawings/','xl/ctrlProps/','xl/media/','xl/comments'))}
    comparisons=[]
    for name in ('sxc-original.xlsx','sxc-working.xlsx','sxc-edited.xlsx','sxc-reopened.xlsx'):
        actual=oracle.read_xlsx(native/'files/sxc-native-proof'/name)
        comparisons.append(dict(nativeFile=name,selectedObjectStructureEqualsControl=signature(actual)==signature(observed['observed']),
                                rawObjectPartsEqualControl=keys(actual)==keys(observed['observed'])))
    return dict(status='verified-supplementary-control-not-native-pass',run=run['id'],harness=run['head_sha'],outputSha256=observed['sha256'],
                cellsPassed=True,strictPreservationPassed=observed['preservation']['passed'],differences=observed['preservation']['differences'],
                comparisons=comparisons,allSelectedNativeStructuresEqualControl=all(c['selectedObjectStructureEqualsControl'] for c in comparisons),
                scope='Independent unchanged bundled converter reproduces selected differences without app editor. Raw and selected XML comparisons are separate. No new native, full visual, control behavior, signing or standalone acceptance.')

if __name__=='__main__':
    binding=read(BASE/'converter-control-binding.json')
    root=Path(sys.argv[1]) if len(sys.argv)>1 else BASE/'evidence/control'
    print(json.dumps(audit(root,binding,BASE/'evidence/native')))
