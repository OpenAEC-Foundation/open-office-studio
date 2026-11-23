"""Remote Linux-only normal-process differential for WebKit HTML file chooser.

No WebDriver connection, DOM script, hidden File input, or application IPC.
This probes picker availability only; it is not Database functional acceptance.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import pyatspi

assert os.environ.get('GITHUB_ACTIONS')=='true' and os.name=='posix'
ROOT=Path('.local/standalone-linux-results/database').resolve()

def cmd(*args,env=None):
    return subprocess.check_output(args,env=env,text=True,timeout=10).strip()

def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as stream:
        while block:=stream.read(1024*1024):h.update(block)
    return h.hexdigest()

def wait(call,message,seconds=30):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        try:
            value=call()
            if value:return value
        except (OSError,RuntimeError,subprocess.SubprocessError):pass
        time.sleep(.15)
    raise AssertionError(message)

def owned(home):
    result=[]
    for path in Path('/proc').iterdir():
        if not path.name.isdecimal():continue
        try:
            entries=(path/'environ').read_bytes().split(b'\0')
            if ('HOME='+str(home)).encode() in entries:
                result.append(dict(pid=int(path.name),exe=str((path/'exe').resolve())))
        except OSError:pass
    return result

def accessible_snapshot(pid):
    desktop=pyatspi.Registry.getDesktop(0)
    apps=[node for node in desktop if node.get_process_id()==pid]
    result=[]
    def visit(node,depth=0):
        if depth>20 or len(result)>2000:return
        states=node.getState()
        result.append(dict(name=node.name,role=node.getRoleName(),enabled=states.contains(pyatspi.STATE_ENABLED),showing=states.contains(pyatspi.STATE_SHOWING)))
        for child in node:visit(child,depth+1)
    for app in apps:visit(app)
    return result

results=[]
for kind in ['appimage','deb']:
    xid=None
    observations=[]
    source=json.loads((ROOT/kind/'report.json').read_text())
    assert source['app']=='database' and source['sourceCommit']=='dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b'
    assert source['version']=='2026.48.1'
    home=ROOT/('normal-picker-'+kind)
    assert not home.exists();home.mkdir(mode=0o700)
    env={key:os.environ[key] for key in ['DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS'] if key in os.environ}
    env.update(PATH='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',HOME=str(home),XDG_CONFIG_HOME=str(home/'.config'),XDG_DATA_HOME=str(home/'.local/share'),XDG_CACHE_HOME=str(home/'.cache'),XDG_RUNTIME_DIR=str(home/'runtime'),LANG='en_US.UTF-8',LC_ALL='en_US.UTF-8',GDK_BACKEND='x11',LIBGL_ALWAYS_SOFTWARE='1',WEBKIT_DISABLE_DMABUF_RENDERER='1',XDG_CURRENT_DESKTOP='GNOME',APPIMAGE_EXTRACT_AND_RUN='1',GITHUB_ACTIONS='true')
    for key in ['XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME','XDG_RUNTIME_DIR']:Path(env[key]).mkdir(parents=True,mode=0o700)
    prefs=Path(env['XDG_CONFIG_HOME'])/'org.openaec.database-studio';prefs.mkdir()
    (prefs/'voorkeuren.json').write_text(json.dumps({'taal':'en','updates':{'automatisch':False}}))
    application=source['package']['path'] if kind=='appimage' else '/usr/bin/open-database-studio'
    case=dict(kind=kind,status='running',normalProcessWithoutWebDriver=True,packageSha256=source['package']['sha256'],expectedElfSha256=source['payloadExecutableSha256'],functionalAcceptanceClaim=False)
    results.append(case)
    process=None
    try:
        with (ROOT/f'normal-picker-{kind}.log').open('wb') as log:
            process=subprocess.Popen([application],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        def app_pid():
            matches=[p for p in owned(home) if p['exe'].endswith('/open-database-studio')]
            return matches[0]['pid'] if len(matches)==1 else None
        pid=wait(app_pid,'Normal Database PID missing')
        assert sha(f'/proc/{pid}/exe')==source['payloadExecutableSha256']
        xid=wait(lambda:cmd('xdotool','search','--onlyvisible','--pid',str(pid),env=env).splitlines()[0],'Native main XID missing')
        case.update(pid=pid,xid=xid,runningElfSha256=sha(f'/proc/{pid}/exe'))
        def ready():
            snapshot=accessible_snapshot(pid)
            matches=[n for n in snapshot if n['name']=='Open database' and n['role']=='push button' and n['enabled'] and n['showing']]
            if matches:case['accessibleReadySnapshot']=snapshot;return True
        wait(ready,'Actual visible enabled Database Open action unavailable through AT-SPI')
        cmd('xdotool','windowactivate','--sync',xid,env=env)
        assert cmd('xdotool','getwindowpid',cmd('xdotool','getwindowfocus',env=env),env=env)==str(pid)
        cmd('xdotool','key','--clearmodifiers','ctrl+o',env=env)
        def picker():
            focus=cmd('xdotool','getwindowfocus',env=env)
            title=cmd('xdotool','getwindowname',focus,env=env)
            record=dict(xid=focus,title=title,pid=cmd('xdotool','getwindowpid',focus,env=env))
            if not observations or observations[-1]!=record:observations.append(record)
            return record if focus!=xid and title.lower() in ['open','open file','open a file','choose files','choose a file'] else None
        case['picker']=wait(picker,'Normal native Ctrl+O did not display a distinct OS picker',15)
        case['status']='passed-picker-differential-only'
        cmd('xdotool','key','--clearmodifiers','Escape',env=env)
    except Exception as error:
        case.update(status='failed',error=repr(error))
    finally:
        case['focusObservations']=observations
        try:
            if xid:
                cmd('xdotool','windowactivate','--sync',xid,env=env)
                cmd('xdotool','key','--clearmodifiers','alt+F4',env=env)
            wait(lambda:not owned(home),'Normal process family cleanup',15)
        except Exception as error:
            case['cleanupError']=repr(error)
            # Only the probe's own session leader/group, never another app.
            if process and process.poll() is None:os.killpg(process.pid,15)
        case['remainingOwnedProcesses']=owned(home)
        case['profilePaths']=[str(p.relative_to(home)) for p in home.rglob('*')]
        assert not any('org.openaec.office-studio' in p for p in case['profilePaths'])
        if not case['remainingOwnedProcesses']:shutil.rmtree(home)
        (ROOT/'normal-picker-differential.json').write_text(json.dumps(results,indent=2)+'\n')
assert all(c['status']=='passed-picker-differential-only' and not c['remainingOwnedProcesses'] for c in results)
