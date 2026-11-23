"""Only the newly source-built witness; never the old P2 artifact or system Office."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--binding',type=Path,required=True)
    parser.add_argument('--source',type=Path,required=True);parser.add_argument('--out',type=Path,required=True)
    a=parser.parse_args();b=json.loads(a.binding.read_text())
    pin=json.loads(Path('scripts/qa-presentation-375/runtime-patch/manifest.json').read_text())
    assert b['upstreamCommit']==pin['upstreamCommit'] and b['patchSHA256']==pin['patchSHA256']
    assert b['correctedCppunitPassed'] and b['baselineExpectedStaleAccent1Failure']
    root=Path(b['ownBuildRoot']).resolve(strict=True);program=Path(b['program']).resolve(strict=True)
    assert program.is_relative_to(root) and sha(program)==b['programSHA256']
    assert sha(Path(b['elf']))==b['elfSHA256']
    source=a.source.read_bytes();assert hashlib.sha256(source).hexdigest()=='7d204f66f3e15a76176145f917089b204f1160ff819a898aa0dd61e977c39c7d'
    profile=Path('src-tauri/src/conversieprofiel.xcu')
    assert sha(profile)=='847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40'
    env=dict(os.environ)
    for k in tuple(env):
        if k in ('GH_TOKEN','GITHUB_TOKEN','OPENAEC_CONVERSIE_PROGRAMMA','OPENAEC_CONVERSIE_PROFIEL') or k.startswith('ACTIONS_'):env.pop(k,None)
    env.update(SAL_USE_VCLPLUGIN='svp',SAL_DISABLE_DEFAULTPRINTER='1',SAL_DISABLE_PRINTERLIST='1',PYTHONDONTWRITEBYTECODE='1')
    a.out.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='source375-convert-') as temp:
        work=Path(temp);user=work/'profile/user';user.mkdir(parents=True);shutil.copyfile(profile,user/'registrymodifications.xcu')
        input=work/'invoer.uop';input.write_bytes(source);dest=work/'out';dest.mkdir()
        argv=[str(program),'-env:UserInstallation='+user.parent.as_uri(),'--headless','--nologo','--nodefault','--norestore','--nolockcheck','--convert-to','pptx:Impress MS PowerPoint 2007 XML','--outdir',str(dest),str(input)]
        start=time.monotonic()
        with (a.out/'converter.log').open('wb') as log:
            p=subprocess.Popen(argv,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            try:code=p.wait(timeout=45)
            except subprocess.TimeoutExpired:
                import signal
                os.killpg(p.pid,signal.SIGTERM)
                try:p.wait(timeout=5)
                except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
                raise
        assert code==0
        files=list(dest.glob('*.pptx'));assert len(files)==1 and input.read_bytes()==source
        output=a.out/'converted.pptx';shutil.copyfile(files[0],output)
        report={'binding':b,'output':str(output.resolve()),'outputSHA256':sha(output),'sourceUnchanged':a.source.read_bytes()==source,
                'seconds':time.monotonic()-start,'argv':argv,'exitCode':code,'profileSHA256':sha(profile),'method':'new source-built runtime only; no P2/system fallback'}
    report['ownProfileRemoved']=not user.parent.exists()
    (a.out/'converter-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))


if __name__=='__main__':main()
