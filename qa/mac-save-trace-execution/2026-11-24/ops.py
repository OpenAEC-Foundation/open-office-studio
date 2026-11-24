"""Owned command receipts and read-only package gates. No import-time execution."""
from pathlib import Path
import json, os, plistlib, shutil, subprocess, time, signal
from contract import require, digest, sha, write_json, under, QA_ID, QA_VERSION


def active_group(pgid):
    result=subprocess.run(['/bin/ps','-axo','pgid=,stat='],capture_output=True,text=True,timeout=5,check=True)
    rows=[line.split() for line in result.stdout.splitlines()]
    # Zombies have no writable descriptors. Every live member of this new group
    # belongs to this exact command session; no shared process group is signaled.
    return any(len(r)==2 and r[0]==str(pgid) and not r[1].startswith('Z') for r in rows)


def drain_group(process):
    changed=False
    for sig,seconds in ((signal.SIGTERM,2),(signal.SIGKILL,2)):
        if not active_group(process.pid):break
        changed=True
        try:os.killpg(process.pid,sig)
        except ProcessLookupError:pass
        deadline=time.monotonic()+seconds
        while active_group(process.pid) and time.monotonic()<deadline:time.sleep(.05)
    try:process.wait(timeout=1)
    except subprocess.TimeoutExpired:return False,changed
    return not active_group(process.pid),changed


class Commands:
    def __init__(self,out,*,synthetic_test_runtime=False):
        self.out=Path(out);self.out.mkdir(parents=True,exist_ok=False);self.number=0
        self.deadline=float(os.environ['OOS_WORK_UNTIL']) if os.environ.get('OOS_WORK_UNTIL') else None
        self.posix=os.name=='posix';self.synthetic_test_runtime=synthetic_test_runtime

    def run(self,args,*,cwd=None,env=None,timeout=120,check=True):
        self.number+=1;stem=self.out/f"command-{self.number:03d}"
        if self.deadline is not None:
            require(time.time()<self.deadline,'Own work budget exhausted; preserve cleanup/upload reserve')
            timeout=min(timeout,max(.1,self.deadline-time.time()))
        require(self.posix or self.synthetic_test_runtime,'Owned process-group execution requires POSIX; non-POSIX is mock-only')
        started=time.time()
        drained=False;stopped_children=False;aborted=None
        with stem.with_suffix('.stdout').open('xb') as stdout,stem.with_suffix('.stderr').open('xb') as stderr:
            process=subprocess.Popen([str(a) for a in args],cwd=cwd,env=env,stdout=stdout,stderr=stderr,start_new_session=self.posix)
            try:
                code=process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                code=None
            except BaseException as error:
                code=None;aborted=error
            if self.posix:
                try:drained,stopped_children=drain_group(process)
                except (OSError,subprocess.SubprocessError):drained=False
                if stopped_children:code=None # A detached writer is not command success.
            else:
                # Only a finite synthetic test command may use this branch. No
                # platform/build entry point permits a Windows execution host.
                if process.poll() is None:process.kill();process.wait(timeout=5)
                drained=True
        if not drained:
            for suffix in ('.stdout','.stderr'):stem.with_suffix(suffix).rename(stem.with_suffix(suffix+'.unsealed'))
            write_json(stem.with_suffix('.json'),{'argv':[str(a) for a in args],'exitCode':None,'processGroupDrained':False,
                'rawLogsUnsealedAndExcludedFromUpload':True})
            raise RuntimeError('Own command group could not drain; no redaction/hash/success claim for unsealed logs')
        redacted=[];raw_hashes={}
        inherited=dict(os.environ);inherited.update(env or {})
        sensitive={k:v for k,v in inherited.items() if v and (k.startswith('APPLE_') or k in ('GH_TOKEN','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN'))}
        for suffix in ('.stdout','.stderr'):
            file=stem.with_suffix(suffix);raw=file.read_bytes();raw_hashes[suffix]=sha(raw);clean=raw
            for name,value in sensitive.items():
                if value.encode() in clean:clean=clean.replace(value.encode(),b'[REDACTED_SECRET]');redacted.append(name)
            if clean!=raw:file.write_bytes(clean)
        record={'argv':[str(a) for a in args],'cwd':str(cwd) if cwd else None,'exitCode':code,
                'startedUTCSeconds':started,'completedUTCSeconds':time.time(),
                'stdoutSha256':digest(stem.with_suffix('.stdout')),'stderrSha256':digest(stem.with_suffix('.stderr')),
                'rawBeforeSecretRedactionSha256':raw_hashes,'secretFieldsRedacted':sorted(set(redacted))}
        record.update(processGroupDrained=drained,ownGroupDescendantsStopped=stopped_children,
            posixOwnSession=self.posix,nonPosixSyntheticTestOnly=not self.posix)
        # The command line contains only own paths/known flags. Secrets are env-only;
        # do not record a copy of the inherited env, tokens, certificates or key data.
        write_json(stem.with_suffix('.json'),record)
        if aborted is not None:raise aborted
        if check: require(code==0,'Owned command failed: '+str(args[0])+'; see '+str(stem))
        return record,stem.with_suffix('.stdout').read_bytes(),stem.with_suffix('.stderr').read_bytes()


