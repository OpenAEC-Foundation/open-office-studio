"""Wacht op beide vastgezette programma's en registreer iedere afzonderlijke GUI-proef."""
from pathlib import Path
import sys,subprocess,json,hashlib,time
r=Path.cwd();w=r/'.local/controle-2026-10-31';vast=w/'native-alpha34-vast-lokaal';eind=time.monotonic()+1800
while not (vast/'herkomst.json').is_file():
 assert time.monotonic()<eind,'Geen afgeronde vastlegging van beide releaseprogramma’s'
 time.sleep(2)
v=json.loads((vast/'herkomst.json').read_text());assert v['broncommit']=='fbd0c07ac30dcd22dd95fa7e8e845df51ffe2974' and len(v['programmas'])==2
for naam,data in v['programmas'].items():assert hashlib.sha256((vast/naam).read_bytes()).hexdigest()==data['sha256']
python='/home/aia01/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
uit={'broncommit':v['broncommit'],'programmas':v['programmas'],'geslaagd':False,'proeven':[]};rapport=w/'native-alpha34-lokale-vensterreeks.json';assert not rapport.exists()
proeven=[('writer-lijsten','venster-writer-lijsten-alpha34.py','controleer-gui-lijsten-alpha34.py'),('schaars','venster-schaars-alpha34.py',None),('writer-stijlen','venster-writer-stijlen-alpha34-hulpgherstel.py','controleer-gui-stijlen-alpha34.py'),('writer','venster-writer-alpha34.py',None)]
for naam,script,lezer in proeven:
 with (w/f'native-alpha34-{naam}-lokaal-vensteropdracht.log').open('x') as log:
  rc=subprocess.run([sys.executable,str(w/script),'lokaal'],stdout=log,stderr=subprocess.STDOUT).returncode
 proef={'naam':naam,'procescode':rc,'geslaagd':rc==0}
 if rc==0 and lezer:
  with (w/f'native-alpha34-{naam}-lokaal-onafhankelijk.log').open('x') as log:
   rc=subprocess.run([python,str(w/lezer),'lokaal'],stdout=log,stderr=subprocess.STDOUT).returncode
  proef['onafhankelijke_lezer_procescode']=rc;proef['geslaagd']=rc==0
 uit['proeven'].append(proef);rapport.write_text(json.dumps(uit,ensure_ascii=False,indent=2)+'\n');print(json.dumps(proef,ensure_ascii=False),flush=True)
uit['geslaagd']=all(p['geslaagd'] for p in uit['proeven']);rapport.write_text(json.dumps(uit,ensure_ascii=False,indent=2)+'\n')
sys.exit(0 if uit['geslaagd'] else 1)
