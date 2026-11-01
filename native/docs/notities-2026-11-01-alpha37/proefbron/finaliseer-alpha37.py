from pathlib import Path
import hashlib, json, re, shutil, subprocess, sys
from PIL import Image
root=Path.cwd()
verwacht=json.loads((root/'.local/controle-2026-10-31/native-alpha37-eind-testbron.json').read_text())
for n,h in verwacht.items(): assert hashlib.sha256((root/n).read_bytes()).hexdigest()==h,n
werk=root/'.local/controle-2026-10-31'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def schrijf(p,d): p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
log=werk/'native-alpha37-eind-definitief-tests.log'
pat=r'test result: ok\. (\d+) passed; (\d+) failed; (\d+) ignored;'
resultaten=[tuple(map(int,m)) for m in re.findall(pat,log.read_text())]
assert 'test result: FAILED' not in log.read_text()
assert sum(r[0] for r in resultaten)==395, resultaten
assert sum(r[1] for r in resultaten)==0
assert sum(r[2] for r in resultaten)==6
runtime=werk/'native-alpha37-eind-runtime.log'
rs=[tuple(map(int,m)) for m in re.findall(pat,runtime.read_text())]
assert sum(r[0] for r in rs)==6 and sum(r[1] for r in rs)==0
assert 'test result: FAILED' not in runtime.read_text()
for naam in ['clippy','fmt','bron','python','onafhankelijk']:
    p=werk/f'native-alpha37-eind-definitief-{naam}.log'
    assert p.is_file(), naam
    if naam=='clippy': assert 'Finished' in p.read_text() and 'error:' not in p.read_text()
    if naam=='python': assert '\nOK\n' in p.read_text()
    if naam=='onafhankelijk': assert 'Directe celbewerking:' in p.read_text()
schermen=werk/'native-alpha37-eind-definitief-schermen'
pngs=sorted(schermen.glob('*.png'))
assert len(pngs)==57, len(pngs)
oud=json.loads((root/'native/docs/schermen-2026-11-01-alpha36.json').read_text())
doel=root/'native/docs/screenshots'
for p in pngs: shutil.copyfile(p,doel/p.name)
for alias,bron in oud['aliassen'].items(): shutil.copyfile(schermen/bron,doel/alias)
assert {p.name for p in doel.glob('*.png')}=={p.name for p in pngs}|set(oud['aliassen'])
bronpaden=[root/n for n in verwacht]
schrijf(root/'native/docs/schermen-2026-11-01-alpha37.json',{
    'versie':'2026.44.9-alpha.37',
    'omvang':'Echte Iced-software-renderer en widgetgebeurtenissen in Rust-tests; eigen klembord en synthetische IME-Commit. Geen fysieke GUI, systeemklembord-, IME-, systeemdialoog- of schermlezerproef.',
    'reguliere_tests':395,'runtime_tests':6,'testlog_sha256':sha(log),'runtime_log_sha256':sha(runtime),'laatste_ui_tests':155,'ui_log_sha256':sha(log),
    'toelichting':'Alle 395 reguliere tests inclusief 155 UI-tests geslaagd. Alpha36 stempelt zoekfocus met de oorspronkelijke widgetgebeurtenis vóór berichtafhandeling. Drie nieuwe gerichte zoekproeven controleren twee snelle openingsroutes en normale zoek-/vervanginvoer. Twee heropenproeven controleren de zelf bewaarde rijke alinea, Home en kopiëren, ook bij wachtende navigatie. De schaduwberekening beperkt monsters tot het actuele fysieke hertekengebied; een aanvullende vier-schaalproef bewaakt fractionele deelgebieden. Oorspronkelijke afkeuringen blijven bewaard. Geen volledige suite-, platform- of pixelpariteit.',
    'beelden':[{'bestand':p.name,'breedte':Image.open(p).width,'hoogte':Image.open(p).height,'sha256':sha(p)} for p in pngs],
    'aliassen':oud['aliassen'],
    'bronbestanden':{p.relative_to(root).as_posix():sha(p) for p in sorted(bronpaden)},
})
metingen=[]
for module in ['writer','spreadsheet','presentation','notition']:
    pad=root/f'native/docs/pixelcontrole-alpha37/{module}'
    r=subprocess.run([sys.executable,'native/scripts/vergelijk-schermen.py',f'native/docs/referentie-2026-W44.8/{module}.png',str(schermen/f'{module}-native-referentie.png'),'--uitvoer',str(pad)],capture_output=True,text=True)
    assert r.returncode in (0,1),r.stderr
    d=json.loads((pad/'rapport.json').read_text())
    assert d['meetbaar'] and d['pixels']==943736
    d['native']=f'native/docs/screenshots/{module}-native-referentie.png'
    d['referentie']=f'native/docs/referentie-2026-W44.8/{module}.png'
    schrijf(pad/'rapport.json',d)
    metingen.append({'module':module,**d})
schrijf(root/'native/docs/pixelcontrole-alpha37/rapport.json',{'versie':'2026.44.9-alpha.37','referentie':'2026-W44.8','omvang':'Volledige verliesloze PNG op 1058×892, zonder maskers, herschaling of kleurtolerantie. Geen telling van voltooide functies.','alle_vergelijkingen_geslaagd':all(m['geslaagd'] for m in metingen),'resultaten':metingen})
oud=json.loads((root/'native/docs/documentbeelden-2026-11-01-alpha36.json').read_text())
beelden=[]
for d in oud['beelden']:
    naam=d['bestand'];a=werk/'native-alpha36-definitief-uitvoer'/naam;b=werk/'native-alpha37-eind-definitief-uitvoer'/naam
    assert a.is_file() and b.is_file(),naam
    beelden.append({'bestand':naam,'referentie_sha256':sha(a),'native_sha256':sha(b),'gelijk':a.read_bytes()==b.read_bytes()})
