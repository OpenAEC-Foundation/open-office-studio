from pathlib import Path
import os,sys,json,hashlib,subprocess,tempfile
r=Path.cwd();w=r/'.local/controle-2026-10-31';vast=w/'native-alpha38-ci-linux-vast';m=json.loads((vast/'herkomst.json').read_text());exe=vast/'open-office-studio-native';assert hashlib.sha256(exe.read_bytes()).hexdigest()==m['programmas'][exe.name]['sha256']
p=Path(tempfile.mkdtemp(prefix='office-note38-',dir='/tmp'));e=os.environ.copy();(w/'notities-alpha38-profiel.json').write_text(json.dumps({'profiel':str(p),'mode':oct(p.stat().st_mode & 0o777),'reden':'Korte eigen Unix-socketpaden; sessiebus krijgt alleen het eigen testscherm.'},indent=2)+'\n')
for n in ['GNOME_KEYRING_CONTROL','SSH_AUTH_SOCK','DBUS_SESSION_BUS_ADDRESS','DBUS_STARTER_ADDRESS','DBUS_STARTER_BUS_TYPE','SESSION_MANAGER','WAYLAND_DISPLAY','DISPLAY','XAUTHORITY']:e.pop(n,None)
for n,k in [('XDG_CONFIG_HOME','config'),('XDG_DATA_HOME','data'),('XDG_CACHE_HOME','cache'),('XDG_RUNTIME_DIR','runtime')]:
 q=p/k;q.mkdir(mode=0o700);e[n]=str(q)
e['PATH']=str(w/'gui-hulpmiddelen/uitgepakt/usr/bin')+':'+e['PATH'];e['WINIT_UNIX_BACKEND']='x11';e['GDK_BACKEND']='x11'
subprocess.run(['dbus-run-session','--',str(w/'gui-hulpmiddelen/uitgepakt/usr/bin/xvfb-run'),'-a','-s','-screen 0 1440x900x24 -nolisten tcp',sys.executable,str(w/'gui-notities-release-alpha38.py'),str(exe),m['broncommit']],env=e,check=True)
