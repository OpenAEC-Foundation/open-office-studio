"""Always-run fallback for explicitly owned temporary resources. Never app input."""
from pathlib import Path
import json,os,plistlib,re,shutil,signal,subprocess,sys,time
from contract import require,under,write_json,SCOPE_SHA,QA_ID
from ops import seal_index


def main(stage,approval,out):
    require(sys.platform=='darwin' and os.environ.get('GITHUB_ACTIONS')=='true','Own disposable Mac cleanup only')
    a=json.loads(Path(approval).read_bytes());nonce=a.get('nonce','')
    require(re.fullmatch('[a-f0-9]{32}',nonce) is not None and a.get('approved') is True and a.get('stage')==stage,'Own approved execution marker required')
    out=Path(out);out.mkdir(parents=True,exist_ok=True);temp=Path(os.environ['RUNNER_TEMP']).resolve()
    results={'fallbackUsed':False,'errors':[],'normalLifecycleProvenByThisScript':False,'noInputSent':True}
    roots=[under(temp/(prefix+nonce),temp) for prefix in
           (('mac-save-signing-','mac-save-verify-') if stage=='build' else ('mac-save-native-','mac-save-trace-'))]
    for root in roots:
        if not root.exists():continue
        marker=root/'owner.json'
        require(not root.is_symlink() and marker.is_file(),'No cleanup of unowned/symlink root')
        require(json.loads(marker.read_bytes())=={'nonce':nonce,'scopeSha256':SCOPE_SHA,'producerCommit':a['producerCommit']},'Own root marker differs')
    live=False
    if stage=='native':
        for record in out.glob('owned-process-*.json'):
            state=json.loads(record.read_bytes());require(state.get('nonce')==nonce,'Foreign owned-process record')
            pid=state['pid'];require(type(pid) is int and pid>1,'Bounded own PID required')
            process=subprocess.run(['/bin/ps','-p',str(pid),'-o','comm=','-o','lstart='],capture_output=True,text=True,timeout=5)
            if process.returncode:continue
            # Distinct fields are read separately because executable paths contain spaces.
            exe=subprocess.check_output(['/bin/ps','-p',str(pid),'-o','comm='],text=True,timeout=5).strip()
            birth=subprocess.check_output(['/bin/ps','-p',str(pid),'-o','lstart='],text=True,timeout=5).strip()
            expected=Path(state['executable']).resolve()
            if exe!=str(expected) or birth!=state['birth']:
                results['errors'].append('PID identity/birth changed; no signal sent');live=True;continue
            require(expected.is_relative_to(roots[0]/'installed'),'Only own copied app process may terminate')
            results['fallbackUsed']=True;os.kill(pid,signal.SIGTERM)
            deadline=time.monotonic()+10
            while time.monotonic()<deadline:
                if subprocess.run(['/bin/ps','-p',str(pid)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:break
                time.sleep(.2)
            else:live=True;results['errors'].append('Own process remained after bounded SIGTERM')
        # Preserve actual outputs even if the main script was externally stopped.
        if roots[1].exists():
            for source,name in [('control.docx','abort-owned-control.docx'),('events.jsonl','abort-owned-trace.jsonl')]:
                f=roots[1]/source
                if f.is_file() and not f.is_symlink() and not (out/name).exists():shutil.copyfile(f,out/name)
        profile=out/'profile-created.json'
        if profile.exists():
            marker=json.loads(profile.read_bytes());require(marker=={'nonce':nonce,'identifier':QA_ID,'profilesAbsentBefore':True},'Own QA profile marker differs')
            from native import profiles
            for path in profiles(Path.home()):
                if path.is_symlink():results['errors'].append('Unexpected QA profile symlink retained');continue
                if path.is_dir():shutil.rmtree(path)
                elif path.is_file():path.unlink()
    attached=set()
    result=subprocess.run(['hdiutil','info','-plist'],capture_output=True,timeout=20)
    if result.returncode==0:
        for image in plistlib.loads(result.stdout).get('images',[]):
            for item in image.get('system-entities',[]):
                if item.get('mount-point'):attached.add(Path(item['mount-point']).resolve())
    else:results['errors'].append('Mount inventory unavailable; temporary roots retained')
    for root in roots:
        mount=root/'mount'
        if mount.resolve() in attached:
            result=subprocess.run(['hdiutil','detach',str(mount)],capture_output=True,timeout=45)
            if result.returncode:results['errors'].append('Own DMG mount could not detach')
    if not live and not results['errors']:
        for root in roots:
            if root.exists():shutil.rmtree(root)
    results['ownRootsRemoved']=all(not r.exists() for r in roots)
    write_json(out/'always-run-teardown.json',results)
    if (out/'evidence-index.json').exists():(out/'evidence-index.json').rename(out/'pre-teardown-evidence-index.json')
    seal_index(out)
    return 0 if not results['errors'] and not results['fallbackUsed'] and results['ownRootsRemoved'] else 1


if __name__=='__main__':raise SystemExit(main(*sys.argv[1:]))
