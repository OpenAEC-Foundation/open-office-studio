"""Owned command receipts and read-only package gates. No import-time execution."""
from pathlib import Path
import json, os, plistlib, shutil, subprocess, time
from contract import require, digest, sha, write_json, under, QA_ID, QA_VERSION


class Commands:
    def __init__(self,out):
        self.out=Path(out);self.out.mkdir(parents=True,exist_ok=False);self.number=0
        self.deadline=float(os.environ['OOS_WORK_UNTIL']) if os.environ.get('OOS_WORK_UNTIL') else None

    def run(self,args,*,cwd=None,env=None,timeout=120,check=True):
        self.number+=1;stem=self.out/f"command-{self.number:03d}"
        if self.deadline is not None:
            require(time.time()<self.deadline,'Own work budget exhausted; preserve cleanup/upload reserve')
            timeout=min(timeout,max(.1,self.deadline-time.time()))
        started=time.time()
        with stem.with_suffix('.stdout').open('xb') as stdout,stem.with_suffix('.stderr').open('xb') as stderr:
            try:
                result=subprocess.run([str(a) for a in args],cwd=cwd,env=env,stdout=stdout,stderr=stderr,timeout=timeout)
                code=result.returncode
            except subprocess.TimeoutExpired:
                code=None
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
        # The command line contains only own paths/known flags. Secrets are env-only;
        # do not record a copy of the inherited env, tokens, certificates or key data.
        write_json(stem.with_suffix('.json'),record)
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
        if p.is_file() and not p.is_symlink() and p.name!='evidence-index.json':
            rows.append({'file':p.relative_to(out).as_posix(),'bytes':p.stat().st_size,'sha256':digest(p)})
    write_json(out/'evidence-index.json',{'files':rows,'nativeAcceptance':False,
        'meaning':'Evidence sealed for independent review; no functional pass from upload/job status'})


def remove_owned(path,root):
    path=under(path,root)
    if path.is_symlink():path.unlink()
    elif path.exists():shutil.rmtree(path)
