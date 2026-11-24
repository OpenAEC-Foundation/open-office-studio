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

from source_targets import select_cli_targets
from test_initialization import PATCH as INITIALIZATION_PATCH, RECIPE as INITIALIZATION_RECIPE, resource_receipt, verified_inputs

START_EPOCH=os.environ.get('OOS_375_WITNESS_START_EPOCH') or os.environ.get('OOS_375_JOB_START_EPOCH') or str(int(time.time()))
assert re.fullmatch(r'\d{10}',START_EPOCH) and 0<=time.time()-float(START_EPOCH)<270*60
START = time.monotonic()-(time.time()-float(START_EPOCH))
OUT = Path('.local/presentation-375-source-build').resolve()
OWN = Path(__file__).resolve().parent
PIN = json.loads((OWN / 'runtime-patch/manifest.json').read_text())
REPORT = {'issue':375, 'upstreamCommit':PIN['upstreamCommit'], 'patchSHA256':PIN['patchSHA256'],
          'qaCommit':os.environ.get('GITHUB_SHA'), 'run':os.environ.get('GITHUB_RUN_ID'),
          'allocatedWitnessStartEpoch':START_EPOCH,
          'stages':[], 'productActivation':False, 'portableRuntimeClaim':False, 'passed':False}


def sha(p):
    with p.open('rb') as f: return hashlib.file_digest(f, 'sha256').hexdigest()


def receipt():
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'build-report.json').write_text(json.dumps(REPORT,indent=2)+'\n')


def run(name, argv, cwd=None, timeout=600, check=True):
    assert shutil.disk_usage(OUT).free >= 10*1024**3, 'Disk stop: less than 10 GiB'
    timeout=min(timeout,max(1,int(260*60-(time.monotonic()-START))))
    if not REPORT.get('preparationCompleted'):
        prep_left=int(45*60-(time.monotonic()-START))
        assert prep_left>0, 'Allocated 45-minute preparation window exhausted; no new source/compiler attempt'
        timeout=min(timeout,prep_left)
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
# Keep the Python used by configure paired with Ubuntu's installed development
# headers/setuptools/lxml. Do not mix setup-python's private interpreter/libraries
# with distribution development packages, and do not change the parent/global env.
BUILD_PYTHON='/usr/bin/python3'
python_root=os.environ.get('pythonLocation','')
if python_root.startswith('/opt/hostedtoolcache/Python/'):
    for key in ('PATH','LD_LIBRARY_PATH','PKG_CONFIG_PATH'):
        values=[p for p in ENV.get(key,'').split(os.pathsep) if p and not (p==python_root or p.startswith(python_root+'/'))]
        if values:ENV[key]=os.pathsep.join(values)
        else:ENV.pop(key,None)
