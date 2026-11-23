"""A fresh app host downloads only its own strictly hashed3-member child ZIP."""
import hashlib
import json
import os
from pathlib import Path,PurePosixPath
import shutil
import stat
import subprocess
import sys
import zipfile
from intake import APP,TREE,RUN,JOB,APPS,validate,write,digest

plan=json.loads(Path(sys.argv[1]).read_bytes());validate(plan);assert plan['ready']
root=Path(sys.argv[2]);root.mkdir(parents=True,exist_ok=False)
app=os.environ['OOS_QA_APP'];assert app in APPS
expected_id=int(os.environ['OOS_QA_CHILD_ID']);expected_sha=os.environ['OOS_QA_CHILD_SHA'];receipt_sha=os.environ['OOS_QA_RECEIPT_SHA']
repo=os.environ['GITHUB_REPOSITORY'];run=int(os.environ['OOS_QA_PREPARER_RUN']);harness=os.environ['OOS_QA_PREPARER_HARNESS']
meta=json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/actions/artifacts/{expected_id}']))
assert meta['id']==expected_id and meta['name']==f'standalone-windows-p5-{app}-package' and not meta['expired']
assert meta['workflow_run']['id']==run and meta['workflow_run']['head_sha']==harness
assert meta['digest']=='sha256:'+expected_sha
archive=root/'input-child.zip'
with archive.open('xb') as f:subprocess.run(['gh','api',f'repos/{repo}/actions/artifacts/{expected_id}/zip'],stdout=f,check=True)
assert archive.stat().st_size==meta['size_in_bytes'] and digest(archive)==expected_sha
with zipfile.ZipFile(archive) as z:
    names=z.namelist();assert len(names)==len(set(names))==3
    assert 'package.json' in names and 'canonical-package-report.json' in names
    receipt_bytes=z.read('package.json');assert hashlib.sha256(receipt_bytes).hexdigest()==receipt_sha
    receipt=json.loads(receipt_bytes);a=receipt['application']
    assert receipt['applicationCommit']==APP and receipt['applicationTree']==TREE
    assert receipt['artifactRun']==RUN and receipt['platformJobId']==JOB and receipt['sourceAttempt']==1
    assert receipt['artifactId']==plan['artifactId'] and receipt['archiveSha256']==plan['archiveSha256']
    assert receipt['preparerRun']==run and receipt['preparerHarness']==harness
    assert a['key']==app and a['executable']==f'open-{app}-studio.exe' and a['identifier']==f'org.openaec.{app}-studio'
    assert a['signature']=='valid' and a['timestampRequired'] is True
    assert set(names)=={'package.json','canonical-package-report.json',receipt['installer']}
    for e in z.infolist():
        p=PurePosixPath(e.filename);assert len(p.parts)==1 and not p.is_absolute() and '..' not in p.parts and '\\' not in e.filename and not stat.S_ISLNK(e.external_attr>>16)
        assert e.file_size<2*1024**3
        with z.open(e) as source,(root/e.filename).open('xb') as dest:shutil.copyfileobj(source,dest,1024*1024)
assert digest(root/receipt['installer'])==a['sha256'] and (root/receipt['installer']).stat().st_size==a['bytes']
assert digest(root/'canonical-package-report.json')==receipt['canonicalPackageReport']['sha256']
write(root/'consumer-binding.json',dict(status='strict-own-child-zip-nsis-report-source-receipt-verified',application=app,childArtifact=meta,receiptSha256=receipt_sha,source=APP,tree=TREE,canonicalParentSha256=plan['archiveSha256'],boundary='This host received only its own NSIS/report/receipt; no suite package, report or resources.'))
# The verified wrapper itself contains only this same app and is not needed by the UI driver.
archive.unlink()
print(json.dumps(dict(app=app,source=APP,childArtifact=expected_id,wholeChildDigestVerified=True)))