def bundle_inventory(app):
    app=Path(app).resolve();rows=[]
    for f in sorted((app/'Contents').rglob('*')):
        name=f.relative_to(app).as_posix()
        if f.is_symlink():
            target=f.resolve();require(target.is_relative_to(app),'Bundle symlink escaped own app')
            rows.append({'path':name,'symlink':os.readlink(f)})
        elif f.is_file(): rows.append({'path':name,'bytes':f.stat().st_size,'sha256':digest(f)})
    return {'sha256':sha(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()),'files':rows}


def verify_bundle(app,commands):
    app=Path(app).resolve();require(app.suffix=='.app','One real app required')
    info=plistlib.loads((app/'Contents/Info.plist').read_bytes())
    require(info.get('CFBundleIdentifier')==QA_ID and info.get('CFBundleShortVersionString')==QA_VERSION,'Not DERIVED QA identity/version')
    require(info.get('CFBundleExecutable')=='open-office-studio','Wrong Suite executable')
    exe=under(app/'Contents/MacOS/open-office-studio',app)
    commands.run(['codesign','--verify','--deep','--strict','--verbose=2',app])
    _,out,err=commands.run(['codesign','--display','--verbose=4',app]);detail=(out+err).decode(errors='replace')
    require('\nIdentifier='+QA_ID+'\n' in '\n'+detail,'Wrong signing identifier')
    require('TeamIdentifier=7KFV4QY98M' in detail and 'Authority=Developer ID Application:' in detail,'Wrong Developer ID signer')
    require('flags=0x10000(runtime)' in detail,'Hardened runtime not confirmed')
    _,out,err=commands.run(['spctl','--assess','--type','execute','--verbose=4',app])
    require('source=Notarized Developer ID' in (out+err).decode(errors='replace'),'No notarized Gatekeeper result')
    commands.run(['xcrun','stapler','validate',app])
    _,ent,err=commands.run(['codesign','--display','--entitlements','-',app])
    parsed=None
    if ent.strip():
        parsed=plistlib.loads(ent);require(parsed.get('com.apple.security.get-task-allow') is not True,'Debug entitlement not permitted')
    inventory=bundle_inventory(app)
    return {'identifier':QA_ID,'version':QA_VERSION,'executableSha256':digest(exe),
        'infoSha256':digest(app/'Contents/Info.plist'),'inventorySha256':inventory['sha256'],
        'inventory':inventory['files'],'entitlementsStdoutBytes':len(ent),'entitlementsStdoutSha256':sha(ent),
        'entitlementsStderrSha256':sha(err),'parsedEntitlements':parsed,
        'emptyEntitlementLimit':'Empty output is not evidence of an explicit get-task-allow=false'},exe


def mount_package(dmg,root,commands):
    root=Path(root);mount=under(root/'mount',root);mount.mkdir(exist_ok=False)
    commands.run(['hdiutil','attach','-readonly','-nobrowse','-mountpoint',mount,dmg],timeout=90)
    return mount


def seal_index(out):
    out=Path(out)
    rows=[]
    for p in sorted(out.rglob('*')):
        if p.is_file() and not p.is_symlink() and p.name!='evidence-index.json' and not p.name.endswith('.unsealed'):
            rows.append({'file':p.relative_to(out).as_posix(),'bytes':p.stat().st_size,'sha256':digest(p)})
    write_json(out/'evidence-index.json',{'files':rows,'nativeAcceptance':False,
        'meaning':'Evidence sealed for independent review; no functional pass from upload/job status'})


def remove_owned(path,root):
    path=under(path,root)
    require(not path.is_mount() and not (path/'mount').is_mount(),'Mounted own volume retained until confirmed detach')
    if path.is_symlink():path.unlink()
    elif path.exists():shutil.rmtree(path)
