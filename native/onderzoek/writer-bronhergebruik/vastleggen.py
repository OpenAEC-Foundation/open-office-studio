"""Verifieer de twee fysieke proeven en archiveer hun exacte, begrensde bewijs."""
from pathlib import Path
import gzip,hashlib,json,sys
from PIL import Image,ImageChops
from meten import REPO,ROOT,UIT

def sha(b):return hashlib.sha256(b).hexdigest()
def main():
    manifest=json.loads((UIT/'manifest.json').read_text());assert len(manifest['ronden'])==2
    assert manifest['transport_sha256']==sha((ROOT/'transport.js').read_bytes())
    assert manifest['helper_sha256']==sha((UIT/'fysieke-proef.py').read_bytes())
    assert manifest['template_sha256']==sha((REPO/'native/onderzoek/writer-desktopcache/meten.py').read_bytes())
    ronden=[];beelden=[]
    for ronde in manifest['ronden']:
        assert ronde['code']==0
        r=json.loads((UIT/ronde['naam']/'profiel.json').read_text());m=r['bronhergebruik'];regels=m['regels'];assert m['gemist']==0
        assert r['geslaagd'] and r['broncontrole']=={'verhalen':1537,'alinea_en_celteksten':3329,'exact':True}
        assert not any(r['fouten_voor'].values())and not any(r['fouten_na'].values())
        assert all(x['soort']=='tekst' and x['schema']==2 and x['bindingGelijk'] and x['vectorGelijk'] and not x['retryFull'] for x in regels)
        assert not regels[0]['incrementeel'] and not regels[0]['hergebruikGeschikt']
        assert all(x['incrementeel'] and x['hergebruikGeschikt'] for x in regels[1:])
        assert r['programma_sha256']==ronde['programma_sha256']
        ronden.append({'naam':ronde['naam'],'aanvragen':len(regels),'geschikte_vervolgaanvragen':len(regels)-1,'koude_bronbytes':regels[0]['bronbytes'],'warme_bronbytes_min':min(x['bronbytes']for x in regels[1:]),'warme_bronbytes_max':max(x['bronbytes']for x in regels[1:]),'retry_full':0,'overgeslagen_metadata':0,'broncontrole':r['broncontrole'],'fouten':r['fouten_na'],'geïnstrumenteerde_rasterduur_ms':r['getekende_tekst_ms']})
        im=Image.open(UIT/ronde['naam']/'profiel.png').convert('RGB').crop((320,210,1140,950));im.paste((0,0,0),(171,137,176,156));beelden.append(im)
    verschil=ImageChops.difference(*beelden);assert verschil.getbbox()is None
    py=(UIT/'python.log').read_text();assert 'Ran 113 tests' in py and '\nOK\n'in py
    doel=REPO/'docs/tests/writer-bronhergebruik'
    if sys.argv[1:]==['--controleer']:
        bestaand=json.loads((REPO/'docs/tests/2026-11-06-writer-bronhergebruik.json').read_text())
        assert bestaand['ronden']==ronden and bestaand['manifest']==manifest
        for b in bestaand['bestanden']:
            raw=(REPO/b['bron']).read_bytes();ingepakt=(REPO/'docs/tests'/b['bestand']).read_bytes()
            assert sha(raw)==b['sha256'] and sha(ingepakt)==b['gzip_sha256'] and gzip.decompress(ingepakt)==raw
        print('Bestaande veertien bewijsbestanden en twee fysieke ronden exact gecontroleerd.');return
    assert len(sys.argv)==1,'Gebruik zonder opties of --controleer'
    doel.mkdir(exist_ok=False)
    bestanden=[]
    bronnen=[UIT/n for n in ['fysieke-proef.py','manifest.json','python.log','referentie.log','afgekeurde-cache.log']]
    bronnen += [UIT/n/b for n in ['referentie','afgekeurde-cache']for b in ['profiel.json','programma.log']]
    bronnen += [ROOT/'transport.js',ROOT/'transport.test.cjs',REPO/'src/tekst/bewerken/rustBron.ts',REPO/'native/crates/office-writer-plakken/src/bronspiegel.rs',REPO/'native/vendor/docx-edit/src/clipboard_batch.rs']
    for i,p in enumerate(sorted(bronnen)):
        inhoud=p.read_bytes();naam=f'{i:02d}-{p.name}.gz';b=gzip.compress(inhoud,mtime=0);(doel/naam).write_bytes(b);assert gzip.decompress(b)==inhoud
        bestanden.append({'bron':str(p.relative_to(REPO)),'bestand':str((doel/naam).relative_to(REPO/'docs/tests')),'bytes':len(inhoud),'sha256':sha(inhoud),'gzip_sha256':sha(b)})
    rapport={'schema':1,'datum':'2026-11-06','basis_commit':'ed57cdd29f2544327f2a1ffdc3c94f47f8facf19','app_ongewijzigd':'2026.45.49 / alpha57','manifest':manifest,'ronden':ronden,'documentpixels':{'roi':[320,210,1140,950],'cursorzone':[491,347,496,366],'afwijkend':0,'grens':'Alleen deze documentuitsnede; geen volledige UI-pariteit.'},'python_geslaagd':113,'besluit':'Alle 69/75 vervolgaanvragen passen exact op het native hergebruikfilter. Geen rechtstreekse reused-vlag, cachetrefferteller of volledige oorzaak gemeten. Geen snelheidsacceptatie of productiepatch.','grenzen':['Eigen Linux-testomgeving, één eigen documentkopie per ronde.','Andere compiler actief; geïnstrumenteerde rasterduur is geen snelheidsvergelijking.','Geen nieuwe bewaar-, heropen-, grote plak-, multi-document-, platform- of editieacceptatie.','Oude workertraps en lijstbewaarfout niet opgelost.','Geen nieuwe release/devdownload of volledige Rust-interface.'],'volgende_stap':'Dezelfde echte GUI-bron reconstrueren in de afzonderlijke replicaproef en cachetreffers/budget meten; SDK-publicatie/tekenen/groepering apart profileren. Het ontbreken van bronhergebruik niet opnieuw als onbewezen hoofdoorzaak aannemen.','bestanden':bestanden}
    (REPO/'docs/tests/2026-11-06-writer-bronhergebruik.json').write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n')
    print('Gecontroleerd:',len(bestanden),'bewijsbestanden; twee exacte bron- en documentuitsneden.')
if __name__=='__main__':main()
