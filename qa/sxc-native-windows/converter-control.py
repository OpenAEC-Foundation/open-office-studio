"""Supplementary exact-bundled-converter control; never native acceptance."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import oracle

assert sys.platform=='win32' and os.environ.get('GITHUB_ACTIONS')=='true'
assert os.environ.get('RUNNER_ENVIRONMENT')=='github-hosted'
assert not os.environ.get('OPENAEC_CONVERSIE_PROGRAMMA') and not os.environ.get('OPENAEC_CONVERSIE_PROFIEL')
BASE=Path(__file__).resolve().parent
packages=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve();out.mkdir()
receipt=json.loads((packages/'package.json').read_bytes());report=dict(kind='supplementary-converter-control-not-native-acceptance',package=receipt,harness=os.environ['GITHUB_SHA'],cleanup={},status='failed')
assert receipt['applicationCommit']==oracle.CONFIG['applicationCommit'] and receipt['applicationTree']==oracle.CONFIG['applicationTree']
temporary=Path(tempfile.mkdtemp(prefix='oos-sxc-control23-')).resolve();install=temporary/'installed'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def ps(action,path=None):
    args=['pwsh','-NoProfile','-File',str(BASE/'inspect.ps1'),'-Action',action]
    if path:args+=['-Path',str(path)]
    return json.loads(subprocess.check_output(args,creationflags=subprocess.CREATE_NO_WINDOW))
def run(args,**kw):return subprocess.run([str(a) for a in args],check=True,timeout=90,creationflags=subprocess.CREATE_NO_WINDOW,**kw)
installed=False
try:
    baseline=ps('Baseline');report['baseline']=baseline
    assert baseline['profiles']==baseline['apps']==baseline['suitePaths']==[]
    installer=packages/receipt['installer']['path']
    assert sha(installer)==receipt['installer']['sha256'] and installer.stat().st_size==receipt['installer']['bytes']
    report['installer']=ps('Executable',installer)
    run([installer,'/S',f'/D={install}']);installed=True
    report['installedExecutable']=ps('Executable',install/receipt['executable'])
    assert report['installedExecutable']['sha256']==receipt['payloadExecutable']['sha256']=='feab08d3bc09895745c75653b2f8c806e04efa7fc36101debff8b278da599a67'
    converter=(install/'kantoorruntime/program/soffice.com').resolve()
    assert converter.is_relative_to(install.resolve())
    report['converter']=ps('Executable',converter)
    assert report['converter']['sha256']=='4f133aba4d8db66122ec34bc17eeaa8b274cfa5ded03feb384953f6ae357d4cf'
    assert report['converter']['signature']=='Valid' and report['converter']['productVersion']=='26.8.2.2'
    source=out/'calcshapes.sxc';oracle.fetch(oracle.CONFIG['source']['url'],source,oracle.CONFIG['source']['sha256'])
    original=oracle.read_source(source)
    assert original==json.loads((BASE/'source-oracle-before-import.json').read_bytes())
    # Use the pinned P2 profile XML and catalog filter, not a replacement profile.
    profile_bytes=subprocess.check_output(['git','show',oracle.CONFIG['applicationCommit']+':src-tauri/src/conversieprofiel.xcu'])
    # Compare Git objects and write the pinned P2 XML. Checkout line endings can
    # differ; this does not claim extraction of the binary-embedded literal.
    assert profile_bytes==subprocess.check_output(['git','show','HEAD:src-tauri/src/conversieprofiel.xcu'])
    catalog_bytes=subprocess.check_output(['git','show',oracle.CONFIG['applicationCommit']+':src/formaten.json'])
    catalog=json.loads(catalog_bytes);entry=catalog['xlsx']['uitvoer']['xlsx']
    filter_arg='xlsx:'+entry['filter'];assert filter_arg=='xlsx:Calc MS Excel 2007 XML' and not entry.get('opties')
    profile=temporary/'profile';(profile/'user').mkdir(parents=True)
    (profile/'user/registrymodifications.xcu').write_bytes(profile_bytes)
    (out/'exact-p2-profile.xcu').write_bytes(profile_bytes)
    output=out/'converted';output.mkdir()
    args=[str(converter),'-env:UserInstallation='+profile.as_uri()+'/', '--headless','--nologo','--nodefault','--norestore','--nolockcheck','--convert-to',filter_arg,'--outdir',str(output),str(source)]
    env=dict(os.environ,SAL_DISABLE_DEFAULTPRINTER='1',SAL_DISABLE_PRINTERLIST='1')
    report['command']=args;report['profileSha256']=sha(out/'exact-p2-profile.xcu')
    with (out/'conversion.log').open('wb') as log:run(args,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
    files=list(output.iterdir());assert len(files)==1 and files[0].name=='calcshapes.xlsx'
    observed=oracle.audit(source,files[0],False)
    (out/'converter-oracle.json').write_text(json.dumps(observed,indent=2)+'\n',encoding='utf8')
    assert sha(source)==oracle.CONFIG['source']['sha256']
    report.update(status='completed-control-with-recorded-differences',sourceUnchanged=True,outputSha256=sha(files[0]),cellsPassed=observed['cells']['passed'],preservationPassed=observed['preservation']['passed'],differences=observed['preservation']['differences'])
except BaseException as error:
    report['error']=repr(error)
    raise
finally:
    # Close only our silent installer/runtime processes; no suite UI was launched.
    try:
        if installed:
            run([install/'uninstall.exe','/S']);report['cleanup']['ownedInstallUninstalled']=True
        # Prove no process in our resolved unique directory before removal.
        probe="param([string]$Root); $p=@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($Root,[StringComparison]::OrdinalIgnoreCase) } | Select-Object ProcessId,ExecutablePath); ConvertTo-Json -InputObject $p -Compress"
        probe_path=out/'owned-process-check.ps1';probe_path.write_text(probe,encoding='utf8')
        remaining=json.loads(subprocess.check_output(['pwsh','-NoProfile','-File',str(probe_path),'-Root',str(temporary)],creationflags=subprocess.CREATE_NO_WINDOW))
        report['cleanup']['residualOwnedProcesses']=remaining
        assert not remaining,'Own converter process still running; no cleanup success'
        assert temporary.parent==Path(tempfile.gettempdir()).resolve() and temporary.name.startswith('oos-sxc-control23-') and not temporary.is_symlink()
        # NSIS can remove descendants concurrently after its launcher returns.
        # Ignore only already-absent entries, then prove the target is absent.
        def already_removed(function,path,error):
            if not isinstance(error,FileNotFoundError):raise error
        shutil.rmtree(temporary,onexc=already_removed)
        assert not temporary.exists()
        report['cleanup']['ownedTemporaryProfileDisposed']=True
    except BaseException as error:
        report['cleanup']['error']=repr(error)
        raise
    finally:
        (out/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps(dict(status=report['status'],preservationPassed=report['preservationPassed'])))
