"""Owned native lifecycle and observations. Imported only on macOS by run.py."""
from pathlib import Path
import json
import os
import plistlib
import shutil
import subprocess
import time
import threading
from contracts import APPS, SUITE_ID, digest, validate_bundle, verify_under


class Unavailable(RuntimeError):pass


def command(argv, *, timeout=30):
    result=subprocess.run([str(x) for x in argv],capture_output=True,text=True,timeout=timeout)
    return {"argv":[str(x) for x in argv],"code":result.returncode,"stdout":result.stdout,"stderr":result.stderr}


def profile_paths(identifier,home):
    home=Path(home)
    return [home/"Library"/base/(identifier+suffix) for base,suffix in
            [("Application Support",""),("Caches",""),("WebKit",""),("HTTPStorages",""),
             ("Preferences",".plist"),("Saved Application State",".savedState"),("Containers","")]]


def environment(inherited):
    keep=("HOME","USER","LOGNAME","TMPDIR","LANG","LC_CTYPE","__CF_USER_TEXT_ENCODING")
    result={k:inherited[k] for k in keep if k in inherited}
    result["PATH"]="/usr/bin:/bin:/usr/sbin:/sbin"
    return result


def forbidden_suite_state(home,processes):
    found=[str(p) for p in profile_paths(SUITE_ID,home) if p.exists() or p.is_symlink()]
    found.extend(row for row in processes.splitlines() if row.strip().endswith("/open-office-studio"))
    return found


def suite_absence(root):
    found=[]
    for base in (Path("/Applications"),Path.home()/"Applications",Path(root)):
        if base.exists():
            for p in base.rglob("*.app"):
                info=p/"Contents/Info.plist"
                try:
                    if info.exists() and plistlib.loads(info.read_bytes()).get("CFBundleIdentifier")==SUITE_ID:found.append(str(p))
                except (OSError,plistlib.InvalidFileException):continue
    processes=command(["/bin/ps","-axo","pid=,comm="])
    found.extend(forbidden_suite_state(Path.home(),processes["stdout"]))
    if found:raise Unavailable("Suite installed/visible/running: "+json.dumps(found))
    return {"searchedRoots":["/Applications",str(Path.home()/"Applications"),str(root)],"processes":processes,"found":found}


