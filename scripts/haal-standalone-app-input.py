"""Transfer only the own app's immutable input ZIP to a fresh native test host."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import zipfile

REPO = 'OpenAEC-Foundation/open-office-studio'
def api(route):
    return json.loads(subprocess.check_output(['gh','api',f'repos/{REPO}/{route}']))
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        while block:=stream.read(1024*1024):h.update(block)
    return h.hexdigest()

def main():
    app=os.environ['STANDALONE_APP'];assert app in ['writer','spreadsheet','presentation','email','notition','database']
    run=os.environ.get('STANDALONE_INPUT_RUN') or os.environ['GITHUB_RUN_ID'];qa=os.environ['GITHUB_SHA'];source=os.environ['STANDALONE_APP_COMMIT'];parent=os.environ['STANDALONE_BUILD_RUN']
    assert run.isdecimal()
    producer=api(f'actions/runs/{run}')
    assert producer['path']=='.github/workflows/linux-release-input-p4.yml' and producer['head_branch']=='codex/linux-release-input-p4-2026-11-23'
    artifacts=api(f'actions/runs/{run}/artifacts?per_page=100')['artifacts']
    artifact,=[a for a in artifacts if a['name']=='standalone-input-'+app+'-p4' and not a['expired']]
    assert artifact['workflow_run']['head_sha']==producer['head_sha']
    archive=Path(os.environ['RUNNER_TEMP'])/f'own-{app}-input.zip'
    with archive.open('wb') as stream:subprocess.run(['gh','api',f'repos/{REPO}/actions/artifacts/{artifact["id"]}/zip'],stdout=stream,check=True)
    assert archive.stat().st_size==artifact['size_in_bytes'] and 'sha256:'+digest(archive)==artifact['digest']
    out=Path('.local/standalone-linux-input');out.mkdir(exist_ok=False)
    with zipfile.ZipFile(archive) as z:
        names=z.namelist();assert len(names)==len(set(names))==4
        assert all(PurePosixPath(n).parent==PurePosixPath('.') and '\\' not in n and not n.startswith('.') for n in names)
        z.extractall(out)
    origin=json.loads((out/'origin.json').read_text())
    raw=(Path(__file__).resolve().parent.parent/'docs/tests/linux-release-input-p4/intake.json').read_bytes()
    pin=json.loads(raw)
    assert origin['intake']['intakeSha256']==hashlib.sha256(raw).hexdigest() and origin['intake']['intake']==pin
    assert origin['preparedBy']['run']==int(run) and origin['preparedBy']['qaCommit']==producer['head_sha']
    assert origin['sourceCommit']==source and origin['run']==int(parent) and origin['purpose']=='P4-frozen-candidate'
    assert origin['studio']['sleutel']==app
    assert origin['sourceTree']==subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip()
    assert json.loads(Path('package.json').read_text())['version']==origin['version']
    expected=next(s for s in json.loads(Path('assets/studios.json').read_text()) if s['sleutel']==app)
    assert expected==origin['studio']
    canonical=api(f'actions/artifacts/{origin["artifact"]["id"]}')
    assert canonical['workflow_run']['id']==int(parent) and canonical['workflow_run']['head_sha']==source
    assert canonical['digest']=='sha256:'+origin['artifact']['zipSha256']
    assert canonical['id']==pin['artifact']['id'] and canonical['digest']==pin['artifact']['digest'] and canonical['name']==pin['artifact']['name']=='uitgave-Linux'
    report=out/origin['packageReport'];assert digest(report)==origin['packageReportSha256']
    assert len(origin['packages'])==2
    for p in origin['packages']:
        path=out/p['path'];assert path.parent==out and path.is_file()
        assert path.stat().st_size==p['bytes'] and digest(path)==p['sha256']
    receipt=dict(qaRun=int(os.environ['GITHUB_RUN_ID']),qaCommit=qa,inputProducerRun=int(run),inputProducerCommit=producer['head_sha'],inputArtifact=artifact,intakeSha256=origin['intake']['intakeSha256'],archiveLocallyHashVerified=True,onlyOwnApp=app,sourceCommit=source,canonicalParent=origin['artifact'])
    (out/'input-artifact-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    archive.unlink()
    print(json.dumps(receipt))
if __name__=='__main__':main()
