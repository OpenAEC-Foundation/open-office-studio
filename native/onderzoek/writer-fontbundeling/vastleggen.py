"""Bewaar de afgewezen fontkandidaat en de afzonderlijke autocorrectiediagnose."""
from pathlib import Path
import gzip,hashlib,json,sys
from PIL import Image,ImageChops
REPO=Path(__file__).resolve().parents[3]
ROOT=Path(__file__).resolve().parent
UIT=REPO/'.local/doorwerk-2026-11-06/fontbundeling'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def lees(p): return json.loads(p.read_text())
def main():
    rapport=REPO/'docs/tests/2026-11-06-writer-fontbundeling.json'
    if sys.argv[1:]==['--controleer']:
        for b in lees(rapport)['bestanden']:
            raw=(REPO/b['bron']).read_bytes();data=(REPO/'docs/tests'/b['bestand']).read_bytes()
            assert hashlib.sha256(raw).hexdigest()==b['sha256'] and hashlib.sha256(data).hexdigest()==b['gzip_sha256'] and gzip.decompress(data)==raw
        print('Alle bewaarde bewijsbytes gecontroleerd.');return
    assert len(sys.argv)==1
    gebouwd=lees(UIT/'gebouwd.json');assert sha(Path(gebouwd['programma']))==gebouwd['programma_sha256']
    assert all(x['code']==0 for x in lees(UIT/'bouwen.json'))
    assert '33 passed' in (UIT/'poort-integratie-eind-33.log').read_text()
    assert '25 passed' in (UIT/'hostproeven.log').read_text()
    assert 'Ran 116 tests' in (UIT/'python-definitief.log').read_text() and '\nOK\n' in (UIT/'python-definitief.log').read_text()
    assert '1860 passed' in (UIT/'frontend-root.log').read_text()
    assert '1853 passed' in (UIT/'frontend.log').read_text() and '7 skipped' in (UIT/'frontend.log').read_text()
    namen=['referentie-a','font-a','font-b','referentie-b'];ronden=[];ref=None
    for n in namen+['autocorrectie-uit']:
        map=UIT/f'gui/{n}' if n in namen else UIT/n/'gui';p=lees(map/'profiel.json')
        assert p['geslaagd'] and p['broncontrole']=={'verhalen':1537,'alinea_en_celteksten':3329,'exact':True}
        assert p['toetsontvangst']['aantal']==351 and all(not v for v in p['fouten_na'].values())
        im=Image.open(map/'profiel.png').convert('RGB').crop((320,210,1140,950));im.paste((0,0,0),(171,137,176,156))
        if ref is None:ref=im
        assert ImageChops.difference(ref,im).getbbox() is None
        ronden.append({'naam':n,'getekende_tekst_ms':p['getekende_tekst_ms'],'programma_sha256':p['programma_sha256']})
    f=lees(UIT/'functioneel.json');assert [x['code'] for x in f]==[0,1]
    font=lees(UIT/'lang-font/rapport.json')['lettertypebewijs'];assert not font['geslaagd'] and font['gevallen']==[] and 'caladea' in font['fout']
    doel=REPO/'docs/tests/writer-fontbundeling';doel.mkdir(exist_ok=False)
    bronnen=[p for p in UIT.iterdir() if p.is_file() and p.suffix in ['.json','.log','.ts','.mjs']]
    for n in ['gui','tijdlijn','selectie','lang-font','autocorrectie-uit','predicate-afkeuring']:
        bronnen += [p for p in (UIT/n).rglob('*') if p.is_file() and p.suffix in ['.json','.log','.png','.py','.js','.cjs','.docx']]
    bronnen += [p for p in ROOT.iterdir() if p.suffix in ['.py','.js','.cjs','.ts','.md']]
    bestanden=[]
    for i,p in enumerate(sorted(set(bronnen))):
        raw=p.read_bytes();data=gzip.compress(raw,mtime=0);naam=f'{i:03d}-{p.name}.gz';(doel/naam).write_bytes(data)
        assert gzip.decompress(data)==raw
        bestanden.append({'bron':str(p.relative_to(REPO)),'bestand':str((doel/naam).relative_to(REPO/'docs/tests')),'bytes':len(raw),'sha256':sha(p),'gzip_sha256':hashlib.sha256(data).hexdigest()})
    r={'schema':1,'datum':'2026-11-06','basis_commit':'8e34482d9650174c1883d63a72a0e6d4ca3a9bb9','app_ongewijzigd':'2026.45.49 / alpha57','kandidaat':gebouwd,'besluit':'Afgekeurd: geen overtuigende snelheidswinst en ontbrekende actuele Caladea-fontvraag. Niet promoveren.','ronden':ronden,'reference_gemiddeld_ms':(ronden[0]['getekende_tekst_ms']+ronden[3]['getekende_tekst_ms'])/2,'font_gemiddeld_ms':(ronden[1]['getekende_tekst_ms']+ronden[2]['getekende_tekst_ms'])/2,'fontafkeuring':font,'documentpixels':{'roi':[320,210,1140,950],'cursorzone':[491,347,496,366],'afwijkend':0},'grenzen':['Alleen Linux, eigen testprofielen en fixturekopieën; geen release, download, installatie of gebruikersinstelling gewijzigd.','Autocorrectie uit is uitsluitend één diagnostische ronde op dezelfde referentie-ELF, geen oplossing of behoud van autocorrectie bewezen.','Fontproef faalt bij eerste variant; geen van vier fontgevallen volledig geslaagd. Oorzaak niet bewezen.','Oude workertraps, bewaren en overige platforms/edities/migratie niet geaccepteerd.'],'volgende_stap':'Autocorrectie mag gewone invoergroepen niet via flushPendingInput onderbreken. Onderzoek één gedeelde natuurlijke-rustwacht per bron, met behoud van versie/tekst/bron/stop-bewaking en autocorrectiegedrag.','bestanden':bestanden}
    rapport.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print('Bewijsbestanden:',len(bestanden))
if __name__=='__main__':main()