class Session:
    def __init__(self,app,root,helper):
        self.app=app;self.root=Path(root).resolve();self.helper=Path(helper).resolve()
        self.root.mkdir(parents=True,exist_ok=False)
        self.process=None;self.mount=None;self.bundle=None;self.exe=None;self.sequence=0;self.profiles=[]
        self.cwd=self.root/"empty-cwd";self.cwd.mkdir()
        self.watch_stop=threading.Event();self.watch_thread=None;self.children={};self.watch_errors=[]
        self.env=environment(os.environ);self.report={"app":app,"nativeAccepted":False,"observations":[]}

    def write(self,name,value):
        path=verify_under(self.root/name,self.root)
        path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")

    def install(self,dmg):
        self.report["suiteAbsence"]=suite_absence(self.root.parents[1])
        self.report["suiteAbsent"]=True
        self.mount=self.root/"readonly-mount";self.mount.mkdir()
        mount=command(["/usr/bin/hdiutil","attach","-readonly","-nobrowse","-plist","-mountpoint",self.mount,dmg],timeout=120)
        self.write("mount.json",mount)
        if mount["code"]:raise Unavailable("Read-only DMG mount failed")
        apps=list(self.mount.glob("*.app"))
        if len(apps)!=1:raise Unavailable("DMG must expose exactly one own app")
        info=plistlib.loads((apps[0]/"Contents/Info.plist").read_bytes());validate_bundle(info,self.app)
        original=apps[0]/"Contents/MacOS"/APPS[self.app][1];before=digest(original)
        dest=self.root/"installed";dest.mkdir();self.bundle=dest/apps[0].name
        copied=command(["/usr/bin/ditto",apps[0],self.bundle],timeout=180);self.write("copy.json",copied)
        if copied["code"]:raise Unavailable("Own app copy failed")
        actual=plistlib.loads((self.bundle/"Contents/Info.plist").read_bytes())
        self.exe=self.bundle/"Contents/MacOS"/APPS[self.app][1];after=digest(self.exe)
        validate_bundle(actual,self.app,after)
        if after!=before:raise Unavailable("Executable changed during installation")
        detach=command(["/usr/bin/hdiutil","detach",self.mount],timeout=90);self.write("detach.json",detach)
        if detach["code"]:raise Unavailable("Own installer did not detach")
        self.mount=None
        self.report.update(identityVerified=True,bundleInfo=actual,executableSHA256=after,
                           signature=command(["/usr/bin/codesign","--verify","--deep","--strict",self.bundle],timeout=120),
                           signatureIdentity=command(["/usr/bin/codesign","-dv","--verbose=4",self.bundle]))
        resources=[]
        for path in (self.bundle/"Contents/Resources").rglob("*"):
            if path.is_file() and path.name in ("soffice","soffice.bin","python","python3","java","kantoorruntime.json"):
                resources.append({"relative":path.relative_to(self.bundle).as_posix(),"sha256":digest(path),"symlink":path.is_symlink(),
                                  "resolvedInsideOwnApp":path.resolve().is_relative_to(self.bundle.resolve())})
        self.write("private-runtime-inventory.json",resources)
        identifier=APPS[self.app][2]
        paths=profile_paths(identifier,Path.home())
        existing=[str(p) for p in paths if p.exists() or p.is_symlink()]
        if existing:raise Unavailable("Dedicated profile is not fresh; will not alter it: "+str(existing))
        self.profiles=paths
        config=paths[0];config.mkdir(parents=True)
        (config/"voorkeuren.json").write_text(json.dumps({"taal":"en","updates":{"automatisch":False,"kanaal":"stabiel"},"emailExterneInhoud":"nooit"}))
        self.report["freshProfileVerified"]=True
        self.write("profile-preflight.json",{"checkedAbsent":[str(p) for p in paths],"seededPreferencesOnly":str(config/"voorkeuren.json")})

    def start(self,document=None):
        if self.process is not None and self.process.poll() is None:raise Unavailable("Own previous app is still running")
        argv=[str(self.exe)]+([str(document)] if document else [])
        if list(self.cwd.iterdir()):raise Unavailable("Own CWD is no longer empty")
        if digest(self.exe)!=self.report["executableSHA256"]:raise Unavailable("Own executable changed before launch")
        out=(self.root/("app-"+str(self.sequence)+".log")).open("a",encoding="utf-8")
        try:self.process=subprocess.Popen(argv,cwd=self.cwd,env=self.env,stdout=out,stderr=out)
        finally:out.close()
        self.watch_stop.clear()
        def watch():
            known={self.process.pid}
            while not self.watch_stop.is_set():
                try:
                    rows=[]
                    for line in subprocess.check_output(["/bin/ps","-axo","pid=,ppid=,comm="],text=True,timeout=3).splitlines():
                        parts=line.strip().split(None,2)
                        if len(parts)==3:rows.append((int(parts[0]),int(parts[1]),parts[2]))
                    changed=True
                    while changed:
                        changed=False
                        for pid,ppid,exe in rows:
                            if ppid in known and pid not in known:known.add(pid);changed=True
                    for pid,ppid,exe in rows:
                        if pid in known:
                            self.children[str(pid)+":"+exe]={"pid":pid,"ppid":ppid,"executable":exe,
                                "resolvedInsideOwnApp":Path(exe).resolve().is_relative_to(self.bundle.resolve())}
                except Exception as error:self.watch_errors.append(str(error))
                self.watch_stop.wait(0.25)
        self.watch_thread=threading.Thread(target=watch,daemon=True);self.watch_thread.start()
        self.report["launches"]=self.report.get("launches",[])+[{"pid":self.process.pid,"argv":argv,"cwd":str(self.cwd),
             "environment":self.env,"environmentSHA256":__import__("hashlib").sha256(json.dumps(self.env,sort_keys=True).encode()).hexdigest()}]
        deadline=time.monotonic()+45;last=None
        while time.monotonic()<deadline:
            if self.process.poll() is not None:raise Unavailable("Own executable exited before native window")
            try:
                last=self.ax("snapshot",check=False)
                if last.get("status")=="observed":
                    if last.get("bundleIdentifier")!=APPS[self.app][2] or Path(last.get("executableURL","")).resolve()!=self.exe.resolve():
                        raise Unavailable("Actual process bundle/executable identity differs")
                    cwd=command(["/usr/sbin/lsof","-a","-p",str(self.process.pid),"-d","cwd","-Fn"])
                    self.write("actual-cwd-"+str(self.process.pid)+".json",cwd)
                    paths=[line[1:] for line in cwd["stdout"].splitlines() if line.startswith("n")]
                    if cwd["code"] or paths!=[str(self.cwd)]:raise Unavailable("Actual owned process CWD differs or is unavailable")
                    self.report["ownCwdEnvironmentVerified"]=True
                    self.guard_suite_namespace()
                    self.capture("opened");return last
            except (json.JSONDecodeError,subprocess.TimeoutExpired):pass
            time.sleep(1)
        raise Unavailable("Native owned window unavailable: "+str(last and last.get("reason")))

    def ax(self,action,spec=None,check=True):
        argv=[self.helper,str(self.process.pid),action]
        if spec is not None:argv.append(json.dumps(spec,separators=(",",":")) if isinstance(spec,dict) else str(spec))
        result=command(argv,timeout=18);self.sequence+=1
        try:value=json.loads(result["stdout"])
        except json.JSONDecodeError:
            self.write("ax-"+str(self.sequence)+"-error.json",result);raise Unavailable("Native helper did not return structured evidence")
        self.write("ax-"+str(self.sequence)+".json",value)
        if check and value.get("status") not in ("observed","input-sent"):raise Unavailable(value.get("reason","Native action blocked"))
        return value

    def capture(self,label):
        self.guard_suite_namespace()
        snapshot=self.ax("snapshot");windows=snapshot.get("ownedScreenWindows",[])
        for i,window in enumerate(windows):
            if window.get("kCGWindowLayer")!=0:continue
            number=window.get("kCGWindowNumber")
            result=command(["/usr/sbin/screencapture","-x","-l",str(number),self.root/(str(self.sequence)+"-"+label+"-"+str(i)+".png")])
            self.write(str(self.sequence)+"-screenshot-"+str(i)+".json",result)
        self.observe_resources(label)
        return snapshot

    def guard_suite_namespace(self):
        observed=command(["/bin/ps","-axo","pid=,comm="])
        if observed["code"]:raise Unavailable("Suite process-namespace observation unavailable")
        found=forbidden_suite_state(Path.home(),observed["stdout"])
        if found:
            self.report["suiteAbsent"]=False
            self.write("forbidden-suite-state.json",{"found":found,"processes":observed,
                       "scope":"Dedicated app unexpectedly created/used Suite profile or process; no Suite paths deleted"})
            raise Unavailable("Suite profile/process appeared during standalone operation: "+str(found))

    def capture_original(self,label):
        self.guard_suite_namespace()
        self.ax("activate")
        snapshot=self.ax("snapshot")
        windows=[w for w in snapshot.get("ownedScreenWindows",[]) if w.get("kCGWindowLayer")==0 and w.get("kCGWindowOwnerPID")==self.process.pid]
        if len(windows)!=1:raise Unavailable("Exactly one owned on-screen original window required")
        path=self.root/(str(self.sequence)+"-"+label+"-original.png")
        result=command(["/usr/sbin/screencapture","-x","-o","-l",str(windows[0]["kCGWindowNumber"]),path])
        self.write(str(self.sequence)+"-"+label+"-capture.json",result)
        if result["code"] or not path.is_file():raise Unavailable("Original no-shadow native window capture unavailable")
        return path,snapshot

    def observe_resources(self,label):
        pid=self.process.pid
        self.write(str(self.sequence)+"-resources-"+label+".json",{
            "pid":pid,"scope":"Point-in-time observations; not proof of absent dependencies",
            "processes":command(["/bin/ps","-axo","pid=,ppid=,comm=,args="]),
            "ownOpenFiles":command(["/usr/sbin/lsof","-p",str(pid),"-Fn"])})

    def quit(self):
        pid=self.process.pid
        self.ax("key","cmd-q")
        try:self.process.wait(timeout=15)
        except subprocess.TimeoutExpired:raise Unavailable("Full normal app quit did not complete")
        self.stop_watch()
        self.guard_suite_namespace()
        self.write("quit-"+str(pid)+".json",{"pid":pid,"returncode":self.process.returncode,"normalCmdQ":True})
        self.report["fullQuitVerified"]=True
        return pid

    def stop_watch(self):
        self.watch_stop.set()
        if self.watch_thread:self.watch_thread.join(timeout=5)
        self.write("owned-process-observations.json",{"intervalSeconds":0.25,"scope":"Sampled descendants, not exhaustive execution audit",
            "processes":list(self.children.values()),"errors":self.watch_errors})

    def cleanup(self):
        errors=[]
        if self.report.get("suiteAbsent") is False:
            errors.append("Unexpected Suite namespace retained outside own declared profile; fresh VM teardown required")
        if self.process and self.process.poll() is None:
            try:self.quit()
            except Exception as error:
                errors.append(str(error));self.process.terminate()
                try:self.process.wait(timeout=10)
                except subprocess.TimeoutExpired:errors.append("Owned app did not terminate")
        self.stop_watch()
        if self.mount:
            result=command(["/usr/bin/hdiutil","detach",self.mount],timeout=90)
            if result["code"]:errors.append("Own DMG still mounted")
        # Only paths proved absent before this exact session can be removed.
        expected=set(profile_paths(APPS[self.app][2],Path.home()))
        for path in self.profiles:
            if path not in expected:errors.append("Unexpected profile cleanup target");continue
            try:
                if path.is_symlink():path.unlink()
                elif path.is_dir():shutil.rmtree(path)
                elif path.exists():path.unlink()
            except OSError as error:errors.append(str(error))
        if self.bundle and (not self.process or self.process.poll() is not None):
            try:shutil.rmtree(verify_under(self.bundle,self.root))
            except OSError as error:errors.append(str(error))
        self.report["cleanupPassed"]=not errors;self.report["cleanupErrors"]=errors
        self.write("receipt.json",self.report)
