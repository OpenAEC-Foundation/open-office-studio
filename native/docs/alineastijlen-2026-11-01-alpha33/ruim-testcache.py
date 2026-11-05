from pathlib import Path
import json,re,hashlib,os,stat,subprocess
r=Path.cwd();w=r/'.local/controle-2026-10-31'
def h(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
assert not (w/'native-bouwbron.actief').exists()
for v in ['native-alpha32-vast-lokaal','native-alpha32-ci-linux-vast']:
 m=json.loads((w/v/'herkomst.json').read_text());assert m['broncommit']=='e4fb4b5d7f8b360fb848e7fbbf002055ce89976f' and len(m['programmas'])==2
 for n,d in m['programmas'].items():
  p=w/v/n;assert stat.S_IMODE(p.stat().st_mode)==0o555 and h(p)==d['sha256']
assert 'Pakket- en bronregressiecontroles geslaagd.' in (w/'native-alpha32-bouwopdracht.log').read_text()
for v in ['lokaal','ci']:
 for a in ['writer','schaars']:
  assert json.loads((w/f'gui-alpha32-{a}-{v}/rapport.json').read_text())['geslaagd']
for n in ['native-alpha32-definitief-tests.log','native-alpha33-stijlen-derde.log']:
 s=(w/n).read_text();assert 'FAILED' not in s and 'error:' not in s
s=(w/'native-alpha33-stijlen-derde.log').read_text();assert '5 passed; 0 failed;' in s and '4 passed; 0 failed;' in s
assert '135 filtered out' not in s
namen=list(dict.fromkeys(re.findall(r'\((native/target/debug/deps/[a-z_0-9-]+)\)',s)));assert len(namen)==7,namen
lijst=[]
for n in namen:
 p=r/n;t=p.stat();assert t.st_nlink==1 and stat.S_ISREG(t.st_mode)
 with p.open('rb') as f:assert f.read(4)==b'\x7fELF'
 lijst.append({'bestand':n,'bytes':t.st_size,'inode':t.st_ino,'apparaat':t.st_dev,'sha256':h(p)})
for p in Path('/proc').glob('[0-9]*/exe'):
 try:t=p.stat()
 except (OSError,PermissionError):continue
 assert not any((t.st_dev,t.st_ino)==(a['apparaat'],a['inode']) for a in lijst),str(p)
voor=json.loads((w/'native-alpha32-testbron.json').read_text());voor.update({n:h(r/n) for n in ['native/crates/office-core/src/writer_stijlen.rs','native/crates/office-core/tests/fixtures/writer-stijlen.docx']})
voor={n:h(r/n) for n in voor};assert len(voor)==664
(w/'native-alpha33-voor-versiebump-bron.json').write_text(json.dumps(voor,ensure_ascii=False,indent=2)+'\n')
for a in lijst:
 p=r/a['bestand'];t=p.stat();assert t.st_ino==a['inode'] and t.st_size==a['bytes'];p.unlink()
(w/'opruiming-testcache-voor-alpha33.json').write_text(json.dumps({'omvang':'Zeven inactieve herbouwbare test-ELFs met de eerdere alpha-32-pakketidentiteit. De eerste alineastijlproeven zijn vóór de versiebump met die identiteit gebouwd en hebben deze cachebestanden vernieuwd. Hun logs, negatieve bronpatches en uitvoer blijven behouden. Beide echte alpha-32-releaseprogramma’s uit lokale en CI-bouw zijn vastgezet en de gerichte vensterproeven slagen. Geen bron, log, bibliotheek, release of gebruikersprogramma verwijderd.','bytes':sum(a['bytes'] for a in lijst),'verwijderd':lijst},ensure_ascii=False,indent=2)+'\n')
print(sum(a['bytes'] for a in lijst),'bytes testcache vrijgemaakt')
