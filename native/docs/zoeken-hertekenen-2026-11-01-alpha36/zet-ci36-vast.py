from pathlib import Path
import json,hashlib,zipfile,subprocess,sys
r=Path.cwd();w=r/'.local/controle-2026-10-31';pakketten=list((w/'native-alpha36-ci-verslagen/native-rust-Linux').rglob('*.zip'));assert len(pakketten)==1
with (w/'native-alpha36-ci-linux-pakket.log').open('w') as log: subprocess.run([sys.executable,str(w/'bron-alpha36-ci-controle/native/scripts/controleer-pakket.py'),str(pakketten[0])],stdout=log,stderr=subprocess.STDOUT,check=True)
v=w/'native-alpha36-ci-linux-vast';v.mkdir();d={}
with zipfile.ZipFile(pakketten[0]) as z:
 top=z.namelist()[0].split('/')[0]
 for n,t in [('open-office-studio-native','Open Office Studio 2026.44.9-alpha.36 (native)'),('controleer-bestand','Open Office native bestandscontrole 2026.44.9-alpha.36 (release)')]:
  p=v/n;p.write_bytes(z.read(top+'/'+n));p.chmod(0o555);assert subprocess.check_output([str(p),'--version'],text=True).strip()==t;d[n]={'versie':t,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
(v/'herkomst.json').write_text(json.dumps({'broncommit':'9deec078c7080549f3e6900685ba8357ad3d1547','ci_ronde':'41312502514','bouwbron':'Linux-pakketbron bytegelijk aan vast Git-archief gecontroleerd; eigen Linux-taak geslaagd; algemene platformstand wordt afzonderlijk gecontroleerd, geen fysieke GUI- of suitegoedkeuring','programmas':d},ensure_ascii=False,indent=2)+'\n')
