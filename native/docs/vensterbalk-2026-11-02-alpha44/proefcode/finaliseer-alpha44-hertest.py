from pathlib import Path
import hashlib,json,re,shutil,subprocess,sys,gzip
from PIL import Image
r=Path.cwd();w=r/'.local/controle-2026-10-31';docs=r/'native/docs';n=44
m=json.loads((w/'native-alpha44-hertest-testbron.json').read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def schrijf(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
for p,h in m.items():assert sha(r/p)==h,p
st=json.loads((w/'native-alpha44-hertest-stapstatus.json').read_text());term=json.loads((w/'native-alpha44-hertest-terminalstatus.json').read_text());assert term['exitcode']==0 and st['inhoudelijk_afgerond'] and st['bron_van_733_bestanden_bytegelijk'];assert len(st['stappen'])==9 and all(s['exitcode']==0 for s in st['stappen'])
for s in st['stappen']:assert sha(w/s['log'])==s['sha256']
pat=r'test result: ok\. (\d+) passed; (\d+) failed; (\d+) ignored;'
log=w/'native-alpha44-hertest-tests.log';tekst=log.read_text();t=[tuple(map(int,x)) for x in re.findall(pat,tekst)];assert 'test result: FAILED' not in tekst and sum(x[0] for x in t)==436 and sum(x[1] for x in t)==0 and sum(x[2] for x in t)==6,t
ui=tekst.split('Running unittests src/main.rs',1)[1];u=tuple(map(int,re.search(pat,ui).groups()));assert u==(183,0,1),u
rr=(w/'native-alpha44-hertest-runtime.log').read_text();t=[tuple(map(int,x)) for x in re.findall(pat,rr)];assert sum(x[0] for x in t)==6 and sum(x[1] for x in t)==0
assert 'Ran 7 tests' in (w/'native-alpha44-hertest-python.log').read_text()
assert 'Presentation-notitiewidget:' in (w/'native-alpha44-hertest-onafhankelijk.log').read_text()
beelden=w/'native-alpha44-hertest-schermen';pngs=sorted(beelden.glob('*.png'));assert len(pngs)==61,len(pngs);oud=json.loads((docs/'schermen-2026-11-02-alpha43.json').read_text());aliassen=oud['aliassen'];doel=docs/'screenshots'
for p in pngs:shutil.copyfile(p,doel/p.name)
for alias,bron in aliassen.items():shutil.copyfile(beelden/bron,doel/alias)
assert {p.name for p in doel.glob('*.png')}=={p.name for p in pngs}|set(aliassen)
schrijf(docs/'schermen-2026-11-02-alpha44.json',{'versie':'2026.45.0-alpha.43','omvang':'Echte Iced-software-renderer en widgetgebeurtenissen in Rust-tests. Eigen klembord en synthetische IME; geen fysieke systeemdialoog-, schermlezer- of volledige GUI-/pixelgoedkeuring.','reguliere_tests':436,'laatste_ui_tests':183,'x11_contracttests':1,'runtime_tests':6,'python_tests':7,'testlog_sha256':sha(log),'runtime_log_sha256':sha(w/'native-alpha44-hertest-runtime.log'),'toelichting':'Zes extra UI-proeven controleren tabbladkeuze bij sluiten en wisselen, documentgebonden status, gecentreerde modulekoppen op twee breedten, expliciete weergaveopslag en echte muisgebeurtenissen op vensterbalkknoppen. Sleepgebieden sluiten de knoppen uit; alle oorspronkelijke suiteacceptaties blijven open.','beelden':[{'bestand':p.name,'breedte':Image.open(p).width,'hoogte':Image.open(p).height,'sha256':sha(p)} for p in pngs],'aliassen':aliassen,'bronbestanden':m})
metingen={}
for soort,referentie,suffix in [('browser','referentie-2026-W44.8',''),('desktop','referentie-desktop-2026-11-01','-desktop')]:
 result=[]
 for module in ['writer','spreadsheet','presentation','notition']:
  uit=docs/f'pixelcontrole-alpha44{suffix}'/module
  p=subprocess.run([sys.executable,'native/scripts/vergelijk-schermen.py',str(docs/referentie/f'{module}.png'),str(beelden/f'{module}-native-referentie.png'),'--uitvoer',str(uit)],capture_output=True,text=True);assert p.returncode in [0,1],p.stderr
  d=json.loads((uit/'rapport.json').read_text());assert d['meetbaar'] and d['pixels']==943736;d.update(native=f'native/docs/screenshots/{module}-native-referentie.png',referentie=f'native/docs/{referentie}/{module}.png');schrijf(uit/'rapport.json',d);result.append({'module':module,**d})
 schrijf(docs/f'pixelcontrole-alpha44{suffix}/rapport.json',{'versie':'2026.45.0-alpha.43','referentie':referentie,'omvang':'Volledige verliesloze PNG op 1058×892, zonder maskers, herschaling of kleurtolerantie. Oorspronkelijke referenties ongewijzigd; geen telling van voltooide functies.','alle_vergelijkingen_geslaagd':all(x['geslaagd'] for x in result),'resultaten':result});metingen[soort]={x['module']:x['afwijkende_pixels'] for x in result}
oud=json.loads((docs/'documentbeelden-2026-11-02-alpha43.json').read_text());b=[]
for d in oud['beelden']:
 a=w/'native-alpha43-hertest-uitvoer'/d['bestand'];p=w/'native-alpha44-hertest-uitvoer'/d['bestand'];b.append({'bestand':p.name,'referentie_sha256':sha(a),'native_sha256':sha(p),'gelijk':a.read_bytes()==p.read_bytes()})
assert len(b)==15 and all(x['gelijk'] for x in b);schrijf(docs/'documentbeelden-2026-11-02-alpha44.json',{'omvang':'Vijftien gedeelde native documentbeelden alpha43 tegenover alpha44; geen oorspronkelijke UI- of functiepariteit.','geslaagd':True,'beelden':b})
fonts=sorted((w/'native-alpha44-hertest-uitvoer').glob('spreadsheet-font-*.png'));assert len(fonts)==8 and len({sha(p) for p in fonts})==8
for p in fonts:assert p.read_bytes()==(w/'native-alpha43-hertest-uitvoer'/p.name).read_bytes()
schrijf(docs/'spreadsheetletters-2026-11-02-alpha44.json',{'versie':'2026.45.0-alpha.43','omvang':'Twee opgeslagen families met elk normaal, vet, cursief en vet-cursief. Acht beelden bytegelijk aan alpha43; geen volledige Unicode- of systeemletterdekking.','beelden':[{'bestand':p.name,'sha256':sha(p)} for p in fonts],'bron_xlsx_sha256':sha(w/'native-alpha44-hertest-uitvoer/spreadsheet-lettertypen.xlsx'),'onafhankelijke_controle_sha256':sha(w/'native-alpha44-hertest-onafhankelijk.log'),'ongewijzigde_bronbeelden':5,'scope_en_budgetproeven':2})
v=json.loads((docs/'spreadsheet-symbolen-2026-11-02-alpha43.json').read_text())
for beeld in v['beelden']:assert sha(w/'native-alpha44-hertest-uitvoer'/beeld['bestand'])==beeld['sha256']
v.update(versie='2026.45.0-alpha.43',ui_beeld_sha256=sha(beelden/'spreadsheet-symbool-raster.png'),bestand_sha256=sha(w/'native-alpha44-hertest-uitvoer/spreadsheet-symbool.xlsx'),testlog_sha256=sha(log),bronmanifest='schermen-2026-11-02-alpha44.json',onafhankelijk_teruggelezen_log_sha256=sha(w/'native-alpha44-hertest-onafhankelijk.log'));schrijf(docs/'spreadsheet-symbolen-2026-11-02-alpha44.json',v)
print(json.dumps({'tests':436,'ui':183,'runtime':6,'python':7,'bronbestanden':len(m),'schermen':len(pngs),'pixelverschillen':metingen},ensure_ascii=False))
