from pathlib import Path
import json,hashlib
from PIL import Image
r=Path.cwd();w=r/'.local/controle-2026-10-31';p=w/'gui-alpha46-writer-menu';d=json.loads((p/'rapport.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert d['expliciet_gestopt'] and len(d['stappen'])==19
assert d['programma_sha256']==json.loads((w/'native-alpha46-debug-vast/herkomst.json').read_text())['programmas']['open-office-studio-native']['sha256']
for s in d['stappen']:
 f=p/s['beeld']['bestand'];assert sha(f)==s['beeld']['sha256'];assert Image.open(f).size==(1440,900);assert s.get('bron_sha256',d['begindata_sha256'])==d['begindata_sha256']
assert d['einddata_sha256']==d['begindata_sha256']==sha(p/'Bewaarde-notitie.json')
assert sha(p/'Eigen-derde-document.docx')==sha(r/'docs/voorbeelden/Ontwerpnotitie.docx')
# Alleen vlakke achtergrondkleuren vaststellen; geen uitgeknipte vergelijking,
# masker of oorspronkelijke pixelgoedkeuring. De volledige vensters blijven bewaard.
for beeld,kleur in [('bestand-open-rustig.png',(255,255,255)),('bestand-donker-rustig.png',(54,54,62))]:
 im=Image.open(p/beeld).convert('RGB');assert im.getpixel((700,90))==kleur
uit={'geslaagd':True,'versie':'2026.45.0-alpha.46','stappen':19,'programma_sha256':d['programma_sha256'],'writer_en_notitie_bron_bytegelijk':True,'visueel_beoordeeld':['bestand-open-rustig.png','bestand-donker-rustig.png','instellingen-donker-rustig.png','writer-terug-licht-rustig.png'],'omvang':'Eigen Linux-debugvenster. Bestand bedekt het documentlint in lichte en donkere modus; Escape keert terug. Instellingen bedekt de volledige app met een overlay en sluit via Escape. Terug naar licht blijft bewaard in een eigen profiel. Dit zijn gerichte GUI-waarnemingen, geen volledige functie-, pixel- of platformacceptatie.'}
(w/'native-alpha46-writer-menu-controle.json').write_text(json.dumps(uit,ensure_ascii=False,indent=2)+'\n');print(json.dumps(uit,ensure_ascii=False))
