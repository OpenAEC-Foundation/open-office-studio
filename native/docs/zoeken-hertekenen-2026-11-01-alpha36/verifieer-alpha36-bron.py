"""Herstel de werkelijke proefbronnen buiten de Git-werkboom en controleer iedere hash."""
from pathlib import Path
import subprocess,tarfile,tempfile,json,hashlib,sys
r=Path.cwd();w=r/'.local/controle-2026-10-31'
resultaten=[]
for naam in ['native-alpha36-geteste-bron']:
 m=json.loads((w/(naam+'.json')).read_text());patch=w/(naam+'.patch');assert hashlib.sha256(patch.read_bytes()).hexdigest()==m['patch_sha256'];bron=m['bronbestanden']
 with tempfile.TemporaryDirectory(prefix='office-zoekfocus-bron-') as tmp:
  map=Path(tmp);p=subprocess.Popen(['git','archive',m['basiscommit'],'native','public/templates','docs/voorbeelden','.gitattributes','.github/workflows/native-rust.yml','LICENSE'],stdout=subprocess.PIPE)
  with tarfile.open(fileobj=p.stdout,mode='r|') as t:
   for a in t:
    if a.isfile() and a.name in bron:
     f=map/a.name;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(t.extractfile(a).read())
  assert p.wait()==0
  subprocess.run(['git','apply','--check',str(patch)],cwd=map,check=True,capture_output=True)
  subprocess.run(['git','apply',str(patch)],cwd=map,check=True,capture_output=True)
  for n,h in bron.items():assert hashlib.sha256((map/n).read_bytes()).hexdigest()==h,n
  resultaten.append({'moment':naam,'basiscommit':m['basiscommit'],'bronbestanden':len(bron),'patch_toepasbaar_en_alle_bronbytes_exact':True,'patch_sha256':m['patch_sha256']})
uit=w/'native-alpha36-bronherstel.json';assert not uit.exists();uit.write_text(json.dumps({'geslaagd':True,'momenten':resultaten},ensure_ascii=False,indent=2)+'\n');print(json.dumps(resultaten,ensure_ascii=False,indent=2))
