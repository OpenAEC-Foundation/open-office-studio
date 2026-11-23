"""Remote Linux-only normal-process differential for WebKit HTML file chooser.

No WebDriver connection, DOM script, hidden File input, or application IPC.
It keeps the failed WebDriver route separate and uses actual UI input throughout.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import sqlite3
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
                raw=(path/'stat').read_text()
                result.append(dict(pid=int(path.name),exe=str((path/'exe').resolve()),startTime=raw[raw.rindex(')')+2:].split()[19]))
        except OSError:pass
    return result

def accessible_snapshot(pid):
    desktop=pyatspi.Registry.getDesktop(0)
    apps=[node for node in desktop if node.get_process_id()==pid]
    result=[]
    def visit(node,depth=0,ancestors=()):
        if depth>20 or len(result)>2000:return
        states=node.getState()
        row=dict(name=node.name,role=node.getRoleName(),enabled=states.contains(pyatspi.STATE_ENABLED),showing=states.contains(pyatspi.STATE_SHOWING),focused=states.contains(pyatspi.STATE_FOCUSED),ancestors=ancestors)
        try:row['text']=node.queryText().getText(0,-1)[:4000]
        except (NotImplementedError,RuntimeError):pass
        try:row['rect']=list(node.queryComponent().getExtents(pyatspi.DESKTOP_COORDS))
        except (NotImplementedError,RuntimeError):pass
        result.append(row)
        for child in node:visit(child,depth+1,(*ancestors,node.getRoleName()))
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
    case=dict(kind=kind,status='running',normalProcessWithoutWebDriver=True,sourceCommit=source['sourceCommit'],sourceTree=source['sourceTree'],version=source['version'],identity=source['identity'],sourceConfigBinding=source['databaseIdentityEvidence'],preflightReportSha256=sha(ROOT/kind/'report.json'),packageSha256=source['package']['sha256'],expectedElfSha256=source['payloadExecutableSha256'],functionalAcceptanceClaim=False,snapshots={})
    results.append(case)
    process=None
    try:
        if kind=='deb':subprocess.run(['sudo','dpkg','--install',source['package']['path']],check=True)
        fixture=ROOT/f'normal-{kind}-input.sqlite';saved=ROOT/f'normal-{kind}-saved.sqlite'
        assert not fixture.exists() and not saved.exists()
        with sqlite3.connect(fixture) as db:
            db.execute('CREATE TABLE StandaloneItems(id INTEGER PRIMARY KEY,label TEXT,amount INTEGER)')
            db.executemany('INSERT INTO StandaloneItems VALUES(?,?,?)',[(1,'SyntheticAlpha',7),(2,'SyntheticBeta',11)])
            db.commit()
        original_sha=sha(fixture);case['fixtureSha256']=original_sha
        def check_focus():
            assert cmd('xdotool','getwindowpid',cmd('xdotool','getwindowfocus',env=env),env=env)==str(pid)
            assert sha(f'/proc/{pid}/exe')==source['payloadExecutableSha256']
        def text_present(*values):
            snapshot=accessible_snapshot(pid)
            text='\n'.join(n['name']+'\n'+n.get('text','') for n in snapshot if n['showing'])
            return snapshot if all(v in text for v in values) else None
        def click(name,role='push button',dialog=False,prefix=False,within=None):
            def find():
                snapshot=accessible_snapshot(pid)
                choices=[n for n in snapshot if (n['name'].startswith(name) if prefix else n['name']==name) and n['role']==role and n['enabled'] and n['showing'] and n.get('rect',[0,0,0,0])[2]>0 and (not dialog or 'dialog' in n['ancestors']) and (not within or within in n['ancestors'])]
                return choices[0] if len(choices)==1 else None
            node=wait(find,'Unambiguous native accessible control missing: '+name)
            check_focus();x,y,w,h=node['rect']
            focused=cmd('xdotool','getwindowfocus',env=env)
            geometry=dict(line.split('=',1) for line in cmd('xdotool','getwindowgeometry','--shell',focused,env=env).splitlines() if '=' in line)
            assert int(geometry['X'])<=x+w//2<int(geometry['X'])+int(geometry['WIDTH']) and int(geometry['Y'])<=y+h//2<int(geometry['Y'])+int(geometry['HEIGHT'])
            # --sync waits for movement, which never arrives when a later edit
            # clicks the same textarea coordinates. Verify the real X pointer.
            cmd('xdotool','mousemove',str(x+w//2),str(y+h//2),env=env)
            pointer=dict(line.split('=',1) for line in cmd('xdotool','getmouselocation','--shell',env=env).splitlines() if '=' in line)
            assert (int(pointer['X']),int(pointer['Y']))==(x+w//2,y+h//2)
            cmd('xdotool','click','1',env=env)
        def keys(chord):check_focus();cmd('xdotool','key','--clearmodifiers',chord,env=env)
        def type_text(text):check_focus();cmd('xdotool','type','--clearmodifiers','--delay','1',text,env=env)
        def open_file(path,foreign):
            keys('ctrl+o')
            def picker():
                focus=cmd('xdotool','getwindowfocus',env=env);title=cmd('xdotool','getwindowname',focus,env=env)
                record=dict(xid=focus,title=title,pid=cmd('xdotool','getwindowpid',focus,env=env))
                if not observations or observations[-1]!=record:observations.append(record)
                return record if focus!=xid and title.lower() in ['open','open file','open a file','choose files','choose a file','select file'] else None
            record=wait(picker,'Normal native Ctrl+O did not display a distinct OS picker',15)
            assert record['pid']==str(pid);case.setdefault('nativePickers',[]).append(record)
            keys('ctrl+l');type_text(str(path));click('Open',within='file chooser')
            if foreign:click('Open anyway',dialog=True)
            wait(lambda:text_present('StandaloneItems'),'Supported actual SQLite UI open')
            click('StandaloneItems',prefix=True)
            case['snapshots']['rows-'+str(len(case['snapshots']))]=wait(lambda:text_present('SyntheticAlpha','SyntheticBeta'),'Original/reopened rows rendered')
        def sql(statement):
            # Actual WebKit AT-SPI exposes this visible textarea as 'embedded'.
            # Its public Access-SQL label and observed focus/value remain strict.
            click('Access-SQL',role='embedded')
            wait(lambda:any(n['name']=='Access-SQL' and n['focused'] for n in accessible_snapshot(pid)),'Actual Access-SQL editor focus before typing')
            keys('ctrl+a');type_text(statement)
            wait(lambda:any(n['name']=='Access-SQL' and n.get('text')==statement for n in accessible_snapshot(pid)),'Actual typed SQL editor value')
            case.setdefault('nativeSqlEntries',[]).append(statement)
            keys('ctrl+Return')
        def cold_quit():
            keys('alt+F4')
            wait(lambda:not owned(home),'Full normal Database/AppImage/WebKit exit',15)
        def launch():
            with (ROOT/f'normal-picker-{kind}.log').open('ab') as log:
                proc=subprocess.Popen([application],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            def app_pid():
                matches=[p for p in owned(home) if p['exe'].endswith('/open-database-studio')]
                return matches[0]['pid'] if len(matches)==1 else None
            actual_pid=wait(app_pid,'Normal Database PID missing')
            assert sha(f'/proc/{actual_pid}/exe')==source['payloadExecutableSha256']
            actual_xid=wait(lambda:cmd('xdotool','search','--onlyvisible','--pid',str(actual_pid),env=env).splitlines()[0],'Native main XID missing')
            def ready():
                snapshot=accessible_snapshot(actual_pid)
                return snapshot if any(n['name']=='Open database' and n['role']=='push button' and n['enabled'] and n['showing'] for n in snapshot) else None
            snapshot=wait(ready,'Actual visible enabled Database Open action unavailable through AT-SPI')
            cmd('xdotool','windowactivate','--sync',actual_xid,env=env)
            return proc,actual_pid,actual_xid,snapshot
        def capture(label):
            check_focus();assert cmd('xdotool','getwindowfocus',env=env)==xid
            proc=Path('/proc')/str(pid);raw=(proc/'stat').read_text();start=raw[raw.rindex(')')+2:].split()[19]
            directory=Path('.local/linux-p2-native')/f'database-normal-{kind}';directory.mkdir(parents=True,exist_ok=True)
            target=directory/(label+'.png')
            result=json.loads(cmd('/usr/bin/python3',str(Path(__file__).with_name('linux-p2-native-capture.py')),str(pid),xid,start,str((proc/'exe').resolve()),str(target),env=env))
            case.setdefault('nativeCaptures',[]).append(dict(label=label,**result))
        process,pid,xid,snapshot=launch()
        first_pid=pid;case.update(pid=pid,xid=xid,runningElfSha256=sha(f'/proc/{pid}/exe'),accessibleReadySnapshot=snapshot)
        case['normalProcessMappings']=sorted({line.split(maxsplit=5)[-1] for line in Path(f'/proc/{pid}/maps').read_text().splitlines() if len(line.split(maxsplit=5))==6})
        assert not any('/open-office-studio' in p or '/libreoffice/' in p or '/Open Office Studio/' in p for p in case['normalProcessMappings'])
        open_file(fixture,True)
        click('Create',role='page tab');click('Query')
        sql('SELECT SUM(amount) AS SyntheticTotal FROM StandaloneItems')
        case['snapshots']['initial-query']=wait(lambda:text_present('SyntheticTotal','18'),'Initial independent sum 18')
        sql('UPDATE StandaloneItems SET amount=13 WHERE id=1')
        click('Run',dialog=True)
        wait(lambda:text_present('1 row changed.'),'One synthetic row changed')
        sql('SELECT SUM(amount) AS SyntheticEditedTotal FROM StandaloneItems')
        case['snapshots']['edited-query']=wait(lambda:text_present('SyntheticEditedTotal','24'),'Actual edited sum 24')
        capture('edited')
        keys('ctrl+s')
        save_picker=wait(lambda:(lambda focus:dict(xid=focus,title=cmd('xdotool','getwindowname',focus,env=env),pid=cmd('xdotool','getwindowpid',focus,env=env)))(cmd('xdotool','getwindowfocus',env=env)) if cmd('xdotool','getwindowname',cmd('xdotool','getwindowfocus',env=env),env=env)=='Save database export' else None,'Real native database export picker')
        assert save_picker['pid']==str(pid);case['nativeSavePicker']=save_picker
        keys('ctrl+l');type_text(str(saved));keys('alt+s')
        wait(lambda:saved.is_file() and saved.stat().st_size>0,'Native export wrote actual SQLite bytes')
        with sqlite3.connect('file:'+str(saved)+'?mode=ro',uri=True) as db:
            assert db.execute('SELECT id,label,amount,typeof(amount) FROM StandaloneItems ORDER BY id').fetchall()==[(1,'SyntheticAlpha',13,'integer'),(2,'SyntheticBeta',11,'integer')]
            assert db.execute('SELECT SUM(amount) FROM StandaloneItems').fetchone()==(24,)
            case['independentSavedTables']=db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
        assert sha(fixture)==original_sha;case['savedSha256']=sha(saved)
        cold_quit()
        process,pid,xid,snapshot=launch();assert pid!=first_pid;case['reopenedPid']=pid
        open_file(saved,False)
        click('Create',role='page tab');click('Query')
        sql('SELECT SUM(amount) AS SyntheticReopenedTotal FROM StandaloneItems')
        case['snapshots']['reopened-query']=wait(lambda:text_present('SyntheticReopenedTotal','24'),'Cold-reopened actual exported edit persists')
        capture('reopened')
        assert sha(saved)==case['savedSha256'] and sha(fixture)==original_sha
        cold_quit()
        case.update(status='passed',functionalAcceptanceClaim=True,scenario='Actual supported SQLite file picker/read/SELECT18/UI UPDATE7to13/SELECT24/CtrlS native export/independent SQLite/cold newPID open/SELECT24; original unchanged')
    except Exception as error:
        case.update(status='failed',error=repr(error))
        if 'pid' in locals():case['failureSnapshot']=accessible_snapshot(pid)
    finally:
        case['focusObservations']=observations
        try:
            if xid and owned(home):
                focus=cmd('xdotool','getwindowfocus',env=env)
                if cmd('xdotool','getwindowpid',focus,env=env)==str(pid):
                    snapshot=accessible_snapshot(pid)
                    if any(n['name']=='Cancel' and n['role']=='push button' and n['enabled'] and n['showing'] and 'file chooser' in n['ancestors'] for n in snapshot):click('Cancel',within='file chooser')
                    else:cmd('xdotool','key','--clearmodifiers','Escape',env=env)
                cmd('xdotool','windowactivate','--sync',xid,env=env)
                cmd('xdotool','key','--clearmodifiers','alt+F4',env=env)
            wait(lambda:not owned(home),'Normal process family cleanup',15)
        except Exception as error:
            case['cleanupError']=repr(error)
            # Only the probe's own session leader/group, never another app.
            if process and process.poll() is None:os.killpg(process.pid,15)
        if owned(home):
            case['failureCleanupTerminatedOwnProcesses']=owned(home)
            for record in owned(home):
                try:
                    # Re-read this private HOME binding immediately before signaling.
                    if record in owned(home):os.kill(record['pid'],15)
                except ProcessLookupError:pass
            try:wait(lambda:not owned(home),'Owned failure-process teardown',3)
            except AssertionError:
                for record in owned(home):
                    try:
                        if record in owned(home):os.kill(record['pid'],9)
                    except ProcessLookupError:pass
                wait(lambda:not owned(home),'Owned forced failure-process teardown',3)
        case['remainingOwnedProcesses']=owned(home)
        case['profilePaths']=[str(p.relative_to(home)) for p in home.rglob('*')]
        assert not any('org.openaec.office-studio' in p for p in case['profilePaths'])
        if not case['remainingOwnedProcesses']:shutil.rmtree(home)
        if kind=='deb':subprocess.run(['sudo','dpkg','--remove','open-database-studio'],check=True)
        (ROOT/'normal-picker-differential.json').write_text(json.dumps(results,indent=2)+'\n')
assert all(c['status']=='passed' and not c['remainingOwnedProcesses'] for c in results)
