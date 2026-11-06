"""Controleer en archiveer exact de eigen GUI-opname en alle voltooide kernronden."""
from pathlib import Path
import gzip,hashlib,json,sys
from PIL import Image,ImageChops
from opnemen import REPO,ROOT,UIT,sha

def lees(p):return json.loads(p.read_text())
def main():
    gui=lees(UIT/'gui/profiel.json');op=lees(UIT/'opnemen.json');assert op['code']==0 and gui['geslaagd']
    assert gui['broncontrole']=={'verhalen':1537,'alinea_en_celteksten':3329,'exact':True}
    assert not any(gui['fouten_voor'].values())and not any(gui['fouten_na'].values())
    assert op['opnemer_sha256']==sha(ROOT/'opnemen.js')and op['helper_sha256']==sha(UIT/'fysieke-proef.py')
    eerste=lees(UIT/'herhaling/rapport.json');definitief=lees(UIT/'herhaling-definitief/rapport.json');cijfers=lees(UIT/'tellerherhaling/rapport.json')
    for r in [eerste,definitief,cijfers]:
        assert r['geslaagd'] and r['groepen']==63 and r['tekens']==351 and r['bronbytes']==5997678
        assert r['bron_sha256']=='b11a6f66b3797a080af2e70477e601ede9fd2e0fad9c2547ba160820a5200e74'
        assert r['opname_sha256']==sha(UIT/'gui/opname.json')
        for x in r['ronden']:
            assert x['hergebruikt']==62 and all(x[n]for n in ['antwoorden_bytegelijk_gui','verhalen_opmaak_identiteiten_selectie','undo_redo','docx_onderdelen_bytegelijk','heropen_alle_teksten'])
    assert eerste['script_sha256']==sha(UIT/'herhalen-eerste-uitgevoerd.mjs')
    assert definitief['script_sha256']==sha(ROOT/'herhalen.mjs')==cijfers['script_sha256']
    for r in [eerste,definitief]:assert [x['naam']for x in r['ronden']]==['referentie-a','cache-a','cache-b','referentie-b']
    assert len(cijfers['ronden'])==1
    telling=cijfers['ronden'][0]['encoder'];assert len(telling)==63 and all(x['gewicht']<=x['grens']==32*1024*1024 for x in telling)
    assert telling[-1]['treffers']>0 and telling[-1]['missers']>0
    achtergrond=lees(UIT/'achtergrondbelasting.json');assert achtergrond['soort']=='cargo'
    bouw=lees(UIT/'cijfers/bouwen.json');assert bouw['code']==0 and sha(Path(bouw['programma']))==bouw['programma_sha256']==cijfers['ronden'][0]['programma_sha256']
    pins=lees(UIT/'cijfers/bronnen.json');assert set(pins['gewijzigd'])=={'vendor/docx-edit/src/clipboard_batch.rs','vendor/docx-edit/src/deterministic.rs'}
    for n,h in pins['oorspronkelijk'].items():assert sha(UIT/'cijfers/bron'/n)==pins['gewijzigd'].get(n,h)
    assert 'Ran 114 tests' in (UIT/'python.log').read_text()and '\nOK\n'in (UIT/'python.log').read_text()
    im=Image.open(UIT/'gui/profiel.png').convert('RGB').crop((320,210,1140,950));ref=Image.open(REPO/'.local/doorwerk-2026-11-06/bronhergebruik/referentie/profiel.png').convert('RGB').crop((320,210,1140,950))
    for p in [im,ref]:p.paste((0,0,0),(171,137,176,156))
    assert ImageChops.difference(im,ref).getbbox()is None
    doel=REPO/'docs/tests/writer-guireplay';rapportpad=REPO/'docs/tests/2026-11-06-writer-guireplay.json'
    if sys.argv[1:]==['--controleer']:
        r=lees(rapportpad)
        for b in r['bestanden']:
            inhoud=(REPO/b['bron']).read_bytes();data=(REPO/'docs/tests'/b['bestand']).read_bytes()
            assert hashlib.sha256(inhoud).hexdigest()==b['sha256'] and hashlib.sha256(data).hexdigest()==b['gzip_sha256'] and gzip.decompress(data)==inhoud
        print('Alle exacte bronnen, ronden en bewijsbestanden gecontroleerd.');return
    assert len(sys.argv)==1;doel.mkdir(exist_ok=False)
    bronnen=[UIT/n for n in ['opnemen.json','opnemen.log','fysieke-proef.py','python.log','python-definitief.log','herhalen.log','herhalen-definitief.log','tellers.log','herhalen-eerste-uitgevoerd.mjs','gui/opname.json','gui/profiel.json','gui/profiel.png','gui/programma.log','cijfers/bouwen.json','cijfers/bouwen.log','cijfers/bronnen.json','achtergrondbelasting.json']]
    bronnen += [p for p in ROOT.iterdir()if p.suffix in ['.py','.js','.mjs','.cjs']]
    for mapnaam in ['herhaling','herhaling-definitief','tellerherhaling']:
        bronnen += [p for p in (UIT/mapnaam).iterdir()if p.suffix in ['.json','.jsonl','.docx']]
    bronnen += [UIT/'cijfers/bron'/n for n in pins['gewijzigd']]
    bestanden=[]
    for i,p in enumerate(sorted(bronnen)):
        inhoud=p.read_bytes();data=gzip.compress(inhoud,mtime=0);naam=f'{i:02d}-{p.name}.gz';(doel/naam).write_bytes(data);assert gzip.decompress(data)==inhoud
        bestanden.append({'bron':str(p.relative_to(REPO)),'bestand':str((doel/naam).relative_to(REPO/'docs/tests')),'bytes':len(inhoud),'sha256':hashlib.sha256(inhoud).hexdigest(),'gzip_sha256':hashlib.sha256(data).hexdigest()})
    def verhouding(r,k):return sum(x[k]for x in r['ronden']if x['naam'].startswith('cache'))/sum(x[k]for x in r['ronden']if x['naam'].startswith('referentie'))
    r={'schema':1,'datum':'2026-11-06','basis_commit':'ba351e50e5bb0b807bfe1a5ffc523793feef4b93','app_ongewijzigd':'2026.45.49 / alpha57','opname':op,'gui_broncontrole':gui['broncontrole'],'eerste_reeks':eerste,'definitieve_reeks':definitief,'tellerreeks':cijfers,'kernratio_eerste':verhouding(eerste,'native_ns'),'kernratio_definitief_niet_aanvaard_voor_snelheid':verhouding(definitief,'native_ns'),'achtergrondbelasting':achtergrond,'python_geslaagd':114,'documentpixels':{'roi':[320,210,1140,950],'cursorzone':[491,347,496,366],'afwijkend':0},'grenzen':['Eigen vaste documentkopie; geen gebruikersdocumenten opgenomen.','Rechtstreeks native hergebruik in de kernherhaling gemeten, niet de interne GUI reused-vlag.','Geen nieuwe desktopcacheacceptatie: eerdere fysieke ABBA was 6,25% trager.','Tellergewicht is boekhouding, geen RSS-/allocatorgrens.','Tijdens de extra definitieve ABBA-herhaling is een andere compiler waargenomen; alleen gegevenspoort, geen zuivere snelheidsvergelijking.','Geen nieuwe frontend-/Rustregressies/platform-/editie-/releaseacceptatie; bronvaste tellerversie met exacte volledige gegevenspoort getest.','Oude workertraps, lijstbewaarfout en volledige Rust-interface blijven open.'],'volgende_stap':'SDK-publicatie, tekenen en daadwerkelijke pakketgroepering in de desktop afbakenen. Kernhergebruik en cachetreffers zijn op de echte aanvragen aangetoond; geen nieuwe cachepromotie zonder fysieke winst.','bestanden':bestanden}
    rapportpad.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print('Gecontroleerd en vastgelegd:',len(bestanden),'bewijsbestanden.')
if __name__=='__main__':main()
