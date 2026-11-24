"""One absolute allocation clock; never resets when the runner starts."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

def remaining(phase):
    start=int(os.environ['OOS_381_DISPATCH_EPOCH'])
    now=time.time()
    assert start<=now+30,'Allocation epoch is in the future'
    duration={'preflight':600,'build':2100,'finish':2700}[phase]
    seconds=int(start+duration-now)
    assert seconds>0,('Absolute allocation deadline expired',phase,start+duration,now)
    return seconds

if __name__=='__main__':
    phase=sys.argv[1]
    seconds=remaining(phase)
    out=Path('.local/issue381');out.mkdir(parents=True,exist_ok=True)
    start=int(os.environ['OOS_381_DISPATCH_EPOCH'])
    witness=dict(dispatchEpoch=start,preflightDeadline=start+600,buildDeadline=start+2100,
        finalDeadline=start+2700,observedEpoch=time.time(),phase=phase,remainingSeconds=seconds,
        run=os.environ.get('GITHUB_RUN_ID'),attempt=os.environ.get('GITHUB_RUN_ATTEMPT'),
        source=os.environ.get('GITHUB_SHA'))
    (out/('deadline-'+phase+'.json')).write_text(json.dumps(witness,indent=2)+'\n')
    if len(sys.argv)>2:
        result=subprocess.run(sys.argv[2:],timeout=seconds)
        raise SystemExit(result.returncode)
    print(json.dumps(witness))
