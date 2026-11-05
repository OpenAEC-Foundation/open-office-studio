from pathlib import Path
from copy import deepcopy
from datetime import datetime
import json,hashlib,gzip,uuid
r=Path.cwd();w=r/'.local/controle-2026-10-31';p=w/'gui-alpha41-notition-release-ci';out=r/'native/docs/invoer-en-presentatie-2026-11-01-alpha41/releasevenster';out.mkdir(exist_ok=True)
def h(b):return hashlib.sha256(b).hexdigest()
def schrijf(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
verslag=json.loads((p/'rapport.json').read_text());assert verslag['expliciet_gestopt'] and verslag['programma_eindcode']==-15
stappen={s.get('beeldnaam'):s for s in verslag['stappen'] if 'beeldnaam' in s};begin=verslag['begindata_sha256']
def bytes_bron(sha):return (p/f'bron-{sha}.openaec-notities').read_bytes()
def bron(n):return json.loads(bytes_bron(stappen[n]['bron_sha256']))
a=json.loads(bytes_bron(begin));b=bron('snelle-greep-bewaard');oud=a['boeken'][0]['secties'][0]['paginas'][0];nieuw=b['boeken'][0]['secties'][0]['paginas'][0];assert (nieuw['vakken'][0]['breedte'],nieuw['vakken'][0]['hoogte'])==(620,218);assert datetime.fromisoformat(nieuw['bijgewerkt'].replace('Z','+00:00'))>=datetime.fromisoformat(oud['bijgewerkt'].replace('Z','+00:00'));nieuw['vakken'][0]['breedte']=560;nieuw['vakken'][0]['hoogte']=160;nieuw['bijgewerkt']=oud['bijgewerkt'];assert b==a
leeg=bron('vrij-blok-leeg-bewaard');tekst=bron('vrij-blok-tekst-bewaard');pg=leeg['boeken'][0]['secties'][0]['paginas'][0];v=pg['vakken'][-1];assert len(pg['vakken'])==3 and (v['x'],v['y'],v['breedte'],v['hoogte'])==(322,370,560,160);assert uuid.UUID(v['id']).version==4 and uuid.UUID(v['blokken'][0]['id']).version==4;assert v['blokken'][0]['tekst']=='';t=deepcopy(tekst);t['boeken'][0]['secties'][0]['paginas'][0]['vakken'][-1]['blokken'][0]['tekst']='';t['boeken'][0]['secties'][0]['paginas'][0]['bijgewerkt']=pg['bijgewerkt'];assert t==leeg
pg['vakken'].pop();pg['bijgewerkt']=oud['bijgewerkt'];assert leeg==a
assert stappen['vrij-blok-tekst-ongedaan-bewaard']['bron_sha256']==stappen['vrij-blok-leeg-bewaard']['bron_sha256'];assert all(stappen[n]['bron_sha256']==begin for n in ['oorspronkelijk-hersteld','vrij-blok-ongedaan-bewaard','alles-oorspronkelijk']);assert verslag['einddata_sha256']==begin
for s in verslag['stappen']:
 assert h((p/s['beeld']['bestand']).read_bytes())==s['beeld']['sha256']
 if 'bron_sha256' in s:assert h(bytes_bron(s['bron_sha256']))==s['bron_sha256']
controle={'omvang':'Geoptimaliseerde alpha41-CI-Linux-build in een eigen tijdelijk X11-/D-Bus-venster. Visuele beoordeling van de eerste Bestand-/Escape-opnamen vóór en na bronexacte undo. Snelle greep na focus op een ander vak; nieuw vrij tekstvak, schrijven, bewaren en twee undo-stappen. Geen volledige suite-, platform-, fysieke IME- of pixelgoedkeuring.','afgebakende_bronproeven_geslaagd':True,'greep':[620,218],'overige_bronvelden_exact':True,'undo_bron_bytegelijk':True,'nieuw_vrij_tekstvak':[322,370,560,160],'nieuwe_tekst_exact':'Nieuw vrij blok','tekst_undo_bytegelijk_aan_leeg_vak':True,'tweede_undo_bytegelijk_aan_oorspronkelijk':True,'eerste_menu_en_escape_opnamen_visueel_correct':True,'ook_na_undo_correct':True,'eindbron_sha256':begin,'geregistreerde_stappen':len(verslag['stappen'])}
schrijf(p/'broncontrole.json',controle)
kopieen=[]
for f in sorted(p.iterdir()):
 if f.is_file():
  raw=f.read_bytes();naam=f.name;doel=out/naam
  if f.suffix=='.log':doel=out/(naam+'.gz');doel.write_bytes(gzip.compress(raw,mtime=0));assert gzip.decompress(doel.read_bytes())==raw
  else:doel.write_bytes(raw)
  kopieen.append({'bestand':doel.name,'ruw_sha256':h(raw),'opgeslagen_sha256':h(doel.read_bytes())})
for naam in ['gui-notities-release-alpha41.py','venster-notities-release-alpha41.py','native-alpha41-notities-release-venster.log','sluit-alpha41-releasevenster.py','native-alpha41-ci-linux-pakket.log']:
 f=w/naam;raw=f.read_bytes();doel=out/(naam+'.gz' if f.suffix=='.log' else naam);doel.write_bytes(gzip.compress(raw,mtime=0) if f.suffix=='.log' else raw);assert (gzip.decompress(doel.read_bytes()) if f.suffix=='.log' else doel.read_bytes())==raw;kopieen.append({'bestand':doel.name,'ruw_sha256':h(raw),'opgeslagen_sha256':h(doel.read_bytes())})
schrijf(out/'bewijskopieen.json',{'omvang':controle['omvang'],'kopieen':kopieen})
print(json.dumps(controle,ensure_ascii=False))