for key in ('PYTHONHOME','PYTHONPATH'):ENV.pop(key,None)
ENV.update(CC='/usr/bin/gcc-13',CXX='/usr/bin/g++-13',SAL_USE_VCLPLUGIN='svp',
           SAL_DISABLE_DEFAULTPRINTER='1',SAL_DISABLE_PRINTERLIST='1',PYTHONDONTWRITEBYTECODE='1',
           PYTHON=BUILD_PYTHON,PYTHON_FOR_BUILD=BUILD_PYTHON)


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
    os_release=Path('/etc/os-release').read_text()
    assert re.search(r'^ID=ubuntu$',os_release,re.M) and re.search(r'^VERSION_CODENAME=noble$',os_release,re.M)
    assert Path('/usr/share/keyrings/ubuntu-archive-keyring.gpg').is_file()
    original=Path('/etc/apt/sources.list.d/ubuntu.sources')
    if original.is_file():
        text=original.read_text();shutil.copyfile(original,OUT/'original-ubuntu.sources.txt')
        blocks=[]
        for block in text.split('\n\n'):
            suites=re.search(r'^Suites:\s*(.+)$',block,re.M)
            uri=re.search(r'^URIs:\s*(.+)$',block,re.M)
            if suites and uri:
                assert all(s.startswith('noble') for s in suites[1].split())
                allowed=uri[1]=='mirror+file:/etc/apt/apt-mirrors.txt' or bool(re.fullmatch(r'https?://(?:[A-Za-z0-9.-]+\.)?(?:archive|security)\.ubuntu\.com/ubuntu/?',uri[1]))
                assert allowed, 'Unknown Ubuntu mirror; do not silently replace an unrelated repository'
                canonical='https://security.ubuntu.com/ubuntu/' if all(s.endswith('-security') for s in suites[1].split()) else 'https://archive.ubuntu.com/ubuntu/'
                block=re.sub(r'^URIs:.*$', 'URIs: '+canonical,block,flags=re.M)
            blocks.append(block)
        binary=OUT/'canonical-ubuntu.sources';binary.write_text('\n\n'.join(blocks))
        run('official-binary-mirror',['sudo','cp',str(binary),str(original)])
    src=OUT/'presentation-375-src.sources'
    src.write_text('Types: deb-src\nURIs: https://archive.ubuntu.com/ubuntu/\nSuites: noble noble-updates\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n\nTypes: deb-src\nURIs: https://security.ubuntu.com/ubuntu/\nSuites: noble-security\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n')
    run('ubuntu-source-index',['sudo','cp',str(src),'/etc/apt/sources.list.d/presentation-375-src.sources'])
    run('apt-update',['sudo','apt-get','update'])
    run('dependency-plan',['sudo','apt-get','-s','build-dep','libreoffice'])
    proposed=(OUT/'dependency-plan.log').read_text(errors='replace')
    assert not re.search(r'^Inst (?:libreoffice(?:-|\s)|libobasis)',proposed,re.M), 'Refuse system Office runtime dependency'
    run('build-dependencies',['sudo','apt-get','build-dep','-y','libreoffice'],timeout=900)
    run('explicit-dependencies',['sudo','apt-get','install','-y','--no-install-recommends',
        'gcc-13','g++-13','openjdk-17-jdk','gperf','bison','flex','zip','unzip','python3-dev','libxslt1-dev'],timeout=600)
    run('package-versions',['dpkg-query','-W','-f=${binary:Package}\t${Version}\n'])
    run('post-install-resource-gate',[BUILD_PYTHON,str(OWN/'build_preflight.py')])
    run('distribution-python-provider',[BUILD_PYTHON,'-c',
        'import sys,sysconfig,distutils.sysconfig,lxml,setuptools,json,os,hashlib;from pathlib import Path;'
        'p=sysconfig.get_path("include");assert Path(p,"Python.h").is_file();'
        'print(json.dumps({"executable":sys.executable,"resolvedExecutable":os.path.realpath(sys.executable),"version":sys.version,"include":p,'
        '"headerSHA256":hashlib.sha256(Path(p,"Python.h").read_bytes()).hexdigest(),'
        '"distutils":distutils.sysconfig.__file__,"lxml":lxml.__file__,"setuptools":setuptools.__file__,"setuptoolsVersion":setuptools.__version__,"LIBDIR":sysconfig.get_config_var("LIBDIR"),"LDLIBRARY":sysconfig.get_config_var("LDLIBRARY")}))'])
    assert Path('/usr/bin/python3-config').is_file()
    run('distribution-python-cflags',['/usr/bin/python3-config','--includes'])
    run('distribution-python-libs',['/usr/bin/python3-config','--embed','--ldflags'])
    ENV['PYTHON_CFLAGS']=(OUT/'distribution-python-cflags.log').read_text().strip()
    ENV['PYTHON_LIBS']=(OUT/'distribution-python-libs.log').read_text().strip()
    assert ENV['PYTHON_CFLAGS'] and ENV['PYTHON_LIBS']
    REPORT['pythonConfigureBinding']={k:ENV[k] for k in ('PYTHON','PYTHON_FOR_BUILD','PYTHON_CFLAGS','PYTHON_LIBS')}
    run('source-init',['git','init','--initial-branch=codex/runtime-375-witness',str(source)])
    run('source-remote',['git','remote','add','origin','https://github.com/LibreOffice/core.git'],cwd=source)
    run('source-fetch',['git','fetch','--no-tags','--depth=1','origin',PIN['upstreamCommit']],cwd=source,timeout=900)
    run('source-checkout',['git','checkout','--detach',PIN['upstreamCommit']],cwd=source,timeout=300)
    assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==PIN['upstreamCommit']
    REPORT['upstreamTree']=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD^{tree}'],text=True).strip()
    # Full checked applicator preconditions before installing only the tests for the red witness.
    run('patchset-preconditions',[BUILD_PYTHON,str(OWN/'runtime-patch/apply.py'),str(source)])
    REPORT['testInitializationBinding'] = verified_inputs(source)
    run('initialization-controls',[BUILD_PYTHON,str(OWN/'test_initialization_checks.py'),'--source',str(source)])
    run('initialization-patch-check',['git','apply','--check','--whitespace=error',str(INITIALIZATION_PATCH)],cwd=source)
    run('initialization-test-recipe',['git','apply','--whitespace=error',str(INITIALIZATION_PATCH)],cwd=source)
    assert sha(source/INITIALIZATION_RECIPE) == REPORT['testInitializationBinding']['recipeAfterSHA256']
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
    assert sha(source/'autogen.sh')=='a79875cdff86bde59f8ab4c60b6da73cd9be82bf32cbdbb07262b9a712d69ca8'
    run('configure',['perl',str(source/'autogen.sh'),*flags],cwd=source,timeout=900)
    configured_workdir = re.findall(r'^export WORKDIR=(.*)$', (source/'config_host.mk').read_text(), re.M)
    assert configured_workdir == [str(source/'workdir')], 'UI resource target must match the actual configured workdir'
    configured_fetch = re.findall(r'^export DO_FETCH_TARBALLS=(.*)$', (source/'config_host.mk').read_text(), re.M)
    assert configured_fetch == ['TRUE'], 'The source wrapper must use normal pinned external-archive fetching'
    REPORT['testInitializationBinding']['configuredWorkdir'] = configured_workdir[0]
    REPORT['testInitializationBinding']['configuredFetchTarballs'] = configured_fetch[0]
    cli_targets, REPORT['cliTargetSelection'] = select_cli_targets(source, source/'config_host.mk')
    receipt()
    run('target-selection-regressions',[BUILD_PYTHON,str(OWN/'test_source_targets.py'),'--source',str(source)])
    assert time.monotonic()-START <=45*60, 'Acquisition/configuration exceeded allocated 45-minute bound'
    REPORT['preparationCompleted']=True
    REPORT['configurationHashes']={p.name:sha(p) for p in [source/'config_host.mk',source/'config_host/config_global.h'] if p.is_file()}
    for p in [source/'config_host.mk',source/'config_host/config_global.h']:
        if p.is_file():shutil.copyfile(p,OUT/p.name)
    run('linker-version',['ld','--version'])
    compiler_start=time.monotonic()
    run('impress-test-ui-resource',['make','-j3',REPORT['testInitializationBinding']['topLevelResourceGoal']],cwd=source,timeout=210*60)
    REPORT['impressResourceAfterUIBuild'] = resource_receipt(source)
    receipt()
    remaining=int(210*60-(time.monotonic()-compiler_start));assert remaining>0
    run('source-cli-prerequisites',['make','-j3',*cli_targets],cwd=source,timeout=remaining)
    REPORT['impressResourceBeforeBaseline'] = resource_receipt(source)
    shutil.copyfile(source/REPORT['testInitializationBinding']['resourceInstalled'],OUT/'required-tabviewbar.ui')
    receipt()
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
    REPORT['impressResourceAfterDrawTests'] = resource_receipt(source)
    # Freeze the exact reviewed source diff/fixtures; no source commit is pushed.
    run('source-add',['git','add',INITIALIZATION_RECIPE,*[e['path'] for e in PIN['sourceFiles']],*[e['destination'] for e in PIN['fixtures']]],cwd=source)
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
              'baselineExpectedStaleAccent1Failure','runtimeVersion','externalArchiveBindings','downloadListSHA256',
              'testInitializationBinding','impressResourceBeforeBaseline','impressResourceAfterDrawTests')}
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
