"""Leid wandtijden af uit complete, bronexacte eigen GUI-proeven."""
from pathlib import Path
import collections,json
ROOT=Path(__file__).resolve().parents[3]
UIT=ROOT/'.local/doorwerk-2026-11-06/wachtrijmeting'
def analyse(p):
    r=json.loads(p.read_text());assert r['geslaagd'] and r['broncontrole']=={'verhalen':1537,'alinea_en_celteksten':3329,'exact':True}
    assert not any(r['fouten_na'].values())
    m=r['wachtrijmeting'];e=m['regels'];assert m['gemist']==0 and m['toetsen']==351
    taken=[];admit=[x for x in e if x['soort']=='toelaten'];native=[x for x in e if x['soort']=='nativebegin']
    assert len(admit)==len(native)==len(m['invoerfasen']['monsters']);assert sum(x['tekens']for x in native)==351
    for a in admit:
        id=a['id'];events=[x for x in e if x['taak']==id]
        def één(soort):
            gevonden=[x for x in events if x['soort']==soort];assert len(gevonden)==1,(id,soort);return gevonden[0]
        begin=één('taakbegin');einde=één('taakeinde');n=één('nativebegin');j=één('nativejson');assert einde['goed'] and not j['retryFull']
        selectie=[x for x in events if x['soort']=='methodeeinde'and x['naam']=='setSelection'];assert len(selectie)==1
        taken.append({'id':id,'toelaten_ms':a['t'],'begin_ms':begin['t'],'einde_ms':einde['t'],'wacht_ms':begin['t']-a['t'],'duur_ms':einde['t']-begin['t'],'voor_native_ms':n['t']-begin['t'],'native_wand_ms':j['t']-n['t'],'na_native_ms':einde['t']-j['t'],'na_selectie_ms':einde['t']-selectie[0]['t']})
    laatsteToets=max(x['t']for x in e if x['soort']=='toets');laatsteTaak=max(x['einde_ms']for x in taken)
    fasen=m['invoerfasen'];assert not fasen['overgeslagen'] and all(x['uitkomst']=='rust'and x['pogingen']==1 for x in fasen['monsters'])
    for t in taken:assert all(t[k]>=0 for k in ['wacht_ms','duur_ms','voor_native_ms','native_wand_ms','na_native_ms','na_selectie_ms'])
    worker=[x for x in e if x['soort']=='worker'];fontvragen=[x for x in worker if x['richting']=='verzonden'and x['type']=='fontRequirements'];fontantwoorden=[x for x in worker if x['richting']=='ontvangst'and 'requirementsJson'in x['velden']]
    return {'groepen':len(taken),'toetsen':351,'laatste_toets_ms':laatsteToets,'laatste_taak_ms':laatsteTaak,'wachtrij_naloop_ms':laatsteTaak-laatsteToets,'max_diepte_voor_toelating':max(x['diepte']for x in admit),'max_taakwacht_ms':max(x['wacht_ms']for x in taken),'getekende_tekst_ms':r['getekende_tekst_ms'],'tekenen_na_laatste_taak_benadering_ms':r['getekende_tekst_ms']-laatsteTaak,'sommen_ms':{k:sum(x[k]for x in taken)for k in ['duur_ms','voor_native_ms','native_wand_ms','na_native_ms','na_selectie_ms']},'rust_binnen_ms':sum(x['rustBinnenMs']for x in fasen['monsters']),'koppeling_ms':sum(x['duurMs']for x in fasen['monsters']),'koppeling_stappen_ms':dict(collections.Counter({k:sum(x['stappen'].get(k,0)for x in fasen['monsters'])for k in ['cursor','bron','hash','aanvraag','transport','binding','mutatie','selectie']})),'fontvragen':len(fontvragen)if 'lezingen'in m else None,'fontantwoorden':len(fontantwoorden)if 'lezingen'in m else None,'laatste_fontantwoord_ms':max((x['t']for x in fontantwoorden),default=None),'lezingen':m.get('lezingen',{}),'raf_max_tussen_ms':max(x['tussen']for x in m['frames']),'taken':taken,'broncontrole':r['broncontrole'],'grens':'Geïnstrumenteerde wandtijden; geen CPU-seconden, daadwerkelijke FPS of snelheidsvergelijking. Python-rasterstart en WebView-meetstart zijn aparte klokken; naloop van tekenen is een benadering.'}
def main():
    uit={'schema':1,'eerste':analyse(UIT.with_name('wachtrijmeting-eerste')/'gui/profiel.json'),'verdiept':analyse(UIT/'gui/profiel.json')}
    (UIT/'analyse.json').write_text(json.dumps(uit,ensure_ascii=False,indent=2)+'\n');print(json.dumps({n:{k:v for k,v in r.items()if k not in ['taken','lezingen','koppeling_stappen_ms']}for n,r in uit.items()if n!='schema'},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
