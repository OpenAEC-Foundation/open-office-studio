from pathlib import Path
import json,hashlib
from PIL import Image
w=Path('.local/controle-2026-10-31');g=w/'gui-alpha45-release-bewaarmelding';v=json.loads((g/'rapport.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert v['expliciet_gestopt'] and v['programma_eindcode']==-15 and len(v['stappen'])==19
assert v['begindata_sha256']=='c39c8cc6be54c175c037be585534c9faa6710521528fd15bbe57f2a796adad13'
assert v['extern_sha256']==v['einddata_sha256']=='6557b2566ef7b95500c6b4d33108466092c8327563181f9004865e84b9e153d1'
for s in v['stappen']:
 p=g/s['beeld']['bestand'];assert sha(p)==s['beeld']['sha256'] and Image.open(p).size==(1440,900)
assert sha(g/'Eigen-derde-document.docx')==sha(Path('docs/voorbeelden/Ontwerpnotitie.docx'))
voor=sha(g/'notitie-actief.png');fout=sha(g/'notitie-eigen-bewaarfout-vastgelegd.png');terug=sha(g/'notitie-bewaarmelding-na-terugkeer.png');assert voor!=fout==terug
vast=json.loads((w/'native-alpha45-ci-linux-vast/herkomst.json').read_text());assert v['programma_sha256']==vast['programmas']['open-office-studio-native']['sha256']
term=json.loads((w/'native-alpha45-release-bewaarmelding-terminalstatus.json').read_text());assert term['exitcode']==0
uit={'geslaagd':True,'stappen':19,'versie':'2026.45.0-alpha.45','bouwronde':'41389707284','programma_sha256':v['programma_sha256'],'eigenaar_broncommit':'68cd58986ea422bfe023f947fccf3ff7c473e94d','volledig_frame_voor_fout':voor,'volledig_frame_met_fout':fout,'volledig_frame_na_terugkeer':terug,'extern_gewijzigde_bron_niet_overschreven':True,'writer_bron_bytegelijk':True,'omvang':'Werkelijke geoptimaliseerde Linux-CI-build, in een eigen Xvfb/D-Bus/XDG-profiel. Dezelfde negentien stappen als de debugproef. Volledige PNGs, zonder uitsneden of maskers. Gerichte foutbehoudproef; geen snelle-toets/tab-eigendomscontrole, fysieke andere OS- of installatieacceptatie en geen oorspronkelijke functie-/pixelpariteit.'}
(w/'native-alpha45-release-bewaarmelding-controle.json').write_text(json.dumps(uit,ensure_ascii=False,indent=2)+'\n');print(json.dumps(uit,ensure_ascii=False))
