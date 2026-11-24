"""One derived package / one Q / one CmdS. No automatic build or retry."""
from pathlib import Path
import argparse,json,os,platform,plistlib,re,runpy,shutil,subprocess,sys,time,xml.etree.ElementTree as ET,zipfile
from contract import *
from ops import Commands,verify_bundle,mount_package,remove_owned,seal_index
from trace_oracle import inspect,read_rows


def text(path):
    with zipfile.ZipFile(path) as z:root=ET.fromstring(z.read('word/document.xml'))
    return ''.join(n.text or '' for n in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'))


def profiles(home):
    return [Path(home)/'Library'/base/(QA_ID+suffix) for base,suffix in
        [('Application Support',''),('Caches',''),('WebKit',''),('HTTPStorages',''),('Preferences','.plist'),('Saved Application State','.savedState'),('Containers','')]]


def detach_after_case(mount,commands,errors):
    row,_,_=commands.run(['hdiutil','detach',mount],timeout=90,check=False)
    if row['exitCode']!=0:
        errors.append('Own read-only DMG detach failed/timed out; mount and root retained')
        return mount
    return None


class Native:
    def __init__(self,root,out,app_checkout,a,witness,commands,bundle,exe):
        self.root,self.out,self.checkout=Path(root),Path(out),Path(app_checkout)
        self.a,self.w,self.commands,self.bundle,self.exe=a,witness,commands,Path(bundle),Path(exe)
        self.process=None;self.counter=0;self.q=0;self.s=0;self.quit_count=0;self.cleanup_mode=False
        self.quit_pids=set()
        remaining=min(12*60,float(os.environ.get('OOS_WORK_UNTIL',str(time.time()+12*60)))-time.time())
        self.deadline=time.monotonic()+remaining;self.helper=None;self.profiles_created=False
        self.cwd=self.root/'empty-cwd';self.cwd.mkdir()
        keep=('HOME','USER','LOGNAME','TMPDIR','LANG','LC_CTYPE','__CF_USER_TEXT_ENCODING')
        self.env={k:os.environ[k] for k in keep if k in os.environ}
        self.env.update(PATH='/usr/bin:/bin:/usr/sbin:/sbin',GITHUB_ACTIONS='true',RUNNER_TEMP=os.environ['RUNNER_TEMP'],
            OOS_QA_SAVE_TRACE='DERIVED_P5_SYNTHETIC_ONLY',OOS_QA_SAVE_TRACE_SESSION=a['nonce'])
        self.identity={'executionApproved':True,'sourceCommit':a['appCommit'],'sourceTree':a['appTree'],
            'packagePath':str(self.root/'package/research.dmg'),'packageSha256':witness['dmgSha256'],
            'executableSha256':witness['bundle']['executableSha256'],'executablePath':str(exe),
            'artifactRun':a['package']['runId'],'artifactId':a['package']['artifactId'],'declaredVersion':QA_VERSION,
            'macViewportSetup':{'mode':'native-maximize-once','executionApproved':True}}
        self.identity_path=self.out/'actual-derived-identity.json';write_json(self.identity_path,self.identity)

    def budget(self):
        require(time.monotonic()<self.deadline,'Own work budget exhausted; reserve cleanup/upload')
        require(self.cleanup_mode or datetime.now(timezone.utc)<utc(self.a['expiresUTC']),'Live approval expired before native input')

    def owned(self):
        if not self.process or self.process.poll() is not None:return False
        try:row=subprocess.check_output(['/bin/ps','-p',str(self.process.pid),'-o','comm='],text=True,timeout=4).strip()
        except subprocess.CalledProcessError:return False
        return Path(row).resolve()==self.exe.resolve()

    def action(self,kind,target=''):
        self.budget();require(self.owned(),'Own process/executable no longer matches')
        allowed={'snapshot','raw-snapshot','activate','ax-press-label','click-body-point','type-test-character','chord'}
        require(kind in allowed,'Unexpected native action')
        if kind=='type-test-character':
            require(target=='Q' and self.q==0 and self.s==0,'Exactly one Q before save');self.q+=1
        if kind=='chord':
            require(target in ('cmd-s','cmd-q'),'No extra shortcut or Undo')
            if target=='cmd-s':require(self.q==1 and self.s==0,'Exactly one CmdS after Q');self.s+=1
            else:
                require(self.quit_count<2 and self.process.pid not in self.quit_pids,'No repeated quit/input loop')
                self.quit_count+=1;self.quit_pids.add(self.process.pid)
        if kind=='ax-press-label':require(target in ('Maximize','Restore down'),'Only ordinary Maximize control')
        self.counter+=1;path=self.out/f'action-{self.counter:03d}.json'
        env=dict(os.environ,OOS_361_EXECUTE='1')
        # The reviewed historical driver retains native pointer/key transport and
        # its package/PID checks; only the explicitly derived bundle ID differs.
        self.commands.run([sys.executable,HERE/'vendor/proef-writer-361-macos.py',self.identity_path,self.process.pid,kind,path,'--target',target],
            cwd=self.checkout,env=env,timeout=min(150,max(1,self.deadline-time.monotonic())))
        snapshot=json.loads(path.read_bytes())['native']
        require(snapshot.get('status') in ('observed','input-sent'),'Native action unavailable')
        return snapshot

    def launch(self,document,observer=True):
        self.budget();require(self.process is None or self.process.poll() is not None,'Old process still running')
        require(digest(self.exe)==self.identity['executableSha256'],'Own executable changed')
        require(not list(self.cwd.iterdir()),'Own CWD is not empty')
        env=dict(self.env)
        if not observer:
            env.pop('OOS_QA_SAVE_TRACE',None);env.pop('OOS_QA_SAVE_TRACE_SESSION',None)
        stream=(self.out/f'app-{self.counter:03d}.log').open('xb')
        try:self.process=subprocess.Popen([str(self.exe),str(document)],cwd=self.cwd,env=env,stdout=stream,stderr=stream)
        finally:stream.close()
        pid=self.process.pid
        birth=subprocess.check_output(['/bin/ps','-p',str(pid),'-o','lstart='],text=True,timeout=5).strip()
        write_json(self.out/f'owned-process-{pid}.json',{'pid':pid,'executable':str(self.exe),'birth':birth,'nonce':self.a['nonce']})
        write_json(self.out/f'launch-{pid}.json',{'pid':pid,'executable':str(self.exe),'document':str(document),
            'cwd':str(self.cwd),'environmentKeys':sorted(env),'explicitEnvironmentSha256':sha(json.dumps(env,sort_keys=True).encode()),
            'transport':'direct own packaged executable with explicit scrubbed env; native90/nonce/PID later proves observer bind'})
        end=min(self.deadline,time.monotonic()+60)
        while time.monotonic()<end:
            self.budget();require(self.process.poll() is None,'App exited before document readiness')
            try:snap=self.action('snapshot')
            except ValueError:snap={} # Passive initial loading only; no input replay.
            if document.name in snap.get('window',{}).get('title',''):
                self.action('activate')
                _,raw,_=self.commands.run(['/usr/sbin/lsof','-a','-p',pid,'-d','cwd','-Fn'],timeout=10)
                paths=[line[1:] for line in raw.decode().splitlines() if line.startswith('n')]
                require(paths==[str(self.cwd)],'Actual owned process CWD differs')
                return pid
            time.sleep(.25)
        raise ValueError('Own document did not become natively ready')

    def ready_grid(self):
        end=min(self.deadline,time.monotonic()+45)
        while time.monotonic()<end:
            snap=self.action('snapshot');tables=snap.get('tables',[])
            if len(tables)==1 and tables[0].get('rowEvidenceAvailable') and tables[0].get('columnEvidenceAvailable') and tables[0].get('rows')==2 and tables[0].get('columns')==2:return
            time.sleep(.25)
        raise ValueError('Original2x2 control did not become ready before input')

    def quit(self):
        pid=self.process.pid;self.action('chord','cmd-q');self.process.wait(timeout=15)
        write_json(self.out/f'normal-quit-{pid}.json',{'pid':pid,'normalCommandQ':True,'exitCode':self.process.returncode})


def main():
    parser=argparse.ArgumentParser();parser.add_argument('approval');parser.add_argument('app');parser.add_argument('out');args=parser.parse_args()
    a=json.loads(Path(args.approval).read_bytes());producer=Path(os.environ['PRODUCER_ROOT']).resolve()
    p=validate_approval(a,'native',producer,os.environ)
    require(sys.platform=='darwin' and platform.machine()=='arm64','Native ARM64 CI only')
    os.environ['OOS_361_EXECUTE']='1' # Historical viewport/driver gate, only after own live approval.
    app_checkout=Path(args.app).resolve();validate_source(app_checkout,p)
    out=Path(args.out).resolve();out.mkdir(exist_ok=False);commands=Commands(out/'commands')
    temp=Path(os.environ['RUNNER_TEMP']).resolve();own=under(temp/('mac-save-native-'+a['nonce']),temp)
    documentroot=under(temp/('mac-save-trace-'+a['nonce']),temp)
    require(not own.exists() and not documentroot.exists(),'Fresh own native roots required')
    own.mkdir();documentroot.mkdir();mount=None;n=None;profile_paths=profiles(Path.home());profile_owned=False
    for directory in (own,documentroot):write_json(directory/'owner.json',{'nonce':a['nonce'],'scopeSha256':SCOPE_SHA,'producerCommit':a['producerCommit']})
    report={'derived':True,'nativeAcceptance':False,'status':'running','originalCause':'OPEN',
            'requestSha256':sha(Path(args.approval).read_bytes()),'cleanup':{},'limits':['One bounded observation only; no original-release cause/fix proof']}
    try:
        for command in (['sw_vers'],['uname','-m']):commands.run(command,timeout=15)
        require(all(not x.exists() and not x.is_symlink() for x in profile_paths),'QA profile already exists')
        # No official Suite/standalone may share this host. Observe, never delete.
        registry=json.loads((app_checkout/'assets/studios.json').read_bytes())
        identifiers={s['identifier'] for s in registry};executables={s['programma'] for s in registry}
        for identifier in identifiers:
            require(not (Path.home()/'Library/Application Support'/identifier).exists(),'Official Office profile exists')
        for base in (Path('/Applications'),Path.home()/'Applications'):
            for candidate in base.glob('*.app'):
                info=candidate/'Contents/Info.plist'
                if info.is_file():require(plistlib.loads(info.read_bytes()).get('CFBundleIdentifier') not in identifiers,'Official Office app visible')
        _,raw,_=commands.run(['/bin/ps','-axo','pid=,comm='],timeout=15)
        require(not any(Path(line.split(None,1)[-1]).name in executables for line in raw.decode().splitlines() if line.strip()),'Official Office process already running')
        metadata=download_package(a,os.environ['GH_TOKEN'],own/'parent.zip')
        write_json(out/'official-package-metadata.json',metadata)
        witness=extract_package(own/'parent.zip',own/'package',a)
        write_json(out/'actual-parent-witness.json',witness)
        mount=own/'mount';mount_package(own/'package/research.dmg',own,commands)
        apps=list(mount.glob('*.app'));require(len(apps)==1,'One mounted research app required')
        install=own/'installed';install.mkdir();commands.run(['/bin/cp','-R',apps[0],install])
        commands.run(['hdiutil','detach',mount],timeout=90);mount=None
        bundle=install/apps[0].name;identity,exe=verify_bundle(bundle,commands)
        require(identity['inventorySha256']==witness['bundle']['inventorySha256'] and identity['executableSha256']==witness['bundle']['executableSha256'],'Copied package bytes differ')
        write_json(out/'actual-installed-bundle.json',identity)
        source=HERE/'vendor/writer-361-macos-ax.swift'
        helper=out/('writer361-ax-'+digest(source)[:12]);ocr=out/'mac-native-body-ocr';caps=out/'capabilities'
        for src,dest in ((source,helper),(HERE/'vendor/mac-native-body-ocr.swift',ocr),(HERE/'capabilities.swift',caps)):
            commands.run(['xcrun','swiftc',src,'-o',dest],timeout=120)
        _,raw,_=commands.run([caps],timeout=20);cap=json.loads(raw)
        require(cap.get('accessibility') is True and cap.get('eventPosting') is True and cap.get('screenCapture') is True,'Own native capabilities unavailable')
        write_json(out/'native-preflight.json',{'observations':cap,'helperSHA256':digest(helper),'ocrSHA256':digest(ocr),'compiledBeforeLaunch':True})
        prefs=profile_paths[0];prefs.mkdir(parents=True,exist_ok=False);profile_owned=True
        write_json(out/'profile-created.json',{'nonce':a['nonce'],'identifier':QA_ID,'profilesAbsentBefore':True})
        write_json(prefs/'voorkeuren.json',{'taal':'en','updates':{'automatisch':False}})
        n=Native(own,out,app_checkout,a,witness,commands,bundle,exe);n.profiles_created=True
        fixture=HERE/'vendor/control.docx';require(fixture.stat().st_size==7480 and digest(fixture)==FIXTURE,'Original synthetic fixture changed')
        document=documentroot/'control.docx';shutil.copyfile(fixture,document);before=text(document);require('Q' not in before,'Own marker must be absent initially')
        first=n.launch(document);report['firstPid']=first;n.ready_grid()
        pre=runpy.run_path(str(HERE/'vendor/mac-native-writer-preflight.py'))
        viewport=runpy.run_path(str(HERE/'vendor/writer361-macos-viewport.py'))['maximize_once']
        previous=Path.cwd();os.chdir(app_checkout)
        try:
            viewport(n.action,out/'initial-viewport',n.identity,first)
            target,receipt=pre['visible_target'](n.action,out/'before-input',first,ocr,'EERSTE',('EERSTE','TWEEDE'))
        finally:os.chdir(previous)
        ledger=documentroot/'events.jsonl'
        deadline=time.monotonic()+15
        while True:
            n.budget()
            try:
                rows=read_rows(ledger)
                ready=any(r['point']==90 and r['pid']==first and r['session']==a['nonce'] for r in rows) and any(r['point']==91 for r in rows)
                ready=ready and rows[-1]['point']==99 and rows[-1]['values'][1:]==[0,0] and all(r['nativeLost']==0 for r in rows)
                if ready:break
            except (OSError,ValueError,KeyError):pass
            require(time.monotonic()<deadline,'Native synthetic-only env/bind/logger preflight did not complete');time.sleep(.1)
        write_json(out/'actual-observer-bind.json',{'pid':first,'nonce':a['nonce'],'nativeEvent90':True,'frontend91':True,'zeroLoss99':True,'preInput':True})
        pre['click_target'](n.action,target)
        focus=n.action('snapshot').get('focusAfter',{})
        require(focus.get('role')=='AXTextArea' and focus.get('description')=='Document input','Actual native body focus not verified')
        n.action('type-test-character','Q');n.action('chord','cmd-s')
        # Historical20second file poll follows input; no extra post-Q barrier.
        end=time.monotonic()+20;value=None
        while True:
            n.budget()
            try:
                value=text(document)
                if value.count('Q')==1 and value.replace('Q','',1)==before:break
            except (OSError,zipfile.BadZipFile,ET.ParseError):pass
            if time.monotonic()>=end:break
            time.sleep(.2)
        saved=digest(document);shutil.copyfile(document,out/'saved-control.docx')
        persisted=value is not None and value.count('Q')==1 and value.replace('Q','',1)==before
        report['persistence']={'sourceSha256':FIXTURE,'savedSha256':saved,'oneQAndOtherwiseExactText':persisted}
        # Passive drain happens only after the original action/persistence poll.
        end=time.monotonic()+10;trace={'complete':False,'status':'INCONCLUSIVE'}
        while time.monotonic()<end:
            try:
                rows=read_rows(ledger);trace=inspect(rows,first,a['nonce'],saved)
                if trace['complete']:break
            except (OSError,ValueError):pass
            time.sleep(.1)
        if ledger.exists():shutil.copyfile(ledger,out/'trace-before-cleanup.jsonl')
        write_json(out/'trace-oracle.json',trace);report['trace']=trace
        pre['OBS']['capture_original'](n.action('raw-snapshot'),first,out/'after-save-original.png')
        if not persisted:raise AssertionError('Single native Q/CmdS did not persist exact expected text; preserve failure, no retry')
        n.quit();second=n.launch(document,observer=False);report['secondPid']=second
        require(second!=first,'Reopen must be a different actual owned PID');n.ready_grid()
        token=re.findall(r'[^\W_]*Q[^\W_]*',value)
        require(len(token)==1,'Unique saved synthetic Q token required for independent visible readback')
        os.chdir(app_checkout)
        try:
            viewport(n.action,out/'reopened-viewport',n.identity,second)
            pre['visible_target'](n.action,out/'reopened-visible-Q',second,ocr,token[0])
        finally:os.chdir(previous)
        require(digest(document)==saved and text(document)==value,'Cold reopen changed independently verified saved bytes/text')
        n.quit();report.update(status='OBSERVED_SINGLE_RUN_PERSIST_AND_REOPEN',functionalCore=True,visualReadback=True,
            traceComplete=trace['complete'],notHistoricalCauseProof=True)
    except Exception as error:
        report.update(status='FAILED_OR_INCONCLUSIVE',errorType=type(error).__name__,error=str(error))
        if n and n.owned():
            try:
                raw=n.action('raw-snapshot');write_json(out/'failure-original-ax.json',raw)
                pre['OBS']['capture_original'](raw,n.process.pid,out/'failure-original-window.png')
            except Exception as capture:report['captureFailure']=str(capture)
    finally:
        commands.deadline=None
        cleanup=[];normal=True
        if n and n.process and n.process.poll() is None:
            n.deadline=time.monotonic()+60;n.cleanup_mode=True
            try:n.quit()
            except Exception as error:
                normal=False;cleanup.append(str(error))
                if n.owned():
                    n.process.terminate()
                    try:n.process.wait(timeout=10)
                    except subprocess.TimeoutExpired:cleanup.append('Own process did not terminate')
                elif n.process.poll() is None:cleanup.append('Live process identity changed; no unrelated process terminated')
        if mount:
            mount=detach_after_case(mount,commands,cleanup)
        if profile_owned:
            for path in profile_paths:
                if path.is_symlink():cleanup.append('Unexpected profile symlink retained: '+str(path));continue
                try:
                    if path.is_dir():shutil.rmtree(path)
                    elif path.is_file():path.unlink()
                except OSError as error:cleanup.append(str(error))
        if (n is None or n.process is None or n.process.poll() is not None) and mount is None:
            try:remove_owned(own,temp);remove_owned(documentroot,temp)
            except Exception as error:cleanup.append(str(error))
        report['cleanup']={'normalLifecycle':normal,'errors':cleanup,'allOwnResourcesRemoved':not cleanup,
            'localComputerUseOrRecordingSession':False,'forcedOwnTerminationDoesNotCountAsNormalQuit':not normal}
        report['immutableFixtureUnchanged']=digest(HERE/'vendor/control.docx')==FIXTURE
        write_json(out/'report.json',report);seal_index(out)
    return 0 if report.get('functionalCore') and report.get('visualReadback') and report.get('traceComplete') and report['cleanup']['normalLifecycle'] and not report['cleanup']['errors'] else 1


if __name__=='__main__':raise SystemExit(main())
