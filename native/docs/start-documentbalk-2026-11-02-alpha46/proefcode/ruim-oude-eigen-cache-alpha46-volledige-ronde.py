from pathlib import Path
import hashlib,json,stat
w=Path('.local/controle-2026-10-31');grens=(w/'native-alpha46-hoofdvoorproef-testbron.json').stat().st_mtime_ns;out=w/'opruiming-oude-eigen-cache-voor-alpha46-volledige-ronde.json';assert not out.exists()
def lopend():
 actief=set();bouw=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdecimal():continue
  try:
   s=(p/'exe').stat();actief.add((s.st_dev,s.st_ino));comm=(p/'comm').read_text().strip()
   if comm in ['cargo','rustc','rust-lld']:bouw.append({'pid':int(p.name),'programma':comm})
   for f in (p/'fd').iterdir():
    try:s=f.stat();actief.add((s.st_dev,s.st_ino))
    except OSError:pass
  except OSError:pass
 return actief,bouw
actief,bouw=lopend();assert not bouw,bouw;v={'omvang':'Maximaal tien eigen oude gegenereerde test-/controle-ELFs vóór de alpha46-bronfreeze; ieder bestand tweemaal op actieve executable/open descriptor gecontroleerd. Geen bronnen, logs, vaste 555-programmas of releasebestanden. Alpha46 gebruikt nieuwere andere artefacten.','grens_mtime_ns':grens,'lopende_bouw':bouw,'bestanden':[]}
behouden = {'x11_presentatie-84153d747015ae23', 'open_office_studio_native-bebe210f5fafa9e2', 'documentkern-32a8a2875e8094c9', 'office_conversie-53ddcf19c3f45fb0', 'engine_velden-709d8104eada2507', 'controleer_bestand-f074a539c103442a', 'office_mail-edd1661335af5721', 'office_core-b1521055de0e6c02'}
v["actuele_alpha46_testuitvoeringen_behouden"] = sorted(behouden)
keus=[]
for p in Path('native/target/debug/deps').iterdir():
 if not p.name.startswith(('writer_navigatie-', 'writer_structuur-', 'writer_invoer-', 'raster_bronbeelden-', 'writer_beveiliging-', 'writer_pagina-', 'rekenblad_klembord-', 'documenten-', 'writer_zoeken-', 'writer_velden-', 'notities_presentatie-', 'rekenblad_snelle_navigatie-', 'interactie-', 'lettertypen-', 'writer_opmaak-', 'writer_regelnavigatie-', 'writer_cursor-', 'writer_interactie-', 'rekenblad_beveiliging-', 'writer_weergave-', 'rekenblad_letters-', 'rekenblad_selectie-', 'documentkern-', 'office_core-', 'office_mail-', 'office_conversie-', 'controleer_bestand-', 'open_office_studio_native-')):continue
 if p.name in behouden:continue
 s=p.stat()
 if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_mode&0o777==0o555 or s.st_mtime_ns>=grens or (s.st_dev,s.st_ino) in actief or s.st_size<100_000_000:continue
 with p.open('rb') as f:
  if f.read(4)!=b'\x7fELF':continue
 keus.append((s.st_mtime_ns,p,s))
for _,p,s in sorted(keus)[:10]:
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 nu=p.stat();actief,_=lopend();assert nu.st_dev==s.st_dev and nu.st_ino==s.st_ino and nu.st_size==s.st_size and nu.st_mtime_ns==s.st_mtime_ns and nu.st_nlink==1 and nu.st_mode&0o777!=0o555 and (nu.st_dev,nu.st_ino) not in actief
 d={'bestand':str(p),'bytes':s.st_size,'sha256':h.hexdigest(),'device':s.st_dev,'inode':s.st_ino,'mtime_ns':s.st_mtime_ns,'links':s.st_nlink,'mode':oct(s.st_mode&0o777),'verwijderd':False};v['bestanden'].append(d);out.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n');p.unlink();d['verwijderd']=True;out.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
print({'bestanden':len(v['bestanden']),'cachebytes':sum(d['bytes'] for d in v['bestanden'])})
