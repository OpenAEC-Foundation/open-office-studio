from pathlib import Path
import json,re,hashlib,stat,subprocess
r=Path.cwd();w=r/'.local/controle-2026-10-31'
def h(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
assert not (w/'native-bouwbron.actief').exists()
for proc in Path('/proc').glob('[0-9]*/comm'):
 try:naam=proc.read_text().strip()
 except OSError:continue
 assert naam!='rustc',str(proc)
for v in ['native-alpha33-vast-lokaal','native-alpha33-ci-linux-vast','native-alpha33-metadata-vast-lokaal','native-alpha33-metadata-ci-linux-vast']:
 m=json.loads((w/v/'herkomst.json').read_text());assert len(m['programmas'])==2
 for n,d in m['programmas'].items():
  p=w/v/n;assert stat.S_IMODE(p.stat().st_mode)==0o555 and h(p)==d['sha256']
for v in ['ci','lokaal']:
 assert json.loads((w/f'gui-alpha33-writer-stijlen-hulpgherstel-{v}/rapport.json').read_text())['geslaagd']
s=(w/'native-alpha34-lijsten-zesde.log').read_text()
assert 'FAILED' not in s and 'error:' not in s
assert sum(int(x) for x in re.findall(r'test result: ok\. (\d+) passed',s))==12
namen=list(dict.fromkeys(re.findall(r'\((native/target/debug/deps/[a-z_0-9-]+)\)',s)));assert len(namen)==7,namen
lijst=[]
for n in namen:
 p=r/n;t=p.stat();assert t.st_nlink==1 and stat.S_ISREG(t.st_mode)
 with p.open('rb') as f:assert f.read(4)==b'\x7fELF'
 lijst.append({'bestand':n,'bytes':t.st_size,'inode':t.st_ino,'apparaat':t.st_dev,'sha256':h(p)})
for p in Path('/proc').glob('[0-9]*/exe'):
 try:t=p.stat()
 except OSError:continue
 assert not any((t.st_dev,t.st_ino)==(a['apparaat'],a['inode']) for a in lijst),str(p)
bron=json.loads((w/'native-alpha33-testbron.json').read_text())
bron.update({n:'' for n in ['native/crates/office-core/src/writer_lijsten.rs','native/crates/office-core/src/writer_nummering.rs','native/crates/office-core/tests/fixtures/controleer-lijsten.py']})
bron={n:h(r/n) for n in bron};assert len(bron)==667
(w/'native-alpha34-voor-versiebump-bron.json').write_text(json.dumps(bron,ensure_ascii=False,indent=2)+'\n')
rapport=w/'opruiming-testcache-voor-alpha34.json';assert not rapport.exists()
# Alleen deze zeven herbouwbare proefprogramma’s; bronnen, uitvoer, logs en alle releases blijven bewaard.
rapport.write_text(json.dumps({'omvang':'Zeven inactieve herbouwbare test-ELFs met alpha-33-pakketidentiteit, bijgewerkt tijdens de tijdelijke lijstontwikkeling vóór de versiebump. Alle proeflogs, bronnen en uitvoer blijven behouden. Beide programma’s van beide alpha-33-broncommits lokaal en uit CI gecontroleerd en vastgezet; echte stijlvensterproeven geslaagd. Geen release- of gebruikersprogramma verwijderd.','bytes':sum(a['bytes'] for a in lijst),'verwijderd':lijst},ensure_ascii=False,indent=2)+'\n')
for a in lijst:
 p=r/a['bestand'];t=p.stat();assert t.st_ino==a['inode'] and t.st_size==a['bytes'];p.unlink()
print(sum(a['bytes'] for a in lijst),'bytes herbouwbare testcache vrijgemaakt')
