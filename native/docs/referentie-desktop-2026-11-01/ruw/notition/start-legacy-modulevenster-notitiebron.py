from pathlib import Path
import os,subprocess,sys
r=Path.cwd();w=r/'.local/controle-2026-10-31';module=sys.argv[1];assert module in ['spreadsheet','presentation','notition'];p=w/('legacy-drie-'+module+'-notitiebron');p.mkdir(mode=0o700);e=os.environ.copy()
for n in ['GNOME_KEYRING_CONTROL','SSH_AUTH_SOCK','DBUS_SESSION_BUS_ADDRESS','DBUS_STARTER_ADDRESS','DBUS_STARTER_BUS_TYPE','SESSION_MANAGER','WAYLAND_DISPLAY']:e.pop(n,None)
for n,k in [('XDG_CONFIG_HOME','config'),('XDG_DATA_HOME','data'),('XDG_CACHE_HOME','cache'),('XDG_RUNTIME_DIR','runtime')]:
 q=p/k;q.mkdir(mode=0o700);e[n]=str(q)
assert module=='notition'
import sqlite3,json,hashlib
fixture=subprocess.check_output(['git','show','4cb1ddc:docs/voorbeelden/Notitieboek.json'])
referentie=json.loads((r/'native/docs/referentie-2026-W44.8/notition.json').read_text());assert hashlib.sha256(fixture).hexdigest()==referentie['bron_sha256']
db=p/'data/org.openaec.office-studio/localstorage/tauri_localhost_0.localstorage';db.parent.mkdir(parents=True)
schema=json.loads((w/'legacy-eigen-notities-schema.json').read_text())['schema']
with sqlite3.connect(db) as c:
 c.execute(schema);c.execute('insert into ItemTable(key,value) values(?,?)',('openaec-notities-v1',fixture.decode('utf-8').encode('utf-16-le')))
 assert c.execute('select count(*) from ItemTable').fetchone()[0]==1
e['OFFICE_EIGEN_GUI_MAP']=str(p);e['PATH']=str(w/'gui-hulpmiddelen/uitgepakt/usr/bin')+':'+e['PATH']
subprocess.run(['dbus-run-session','--',str(w/'gui-hulpmiddelen/uitgepakt/usr/bin/xvfb-run'),'-a','-s','-screen 0 1058x892x24 -nolisten tcp',sys.executable,str(w/'legacy-drie-modulevenster-notitiebron.py'),module],env=e,check=True)
