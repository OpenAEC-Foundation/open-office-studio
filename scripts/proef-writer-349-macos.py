"""Native F Writer language/keyboard/save acceptance on disposable macOS CI."""
import hashlib, io, json, os, platform, plistlib, runpy, signal, subprocess, sys, time, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

assert sys.platform=="darwin" and os.environ.get("GITHUB_ACTIONS")=="true"
F="e1f84f84f4d72e5ce8ab967e376a6f38344edf39"
assert subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip()==F
base=Path(__file__).resolve().parent
out=Path(".local/writer349-native-macos").resolve();out.mkdir(parents=True,exist_ok=True)
package=Path(".local/writer349-macos-package")
origin=json.loads((package/"origin.json").read_text())
assert origin["applicationCommit"]==F
H=subprocess.check_output(["git","-C",str(base.parent),"rev-parse","HEAD"],text=True).strip()
sha=lambda b: hashlib.sha256(b).hexdigest()
report={"applicationCommit":F,"harnessCommit":H,"harnessSha256":sha(Path(__file__).read_bytes()),"axSourceSha256":sha((base/"writer-349-macos-ax.swift").read_bytes()),"origin":origin,"status":"running","checks":[],"limits":["Writer only, bounded synthetic fixture","Disposable macOS CI host; no physical low-end performance claim","No TCC, entitlements, signing or security changes"]}
report["host"]={"macOS":platform.mac_ver()[0],"machine":platform.machine(),"platform":platform.platform(),"runnerOS":os.environ.get("RUNNER_OS")}
program=None;mount=out/"mounted";mounted=False;helper=out/"writer349-ax";pid=None;serial=0
processes=runpy.run_path("scripts/proef-macos-openen.py")["processen"]
def save_report(): (out/"report.json").write_text(json.dumps(report,indent=2)+"\n")
def run(args,**kw): return subprocess.run(args,check=True,timeout=kw.pop("timeout",25),**kw)
def own_pids(): return processes(program) if program else []
def inspect(action="inspect",target=""):
    global serial
    result=run([str(helper),str(pid),action,target],text=True,capture_output=True,timeout=18)
    state=json.loads(result.stdout);serial+=1
    (out/f"ax-{serial:03d}-{action}.json").write_text(json.dumps(state,indent=2))
    if state["status"]=="blocked": raise PermissionError(state["reason"])
    return state
def wait(check,message,seconds=60):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        value=check()
        if value: return value
        time.sleep(.25)
    raise AssertionError(message)
def keyboard(body):
    script=f'tell application "System Events"\ntell (first application process whose unix id is {pid})\nset frontmost to true\n{body}\nend tell\nend tell'
    result=run(["osascript","-e",script],text=True,capture_output=True,timeout=15)
    return result.stdout
def key(code,mod=""):
    suffix=f" using {{{mod}}}" if mod else ""
    keyboard(f"key code {code}{suffix}")
def type_text(text): keyboard("keystroke "+json.dumps(text))
def tab(name):
    state=inspect("press",name)
    if not state.get("performed"): raise PermissionError("Native AX tab action unavailable: "+name)
def focus():
    state=inspect("focus-editor")
    if not state.get("performed"): raise PermissionError("Native AX editor focus unavailable")
def language(name,expected):
    state=wait(lambda: (lambda s:s if any(expected in t for t in s.get("languages",[])) else None)(inspect()),name+": expected "+expected)
    report["checks"].append({"name":name,"expected":expected,"actual":state["languages"]});save_report()
def boundary(name,left):
    key(115,"command down")
    keyboard("\n".join("key code 124" for _ in range(left)))
    language(name+" left","Dutch");key(124);language(name+" right","English")
