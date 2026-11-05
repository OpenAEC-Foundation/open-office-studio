"""Controleer beide releaseprogramma's en iedere vaste bronbyte na de bouw."""
from pathlib import Path
import json,hashlib,subprocess,tarfile
r=Path.cwd();w=r/'.local/controle-2026-10-31';vast=w/'native-alpha36-vast-lokaal';m=json.loads((vast/'herkomst.json').read_text());assert m['broncommit']=='9deec078c7080549f3e6900685ba8357ad3d1547'
assert (w/'native-alpha36-bouwopdracht.log').read_text().endswith('Pakket- en bronregressiecontroles geslaagd.\n')
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
for n,d in m['programmas'].items():
 p=vast/n;assert not p.stat().st_mode&0o222;assert sha(p)==d['sha256'];assert subprocess.check_output([str(p),'--version'],text=True).strip()==d['versie']
bron={};p=subprocess.Popen(['git','archive',m['broncommit'],'native','public/templates','docs/voorbeelden','.gitattributes','.github/workflows/native-rust.yml','LICENSE'],stdout=subprocess.PIPE)
with tarfile.open(fileobj=p.stdout,mode='r|') as t:
 for a in t:
  if a.isfile():
   h=hashlib.sha256(t.extractfile(a).read()).hexdigest();bron[a.name]=h;assert sha(w/'native-bouwbron'/a.name)==h;assert sha(w/'bron-alpha36'/a.name)==h
assert p.wait()==0;assert hashlib.sha256(json.dumps(bron,sort_keys=True).encode()).hexdigest()==m['bronmanifest_sha256']
regressie=json.loads((w/'native-alpha36-bronregressie-release.json').read_text());assert regressie['geslaagd']
rapport={'versie':'2026.44.9-alpha.36','geslaagd':True,'omvang':'Lokale releasecompilatie uit onveranderlijk Git-archief, CRC/bron/notices/versie-pakketcontrole en vaste bronregressie; geen volledige suite- of GUI-goedkeuring.','bouwbronbestanden':len(bron),'alle_bouwbronbytes_voor_en_na_en_git_gelijk':True,**m,'bronregressie':regressie}
(w/'native-alpha36-bouwnacontrole.json').write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n');(r/'native/docs/bouw-2026-11-01-alpha36-lokaal.json').write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n');print('Lokale release, beide programma’s,',len(bron),'bouwbronbestanden en pakket-/bronregressie gecontroleerd.',flush=True)
