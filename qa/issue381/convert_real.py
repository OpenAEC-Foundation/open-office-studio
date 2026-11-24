"""Differential private CLI conversion with one explicit, verified libwps overlay."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from deadline import remaining
from runtime_prefix import Audit, fresh_variant

ROOT=Path('.local/issue381').resolve()
def sha(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def write(path,data):path.write_bytes((json.dumps(data,indent=2)+'\n').encode())

def overlay(binding,build,variant):
    canonical=Path(binding['privateRoot']).resolve()
    private=ROOT/'variant-runtime'/variant
    program_relative=Path(binding['program']).resolve().relative_to(canonical)
    library_relative=(program_relative.parent/'libwps-0.4-lo.so.4').as_posix()
    selected=build['variants'][variant]
    assert sha(selected['file'])==selected['sha256']
    assert (selected['sha256']==build['originalLibrarySha256'])==(variant=='packaged')
    manifest=ROOT/'runtime-input/artifact/entry-manifest.json'
    assert sha(manifest)=='79204b36527a7fed0f073b5290df26a86c6a610ba4f78ddf36883507b28da029'
    audit=Audit(ROOT/'real-proof'/variant/'prefix-inventory')
    expected,original=fresh_variant(canonical,private,json.loads(manifest.read_bytes()),library_relative,
        selected['file'],build['originalLibrarySha256'],selected['sha256'],audit)
    destination=private/library_relative
    derived={**binding,'designation':'DERIVED_PRIVATE_QA_ONLY_NOT_OFFICIAL_RUNTIME',
        'privateRoot':str(private),'program':str(private/program_relative),
        'canonicalInputPrivateRoot':str(canonical),'canonicalBinding':'runtime-evidence/runtime-binding.json'}
    write(audit.destination/'binding.json',derived)
    return derived,destination,dict(variant=variant,librarySha256=sha(destination),
        changedEntries=[] if variant=='packaged' else [library_relative],checkedEntries=len(original)),audit,expected,original

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--variant',choices=['packaged','rebuilt-control','patched'],required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    assert sys.platform=='linux' and os.environ.get('GITHUB_ACTIONS')=='true'
    remaining('build')
    binding=json.loads((ROOT/'runtime-evidence/runtime-binding.json').read_bytes())
    build=json.loads((ROOT/'build-proof/build.json').read_bytes());assert build['passed']
    binding,library,checked,prefix_audit,expected,canonical_expected=overlay(binding,build,args.variant)
    program=Path(binding['program']).resolve()
    assert sha(program)==binding['programSha256']
    source=ROOT/'inputs/source.wq2'
    assert sha(source)=='5431c7f8ae2840b93864049531448cdd7c79d939d31465e23abfefd1817703ce'
    profile=Path('src-tauri/src/conversieprofiel.xcu')
    assert sha(profile)=='847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40'
    out=args.out.resolve();out.mkdir(parents=True,exist_ok=True)
    env=dict(os.environ)
    for key in ('GH_TOKEN','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','OPENAEC_CONVERSIE_PROGRAMMA','OPENAEC_CONVERSIE_PROFIEL'):
        env.pop(key,None)
    env.update(SAL_DISABLE_DEFAULTPRINTER='1',SAL_DISABLE_PRINTERLIST='1',
        LD_LIBRARY_PATH=str(program.parent),LD_DEBUG='libs',LD_DEBUG_OUTPUT=str(out/'loader'))
    report=dict(applicationCommit=build['applicationCommit'],runtimeBase=binding,
        overlay=checked,profileSha256=sha(profile),sourceSha256=sha(source),passed=False)
    try:
        prefix_audit.check('before-converter',Path(binding['privateRoot']),expected,'Only explicit selected library delta before executing private converter')
        with tempfile.TemporaryDirectory(prefix='wq2-381-') as temp:
            work=Path(temp);user=work/'profile/user';user.mkdir(parents=True)
            shutil.copyfile(profile,user/'registrymodifications.xcu')
            input_path=work/'invoer.wq2';shutil.copyfile(source,input_path)
            output=work/'out';output.mkdir()
            argv=[str(program),'-env:UserInstallation='+(work/'profile').as_uri(),'--headless','--nologo','--nodefault',
                '--norestore','--nolockcheck','--convert-to','xlsx:Calc MS Excel 2007 XML','--outdir',str(output),str(input_path)]
            started=time.monotonic()
            with (out/'converter.log').open('wb') as log:
                child=subprocess.Popen(argv,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
                report['launcherPid']=child.pid
                try:code=child.wait(timeout=min(60,remaining('build')))
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid,signal.SIGTERM)
                    try:child.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(child.pid,signal.SIGKILL);child.wait(timeout=5)
                    raise
            report.update(exitCode=code,seconds=time.monotonic()-started,argv=argv)
            assert code==0
            files=list(output.glob('*.xlsx'));assert len(files)==1 and files[0].stat().st_size
            assert input_path.read_bytes()==source.read_bytes()
            shutil.copyfile(files[0],out/'converted.xlsx')
            active=[]
            for entry in Path('/proc').iterdir():
                if not entry.name.isdigit():continue
                try:
                    if entry.stat().st_uid!=os.getuid():continue
                    command=(entry/'cmdline').read_bytes()
                except (FileNotFoundError,ProcessLookupError,PermissionError):continue
                if argv[1].encode() in command:active.append(int(entry.name))
            assert not active,('Private converter processes remain',active)
            report['ownedProfileProcessesAfter']=active
        loaders=[];actual=[]
        for path in sorted(out.glob('loader.*')):
            content=path.read_text(errors='replace')
            loaders.append(dict(name=path.name,sha256=sha(path)))
            for line in content.splitlines():
                if 'calling init:' in line and 'libwps-0.4-lo.so.4' in line:
                    loaded=Path(line.split('calling init:',1)[1].strip()).resolve()
                    assert loaded==library
                    actual.append(dict(pid=int(path.suffix[1:]),path=str(loaded),sha256=sha(loaded)))
        assert actual,'No real loader observation for libwps'
        assert sha(library)==checked['librarySha256']
        assert sha(source)==report['sourceSha256']
        report.update(passed=True,loaderFiles=loaders,actualLibwpsLoads=actual,sourceUnchanged=True,
            output=str(out/'converted.xlsx'),outputSha256=sha(out/'converted.xlsx'))
        print(json.dumps(dict(output=report['output'],sha256=report['outputSha256'],variant=args.variant)))
    finally:
        failures=[]
        primary=sys.exc_info()[1]
        if primary:report['failure']=repr(primary)
        for label,root,contract,reason in [
            ('after-converter',Path(binding['privateRoot']),expected,'No unknown cache/temp/byte/mode/entry mutation permitted'),
            ('canonical-after-converter',Path(binding['canonicalInputPrivateRoot']),canonical_expected,'Canonical input was never executed; full post-run immutability required')]:
            try:
                prefix_audit.check(label,root,contract,reason)
            except Exception as error:failures.append(repr(error))
        report['prefixInventoryPassed']=not failures
        report['prefixInventoryFailures']=failures
        report['passed']=report['passed'] and not failures
        write(out/'converter-report.json',report)
        if failures and primary is None:raise AssertionError('; '.join(failures))

if __name__=='__main__':main()
