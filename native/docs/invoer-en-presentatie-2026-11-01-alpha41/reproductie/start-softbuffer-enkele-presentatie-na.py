from pathlib import Path
import os,subprocess,tempfile,sys,json
r=Path.cwd();w=r/'.local/controle-2026-10-31';p=Path(tempfile.mkdtemp(prefix='office-xbeeld-',dir='/tmp'));e=os.environ.copy()
for n in ['GNOME_KEYRING_CONTROL','SSH_AUTH_SOCK','DBUS_SESSION_BUS_ADDRESS','DBUS_STARTER_ADDRESS','DBUS_STARTER_BUS_TYPE','SESSION_MANAGER','WAYLAND_DISPLAY','DISPLAY','XAUTHORITY']:e.pop(n,None)
for n,k in [('XDG_CONFIG_HOME','config'),('XDG_DATA_HOME','data'),('XDG_CACHE_HOME','cache'),('XDG_RUNTIME_DIR','runtime')]:q=p/k;q.mkdir(mode=0o700);e[n]=str(q)
e['PATH']=str(w/'gui-hulpmiddelen/uitgepakt/usr/bin')+':'+e['PATH'];code=subprocess.run(['dbus-run-session','--',str(w/'gui-hulpmiddelen/uitgepakt/usr/bin/xvfb-run'),'-a','-s','-screen 0 320x240x24 -nolisten tcp',sys.executable,str(w/'softbuffer-enkele-presentatie-na.py')],env=e).returncode;(w/'softbuffer-enkele-presentatie-na-terminal.json').write_text(json.dumps({'exitcode':code,'eigen_profiel':str(p)},indent=2)+'\n');raise SystemExit(code)
