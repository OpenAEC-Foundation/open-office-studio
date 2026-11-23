"""Create only the immutable P5 API intake; no installer download or execution."""
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

HERE=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('prepare',Path(__file__).with_name('prepare-linux-release-input-p5.py'))
prepare=importlib.util.module_from_spec(spec);spec.loader.exec_module(prepare)

def main():
    source=prepare.SOURCE;tree=prepare.TREE
    assert subprocess.check_output(['git','rev-parse',source+'^{tree}'],text=True).strip()==tree
    version=json.loads(subprocess.check_output(['git','show',source+':package.json']))['version']
    assert version=='2026.48.1'
    run=prepare.api('actions/runs/45177730188')
    job=prepare.api('actions/jobs/137703365848')
    if job['status']!='completed' or job['conclusion']!='success':
        raise SystemExit('Own P5 Linux job is not SUCCESS; no intake/go/download was created')
    artifacts=prepare.api('actions/runs/45177730188/artifacts?per_page=100')['artifacts']
    artifact,=[a for a in artifacts if a['name']=='uitgave-Linux' and not a['expired']]
    pin=dict(purpose='P5-frozen-candidate',sourceCommit=source,sourceTree=tree,version=version,run=run['id'],attempt=1,job=job['id'],workflow=run['path'],canonicalBranch=run['head_branch'],qaCodeCommit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),checkedAt=datetime.now(timezone.utc).isoformat(),window=dict(runStartedAt=run['run_started_at'],jobStartedAt=job['started_at'],jobCompletedAt=job['completed_at']),artifact=dict(id=artifact['id'],name=artifact['name'],digest=artifact['digest'],bytes=artifact['size_in_bytes'],createdAt=artifact['created_at'],updatedAt=artifact['updated_at'],parent=artifact['workflow_run']),requiredGates=prepare.REQUIRED_GATES,skippedNonLinuxGate=dict(name=prepare.NON_LINUX_GATE,sourceCondition="runner.os != 'Linux'"),publicationAuthorized=False)
    prepare.verify_intake(pin,run,job,artifact)
    path=HERE/'docs/tests/linux-release-input-p5/intake.json'
    assert not path.exists(), 'Existing immutable intake must not be silently replaced'
    path.write_bytes((json.dumps(pin,indent=2)+'\n').encode('utf-8'))
    print(json.dumps(dict(path=str(path),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),sourceCommit=source,sourceTree=tree,artifact=pin['artifact'],nativeExecutionAuthorizedByThisFile=False)))

if __name__=='__main__':main()
