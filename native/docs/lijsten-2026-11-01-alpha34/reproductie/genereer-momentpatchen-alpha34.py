from pathlib import Path
import subprocess,tarfile,io,tempfile,json,hashlib,shutil,stat
r=Path.cwd();w=r/'.local/controle-2026-10-31';uit=w/'native-alpha34-momentpatchen';uit.mkdir();basis=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
getrackt=set(subprocess.check_output(['git','ls-files'],text=True).splitlines())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for naam,map,manifest in [('eerste-volledige','native-alpha34-eerste-volledige-bron','native-alpha34-eerste-volledige-testbron.json'),('verwijzing-voor','native-alpha34-verwijzing-voor-bron','native-alpha34-verwijzing-voor-bron.json'),('markdown-voor','native-alpha34-markdown-voor-bron','native-alpha34-markdown-voor-bron.json')]:
 m=json.loads((w/manifest).read_text());assert len(m)==667
 for n,h in m.items():assert sha(w/map/n)==h,n
 archief=subprocess.check_output(['git','archive',basis,*[n for n in m if n in getrackt]])
 with tempfile.TemporaryDirectory(prefix='office-bronmoment-') as t:
  a=Path(t)/'a';b=Path(t)/'b';a.mkdir();b.mkdir()
  with tarfile.open(fileobj=io.BytesIO(archief)) as f:f.extractall(a,filter='data')
  for n in m:
   q=b/n;q.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(w/map/n,q)
   if (a/n).exists():q.chmod(stat.S_IMODE((a/n).stat().st_mode))
  p=subprocess.run(['git','diff','--no-index','--no-prefix','--binary','--','a','b'],cwd=t,capture_output=True);assert p.returncode==1
  patch=uit/(naam+'.patch');patch.write_bytes(p.stdout)
  subprocess.run(['git','apply','--check',str(patch)],cwd=a,check=True)
  subprocess.run(['git','apply','--whitespace=nowarn',str(patch)],cwd=a,check=True)
  for n,h in m.items():assert sha(a/n)==h,n
 shutil.copyfile(w/manifest,uit/(naam+'-bronmanifest.json'))
 (uit/(naam+'-patchcontrole.json')).write_text(json.dumps({'basiscommit':basis,'patch_sha256':sha(patch),'git_apply_check_geslaagd':True,'bronbestanden':667,'alle_bronbytes_na_toepassen_gelijk':True},ensure_ascii=False,indent=2)+'\n')
 print(naam,': complete patch herstelt alle 667 bronbestanden bytegelijk',flush=True)
