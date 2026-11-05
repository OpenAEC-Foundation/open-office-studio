from pathlib import Path
import os,sys,json,hashlib,subprocess
r=Path.cwd();w=r/'.local/controle-2026-10-31';variant=sys.argv[1];assert variant in ['lokaal','ci'];vast=w/('native-alpha33-vast-lokaal' if variant=='lokaal' else 'native-alpha33-ci-linux-vast');m=json.loads((vast/'herkomst.json').read_text());assert len(m['broncommit'])==40
for n,d in m['programmas'].items():assert hashlib.sha256((vast/n).read_bytes()).hexdigest()==d['sha256']
p=w/f'gui-alpha33-writer-stijlen-doelherstel-{variant}-profiel';p.mkdir(mode=0o700);e=os.environ.copy()
for n in ['GNOME_KEYRING_CONTROL','SSH_AUTH_SOCK','DBUS_SESSION_BUS_ADDRESS','DBUS_STARTER_ADDRESS','DBUS_STARTER_BUS_TYPE','SESSION_MANAGER','WAYLAND_DISPLAY']:e.pop(n,None)
for n,k in [('XDG_CONFIG_HOME','config'),('XDG_DATA_HOME','data'),('XDG_CACHE_HOME','cache'),('XDG_RUNTIME_DIR','runtime')]:
 q=p/k;q.mkdir(mode=0o700);e[n]=str(q)
e['PATH']=str(w/'gui-hulpmiddelen/uitgepakt/usr/bin')+':'+e['PATH']
subprocess.run(['dbus-run-session','--',str(w/'gui-hulpmiddelen/uitgepakt/usr/bin/xvfb-run'),'-a','-s','-screen 0 1440x900x24 -nolisten tcp',sys.executable,str(w/'gui-writer-stijlen-alpha33-doelherstel.py'),str(vast/'open-office-studio-native'),f'gui-alpha33-writer-stijlen-doelherstel-{variant}',m['broncommit']],env=e,check=True)