def paragraphs(path):
    with zipfile.ZipFile(path) as z: root=ET.fromstring(z.read("word/document.xml"))
    ns={"w":"http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    return [''.join(t.text or '' for t in p.findall('.//w:t',ns)) for p in root.findall('.//w:body/w:p',ns)]
def close_app(graceful=False):
    global pid
    if graceful and own_pids():
        keyboard('keystroke "q" using {command down}')
        wait(lambda:not own_pids(),"Native CmdQ did not fully exit the owned app",15)
        pid=None
        return
    for p in own_pids(): os.kill(p,signal.SIGTERM)
    deadline=time.monotonic()+10
    while own_pids() and time.monotonic()<deadline: time.sleep(.25)
    for p in own_pids(): os.kill(p,signal.SIGKILL)
    wait(lambda:not own_pids(),"Owned app did not exit",5);pid=None
def launch(app,paths):
    global pid
    assert not own_pids()
    run(["open","-a",str(app),*[str(p) for p in paths]],timeout=20)
    found=wait(lambda:own_pids() if len(own_pids())==1 else None,"Exactly one installed app process required",90)
    pid=found[0]
    def ready():
        s=inspect()
        save=any(n.get("role")=="AXButton" and n.get("enabled") and any(t=="Save" or t.startswith("Save ·") for t in [n.get("title",""),n.get("description","")]) for n in s.get("nodes",[]))
        return s if s.get("languages") and save else None
    wait(ready,"Native language status and enabled Save control did not appear",90)
def capture(name):
    run(["screencapture","-x",str(out/name)],capture_output=True,timeout=10)
try:
    dmgs=list(package.glob("*.dmg"));assert len(dmgs)==1;dmg=dmgs[0]
    report["dmg"]={"name":dmg.name,"sha256":sha(dmg.read_bytes()),"bytes":dmg.stat().st_size}
    report["packageControl"]=json.loads((package/"pakketcontrole-macOS.json").read_text())
    mount.mkdir(exist_ok=True)
    run(["hdiutil","attach","-readonly","-nobrowse","-mountpoint",str(mount),str(dmg.resolve())],capture_output=True,timeout=60);mounted=True
    apps=list(mount.glob("*.app"));assert len(apps)==1
    app=out/apps[0].name
    run(["ditto",str(apps[0]),str(app)],timeout=60)
    run(["hdiutil","detach",str(mount)],capture_output=True,timeout=30);mounted=False
    plist=(app/"Contents/Info.plist").read_bytes();info=plistlib.loads(plist)
    assert info["CFBundleIdentifier"]=="org.openaec.office-studio"
    assert sha(plist)==report["packageControl"]["plistSha256"]
    program=app/"Contents/MacOS"/info["CFBundleExecutable"]
    assert not own_pids()
    manifest=[]
    for f in sorted(app.rglob("*")):
        if f.is_symlink(): manifest.append(f"{f.relative_to(app).as_posix()}\tlink\t{os.readlink(f)}\n")
        elif f.is_file(): manifest.append(f"{f.relative_to(app).as_posix()}\t{sha(f.read_bytes())}\t{f.stat().st_size}\n")
    report["app"]={"version":info.get("CFBundleShortVersionString"),"executableSha256":sha(program.read_bytes()),"plistSha256":sha(plist),"treeSha256":sha(''.join(manifest).encode()),"treeAlgorithm":"Unicode sorted POSIX path TAB sha256 TAB size NEWLINE; symlinks path TAB link TAB target NEWLINE"}
    (out/"app-manifest.txt").write_text(''.join(manifest))
    config=Path.home()/"Library/Application Support/org.openaec.office-studio/voorkeuren.json"
    assert not config.exists(),"Fresh own CI profile required"
    config.parent.mkdir(parents=True,exist_ok=True);config.write_text(json.dumps({"taal":"en","updates":{"automatisch":False}}))
    template=Path("public/templates/nieuw.docx").read_bytes()
    def fixture(other):
        import re
        z=zipfile.ZipFile(io.BytesIO(template));parts={n:z.read(n) for n in z.namelist()};xml=parts['word/document.xml'].decode()
        section=re.search(r'<w:sectPr\b[\s\S]*?</w:sectPr>',xml).group()
        def r(lang,text): return f'<w:r><w:rPr><w:lang w:val="{lang}"/></w:rPr><w:t xml:space="preserve">{text}</w:t></w:r>'
        body='<w:p>'+r('de-DE' if other else 'nl-NL','Nederlands ')+r('en-GB','English')+'</w:p><w:p>'+r('it-IT' if other else 'fr-FR','Bonjour')+'</w:p><w:p>'+r('en-US' if other else 'nl-NL','Nogmaals Nederlands')+'</w:p>'
        parts['word/document.xml']=re.sub(r'<w:body>[\s\S]*</w:body>',lambda m:'<w:body>'+body+section+'</w:body>',xml).encode()
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED) as writer:
            for n,b in parts.items(): writer.writestr(n,b)
        return stream.getvalue()
    A=out/'349 native language A.docx';B=out/'349 native language B.docx'
    A.write_bytes(fixture(False));B.write_bytes(fixture(True));bhash=sha(B.read_bytes())
    report['inputSha256']={'A':sha(A.read_bytes()),'B':bhash}
    run(['xcrun','swiftc',str(base/'writer-349-macos-ax.swift'),'-o',str(helper)],capture_output=True,timeout=120)
    report['axBinarySha256']=sha(helper.read_bytes())
    launch(app,[A,B]);report['firstPid']=pid
    tab(A.name);focus();key(115,'command down');language('initial A','Dutch')
    boundary('original boundary',10);key(125,'option down');language('next paragraph A','French')
    key(119,'command down');type_text(' slot');time.sleep(1.2);language('after typing','Dutch')
    key(115,'command down');type_text('x');time.sleep(1.2);boundary('inserted boundary',11)
    keyboard('keystroke "z" using {command down}');time.sleep(1.2);boundary('Undo boundary',10)
    keyboard('keystroke "z" using {command down, shift down}');time.sleep(1.2);boundary('Redo boundary',11)
    keyboard('keystroke "z" using {command down}');time.sleep(1.2);boundary('restored after Undo',10)
    keyboard('keystroke "s" using {command down, shift down}')
    def save_modal():
        s=inspect();nodes=s.get('nodes',[])
        modal=any(n.get('role') in ['AXDialog','AXSheet'] or n.get('subrole')=='AXDialog' or 'dialog' in n.get('roleDescription','').lower() for n in nodes)
        filename=any(n.get('role')=='AXTextField' and n.get('text') in [A.name,A.stem] for n in nodes)
        return s if modal and filename else None
    wait(save_modal,'Actual Save As modal and matching native filename field required',40)
    capture('save-as-modal.png');key(53)
    wait(lambda:not save_modal(),'Native Save As cancellation did not dismiss modal',20)
    report['checks'].append('Native Save As modal and correct filename inspected, then cancelled')
    focus();keyboard('keystroke "s" using {command down}')
    expected=['Nederlands English','Bonjour','Nogmaals Nederlands slot']
    wait(lambda:paragraphs(A)==expected,'Native CmdS did not preserve exact edited text',60)
    report['savedSha256']=sha(A.read_bytes());report['exactSavedParagraphs']=paragraphs(A);capture('saved.png')
    tab(B.name);focus();key(115,'command down');language('independent B','German');key(125,'option down');language('B second paragraph','Italian')
    for i in range(2):
        tab(A.name);focus();boundary(f'A tab {i}',10)
        tab(B.name);language(f'B tab retained {i}','Italian');focus();key(115,'command down');language(f'B tab reset {i}','German');key(125,'option down');language(f'B tab second {i}','Italian')
    assert sha(B.read_bytes())==bhash and sha(A.read_bytes())==report['savedSha256']
    capture('tabs.png');close_app(True);report['firstProcessClosed']=True;report['firstCloseMethod']='native CmdQ'
    launch(app,[A,B]);report['secondPid']=pid;assert pid!=report['firstPid']
    tab(A.name);focus();key(115,'command down');language('reopened A','Dutch');boundary('reopened boundary',10)
    key(125,'option down');language('reopened second paragraph','French')
    assert sha(A.read_bytes())==report['savedSha256'] and sha(B.read_bytes())==bhash
    capture('reopened.png');report['status']='passed'
except (PermissionError,subprocess.TimeoutExpired) as e:
    report.update(status='blocked',reason=str(e))
except subprocess.CalledProcessError as e:
    report.update(status='failed',error=repr(e),commandDetails={'command':e.cmd,'stdout':str(e.stdout or '')[-8000:],'stderr':str(e.stderr or '')[-8000:]})
except Exception as e:
    report.update(status='failed',error=repr(e))
finally:
    if own_pids():
        try: capture('final-state.png')
        except Exception as e: report['finalCaptureError']=str(e)
    try:
        close_app(report['status']=='passed')
        report['cleanupMethod']='native CmdQ' if report['status']=='passed' else 'owned-process termination after incomplete test'
    except Exception as e:
        report.update(status='failed',cleanupError=str(e))
        try: close_app()
        except Exception as forced: report['forcedCleanupError']=str(forced)
    report['ownedAppClosed']=not own_pids()
    if mounted:
        try: run(['hdiutil','detach',str(mount)],capture_output=True,timeout=30);mounted=False
        except Exception as e: report['mountCleanupError']=str(e)
    report['ownMountDetached']=not mounted
    save_report();print(json.dumps(report))
    if report['status']!='passed' or not report['ownedAppClosed'] or mounted: sys.exit(1)
