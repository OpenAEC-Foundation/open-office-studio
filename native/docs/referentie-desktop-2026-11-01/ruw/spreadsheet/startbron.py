from pathlib import Path
import os,subprocess,sys
r=Path.cwd();w=r/'.local/controle-2026-10-31';module=sys.argv[1];assert module in ['spreadsheet','presentation','notition'];p=w/('legacy-drie-'+module+'-hertest');p.mkdir(mode=0o700);e=os.environ.copy()
for n in ['GNOME_KEYRING_CONTROL','SSH_AUTH_SOCK','DBUS_SESSION_BUS_ADDRESS','DBUS_STARTER_ADDRESS','DBUS_STARTER_BUS_TYPE','SESSION_MANAGER','WAYLAND_DISPLAY']:e.pop(n,None)
for n,k in [('XDG_CONFIG_HOME','config'),('XDG_DATA_HOME','data'),('XDG_CACHE_HOME','cache'),('XDG_RUNTIME_DIR','runtime')]:
 q=p/k;q.mkdir(mode=0o700);e[n]=str(q)
e['OFFICE_EIGEN_GUI_MAP']=str(p);e['PATH']=str(w/'gui-hulpmiddelen/uitgepakt/usr/bin')+':'+e['PATH']
subprocess.run(['dbus-run-session','--',str(w/'gui-hulpmiddelen/uitgepakt/usr/bin/xvfb-run'),'-a','-s','-screen 0 1058x892x24 -nolisten tcp',sys.executable,str(w/'legacy-drie-modulevenster-hertest.py'),module],env=e,check=True)
