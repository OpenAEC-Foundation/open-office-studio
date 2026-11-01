"""Leg de gesloten uitvoer vast naast de oorspronkelijke momentopname."""
from pathlib import Path
import json,hashlib,shutil
r=Path.cwd();w=r/'.local/controle-2026-10-31';p=r/'native/docs/zoeken-hertekenen-2026-11-01-alpha36';m=json.loads((p/'bewijskopieen.json').read_text())
def sha(a):return hashlib.sha256(a.read_bytes()).hexdigest()
af=[n for n,v in m['bestanden'].items() if sha(p/n)!=v['sha256'] or sha(r/v['bron'])!=v['sha256']];assert af==['native-alpha36-documenteren.log'],af
oud=p/af[0];moment=w/'native-alpha36-documenteren-eerste-momentopname.log';assert not moment.exists();moment.write_bytes(oud.read_bytes());assert moment.read_bytes()==b''
def kopie(a,b):
 shutil.copyfile(a,b);assert sha(a)==sha(b);m['bestanden'][b.relative_to(p).as_posix()]={'bron':a.relative_to(r).as_posix(),'sha256':sha(a)}
kopie(moment,p/moment.name);kopie(w/af[0],oud);kopie(Path(__file__).resolve(),p/Path(__file__).name)
(p/'logkopiecorrectie.json').write_text(json.dumps({'oorzaak':'De documentatiegenerator nam haar eigen nog open uitvoerlog mee. Daardoor was de eerste kopie leeg, terwijl de generator pas op het einde haar aantallen schreef.','eerste_momentopname_behouden':moment.name,'eerste_sha256':sha(moment),'gesloten_log':af[0],'gesloten_sha256':sha(oud),'alle_andere_kopieen_waren_al_bytegelijk':True,'geen_testuitslag_of_productbron_gewijzigd':True},ensure_ascii=False,indent=2)+'\n')
(p/'bewijskopieen.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
for n,v in m['bestanden'].items():assert sha(p/n)==sha(r/v['bron'])==v['sha256'],n
print('Alle',len(m['bestanden']),'bewijskopieën en hun oorspronkelijke bron bytegelijk.')
