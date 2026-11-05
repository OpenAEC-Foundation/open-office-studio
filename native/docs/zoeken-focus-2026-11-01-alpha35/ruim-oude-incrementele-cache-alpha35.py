from pathlib import Path
import os,stat,hashlib,shutil,json,time
r=Path.cwd();w=r/'.local/controle-2026-10-31';basis=r/'native/target/debug/incremental';grens=(w/'native-alpha35-testbron.json').stat().st_mtime-3600
rapport={'omvang':'Uitsluitend oude herbouwbare incrementele caches van de eigen Rust-crates, zonder actieve rustc. Alle cachebestanden worden vóór verwijdering op pad, grootte en SHA-256 geregistreerd. Geen bron, testprogramma, log, vastgezette release of gebruikersproces gewijzigd.','verwijderd':[]}
def compiler_vrij():
 for p in Path('/proc').glob('[0-9]*/comm'):
  try:naam=p.read_text().strip()
  except OSError:continue
  assert naam!='rustc','Actieve compiler; cache blijft behouden'
def vrij():return shutil.disk_usage(r).free
assert not (w/'opruiming-oude-incrementele-cache-tijdens-alpha35.json').exists()
compiler_vrij();rapport['vrije_bytes_voor']=vrij()
voor=[]
for p in basis.iterdir():
 if not p.is_dir() or not p.name.startswith(('office_core-','office_mail-','office_conversie-','open_office_studio_native-','documentkern-','controleer_bestand-')):continue
 bestanden=[f for f in p.rglob('*') if f.is_file()]
 if bestanden and max(f.stat().st_mtime for f in bestanden)<grens:voor.append((max(f.stat().st_mtime for f in bestanden),p,bestanden))
for _,p,bestanden in sorted(voor):
 if vrij()>=8*1024**3:break
 compiler_vrij();assert p.resolve().parent==basis.resolve()
 m=[]
 for f in bestanden:
  assert not f.is_symlink()
  t=f.stat();assert stat.S_ISREG(t.st_mode)
  with f.open('rb') as a:h=hashlib.file_digest(a,'sha256').hexdigest()
  m.append({'bestand':f.relative_to(r).as_posix(),'bytes':t.st_size,'inode':t.st_ino,'gewijzigd':t.st_mtime_ns,'sha256':h})
 for a in m:
  t=(r/a['bestand']).stat();assert t.st_ino==a['inode'] and t.st_size==a['bytes'] and t.st_mtime_ns==a['gewijzigd']
 compiler_vrij();shutil.rmtree(p);rapport['verwijderd'].append({'map':p.relative_to(r).as_posix(),'bestanden':m});rapport['vrije_bytes_na']=vrij()
 (w/'opruiming-oude-incrementele-cache-tijdens-alpha35.json').write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n')
 print(p.name,'verwijderd; vrije bytes',vrij(),flush=True)
assert vrij()>=2*1024**3,'Nog onvoldoende vrije ruimte'
