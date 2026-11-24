"""Check queued critical work before dispatch and again when the witness starts."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

def api(path):
    return json.loads(subprocess.check_output(['gh','api','repos/OpenAEC-Foundation/open-office-studio/'+path]))
def main():
    checked=[];blocking=[]
    for state in ('queued','in_progress'):
        response=api('actions/runs?status='+state+'&per_page=100')
        assert response['total_count']<100,'Active run pagination needs explicit review'
        for run in response['workflow_runs']:
            name=run.get('name') or ''
            publisher=bool(re.search(r'publish|publicat',name,re.I))
            release=bool(re.search(r'release|uitgave',name,re.I))
            p5=bool(re.search(r'(?:^|[-/])p5(?:[-/]|$)',run['head_branch']))
            if not (publisher or release or p5):continue
            jobs=api('actions/runs/'+str(run['id'])+'/jobs?per_page=100')
            assert jobs['total_count']<100
            queued=[j for j in jobs['jobs'] if j['status']=='queued' and (publisher or re.search('linux',j['name'],re.I))]
            row=dict(run=run['id'],name=name,branch=run['head_branch'],state=state,
                queuedCriticalJobs=[dict(id=j['id'],name=j['name']) for j in queued])
            checked.append(row)
            if queued or (state=='queued' and not jobs['jobs']):blocking.append(row)
    now=int(time.time())
    report=dict(checkedEpoch=now,checked=checked,blocking=blocking,passed=not blocking)
    if '--create' in sys.argv:
        report.update(dispatchEpoch=now,preflightDeadline=now+600,buildDeadline=now+2100,finalDeadline=now+2700)
    else:
        from deadline import remaining
        report['remainingPreflightSeconds']=remaining('preflight')
    output=Path('.local/issue381');output.mkdir(parents=True,exist_ok=True)
    name='dispatch-request.json' if '--create' in sys.argv else 'runner-frontgate.json'
    (output/name).write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))
    assert not blocking,'Queued critical publisher/P5 Linux work takes precedence'

if __name__=='__main__':main()
