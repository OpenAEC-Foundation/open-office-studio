"""Read-only execution gate. No workflow dispatch, approval generation or app start."""
from pathlib import Path
import argparse,json,os,sys
from contract import *


def main():
    parser=argparse.ArgumentParser();parser.add_argument('stage',choices=['build','native']);args=parser.parse_args()
    root=Path(os.environ['PRODUCER_ROOT']).resolve()
    event=json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_bytes())
    raw=event.get('inputs',{}).get('approval_json','{}')
    require(len(raw.encode())<40000,'Bounded approval input required')
    a=json.loads(raw);p=validate_approval(a,args.stage,root,os.environ)
    require(event['inputs'].get('stage')==args.stage,'Dispatch stage differs')
    run_id=int(os.environ['GITHUB_RUN_ID']);token=os.environ['GH_TOKEN']
    run=api('repos/'+REPO+'/actions/runs/'+str(run_id)+'/attempts/1',token)
    validate_run(run,a,run_id)
    require(utc(run['created_at'])>=utc(a['issuedUTC']),'Run predates live approval')
    out=Path(os.environ['RUNNER_TEMP'])/'mac-save-execution-approval.json'
    write_json(out,a)
    write_json(Path(os.environ['RUNNER_TEMP'])/'mac-save-gate-run.json',run)
    if os.environ.get('GITHUB_OUTPUT'):
        with Path(os.environ['GITHUB_OUTPUT']).open('a') as f:
            f.write('appCommit='+p['appCommit']+'\n')
    print('Frozen producer/app/workflow/request gates verified; stage='+args.stage)


if __name__=='__main__':main()
