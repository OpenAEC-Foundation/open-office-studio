from pathlib import Path
import json,hashlib,zipfile,subprocess
r=Path.cwd();w=r/'.local/controle-2026-10-31';a=w/'native-alpha45-ci-verslagen';v=json.loads((a/'native-platformvergelijking/rapport.json').read_text());p=next(p for p in v['pakketten'] if p['platform']=='Linux');z=a/'native-rust-Linux'/p['pakket'];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();assert sha(z)==p['sha256']
oud=w/'native-alpha44-ci-linux-vast';moud=json.loads((oud/'herkomst.json').read_text())
for naam,d in moud['programmas'].items():assert (oud/naam).stat().st_mode&0o777==0o555 and sha(oud/naam)==d['sha256']
uit=w/'native-alpha45-ci-linux-vast';assert not uit.exists();m=json.loads((w/'native-alpha45-hertest-testbron.json').read_text());resultaat={};niet_verpakt=[]
with zipfile.ZipFile(z) as archief:
 namen=archief.namelist();prefix=next(n[:-len('open-office-studio-native')] for n in namen if n.endswith('/open-office-studio-native') and '/bron/' not in n)
 for n,h in m.items():
  pad=prefix+'bron/'+n
  if pad not in namen:niet_verpakt.append(n);continue
  assert hashlib.sha256(archief.read(pad)).hexdigest()==h,n
 assert niet_verpakt==['.github/workflows/native-rust.yml'],niet_verpakt
 uit.mkdir()
 for programma in p['programmas']:
  naam=programma['bestand'];q=uit/naam;q.write_bytes(archief.read(prefix+naam));q.chmod(0o555);assert sha(q)==programma['sha256'];versie=subprocess.check_output([str(q),'--version'],text=True).strip();assert '2026.45.0-alpha.45' in versie;resultaat[naam]={'sha256':sha(q),'versie':versie}
d={'versie':'2026.45.0-alpha.45','basiscommit':'68cd58986ea422bfe023f947fccf3ff7c473e94d','geteste_checkout':v['geteste_checkout'],'bouwronde':'41389707284','pakket':p['pakket'],'pakket_sha256':p['sha256'],'bronbestanden_ci':p['bronbestanden'],'eigen_geteste_bronbestanden_exact_in_pakket':len(m)-len(niet_verpakt),'eigen_bronbestand_niet_verpakt':niet_verpakt,'programmas':resultaat}
(uit/'herkomst.json').write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(json.dumps(d,ensure_ascii=False))
