"""Bind the uploaded transfer ZIPs without downloading the canonical parent again."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

REPO='OpenAEC-Foundation/open-office-studio'

def main():
    run=int(os.environ['GITHUB_RUN_ID']);qa=os.environ['GITHUB_SHA']
    artifacts=json.loads(subprocess.check_output(['gh','api',f'repos/{REPO}/actions/runs/{run}/artifacts?per_page=100']))['artifacts']
    manifest={'schemaVersion':1,'producerRun':run,'producerCommit':qa,'sourceCommit':'04fa6cd43b84e3f59fb9d5055bb2d00dde351a47','sourceTree':'94fa38c20b51a73e4912964f37f0e1a659b0fb1b','appVersion':'2026.48.1','artifacts':[],'nativeAcceptanceClaim':False,'publicationAuthorized':False}
    metadata=Path('.local/linux-release-input-p4-metadata')
    expected=[f'standalone-input-{app}-p4' for app in ['writer','spreadsheet','presentation','email','notition','database']]+[f'suite-input-office-{kind}-p4' for kind in ['deb','appimage']]
    for name in expected:
        artifact,=[a for a in artifacts if a['name']==name and not a['expired']]
        assert artifact['workflow_run']['head_sha']==qa and artifact['workflow_run']['id']==run
        assert re.fullmatch(r'sha256:[0-9a-f]{64}',artifact['digest']) and artifact['size_in_bytes']>0
        manifest['artifacts'].append(artifact)
        if name.startswith('suite-'):
            kind=name.removeprefix('suite-input-office-').removesuffix('-p4')
            path=metadata/f'office-{kind}-descriptor.json'
            descriptor=json.loads(path.read_text(encoding='utf-8'))
            assert descriptor['qaPin']['producerCommit']==qa and descriptor['parent']['jobConclusion']=='success'
            descriptor['artifact'].update(run=run,id=artifact['id'],name=name,zipSha256=artifact['digest'].removeprefix('sha256:'),zipBytes=artifact['size_in_bytes'])
            descriptor['executionApproved']=True
            descriptor['purpose']='P4 verified Suite byte transfer; native acceptance remains consumer-owned'
            descriptor['embeddedDescriptorNote']='Embedded pre-upload descriptor intentionally has no self-referential ZIP digest; this external descriptor binds the uploaded ZIP'
            path.write_text(json.dumps(descriptor,indent=2)+'\n',encoding='utf-8')
            manifest[name+'DescriptorSha256']=hashlib.sha256(path.read_bytes()).hexdigest()
    (metadata/'transfers.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()
