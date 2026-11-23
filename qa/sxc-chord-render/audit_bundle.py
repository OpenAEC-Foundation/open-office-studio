"""Recheck official archive bytes, exact source binding and independent saved XML."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile
import audit_outputs

BASE=Path(__file__).resolve().parent
read=lambda p:json.loads(p.read_bytes())
sha=lambda b:hashlib.sha256(b).hexdigest()

def audit(root):
    binding=read(BASE/'result-binding.json');run=read(root/'run.json');meta=read(root/'artifact-metadata.json')
    assert run['id']==binding['run'] and run['head_sha']==binding['sourceCommit']
    assert run['status']=='completed' and run['conclusion']=='success'
    assert meta['id']==binding['artifact'] and meta['name']=='sxc-chord-browser-proof'
    assert meta['workflow_run']['id']==run['id'] and meta['workflow_run']['head_sha']==run['head_sha']
    archive=root/'artifact.zip';assert sha(archive.read_bytes())==binding['zipSha256']
    assert meta['digest']=='sha256:'+binding['zipSha256'] and archive.stat().st_size==meta['size_in_bytes']
    jobs=read(root/'jobs.json')['jobs'];assert len(jobs)==1
    job=jobs[0];assert job['id']==binding['job'] and job['run_id']==run['id'] and job['conclusion']=='success'
    assert run['run_attempt']==job['run_attempt']==1
    assert all(s['conclusion']=='success' for s in job['steps'] if s['name'] in ('Focused geometry, source and OOXML preservation regressions','Actual browser source edit/save/fresh reopen and print canvas'))
    files=root/'files'
    with zipfile.ZipFile(archive) as z:
        names=[n for n in z.namelist() if not n.endswith('/')];assert len(names)==len(set(names))==17
        assert set(names)=={p.relative_to(files).as_posix() for p in files.rglob('*') if p.is_file()}
        for n in names:assert z.read(n)==(files/n).read_bytes(),n
    report=read(files/'report.json')
    assert report['sourceCommit']==binding['sourceCommit'] and report['sourceTree']==binding['sourceTree']
    windows=read(BASE/'windows-static-checks.json')
    assert windows['sourceCommit']==binding['sourceCommit'] and windows['sourceTree']==binding['sourceTree']
    assert windows['tsc']=='passed --noEmit' and windows['nativeAcceptance'] is False
    assert windows['targetedTests']['passed']==windows['targetedTests']['total']==25 and windows['targetedTests']['failed']==0
    assert subprocess.check_output(['git','rev-parse',binding['sourceCommit']+'^{tree}']).decode().strip()==binding['sourceTree']
    source_files={}
    for name in binding['productFiles']:
        tested=subprocess.check_output(['git','show',binding['sourceCommit']+':'+name])
        assert tested==subprocess.check_output(['git','show','HEAD:'+name]),'Product changed after proof: '+name
        source_files[name]=sha(tested)
    result=audit_outputs.audit(files)
    return dict(status='passed-official-byte-source-and-output-audit',binding=binding,productFileSha256=source_files,outputAudit=result,
                scope='Actual browser and print-canvas evidence only; no new native package/standalone/signing or all-SXC acceptance.')

if __name__=='__main__':
    root=Path(sys.argv[1]) if len(sys.argv)>1 else BASE/'evidence/passed'
    print(json.dumps(audit(root)))
