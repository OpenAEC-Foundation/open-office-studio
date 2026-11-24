"""Only small prior QA metadata; never redownload/rebuild the canonical parent."""
import hashlib
import io
import json
import os
from pathlib import Path,PurePosixPath
import stat
import subprocess
import zipfile
from intake import APP,TREE,RUN,JOB,validate,write
from oracle import inspect

config=json.loads(Path('.github/wpd6-windows.json').read_bytes())
plan=json.loads(Path('.github/wpd6-windows-consumer.json').read_bytes());validate(plan)
assert config['schemaVersion']==1 and config['ready'] is True and plan['ready'] is True
assert plan['reuseOnly'] is True
assert (config['preparerRun'],config['preparerJob'],config['preparerHarness'])==(45195780472,137765723008,'f88a805beb152d42a22806d135d9af1c912aedcb')
repo=os.environ['GITHUB_REPOSITORY']
def raw(endpoint):return subprocess.check_output(['gh','api',f'repos/{repo}/{endpoint}'])
def api(endpoint):return json.loads(raw(endpoint))
target=Path('.local/p5-reuse-plan');target.mkdir(parents=True,exist_ok=False)
def small_archive(artifact_id,expected_sha,expected_name):
    meta=api(f'actions/artifacts/{artifact_id}')
    assert meta['id']==artifact_id and meta['name']==expected_name and not meta['expired']
    assert meta['workflow_run']['id']==config['preparerRun'] and meta['workflow_run']['head_sha']==config['preparerHarness']
    assert meta['digest']=='sha256:'+expected_sha and 0<meta['size_in_bytes']<20*1024**2
    data=raw(f'actions/artifacts/{artifact_id}/zip')
    assert len(data)==meta['size_in_bytes'] and hashlib.sha256(data).hexdigest()==expected_sha
    (target/(expected_name+'.zip')).write_bytes(data);write(target/(expected_name+'-metadata.json'),meta)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        entries=z.infolist();assert len(entries)==len({e.filename for e in entries})<1000
        assert sum(e.file_size for e in entries)<100*1024**2
        for e in entries:
            p=PurePosixPath(e.filename)
            assert not p.is_absolute() and '..' not in p.parts and '\\' not in e.filename and ':' not in e.filename and not stat.S_ISLNK(e.external_attr>>16)
            assert p.suffix.lower() not in ('.exe','.dll','.msi')
        return {e.filename:z.read(e) for e in entries if not e.is_dir()}
prepared=api(f"actions/jobs/{config['preparerJob']}")
assert prepared['run_id']==config['preparerRun'] and prepared['head_sha']==config['preparerHarness'] and prepared['name']=='prepare'
assert prepared['status']=='completed' and prepared['conclusion']=='success'
assert prepared['run_attempt']==1
write(target/'original-prepare-job.json',prepared)
files=small_archive(config['bindingArtifact'],config['bindingSha256'],'standalone-windows-p5-binding')
binding=json.loads(files['binding.json'])
assert (binding['applicationCommit'],binding['applicationTree'],binding['artifactRun'],binding['platformJobId'],binding['sourceAttempt'])==(APP,TREE,RUN,JOB,1)
assert (binding['preparerRun'],binding['preparerHarness'])==(config['preparerRun'],config['preparerHarness'])
assert binding['artifactId']==plan['artifactId'] and binding['archiveSha256']==plan['archiveSha256'] and binding['archiveBytes']==plan['archiveBytes']
core_job=api(f"actions/jobs/{config['writerCoreJob']}")
assert core_job['run_id']==config['preparerRun'] and core_job['head_sha']==config['preparerHarness'] and core_job['name']=='Native writer Windows app-only'
assert core_job['status']=='completed' and core_job['conclusion']=='success'
write(target/'original-writer-core-job.json',core_job)
cases=config['cases'];assert len(cases)==len({c['app'] for c in cases})<=6
matrix=[]
for case in cases:
    app,mode=case['app'],case['mode']
    assert mode=='wpd6' and app=='writer' and len(cases)==1
    product=binding['products'][app];child=product['childArtifact']
    assert product['application']['key']==app
    suffix='wpd6-proof'
    matrix.append(dict(app=app,mode=mode,artifactId=child['id'],artifactSha256=child['digest'].removeprefix('sha256:'),receiptSha256=product['packageReceiptSha256'],preparerRun=config['preparerRun'],preparerHarness=config['preparerHarness'],coreRun=config['preparerRun'],coreJob=config['writerCoreJob'],coreProof=config['writerCoreProof'],proofName=f'standalone-windows-p5-{app}-'+suffix))
write(target/'binding.json',binding);write(target/'reuse-plan.json',dict(config=config,matrix=matrix,scope='Own original app children only; no canonical parent download, product build or suite transfer'))
with open(os.environ['GITHUB_OUTPUT'],'a',encoding='utf8') as f:f.write('apps='+json.dumps(matrix,separators=(',',':'))+'\n')
print(json.dumps(dict(source=APP,cases=cases,scope='One native Windows WPD6 Writer case; previous core proof retained')))
