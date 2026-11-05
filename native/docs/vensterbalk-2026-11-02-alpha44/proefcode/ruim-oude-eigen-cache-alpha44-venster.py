from pathlib import Path
import hashlib,json,stat
w=Path('.local/controle-2026-10-31');grens=(w/'native-alpha43-hertest-testbron.json').stat().st_mtime_ns;actief=set();bouw=[]
for p in Path('/proc').iterdir():
 if not p.name.isdecimal():continue
 try:
  s=(p/'exe').stat();actief.add((s.st_dev,s.st_ino));comm=(p/'comm').read_text().strip()
  if comm in ['cargo','rustc','rust-lld']:bouw.append({'pid':int(p.name),'programma':comm,'opdracht':(p/'cmdline').read_bytes().replace(b'\0',b' ').decode(errors='replace')[:230]})
  for f in (p/'fd').iterdir():
   try:s=f.stat();actief.add((s.st_dev,s.st_ino))
   except OSError:pass
 except OSError:pass
keus=[]
for p in Path('native/target/debug/deps').iterdir():
 if not p.name.startswith(('writer_navigatie-', 'writer_structuur-', 'writer_invoer-', 'raster_bronbeelden-', 'writer_beveiliging-', 'writer_pagina-', 'rekenblad_klembord-', 'documenten-', 'writer_zoeken-', 'writer_velden-', 'notities_presentatie-', 'rekenblad_snelle_navigatie-', 'interactie-', 'lettertypen-', 'writer_opmaak-', 'writer_regelnavigatie-', 'writer_cursor-', 'writer_interactie-', 'rekenblad_beveiliging-', 'writer_weergave-', 'rekenblad_letters-', 'rekenblad_selectie-', 'documentkern-', 'controleer_bestand-', 'open_office_studio_native-')):continue
 s=p.stat()
 if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_mode&0o777==0o555 or s.st_mtime_ns>=grens or (s.st_dev,s.st_ino) in actief or s.st_size<100_000_000:continue
 with p.open('rb') as f:
  if f.read(4)!=b'\x7fELF':continue
 keus.append((s.st_mtime_ns,p,s))
items=[]
for _,p,s in sorted(keus)[:10]:
 hh=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):hh.update(b)
 items.append({'bestand':str(p),'bytes':s.st_size,'sha256':hh.hexdigest(),'device':s.st_dev,'inode':s.st_ino,'mtime_ns':s.st_mtime_ns,'links':s.st_nlink,'mode':oct(s.st_mode&0o777)})
(w/'opruiming-oude-eigen-cache-voor-alpha44-venster.json').write_text(json.dumps({'omvang':'Maximaal tien oude eigen gegenereerde test-/controle-ELFs vóór de alpha43-hertest-freeze, geen actieve inode of open descriptor, links 1, geen vaste 555-programmas. De huidige alpha44-bouw gebruikt andere nieuwere artefacten; alle bronnen, vaste builds en bewijzen blijven bewaard.','lopende_bouw':bouw,'bestanden':items},ensure_ascii=False,indent=2)+'\n')
for d in items:
 p=Path(d['bestand']);s=p.stat();assert s.st_dev==d['device'] and s.st_ino==d['inode'] and s.st_size==d['bytes'] and s.st_nlink==1 and s.st_mode&0o777!=0o555 and s.st_mtime_ns==d['mtime_ns'];p.unlink()
print({'cachebytes':sum(d['bytes'] for d in items),'bestanden':len(items)})
