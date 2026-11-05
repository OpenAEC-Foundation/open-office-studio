"""Accepteer uitsluitend volledige bouwpoorten en een bronvaste kandidaat."""
from pathlib import Path
import json,hashlib,subprocess,sys
from voorbereiden import ROOT,REPO,LOKAAL,bereid
bereid();m=json.loads((LOKAAL/'gebouwd.json').read_text())
resultaten=[]
for p in sorted(LOKAAL.glob('controles*/rapport.json')):
    regels=json.loads(p.read_text())
    if len(regels)==8 and all(r['code']==0 for r in regels):resultaten.append((p,regels))
assert len(resultaten)==1,'Er moet exact één volledig geslaagde bouwronde zijn'
p,regels=resultaten[0];map=p.parent
assert [r['naam']for r in regels]==['frontend','typescript','engines','opdrachten','weekversie','rust-kern','desktop','python-referenties']
front=(map/'frontend.log').read_text();rust=(map/'rust-kern.log').read_text();python=(map/'python-referenties.log').read_text()
assert '179 passed (179)'in front and '1850 passed | 10 skipped (1860)'in front
assert '28 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out'in rust
assert 'Ran 112 tests'in python and '\nOK\n'in python
assert hashlib.sha256(Path(m['programma']).read_bytes()).hexdigest()==m['programma_sha256']
subprocess.run([sys.executable,str(ROOT/'broncontrole.py')],cwd=REPO,check=True)
r={'geslaagd':True,'controlemap':str(map),'frontend_geslaagd':1850,'frontend_overgeslagen':10,'frontend_bestanden':179,'rust_kern':28,'python':112,'programma_sha256':m['programma_sha256'],'grens':'Bouwpoorten en bronidentiteit; nog geen GUI-/snelheids-/geheugen-/platformacceptatie.'}
(LOKAAL/'bouwacceptatie.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
