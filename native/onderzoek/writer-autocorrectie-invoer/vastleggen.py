"""Verifieer de afgebakende appverbetering, beide oude afkeuringen en alle bewijsbytes."""
from pathlib import Path
import gzip,hashlib,json,sys,shutil
from PIL import Image,ImageChops
REPO=Path(__file__).resolve().parents[3];ROOT=Path(__file__).resolve().parent
UIT=REPO/'.local/doorwerk-2026-11-06/autocorrectie-invoer'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def lees(p):return json.loads(p.read_text())
def main():
    rapport=REPO/'docs/tests/2026-11-06-writer-autocorrectie-invoer.json'
    if sys.argv[1:]==['--controleer']:
        for b in lees(rapport)['bestanden']:
            raw=(REPO/b['bron']).read_bytes();data=(REPO/'docs/tests'/b['bestand']).read_bytes()
            assert hashlib.sha256(raw).hexdigest()==b['sha256']and hashlib.sha256(data).hexdigest()==b['gzip_sha256']and gzip.decompress(data)==raw
        print('Alle bewaarde bron-, beeld-, log- en bewijsbytes gecontroleerd.');return
    assert len(sys.argv)==1
    m=lees(UIT/'gebouwd.json');assert sha(Path(m['programma']))==m['programma_sha256']
    assert len(lees(UIT/'bouwen.json'))==6 and all(x['code']==0 for x in lees(UIT/'bouwen.json'))
    assert '1870 passed' in (UIT/'frontend-root.log').read_text()
    assert 'Ran 116 tests' in (UIT/'python-root.log').read_text() and '\nOK\n' in (UIT/'python-root.log').read_text()
    assert '7 failed | 3 passed' in (UIT/'regressie-oud.log').read_text()
    assert sha(ROOT/'sessie-kandidaat.ts')==sha(UIT/'bron/src/spelling/tekst/sessie.ts')==sha(REPO/'src/spelling/tekst/sessie.ts')
    assert sha(ROOT/'invoerrust.template.ts')==sha(REPO/'src/spelling/tekst/invoerrust.test.ts')
    ref=None;ronden={}
    for map in ['gui-achtergrond','gui','gui-rustig']:
        sam=[];r=lees(UIT/map/'rapport.json');assert len(r)==4 and all(x['code']==0 for x in r)
        if map=='gui-rustig':assert all(not x['achtergrond_bij_start'] for x in r)
        for n in ['referentie-a','invoer-a','invoer-b','referentie-b']:
            p=UIT/map/n;j=lees(p/'profiel.json');assert j['geslaagd'] and j['broncontrole']=={'verhalen':1537,'alinea_en_celteksten':3329,'exact':True}
            assert j['toetsontvangst']['aantal']==351 and all(not v for v in j['fouten_na'].values())
            im=Image.open(p/'profiel.png').convert('RGB').crop((320,210,1140,950));im.paste((0,0,0),(171,137,176,156));ref=im if ref is None else ref;assert ImageChops.difference(im,ref).getbbox()is None
            sam.append({'naam':n,'getekende_tekst_ms':j['getekende_tekst_ms']})
        ronden[map]=sam
    tijden=[x['getekende_tekst_ms']for x in ronden['gui-rustig']];ratio=(tijden[1]+tijden[2])/(tijden[0]+tijden[3])
    assert lees(UIT/'correctie.json')['code']==1
    assert 'Sluitdialoog wacht op tekstinvoer' in lees(UIT/'correctie/rapport.json')['fout']
    for naam in ['correctie-ref','sluitdiagnose','sluitvoor','correctie-batch']:
        assert lees(UIT/(naam+'.json'))['code']==0 and lees(UIT/naam/'rapport.json')['geslaagd']
    for naam in ['lang-font','font-ref']:
        j=lees(UIT/naam/'rapport.json')['lettertypebewijs'];assert not j['geslaagd'] and j['gevallen']==[] and 'caladea' in j['fout']
    for naam in ['canoniek-ref','canoniek-invoer']:
        j=lees(UIT/naam/'rapport.json');b=j['lettertypebewijs'];assert j['geslaagd'] and b['geslaagd'] and len(b['gevallen'])==4
        assert all(g['xml_exact'] and g['volledige_tekst_exact'] and g['bron_hersteld'] and g['layoutbron']['herkomst']=='sync.snapshot.layoutInput' for g in b['gevallen'])
        assert b['script_sha256']==sha(REPO/'scripts/gui/lettertype_bewijs.js')
    # Bewaar product-/testbronnen los van toekomstige wijzigingen in de werkboom.
    bevroren=UIT/'bevroren-bronnen';bevroren.mkdir(exist_ok=False)
    for n in ['src/spelling/tekst/sessie.ts','src/spelling/tekst/invoerrust.test.ts','scripts/gui/lettertype_bewijs.js','tests/fixtures/lettertype-bewijs.mjs','tests/test_lettertype_bewijs.py','package.json','versie.json','src-tauri/tauri.conf.json','src-tauri/Cargo.toml','src-tauri/Cargo.lock','apps/database-studio/src-tauri/tauri.conf.json','apps/database-studio/src-tauri/Cargo.toml','apps/database-studio/src-tauri/Cargo.lock']:
        p=bevroren/n;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(REPO/n,p)
    doel=REPO/'docs/tests/writer-autocorrectie-invoer';doel.mkdir(exist_ok=False)
    extensies=['.json','.log','.png','.py','.js','.cjs','.ts','.mjs','.md','.docx','.toml','.lock']
    bronnen=[p for p in UIT.iterdir()if p.is_file()and p.suffix in extensies]
    for naam in ['gui','gui-achtergrond','gui-rustig','selectie','lang-font','correctie','correctie-ref','sluitdiagnose','sluitvoor','font-ref','fontdiagnose-tweede','fontbron','canoniek-ref','canoniek-invoer','correctie-batch','bevroren-bronnen']:
        bronnen += [p for p in (UIT/naam).rglob('*')if p.is_file()and p.suffix in extensies]
    bronnen += [p for p in ROOT.iterdir()if p.suffix in extensies]
    bestanden=[]
    for i,p in enumerate(sorted(set(bronnen))):
        raw=p.read_bytes();data=gzip.compress(raw,mtime=0);naam=f'{i:03d}-{p.name}.gz';(doel/naam).write_bytes(data);assert gzip.decompress(data)==raw
        bestanden.append({'bron':str(p.relative_to(REPO)),'bestand':str((doel/naam).relative_to(REPO/'docs/tests')),'bytes':len(raw),'sha256':sha(p),'gzip_sha256':hashlib.sha256(data).hexdigest()})
    r={'schema':1,'datum':'2026-11-06','basis_commit':lees(UIT/'bronnen.json')['commit'],'app':'2026.45.52 / alpha57','programma':m,'besluit':'Afgebakende invoerverbetering op ontwikkelbranch; geen volledige Writer-/suite-/afsluit-/platformacceptatie.','ronden':ronden,'rustige_ratio':ratio,'rustige_reference_gemiddeld_ms':(tijden[0]+tijden[3])/2,'rustige_kandidaat_gemiddeld_ms':(tijden[1]+tijden[2])/2,'documentpixels':{'roi':[320,210,1140,950],'cursorzone':[491,347,496,366],'afwijkend':0},'frontend_root_geslaagd':1870,'python_geslaagd':116,'font_helper_scenarios':12,'open_afkeuringen':['Eerste extra correctie-/sluitproef: sluitdialoog niet binnen tien seconden tijdens een vastgehouden tekstantwoord. Oorzaak onbekend; twee instrumentatieherhalingen, batchcorrectieproef en oorspronkelijke selectie-/bewaarproef slagen. Niet als hersteld verklaren.','Oorspronkelijke automatische-fontberichtverwachting faalt identiek op referentie en kandidaat. Bewaard; nieuwe canonieke proef bevraagt de daadwerkelijk verzonden actuele layoutinput op precies de eigen worker, met alle oorspronkelijke inhouds-/export-/Undo-bewakingen.'], 'meetgrenzen':['Eén pc en 129-paginabron, echte toetsen, alleen volledige nieuwe tekst zichtbaar; geen algemene FPS-/toetslatentieclaim.','Achtergronddiagnose heeft andere Cargo-tests; telt niet als snelheidsacceptatie. Eerste strikte ronde omvat kort eigen Node/Python-controles; de definitieve rustige herhaling heeft geen eigen nevenproeven en controleert afwezigheid van compilers vóór iedere ronde.','Kandidaatfrontend vóór assets: 1860 geslaagd, tien bestaande skips; na assets slagen alle achttien spellingproeven. Rootfrontend daarna 1870 zonder skips.','Geen gebruikersbestanden, installatie, bestaande ELF of referentie vervangen. Geen officiële release/tag.','Windows/macOS, zeven edities, oude worker-/lijstbewaarproblemen en volledige Rust-interface blijven afzonderlijk open.'],'volgende_stap':'Controleer nieuwe CI/platform-/editieartefacten; onderzoek de bewaarde eenmalige sluitafkeuring met metadata vóór/na de sneltoets. Verlaag daarna de resterende invoer-/selectievertraging verder zonder functionaliteit uit te zetten.','bestanden':bestanden}
    rapport.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print('Gecontroleerd:',len(bestanden),'bewijsbestanden. Ratio:',ratio)
if __name__=='__main__':main()
