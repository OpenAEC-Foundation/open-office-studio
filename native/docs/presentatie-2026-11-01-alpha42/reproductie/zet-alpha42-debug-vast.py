from pathlib import Path
import json,hashlib,subprocess,shutil
r=Path.cwd();w=r/'.local/controle-2026-10-31';m=json.loads((w/'native-alpha42-testbron.json').read_text());b=json.loads((w/'native-alpha42-geteste-bron.json').read_text());st=json.loads((w/'native-alpha42-stapstatus.json').read_text());assert st['stappen'][0]['controle']=='debugbouw' and st['stappen'][0]['exitcode']==0
for n,h in m.items():assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
vast=w/'native-alpha42-debug-vast';vast.mkdir();d={'basiscommit':b['basiscommit'],'bronbestanden':len(m),'bronmanifest_sha256':hashlib.sha256((w/'native-alpha42-testbron.json').read_bytes()).hexdigest(),'bronpatch_sha256':b['volledige_patch_sha256'],'bouwbron':'Eigen debugprogramma’s na geslaagde volledige workspacebouw en broncontrole. De volledige ronde met workspacefuncties loopt afzonderlijk; geen release- of platformgoedkeuring.','bouwlog_sha256':st['stappen'][0]['sha256'],'programmas':{}}
for naam in ['open-office-studio-native','controleer-bestand']:
 p=r/'native/target/debug'/naam;q=vast/naam;v=subprocess.check_output([str(p),'--version'],text=True).strip();assert '2026.44.9-alpha.42' in v;shutil.copyfile(p,q);q.chmod(0o555);h=hashlib.sha256(q.read_bytes()).hexdigest();assert hashlib.sha256(p.read_bytes()).hexdigest()==h;d['programmas'][naam]={'versie':v,'sha256':h}
for n,h in m.items():assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
(vast/'herkomst.json').write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(json.dumps(d,ensure_ascii=False))
