"""The one allocated #375 Linux source witness. No P2 mixing or product activation."""
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
import time

START = time.monotonic()-max(0,time.time()-float(os.environ.get('OOS_375_JOB_START_EPOCH',time.time())))
OUT = Path('.local/presentation-375-source-build').resolve()
OWN = Path(__file__).resolve().parent
PIN = json.loads((OWN / 'runtime-patch/manifest.json').read_text())
REPORT = {'issue':375, 'upstreamCommit':PIN['upstreamCommit'], 'patchSHA256':PIN['patchSHA256'],
          'qaCommit':os.environ.get('GITHUB_SHA'), 'run':os.environ.get('GITHUB_RUN_ID'),
          'stages':[], 'productActivation':False, 'portableRuntimeClaim':False, 'passed':False}


def sha(p):
    with p.open('rb') as f: return hashlib.file_digest(f, 'sha256').hexdigest()


def receipt():
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'build-report.json').write_text(json.dumps(REPORT,indent=2)+'\n')


def run(name, argv, cwd=None, timeout=600, check=True):
    assert shutil.disk_usage(OUT).free >= 10*1024**3, 'Disk stop: less than 10 GiB'
    timeout=min(timeout,max(1,int(260*60-(time.monotonic()-START))))
    log=OUT/(name+'.log'); started=time.monotonic()
    print(name,flush=True)
    with log.open('wb') as stream:
        p=subprocess.Popen(argv,cwd=cwd,env=ENV,stdout=stream,stderr=subprocess.STDOUT,
                           stdin=subprocess.DEVNULL,start_new_session=True)
        try: code=p.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(p.pid,signal.SIGTERM)
            try: p.wait(timeout=10)
            except subprocess.TimeoutExpired: os.killpg(p.pid,signal.SIGKILL);p.wait()
            code=124
    truncated=False
    if log.stat().st_size>8*1024**2:
        with log.open('rb') as f:
            head=f.read(1024**2);f.seek(-7*1024**2,os.SEEK_END);tail=f.read()
        log.write_bytes(head+b'\n[owned log truncated: retained first 1 MiB / last 7 MiB]\n'+tail);truncated=True
    REPORT['stages'].append({'name':name,'argv':list(map(str,argv)),'exitCode':code,'logTruncated':truncated,
                             'seconds':time.monotonic()-started,'log':log.name,'logSHA256':sha(log)})
    receipt()
    if check: assert code==0, name+' failed; inspect '+str(log)
    return code


ENV=dict(os.environ)
for key in tuple(ENV):
    if key in ('GH_TOKEN','GITHUB_TOKEN','OPENAEC_CONVERSIE_PROGRAMMA','OPENAEC_CONVERSIE_PROFIEL') or key.startswith('ACTIONS_'):
        ENV.pop(key,None)
ENV.update(CC='/usr/bin/gcc-13',CXX='/usr/bin/g++-13',SAL_USE_VCLPLUGIN='svp',
           SAL_DISABLE_DEFAULTPRINTER='1',SAL_DISABLE_PRINTERLIST='1',PYTHONDONTWRITEBYTECODE='1')


