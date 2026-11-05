from pathlib import Path
import os,sys,json,hashlib,subprocess
r=Path.cwd();w=r/'.local/controle-2026-10-31';variant=sys.argv[1];assert variant in ['lokaal','ci'];vast=w/('native-alpha29-vast-lokaal' if variant=='lokaal' else 'native-alpha29-ci-linux-vast');m=json.loads((vast/'herkomst.json').read_text());assert m['broncommit']=='cf35322ccf19fc8981ee63592d4892f54349e5fd'
for n,d in m['programmas'].items():assert hashlib.sha256((vast/n).read_bytes()).hexdigest()==d['sha256']
p=w/f'gui-alpha29-writer-{variant}-profiel';p.mkdir();e=os.environ.copy()
for n in ['GNOME_KEYRING_CONTROL','SSH_AUTH_SOCK','DBUS_SESSION_BUS_ADDRESS','DBUS_STARTER_ADDRESS','DBUS_STARTER_BUS_TYPE','SESSION_MANAGER','WAYLAND_DISPLAY']:e.pop(n,None)
for n,k in [('XDG_CONFIG_HOME','config'),('XDG_DATA_HOME','data'),('XDG_CACHE_HOME','cache'),('XDG_RUNTIME_DIR','runtime')]:
 q=p/k;q.mkdir(mode=0o700);e[n]=str(q)
e['PATH']=str(w/'gui-hulpmiddelen/uitgepakt/usr/bin')+':'+e['PATH']
subprocess.run(['dbus-run-session','--',str(w/'gui-hulpmiddelen/uitgepakt/usr/bin/xvfb-run'),'-a','-s','-screen 0 1440x900x24 -nolisten tcp',sys.executable,str(w/'gui-writer-alpha29.py'),str(vast/'open-office-studio-native'),f'gui-alpha29-writer-{variant}'],env=e,check=True)
