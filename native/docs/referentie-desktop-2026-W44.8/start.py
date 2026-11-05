from pathlib import Path
import os,sys,subprocess
r=Path.cwd();w=r/'.local/controle-2026-10-31';uit=w/'legacy-native-kandidaat-nl5';uit.mkdir();e=os.environ.copy()
for n in ['GNOME_KEYRING_CONTROL','SSH_AUTH_SOCK','DBUS_SESSION_BUS_ADDRESS','DBUS_STARTER_ADDRESS','DBUS_STARTER_BUS_TYPE','SESSION_MANAGER','WAYLAND_DISPLAY']:e.pop(n,None)
for n,mapnaam in [('XDG_CONFIG_HOME','config'),('XDG_DATA_HOME','data'),('XDG_CACHE_HOME','cache'),('XDG_RUNTIME_DIR','runtime')]:
 p=uit/mapnaam;p.mkdir(mode=0o700);e[n]=str(p)
e['OFFICE_EIGEN_GUI_MAP']=str(uit);e['PATH']=str(w/'gui-hulpmiddelen/uitgepakt/usr/bin')+':'+e['PATH']
subprocess.run(['dbus-run-session','--',str(w/'gui-hulpmiddelen/uitgepakt/usr/bin/xvfb-run'),'-a','-s','-screen 0 1058x892x24 -nolisten tcp',sys.executable,str(w/'legacy-native-referentie-kandidaat.py')],env=e,check=True)