schrijf(root/'native/docs/documentbeelden-2026-11-01-alpha37.json',{'omvang':'Vijftien gedeelde native documentbeelden alpha 36 tegenover alpha 37; geen volledige UI- of functiepariteit','geslaagd':all(d['gelijk'] for d in beelden),'beelden':beelden})
assert all(d['gelijk'] for d in beelden)
print({'tests':395,'runtime':6,'schermen':len(pngs),'pixelverschillen':{d['module']:d['afwijkende_pixels'] for d in metingen}})

fonts=sorted((werk/'native-alpha37-eind-definitief-uitvoer').glob('spreadsheet-font-*.png'))
assert len(fonts)==8, [p.name for p in fonts]
assert len({sha(p) for p in fonts})==8
for p in fonts: assert p.read_bytes()==(werk/'native-alpha36-definitief-uitvoer'/p.name).read_bytes(),p.name
schrijf(root/'native/docs/spreadsheetletters-2026-11-01-alpha37.json', {
    'versie':'2026.44.9-alpha.37',
    'omvang':'Twee opgeslagen families met elk normaal, vet, cursief en vet-cursief; echte vaste stijlgezichten. Acht beelden blijven bytegelijk aan alpha 36. Geen bewijs voor alle lettertypen, volledige Unicode-terugval of systeemletters.',
    'beelden':[{'bestand':p.name,'sha256':sha(p)} for p in fonts],
    'bron_xlsx_sha256':sha(werk/'native-alpha37-eind-definitief-uitvoer/spreadsheet-lettertypen.xlsx'),
    'onafhankelijke_controle_sha256':sha(werk/'native-alpha37-eind-definitief-onafhankelijk.log'),
    'ongewijzigde_bronbeelden':5,
    'scope_en_budgetproeven':2,
})

nieuw=[werk/'native-alpha37-eind-definitief-uitvoer'/f'xlsx-{naam}.png' for naam in ['symbool','ontbrekend']]
assert all(p.is_file() for p in nieuw) and nieuw[0].read_bytes()!=nieuw[1].read_bytes()
schrijf(root/'native/docs/spreadsheet-symbolen-2026-11-01-alpha37.json',{
    'versie':'2026.44.9-alpha.37', 'geslaagd':True,
    'omvang':'Monochrome symbolen uit het vastgepinde aanvullende gezicht. Bestaande gevormde clusters en kerning blijven behouden; alleen ontbrekende clusters krijgen vervanging. Geen volledige CJK-, BiDi-, emoji- of systeemletterdekking.',
    'beelden':[{'bestand':p.name,'sha256':sha(p)} for p in nieuw],
    'kernproeven':[
        'spreadsheet_aanvullend_huisglyph_heeft_dezelfde_schaal_uitlijning_en_stijl_als_zijn_eigen_font',
        'spreadsheet_aanvullend_glyph_blijft_zichtbaar_bij_rotatie_stapeling_en_regelterugloop',
        'documentmodules_rasteren_een_symbool_in_plaats_van_een_ontbrekend_teken'],
    'gui_proef':'spreadsheet_opgeslagen_symbool_staat_in_het_raster_en_undo_herstelt_de_bron',
    'ui_beeld':'screenshots/spreadsheet-symbool-raster.png',
    'ui_beeld_sha256':sha(schermen/'spreadsheet-symbool-raster.png'),
    'bestand_sha256':sha(werk/'native-alpha37-eind-definitief-uitvoer/spreadsheet-symbool.xlsx'),
    'onafhankelijk_teruggelezen_log_sha256':sha(werk/'native-alpha37-eind-definitief-onafhankelijk.log'),
    'testlog_sha256':sha(log), 'bronmanifest':'schermen-2026-11-01-alpha37.json',
    'eerder_echt_venster_afgekeurd':'vensterproef-2026-10-31-alpha23-spreadsheet/rapport.json',
    'vorige_echte_vensterhertest':'vensterproef-2026-11-01-alpha27-ci/rapport.json',
    'echte_releasevenster_hertest_afgerond':False,
})

# De oorspronkelijke desktopreferenties blijven afzonderlijk van de browserreferenties.
desktop=[]
for module in ['writer','spreadsheet','presentation','notition']:
    pad=root/f'native/docs/pixelcontrole-alpha37-desktop/{module}'
    r=subprocess.run([sys.executable,'native/scripts/vergelijk-schermen.py',f'native/docs/referentie-desktop-2026-11-01/{module}.png',str(schermen/f'{module}-native-referentie.png'),'--uitvoer',str(pad)],capture_output=True,text=True)
    assert r.returncode in (0,1),r.stderr
    d=json.loads((pad/'rapport.json').read_text());assert d['meetbaar'] and d['pixels']==943736
    d['native']=f'native/docs/screenshots/{module}-native-referentie.png';d['referentie']=f'native/docs/referentie-desktop-2026-11-01/{module}.png';schrijf(pad/'rapport.json',d);desktop.append({'module':module,**d})
schrijf(root/'native/docs/pixelcontrole-alpha37-desktop/rapport.json',{'versie':'2026.44.9-alpha.37','referentie':'Oorspronkelijke Linux-desktop 2026.44.8, afzonderlijk vastgelegd op 1 november','omvang':'Vier volledige verliesloze PNG op 1058×892, zonder maskers, herschaling of kleurtolerantie. Geen telling van voltooide functies; browserreferenties blijven ongewijzigd.','alle_vergelijkingen_geslaagd':all(d['geslaagd'] for d in desktop),'resultaten':desktop})
print({'desktopverschillen':{d['module']:d['afwijkende_pixels'] for d in desktop}})
