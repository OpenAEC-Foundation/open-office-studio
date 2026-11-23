"""Bind actual official child artifact digests after the single split/upload."""
import json
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from intake import PRODUCTS,APPS,write

root=Path(sys.argv[1]);provenance=root/'provenance'
binding=json.loads((provenance/'binding-before-child-artifacts.json').read_bytes())
repo=os.environ['GITHUB_REPOSITORY'];run=int(os.environ['GITHUB_RUN_ID'])
assert run==binding['preparerRun'] and os.environ['GITHUB_SHA']==binding['preparerHarness']
for poll in range(15):
    artifacts=json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/actions/runs/{run}/artifacts?per_page=100']))['artifacts']
    wanted={f'standalone-windows-p5-{key}-package' for key in PRODUCTS}
    visible=[a for a in artifacts if a['name'] in wanted and not a['expired'] and re.fullmatch('sha256:[0-9a-f]{64}',a.get('digest',''))]
    if {a['name'] for a in visible}==wanted:break
    time.sleep(2)
else:raise AssertionError('Official child metadata/digests not ready after uploads')
for key in PRODUCTS:
    name=f'standalone-windows-p5-{key}-package'
    found=[a for a in artifacts if a['name']==name and not a['expired']];assert len(found)==1
    a=found[0];assert re.fullmatch('sha256:[0-9a-f]{64}',a['digest'])
    assert a['workflow_run']['id']==run and a['workflow_run']['head_sha']==binding['preparerHarness']
    binding['products'][key]['childArtifact']=dict(id=a['id'],name=a['name'],bytes=a['size_in_bytes'],digest=a['digest'])
    binding['products'][key]['packageReceiptSha256']=hashlib.sha256((root/key/'package.json').read_bytes()).hexdigest()
    write(provenance/f'child-{key}-artifact-metadata.json',a)
write(provenance/'binding.json',binding)
suite=binding['products']['office']
write(provenance/'suite-consumer.json',dict(schemaVersion=1,consumer='750b',source=dict(producer=binding['artifactRun'],attempt=1,job=binding['platformJobId'],commit=binding['applicationCommit'],tree=binding['applicationTree'],version=binding['version'],parentArtifact=binding['artifactId'],parentZipSha256=binding['archiveSha256']),suite=suite,contract='Verify full child ZIP against official digest, all3 exact members, original NSIS and canonical report size/SHA, payload==installed app and Authenticode before native UI. Own fresh suite host; no new build.'))
app_inputs=[dict(app=key,artifactId=binding['products'][key]['childArtifact']['id'],artifactSha256=binding['products'][key]['childArtifact']['digest'].removeprefix('sha256:'),receiptSha256=binding['products'][key]['packageReceiptSha256'],preparerRun=run,preparerHarness=binding['preparerHarness']) for key in APPS]
with open(os.environ['GITHUB_OUTPUT'],'a',encoding='utf8') as f:f.write('apps='+json.dumps(app_inputs,separators=(',',':'))+'\n')
print(json.dumps(dict(preparerRun=run,products=list(PRODUCTS),suiteChild=suite['childArtifact'],binding='provenance/binding.json')))
