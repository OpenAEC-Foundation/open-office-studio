"""Supplementary operator gate: include new main jobs and their OS labels."""
import hashlib,json,pathlib,re,subprocess,time
def api(path):return json.loads(subprocess.check_output(['gh','api','repos/OpenAEC-Foundation/open-office-studio/'+path]))
rows=[];blocking=[]
for state in ['queued','in_progress']:
    response=api('actions/runs?status='+state+'&per_page=100')
    assert response['total_count']<100,'Unknown paginated queue'
    for run in response['workflow_runs']:
        name=run.get('name') or ''
        pub=bool(re.search('publish|publicat',name,re.I))
        critical=pub or bool(re.search('release|uitgave',name,re.I)) or run['head_branch']=='main' or bool(re.search(r'(?:^|[-/])p5(?:[-/]|$)',run['head_branch']))
        if not critical:continue
        jobs=api('actions/runs/'+str(run['id'])+'/jobs?per_page=100')
        assert jobs['total_count']<100
        row=dict(run=run['id'],head=run['head_sha'],branch=run['head_branch'],name=name,state=state,
                 jobs=[{k:j.get(k) for k in ['id','name','status','conclusion','labels']} for j in jobs['jobs']])
        rows.append(row)
        if state=='queued' and not jobs['jobs']:blocking.append(dict(run=run['id'],reason='Unknown queued critical jobs'))
        for job in jobs['jobs']:
            if job['status']!='queued':continue
            labels=' '.join(job.get('labels') or [])
            linux=bool(re.search('ubuntu|linux',labels+' '+job['name'],re.I))
            other=bool(re.search('windows|macos|mac-',labels+' '+job['name'],re.I))
            if pub or linux or not other:
                blocking.append(dict(run=run['id'],job=job['id'],reason='Queued publisher/Linux/unknown-OS critical job',labels=job.get('labels'),name=job['name']))
report=dict(method='Supplementary read-only operator gate, including all main/publisher/release/P5 runs and explicit Linux/Ubuntu job labels',
            checkedEpoch=int(time.time()),checked=rows,blocking=blocking,passed=not blocking,
            operatorScriptSha256=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest())
pathlib.Path('.local/issue381/full-critical-queue.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
print(json.dumps(dict(checkedEpoch=report['checkedEpoch'],checkedRuns=[r['run'] for r in rows],blocking=blocking,passed=report['passed'])))
assert not blocking,'Conditional allocation blocked by the full critical Linux queue'
