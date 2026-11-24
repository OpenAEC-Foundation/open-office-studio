"""One marker push, with request-only delta and frozen source/absolute clocks."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

SCOPES=['qa/issue381','.github/workflows/issue381-private-runtime.yml',
    'patches/libwps-wq2-vlookup.patch','patches/libwps-wq2-vlookup.json',
    'docs/tests/issue381-20261124/retained']
def git(*args):return subprocess.check_output(['git',*args])
def sha(data):return hashlib.sha256(data).hexdigest()
def paths(commit):return git('ls-tree','-r','--name-only',commit,'--',*SCOPES).decode().splitlines()
def write(path,data):path.write_bytes((json.dumps(data,indent=2)+'\n').encode())

def main():
    binding=json.loads(Path('qa/issue381/witness-binding.json').read_bytes())
    request_path=Path(binding['requestPath'])
    output=Path('.local/issue381');output.mkdir(parents=True,exist_ok=True)
    head=git('rev-parse','HEAD').decode().strip()
    if '--create' in sys.argv:
        assert os.environ.get('GITHUB_ACTIONS')!='true'
        assert git('branch','--show-current').decode().strip()==binding['branch']
        assert not git('status','--porcelain').strip(),'Commit/push the frozen harness first'
        assert git('rev-parse','@{u}').decode().strip()==head
        assert not request_path.exists(),'No second executing request/clock'
        subprocess.run([sys.executable,'qa/issue381/frontgate.py','--create'],check=True)
        gate=json.loads((output/'dispatch-request.json').read_bytes())
        assert gate['passed'] and time.time()-gate['checkedEpoch']<=30
        request=dict(**binding,harnessSourceCommit=head,frontgate=gate,
            sourceFiles={p:sha(git('show',head+':'+p)) for p in paths(head)})
        write(request_path,request)
        print(json.dumps(dict(marker=binding['marker'],harnessSourceCommit=head,
            dispatchEpoch=gate['dispatchEpoch'],finalDeadline=gate['finalDeadline'])))
        return
    assert os.environ.get('GITHUB_ACTIONS')=='true'
    assert os.environ['GITHUB_EVENT_NAME']=='push'
    assert os.environ['GITHUB_REF']=='refs/heads/'+binding['branch']
    assert os.environ['GITHUB_SHA']==head
    request=json.loads(request_path.read_bytes())
    assert all(request[key]==value for key,value in binding.items())
    assert git('log','-1','--format=%B').decode().strip()==binding['marker']
    parent=git('rev-parse','HEAD^').decode().strip()
    assert request['harnessSourceCommit']==parent
    assert git('diff','--name-only',parent,head).decode().splitlines()==[binding['requestPath']]
    expected=paths(parent)
    assert set(request['sourceFiles'])==set(expected)
    for path in expected:
        assert sha(Path(path).read_bytes())==request['sourceFiles'][path],('Source binding mismatch',path)
    gate=request['frontgate'];start=gate['dispatchEpoch']
    assert gate['passed'] and not gate['blocking'] and start==gate['checkedEpoch']
    assert (gate['preflightDeadline'],gate['buildDeadline'],gate['finalDeadline'])==(start+600,start+2100,start+2700)
    assert start<=time.time()+30 and time.time()<start+600,'Expired/future request'
    os.environ['OOS_381_DISPATCH_EPOCH']=str(start)
    with Path(os.environ['GITHUB_ENV']).open('a') as stream:stream.write('OOS_381_DISPATCH_EPOCH='+str(start)+'\n')
    write(output/'request-verification.json',dict(passed=True,head=head,harnessSourceCommit=parent,
        nonce=binding['nonce'],requestSha256=sha(request_path.read_bytes()),dispatchEpoch=start,
        verifiedEpoch=time.time(),boundFiles=len(expected),run=os.environ['GITHUB_RUN_ID'],
        attempt=os.environ['GITHUB_RUN_ATTEMPT']))

if __name__=='__main__':
    try:main()
    except Exception as error:
        output=Path('.local/issue381');output.mkdir(parents=True,exist_ok=True)
        write(output/'request-failure.json',dict(error=repr(error),observedEpoch=time.time(),
            run=os.environ.get('GITHUB_RUN_ID'),attempt=os.environ.get('GITHUB_RUN_ATTEMPT'),source=os.environ.get('GITHUB_SHA')))
        raise
