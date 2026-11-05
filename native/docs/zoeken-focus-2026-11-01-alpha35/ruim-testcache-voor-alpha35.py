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
for v in ['native-alpha34-vast-lokaal','native-alpha34-ci-linux-vast']:
 m=json.loads((w/v/'herkomst.json').read_text());assert len(m['programmas'])==2
 for n,d in m['programmas'].items():
  p=w/v/n;assert stat.S_IMODE(p.stat().st_mode)==0o555 and h(p)==d['sha256']
for v in ['ci','lokaal']:
 assert json.loads((w/f'gui-alpha34-writer-stijlen-hulpgherstel-{v}/rapport.json').read_text())['geslaagd']
s=(w/'native-na-alpha34-zoekfocus-grenzen-hertest.log').read_text()
assert 'FAILED' not in s and 'error:' not in s
assert sum(int(x) for x in re.findall(r'test result: ok\. (\d+) passed',s))==16
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
bron=json.loads((w/'native-alpha34-testbron.json').read_text())
bron.update({'native/crates/office-ui/src/invoerfocus.rs':''})
bron={n:h(r/n) for n in bron};assert len(bron)==668
(w/'native-alpha35-voor-versiebump-bron.json').write_text(json.dumps(bron,ensure_ascii=False,indent=2)+'\n')
rapport=w/'opruiming-testcache-voor-alpha35.json';assert not rapport.exists()
# Alleen deze zeven herbouwbare proefprogramma’s; bronnen, uitvoer, logs en alle releases blijven bewaard.
rapport.write_text(json.dumps({'omvang':'Zeven inactieve herbouwbare test-ELFs met alpha-34-pakketidentiteit, bijgewerkt tijdens de tijdelijke zoekfocusontwikkeling vóór de versiebump. Alle proeflogs, bronpatches en uitvoer blijven behouden. Beide alpha34-releaseprogramma’s lokaal en uit CI op SHA/versie gecontroleerd en vastgezet; gerichte lijst-, stijl- en rastervensters geslaagd. De afzonderlijke Writer-zoekroute blijft afgekeurd. Geen release- of gebruikersprogramma verwijderd.','bytes':sum(a['bytes'] for a in lijst),'verwijderd':lijst},ensure_ascii=False,indent=2)+'\n')
for a in lijst:
 p=r/a['bestand'];t=p.stat();assert t.st_ino==a['inode'] and t.st_size==a['bytes'];p.unlink()
print(sum(a['bytes'] for a in lijst),'bytes herbouwbare testcache vrijgemaakt')
