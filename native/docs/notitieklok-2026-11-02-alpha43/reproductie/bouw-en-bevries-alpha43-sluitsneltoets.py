from pathlib import Path
import hashlib,json,subprocess,shutil,os
r=Path.cwd();w=r/'.local/controle-2026-10-31';m=json.loads((w/'native-alpha43-sluitsneltoets-testbron.json').read_text())
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
for n,h in m.items():assert sha(r/n)==h,n
oud=w/'native-alpha43-debug-vast';v=json.loads((oud/'herkomst.json').read_text())
for naam in ['open-office-studio-native','controleer-bestand']:assert (oud/naam).stat().st_mode&0o777==0o555 and sha(oud/naam)==v['programmas'][naam]['sha256']
log=w/'native-alpha43-sluitsneltoets-debug-bouw.log'
with log.open('wb') as f:p=subprocess.run(['cargo','build','--manifest-path','native/Cargo.toml','--workspace','--locked','-j1'],stdout=f,stderr=subprocess.STDOUT)
(w/'native-alpha43-sluitsneltoets-debug-bouwstatus.json').write_text(json.dumps({'exitcode':p.returncode},indent=2)+'\n');assert p.returncode==0
for n,h in m.items():assert sha(r/n)==h,n
vast=w/'native-alpha43-sluitsneltoets-vast';vast.mkdir();d={'basiscommit':'214471bdaef902cdc6a787cca9f162fdb7920ab4','bronbestanden':len(m),'bronmanifest_sha256':sha(w/'native-alpha43-sluitsneltoets-testbron.json'),'bronpatch_sha256':sha(w/'native-alpha43-sluitsneltoets-geteste-bron.patch'),'bouwlog_sha256':sha(log),'bouwbron':'Afzonderlijk gebouwde volledige workspace-debugbouw van de klok-/kalendercorrectie en de sluitsneltoets; gerichte proeven groen, volledige ronde en platformcontrole nog niet afgesloten.','programmas':{}}
for naam in ['open-office-studio-native','controleer-bestand']:
 p=r/'native/target/debug'/naam;h=sha(p);versie=subprocess.check_output([str(p),'--version'],text=True).strip();assert '2026.45.0-alpha.43' in versie;q=vast/naam;os.link(oud/naam,q) if sha(oud/naam)==h else shutil.copyfile(p,q);q.chmod(0o555);assert sha(q)==h and q.stat().st_mode&0o777==0o555;d['programmas'][naam]={'sha256':h,'versie':versie}
(vast/'herkomst.json').write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(json.dumps(d,ensure_ascii=False))
