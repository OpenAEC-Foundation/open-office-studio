from pathlib import Path
import json,hashlib,datetime
from PIL import Image
r=Path.cwd();w=r/'.local/controle-2026-10-31';p=w/'gui-alpha46-start-documentbalk';d=json.loads((p/'rapport.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert d['expliciet_gestopt'] and len(d['stappen'])==40
assert d['programma_sha256']==json.loads((w/'native-alpha46-debug-vast/herkomst.json').read_text())['programmas']['open-office-studio-native']['sha256']
for s in d['stappen']:
 f=p/s['beeld']['bestand'];assert sha(f)==s['beeld']['sha256'];assert Image.open(f).size==(1440,900)
oud=json.loads((p/('bron-'+d['begindata_sha256']+'.json')).read_text());nieuw=json.loads((p/'Bewaarde-notitie.json').read_text());pg=nieuw['boeken'][0]['secties'][0]['paginas'][0];assert pg['titel']=='Vrije notitie bewaard bij Start'
oud['boeken'][0]['secties'][0]['paginas'][0]['titel']=pg['titel'];oud['boeken'][0]['secties'][0]['paginas'][0]['bijgewerkt']=pg['bijgewerkt'];assert oud==nieuw
moment=datetime.datetime.fromisoformat(pg['bijgewerkt'].replace('Z','+00:00'));assert datetime.datetime.fromisoformat(d['systeem_utc_start'])<=moment<=datetime.datetime.fromisoformat(d['systeem_utc_eind'])
assert sha(p/'Eigen-derde-document.docx')==sha(r/'docs/voorbeelden/Ontwerpnotitie.docx')
beelden=['writer-blijft-actief.png','writer-terug-rustig.png','writer-plus-terug-rustig.png','notities-expliciet-gestopt.png'];assert len({sha(p/b) for b in beelden})==1
m=json.loads((w/'native-alpha46-hertest-testbron.json').read_text())
for n,h in m.items():assert sha(r/n)==h,n
uit={'geslaagd':True,'versie':'2026.45.0-alpha.46','stappen':40,'eigen_testscherm':d['testscherm'],'programma_sha256':d['programma_sha256'],'proefbron_sha256':d['proefbron_sha256'],'notitie_bewaard':True,'alleen_titel_en_tijd_gewijzigd':True,'writer_bron_bytegelijk':True,'writer_terugkeer_volledig_frame_bytegelijk':beelden,'bronbestanden_bytegelijk':len(m),'omvang':'Gerichte eigen Linux-debugvensterproef. Start via tab, merk en plus; behoud van onbewerkte titel, sluiten vanaf Start met eigen doel, annuleren, toepassen en werkelijk bewaren; systeemdialoog met expliciete eigen focus; sluiten inactieve notitie behoudt Writer en terugkeer geeft exact hetzelfde volledige frame. Eerste frames na 0,6 seconde zijn soms verouderd; afzonderlijke beelden na 2–8 seconden zijn behouden. Geen volledige functie-/pixel- of andere OS-goedkeuring.'}
(w/'native-alpha46-start-documentbalk-controle.json').write_text(json.dumps(uit,ensure_ascii=False,indent=2)+'\n');print(json.dumps(uit,ensure_ascii=False))
