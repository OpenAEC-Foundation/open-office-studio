"""Verifieer complete eigen tijdlijnen en behoud ook de afgekeurde meetopzetten."""
from pathlib import Path
import gzip,hashlib,json,sys
from PIL import Image,ImageChops
from analyseren import ROOT as REPO,UIT,analyse
ROOT=Path(__file__).resolve().parent
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def lees(p):return json.loads(p.read_text())
def main():
    eerste=UIT.with_name('wachtrijmeting-eerste');fouten=[UIT.with_name('wachtrijmeting-afgekeurd-invoer'),UIT.with_name('wachtrijmeting-afgekeurd-raster')]
    a=lees(UIT/'analyse.json');assert a['eerste']==analyse(eerste/'gui/profiel.json')and a['verdiept']==analyse(UIT/'gui/profiel.json')
    for map in [eerste,UIT]:
        m=lees(map/'manifest.json');assert m['code']==0 and m['programma_sha256']=='e7295980a17df1e85c9524ad6e384fcf63735162bb60964f4d7aebacf42e5785'
        assert m['helper_sha256']==sha(map/'fysieke-proef.py')
        bron=ROOT/'meting.js'if map==UIT else map/'meting.js';assert m['meting_sha256']==sha(bron)
        assert m['template_sha256']==sha(REPO/'native/onderzoek/writer-desktopcache/meten.py')
    assert all(lees(p/'manifest.json')['code']!=0 for p in fouten)
    assert 'SyntaxError' in (fouten[0]/'test-opzet.log').read_text()
    assert not lees(fouten[1]/'gui/profiel.json')['geslaagd']
    assert '90 seconden'in lees(fouten[1]/'gui/profiel.json')['fout']
    assert a['verdiept']['fontvragen']==a['verdiept']['fontantwoorden']==64
    assert 'Ran 115 tests'in (UIT/'python-definitief.log').read_text()and '\nOK\n'in (UIT/'python-definitief.log').read_text()
    ref=Image.open(REPO/'.local/doorwerk-2026-11-06/guireplay/gui/profiel.png').convert('RGB').crop((320,210,1140,950));ref.paste((0,0,0),(171,137,176,156))
    for map in [eerste,UIT]:
        im=Image.open(map/'gui/profiel.png').convert('RGB').crop((320,210,1140,950));im.paste((0,0,0),(171,137,176,156));assert ImageChops.difference(im,ref).getbbox()is None
    doel=REPO/'docs/tests/writer-wachtrijmeting';rapportpad=REPO/'docs/tests/2026-11-06-writer-wachtrijmeting.json'
    if sys.argv[1:]==['--controleer']:
        for b in lees(rapportpad)['bestanden']:
            p=REPO/b['bron'];data=(REPO/'docs/tests'/b['bestand']).read_bytes();assert sha(p)==b['sha256']and hashlib.sha256(data).hexdigest()==b['gzip_sha256']and gzip.decompress(data)==p.read_bytes()
        print('Alle tijdlijnen, afbeeldingen en bewijsbytes gecontroleerd.');return
    assert len(sys.argv)==1;doel.mkdir(exist_ok=False)
    bronnen=[p for map in [eerste,UIT,*fouten]for p in map.rglob('*')if p.is_file()and p.suffix in ['.json','.log','.png','.py','.js','.cjs']]
    bronnen += [p for p in ROOT.iterdir()if p.suffix in ['.py','.js','.cjs','.md']]
    bestanden=[]
    for i,p in enumerate(sorted(bronnen)):
        raw=p.read_bytes();data=gzip.compress(raw,mtime=0);naam=f'{i:02d}-{p.name}.gz';(doel/naam).write_bytes(data);assert gzip.decompress(data)==raw
        bestanden.append({'bron':str(p.relative_to(REPO)),'bestand':str((doel/naam).relative_to(REPO/'docs/tests')),'bytes':len(raw),'sha256':sha(p),'gzip_sha256':hashlib.sha256(data).hexdigest()})
    r={'schema':1,'datum':'2026-11-06','basis_commit':'6a092f093f16823866eb5ae98c871bd3ee5afe89','app_ongewijzigd':'2026.45.49 / alpha57','analyse':a,'python_geslaagd':115,'documentpixels':{'roi':[320,210,1140,950],'cursorzone':[491,347,496,366],'afwijkend':0},'afkeuringen':['Eerste selector vond het verborgen invoerveld buiten de documentcontainer niet; vóór typen gestopt.','Syntaxfout in nieuwe JS-teststub; bron en foutlog bewaard.','Volledige rasterproef tekende binnen 90 seconden geen nieuwe tekst. Geen bruikbare tijdlijn of primaire foutmetadata; oorzaak blijft onbekend. Latere successen herstellen haar niet.'],'grenzen':['Geïnstrumenteerde wandtijden, geen CPU-seconden of snelheidsvergelijking.','Andere Cargo-bouw in aparte werkmap waargenomen: ops-wt/office-getalnotatie/.local/getalnotatie/betteroffice-bron. Geen andere processen gestopt.','Geen nieuwe bewaar-/heropen-/grote-plak-/fontopmaak-/platform-/editieacceptatie.','Geen productiepatch, download, release of gesloten issue.','Oude workertraps, lijstbewaarfout en volledige Rust-interface blijven open.'],'volgende_stap':'Bouw een afzonderlijke kandidaat die alleen achterhaalde host-lettertypevragen vóór verzending samenvoegt, met bron-/eigenaar-/versiebewaking. De bestaande worker-berichtvolgorde en oorspronkelijke fontRequirements-API behouden. Eerst uitgestelde vragen, fouten, bronwissels en actuele fonts functioneel toetsen; daarna fysieke invoer/beeld/font-DOCX bewaren/heropenen vergelijken.','bestanden':bestanden}
    rapportpad.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print('Gecontroleerd:',len(bestanden),'bewijsbestanden.')
if __name__=='__main__':main()
