from pathlib import Path
import hashlib,json,subprocess,shutil,os
r=Path.cwd();w=r/'.local/controle-2026-10-31';m=json.loads((w/'native-alpha45-hertest-testbron.json').read_text())
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
for n,h in m.items():assert sha(r/n)==h,n
oud=w/'native-alpha44-debug-vast';v=json.loads((oud/'herkomst.json').read_text())
for naam in ['open-office-studio-native','controleer-bestand']:assert (oud/naam).stat().st_mode&0o777==0o555 and sha(oud/naam)==v['programmas'][naam]['sha256']
log=w/'native-alpha45-hertest-debugbouw.log'
st=json.loads((w/'native-alpha45-hertest-stapstatus.json').read_text());assert st['stappen'][0]['controle']=='debugbouw' and st['stappen'][0]['exitcode']==0
for n,h in m.items():assert sha(r/n)==h,n
vast=w/'native-alpha45-debug-vast';vast.mkdir();d={'basiscommit':'6c76a71f9946d02776c2967ad58f91dd26f1b6f8','bronbestanden':len(m),'bronmanifest_sha256':sha(w/'native-alpha45-hertest-testbron.json'),'bronpatch_sha256':sha(w/'native-alpha45-geteste-bron.patch'),'bouwlog_sha256':sha(log),'bouwbron':'Afzonderlijk gebouwde volledige workspace-debugbouw van documentgebonden achtergrondmeldingen en Writer-foutmeldingen; gerichte proeven groen, volledige ronde en platformcontrole nog niet afgesloten.','programmas':{}}
for naam in ['open-office-studio-native','controleer-bestand']:
 p=r/'native/target/debug'/naam;h=sha(p);versie=subprocess.check_output([str(p),'--version'],text=True).strip();assert '2026.45.0-alpha.45' in versie;q=vast/naam;os.link(oud/naam,q) if sha(oud/naam)==h else shutil.copyfile(p,q);q.chmod(0o555);assert sha(q)==h and q.stat().st_mode&0o777==0o555;d['programmas'][naam]={'sha256':h,'versie':versie}
(vast/'herkomst.json').write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(json.dumps(d,ensure_ascii=False))
