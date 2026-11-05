from pathlib import Path
import os,subprocess,time,json,hashlib,sys
r=Path.cwd();w=r/'.local/controle-2026-10-31';vast=w/'native-alpha22-vast-lokaal';eind=time.monotonic()+1800
while not (vast/'herkomst.json').is_file():
 assert time.monotonic()<eind,'Geen vastgezette alpha-22-programma’s binnen de bouwtermijn'
 time.sleep(3)
d=json.loads((vast/'herkomst.json').read_text());assert d['broncommit']=='37bc80b903bd6f921c4fb0b951d52713ba1b99ef'
for n,m in d['programmas'].items():assert hashlib.sha256((vast/n).read_bytes()).hexdigest()==m['sha256']
profiel=w/'gui-alpha22-lokaal-profiel';profiel.mkdir();e=os.environ.copy()
for n in ['GNOME_KEYRING_CONTROL','SSH_AUTH_SOCK','DBUS_SESSION_BUS_ADDRESS','DBUS_STARTER_ADDRESS','DBUS_STARTER_BUS_TYPE','SESSION_MANAGER','WAYLAND_DISPLAY']:e.pop(n,None)
for n,naam in [('XDG_CONFIG_HOME','config'),('XDG_DATA_HOME','data'),('XDG_CACHE_HOME','cache'),('XDG_RUNTIME_DIR','runtime')]:
 p=profiel/naam;p.mkdir(mode=0o700);e[n]=str(p)
e['PATH']=str(w/'gui-hulpmiddelen/uitgepakt/usr/bin')+':'+e['PATH']
subprocess.run(['dbus-run-session','--',str(w/'gui-hulpmiddelen/uitgepakt/usr/bin/xvfb-run'),'-a','-s','-screen 0 1440x900x24 -nolisten tcp',sys.executable,str(w/'gui-writer-navigatie-ci22.py'),str(vast/'open-office-studio-native'),'gui-alpha22-writer-navigatie-lokaal'],env=e,check=True)
