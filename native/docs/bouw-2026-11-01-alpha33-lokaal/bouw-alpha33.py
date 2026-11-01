"""Bouw vanuit vaste bronbytes op een herbruikbaar, tijdens de bouw bevroren pad."""
from pathlib import Path
import subprocess,os,hashlib,json,shutil,sys,tarfile,time
r=Path.cwd();w=r/'.local/controle-2026-10-31';commit=sys.argv[1]
assert len(commit)==40 and all(c in '0123456789abcdef' for c in commit)
eind=time.monotonic()+3600
while True:
 try:
  vorige=json.loads((w/'native-alpha32-vast-lokaal/herkomst.json').read_text())
  assert len(vorige['programmas'])==2
  gereed=not (w/'native-bouwbron.actief').exists()
 except (FileNotFoundError,json.JSONDecodeError):gereed=False
 if gereed:break
 assert time.monotonic()<eind,'Vorige releasebouw niet binnen de wachttermijn vastgezet'
 time.sleep(2)
subprocess.run(['git','cat-file','-e',commit+'^{tree}'],check=True)
bron=w/'bron-alpha33';bron.mkdir()
p=subprocess.Popen(['git','archive',commit,'native','public/templates','docs/voorbeelden','.gitattributes','.github/workflows/native-rust.yml','LICENSE'],stdout=subprocess.PIPE)
with tarfile.open(fileobj=p.stdout,mode='r|') as t:t.extractall(bron,filter='data')
assert p.wait()==0

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def bestanden(map):return {p.relative_to(map).as_posix():sha(p) for p in map.rglob('*') if p.is_file()}
for n in ['open-office-studio-native','controleer-bestand']:
 oud=w/'native-alpha32-vast-lokaal'/n;d=json.loads((oud.parent/'herkomst.json').read_text());assert sha(oud)==d['programmas'][n]['sha256']
vaste=w/'native-bouwbron';vaste.mkdir(exist_ok=True)
slot=w/'native-bouwbron.actief';fd=os.open(slot,os.O_CREAT|os.O_EXCL|os.O_WRONLY);os.write(fd,f'{os.getpid()} {commit}\n'.encode());os.close(fd)
try:
 manifest=bestanden(bron)
 # Schrijf ongewijzigde bestanden niet opnieuw. Zo behouden gepinde crates
 # hun bronidentiteit en tijdstempels tussen afzonderlijke, bevroren builds.
 for p in sorted(vaste.rglob('*'),reverse=True):
  if p.is_file() and p.relative_to(vaste).as_posix() not in manifest:p.chmod(0o644);p.unlink()
 for n,h in manifest.items():
  q=vaste/n;q.parent.mkdir(parents=True,exist_ok=True)
  if not q.is_file() or sha(q)!=h:
   if q.exists():q.chmod(0o644)
   shutil.copy2(bron/n,q)
  q.chmod(0o444)
 assert bestanden(vaste)==manifest
 e=os.environ.copy();e['CARGO_TARGET_DIR']=str(r/'native/target');start=time.monotonic()
 with (w/'native-alpha33-release.log').open('w') as log:
  subprocess.run(['cargo','build','--manifest-path',str(vaste/'native/Cargo.toml'),'--workspace','--locked','--release','-j','1'],stdout=log,stderr=subprocess.STDOUT,env=e,check=True)
 duur=time.monotonic()-start
 assert bestanden(vaste)==manifest,'Bouwbron tijdens de bouw veranderd'
 assert bestanden(bron)==manifest,'Git-archief tijdens de bouw veranderd'
 vast=w/'native-alpha33-vast-lokaal';vast.mkdir();programmas={}
 for n,v in [('open-office-studio-native','Open Office Studio 2026.44.9-alpha.33 (native)'),('controleer-bestand','Open Office native bestandscontrole 2026.44.9-alpha.33 (release)')]:
  p=r/'native/target/release'/n;assert subprocess.check_output([str(p),'--version'],text=True).strip()==v
  q=vast/n;shutil.copy2(p,q);q.chmod(0o555);programmas[n]={'versie':v,'sha256':sha(q)}
  q=bron/'native/target/release'/n;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
 (vast/'herkomst.json').write_text(json.dumps({'broncommit':commit,'bouwbron':'Vast Git-archief en bytegelijke bron op een herbruikbaar, tijdens de volledige bouw onveranderd pad. Beide programma’s vóór volgende builds vastgezet.','rust_bouwduur_seconden':round(duur,3),'bronmanifest_sha256':hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest(),'programmas':programmas},ensure_ascii=False,indent=2)+'\n')
 print('Beide alpha-33-releaseprogramma’s vastgezet.',flush=True)
finally:
 slot.unlink()
with (w/'native-alpha33-pakket.log').open('w') as log:
 for s in ['verpak.py','controleer-pakket.py']:subprocess.run([sys.executable,str(bron/'native/scripts'/s)],stdout=log,stderr=subprocess.STDOUT,check=True)
with (w/'native-alpha33-bronregressie.log').open('w') as log:
 subprocess.run([sys.executable,str(bron/'native/scripts/controleer-bronregressies.py'),'--programma',str(vast/'controleer-bestand'),'--bronbestand',str(r/'.local/corpus/bestanden/poi-e0e7dd7b3be8935aa9f0f5ff22c47ccaec7e338b.docx'),'--uitvoer',str(w/'native-alpha33-bronregressie-release.json')],stdout=log,stderr=subprocess.STDOUT,check=True)
print('Pakket- en bronregressiecontroles geslaagd.',flush=True)