def main():
    assert sys.platform.startswith('linux') and os.environ.get('GITHUB_ACTIONS')=='true'
    OUT.mkdir(parents=True,exist_ok=True)
    preflight=json.loads(Path('.local/presentation-375-build-preflight/build-preflight.json').read_text())
    assert preflight['buildReadyByPlanGates'] and preflight['patchSHA256']==PIN['patchSHA256']
    assert sha(OWN/'runtime-patch/375-solid-rgb-import.patch')==PIN['patchSHA256']
    REPORT['initialPreflight']=preflight
    temp=Path(os.environ['RUNNER_TEMP']).resolve(strict=True)
    build=temp/('presentation-375-'+os.environ['GITHUB_RUN_ID'])
    assert not build.exists() and build.parent==temp
    build.mkdir(); source=build/'source'; source.mkdir()
    REPORT['ownBuildRoot']=str(build)
    ENV['JAVA_HOME']=str(Path(preflight['toolchain']['jdk17']['path']).parent.parent)
    # Only official Ubuntu source repositories; no arbitrary compiler repositories.
    ubuntu=Path('/etc/apt/sources.list.d/ubuntu.sources')
    text=ubuntu.read_text()
    assert 'ubuntu.com/ubuntu' in text and 'Types: deb' in text
    src=OUT/'presentation-375-src.sources'
    src.write_text(re.sub(r'^Types:.*$', 'Types: deb-src', text,flags=re.M))
    run('ubuntu-source-index',['sudo','cp',str(src),'/etc/apt/sources.list.d/presentation-375-src.sources'])
    run('apt-update',['sudo','apt-get','update'])
    run('dependency-plan',['sudo','apt-get','-s','build-dep','libreoffice'])
    proposed=(OUT/'dependency-plan.log').read_text(errors='replace')
    assert not re.search(r'^Inst (?:libreoffice(?:-|\s)|libobasis)',proposed,re.M), 'Refuse system Office runtime dependency'
    run('build-dependencies',['sudo','apt-get','build-dep','-y','libreoffice'],timeout=900)
    run('explicit-dependencies',['sudo','apt-get','install','-y','--no-install-recommends',
        'gcc-13','g++-13','openjdk-17-jdk','gperf','bison','flex','zip','unzip','python3-dev','libxslt1-dev'],timeout=600)
    run('package-versions',['dpkg-query','-W','-f=${binary:Package}\t${Version}\n'])
    run('post-install-resource-gate',[sys.executable,str(OWN/'build_preflight.py')])
    run('source-init',['git','init','--initial-branch=codex/runtime-375-witness',str(source)])
    run('source-remote',['git','remote','add','origin','https://github.com/LibreOffice/core.git'],cwd=source)
    run('source-fetch',['git','fetch','--no-tags','--depth=1','origin',PIN['upstreamCommit']],cwd=source,timeout=900)
    run('source-checkout',['git','checkout','--detach',PIN['upstreamCommit']],cwd=source,timeout=300)
    assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==PIN['upstreamCommit']
    REPORT['upstreamTree']=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD^{tree}'],text=True).strip()
    # Full checked applicator preconditions before installing only the tests for the red witness.
    run('patchset-preconditions',[sys.executable,str(OWN/'runtime-patch/apply.py'),str(source)])
    patch=OWN/'runtime-patch/375-solid-rgb-import.patch'
    run('test-diff',['git','apply','--include=xmloff/qa/unit/draw.cxx',str(patch)],cwd=source)
    for entry in PIN['fixtures']:
        dest=source/entry['destination'];assert not dest.exists()
        shutil.copyfile(OWN/'runtime-patch'/entry['file'],dest)
        assert sha(dest)==entry['sha256']
    external=build/'external-tars';external.mkdir()
    flags=['--disable-mergelibs','--disable-lto','--disable-debug','--disable-dbgutil',
           '--disable-symbols','--disable-skia','--without-help','--without-myspell-dicts',
           '--with-fonts','--with-lang=en-US','--with-parallelism=3','--with-jdk-home='+ENV['JAVA_HOME'],
           '--with-external-tar='+str(external)]
    REPORT['configureFlags']=flags
    run('configure',[str(source/'autogen.sh'),*flags],cwd=source,timeout=900)
    assert time.monotonic()-START <=30*60, 'Acquisition/configuration exceeded 30-minute bound'
    REPORT['configurationHashes']={p.name:sha(p) for p in [source/'config_host.mk',source/'config_host/config_global.h'] if p.is_file()}
    for p in [source/'config_host.mk',source/'config_host/config_global.h']:
        if p.is_file():shutil.copyfile(p,OUT/p.name)
    run('linker-version',['ld','--version'])
    compiler_start=time.monotonic()
    run('source-cli-prerequisites',['make','-j3','Executable_soffice_bin','Executable_oosplash',
        'Package_desktop_soffice_sh','Package_filter_xslt','Package_instsetoo_native_setup',
        'Package_instsetoo_native_setup_ure','Package_instsetoo_native_ooenv'],cwd=source,timeout=210*60)
    remaining=int(210*60-(time.monotonic()-compiler_start));assert remaining>0
    red=run('baseline-red',['make','-j3','CppunitTest_xmloff_draw','CPPUNIT_TEST_NAME=testUOFExplicitRectangleFillColors'],cwd=source,timeout=remaining,check=False)
    log=(OUT/'baseline-red.log').read_text(errors='replace')
    expected=red!=0 and 'testUOFExplicitRectangleFillColors' in log and 'UOP375_STALE_INHERITED_FILL_THEME' in log and 'equality assertion failed' in log
    REPORT['baselineExpectedStaleAccent1Failure']=bool(expected)
    assert expected, 'No proven expected red assertion; no green relabelling of a build/environment failure'
    assert sha(source/PIN['sourceFiles'][0]['path'])==PIN['sourceFiles'][0]['sourceSHA256']
    run('importer-diff',['git','apply','--include=xmloff/source/draw/XMLShapeStyleContext.cxx',str(patch)],cwd=source)
    for entry in PIN['sourceFiles']: assert sha(source/entry['path'])==entry['patchedSHA256']
    remaining=int(210*60-(time.monotonic()-compiler_start));assert remaining>0
    run('corrected-xmloff-draw',['make','-j3','CppunitTest_xmloff_draw'],cwd=source,timeout=remaining)
    REPORT['correctedCppunitPassed']=True
    # Freeze the exact reviewed source diff/fixtures; no source commit is pushed.
    run('source-add',['git','add',*[e['path'] for e in PIN['sourceFiles']],*[e['destination'] for e in PIN['fixtures']]],cwd=source)
    REPORT['patchedSourceTree']=subprocess.check_output(['git','-C',str(source),'write-tree'],text=True).strip()
    REPORT['patchedFiles']={e['path']:sha(source/e['path']) for e in PIN['sourceFiles']}
    runtime=source/'instdir';assert (runtime/'program/soffice').is_file()
    REPORT['sourceBuiltRuntime']=str(runtime)
    REPORT['externalArchiveBindings']=[{'file':p.relative_to(external).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(external.rglob('*')) if p.is_file()]
    REPORT['downloadListSHA256']=sha(source/'download.lst')
    with tempfile.TemporaryDirectory(prefix='version-profile-',dir=build) as version_temp:
        user=Path(version_temp)/'user';user.mkdir();shutil.copyfile('src-tauri/src/conversieprofiel.xcu',user/'registrymodifications.xcu')
        run('runtime-version',[str(runtime/'program/soffice'),'-env:UserInstallation='+Path(version_temp).as_uri(),'--headless','--version'],timeout=45)
    REPORT['runtimeVersion']=(OUT/'runtime-version.log').read_text().strip()
    binding={k:REPORT[k] for k in ('upstreamCommit','upstreamTree','patchSHA256','qaCommit','run','ownBuildRoot',
              'patchedSourceTree','patchedFiles','configureFlags','configurationHashes','correctedCppunitPassed',
              'baselineExpectedStaleAccent1Failure','runtimeVersion','externalArchiveBindings','downloadListSHA256')}
    binding.update(program=str(runtime/'program/soffice'),programSHA256=sha(runtime/'program/soffice'),
                   elf=str(runtime/'program/soffice.bin'),elfSHA256=sha(runtime/'program/soffice.bin'),
                   kind='new Ubuntu24 source-build witness; no original P2 binary or portable-runtime identity')
    binding_path=OUT/'source-build-binding.json';binding_path.write_text(json.dumps(binding,indent=2)+'\n')
    engine=OUT/'engine';engine.mkdir()
    shutil.copyfile(OWN/'runtime-patch/uop-explicit-rectangle-fills.uop',engine/'source.uop')
    oracle=runpy.run_path(str(OWN/'engine/oracle.py'))
    (engine/'source-oracle.json').write_text(json.dumps(oracle['parse_source'](engine/'source.uop'),ensure_ascii=False,indent=2)+'\n')
    ENV.update(OOS_UOP_OUTPUT=str(engine),OOS_UOP_RUNTIME_BINDING=str(binding_path))
    run('corrected-converter-engine',['node',str(OWN/'engine/built_engine.mjs')],timeout=600)
    REPORT['scopedConverterEnginePassed']=True
    REPORT['completeSourceAcceptancePassed']=json.loads((engine/'engine-report.json').read_text())['strictCompleteSourceAcceptancePassed']
    manifest=[]
    for p in [runtime]+sorted(runtime.rglob('*')):
        e={'path':p.relative_to(runtime.parent).as_posix(),'mode':f'{stat.S_IMODE(p.lstat().st_mode):04o}'}
        if p.is_symlink():
            assert p.resolve(strict=True).is_relative_to(runtime), 'Outside-payload build link: '+str(p)
            e.update(type='symlink',linkTarget=os.readlink(p))
        elif p.is_file(): e.update(type='file',bytes=p.stat().st_size,sha256=sha(p))
        else: assert p.is_dir();e.update(type='directory')
        manifest.append(e)
    (OUT/'runtime-entry-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    REPORT['runtimeEntryManifestSHA256']=sha(OUT/'runtime-entry-manifest.json')
    REPORT['runtimeEntryCount']=len(manifest)
    for name in ('soffice','soffice.bin'): REPORT[name+'SHA256']=sha(runtime/'program'/name)
    run('runtime-elf',['readelf','-h',str(runtime/'program/soffice.bin')])
    run('runtime-dependencies',['ldd',str(runtime/'program/soffice.bin')])
    assert 'not found' not in (OUT/'runtime-dependencies.log').read_text()
    archive=OUT/'runtime-source-witness.tar.gz'
    with tarfile.open(archive,'w:gz',compresslevel=5) as z: z.add(runtime,arcname='instdir')
    if archive.stat().st_size>900*1024**2:
        REPORT['oversizePayloadBytes']=archive.stat().st_size;archive.unlink()
        raise AssertionError('Payload exceeds agreed upload bound; own oversized archive not uploaded')
    REPORT['payload']={'name':archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive),
                       'kind':'Ubuntu24 source-built QA runtime; not portable/product-activated/P2 artifact'}
    REPORT['passed']=True


if __name__=='__main__':
    try: main()
    except Exception as exc:
        REPORT['error']=repr(exc)
        raise
    finally:
        # Compact owned logs only; no source/runtime/cache deletion or status relabelling.
        if OUT.exists():
            logs=list(OUT.glob('*.log'))
            for log in sorted(logs,key=lambda p:p.stat().st_size,reverse=True):
                if sum(p.stat().st_size for p in logs)<=50*1024**2:break
                if log.stat().st_size>1024**2:
                    with log.open('rb') as f:f.seek(-1024**2,os.SEEK_END);tail=f.read()
                    log.write_bytes(b'[retained final 1 MiB under the total log budget]\n'+tail)
        for stage in REPORT['stages']:
            p=OUT/stage['log']
            if p.exists():stage['retainedLogSHA256']=sha(p)
        REPORT['elapsedSeconds']=time.monotonic()-START
        receipt()
