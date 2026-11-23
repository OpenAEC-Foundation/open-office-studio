"""Suite prefix proof is publishable without waiting for the six native cases."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from intake import write,suite_descriptor

root=Path(sys.argv[1]);provenance=root/'provenance'
binding=json.loads((provenance/'binding-before-child-artifacts.json').read_bytes())
repo=os.environ['GITHUB_REPOSITORY'];run=int(os.environ['GITHUB_RUN_ID'])
assert run==binding['preparerRun'] and os.environ['GITHUB_SHA']==binding['preparerHarness']
name='standalone-windows-p5-office-package'
for poll in range(15):
    all_artifacts=json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/actions/runs/{run}/artifacts?per_page=100']))['artifacts']
    found=[a for a in all_artifacts if a['name']==name and not a['expired']]
    if len(found)==1 and re.fullmatch('sha256:[0-9a-f]{64}',found[0].get('digest','')):break
    time.sleep(2)
else:raise AssertionError('Official own-Suite child metadata not ready')
a=found[0];assert a['workflow_run']['id']==run and a['workflow_run']['head_sha']==binding['preparerHarness']
suite=dict(binding['products']['office'])
suite['childArtifact']=dict(id=a['id'],name=a['name'],bytes=a['size_in_bytes'],digest=a['digest'])
suite['packageReceiptSha256']=hashlib.sha256((root/'office/package.json').read_bytes()).hexdigest()
target=root/'suite-provenance';target.mkdir()
write(target/'suite-consumer.json',suite_descriptor(binding,suite))
write(target/'child-office-artifact-metadata.json',a)
for filename in ('approved-input.json','source-run.json','source-attempt-jobs.json','source-job.json','source-commit.json','artifact-metadata.json','pakketcontrole-Windows.json','tool-capability.json'):
    shutil.copyfile(provenance/filename,target/filename)
print(json.dumps(dict(scope='Verified Suite child and descriptor ready; no dependency on remaining app uploads/native matrix',child=suite['childArtifact'],preparerRun=run)))
