from pathlib import Path
import json,hashlib
from PIL import Image
w=Path('.local/controle-2026-10-31');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();uit=[]
for nr in [44,45]:
 g=w/f'gui-alpha{nr}-bewaarmelding-v2';v=json.loads((g/'rapport.json').read_text());assert v['expliciet_gestopt'] and v['programma_eindcode']==-15;assert len(v['stappen'])==19
 assert v['begindata_sha256']=='c39c8cc6be54c175c037be585534c9faa6710521528fd15bbe57f2a796adad13';assert v['extern_sha256']==v['einddata_sha256']=='6557b2566ef7b95500c6b4d33108466092c8327563181f9004865e84b9e153d1'
 for s in v['stappen']:
  p=g/s['beeld']['bestand'];assert sha(p)==s['beeld']['sha256'];im=Image.open(p);assert im.format=='PNG' and im.size==(1440,900)
 assert sha(g/'Eigen-derde-document.docx')==sha(Path('docs/voorbeelden/Ontwerpnotitie.docx'))
 assert json.loads((g/'Bewaarde-notitie.json').read_text())['bron_proef_extern']=='Eigen afzonderlijke bewaarconflictproef'
 voor=sha(g/'notitie-actief.png');fout=sha(g/'notitie-eigen-bewaarfout-vastgelegd.png');terug=sha(g/'notitie-bewaarmelding-na-terugkeer.png');assert voor!=fout
 assert terug==(voor if nr==44 else fout)
 uit.append({'versie':nr,'stappen':len(v['stappen']),'volledige_frame_hash_voor_fout':voor,'volledige_frame_hash_met_fout':fout,'volledige_frame_hash_na_terugkeer':terug,'fout_behouden':nr==45,'extern_gewijzigde_bron_niet_overschreven':True,'writer_bron_bytegelijk':True,'visueel_beoordeeld':'Eigen bewaarfout wordt eerst zichtbaar vastgelegd; Writer toont zijn eigen metadata; terugkeer naar de notitie verliest de fout in alpha44 en behoudt haar in alpha45.','rapport_sha256':sha(g/'rapport.json')})
(w/'native-alpha45-bewaarmelding-controle.json').write_text(json.dumps({'omvang':'Eigen Linux-debugvensters, ieder negentien stappen. De fout ontstaat vóór tabwisseling; deze GUI-proef controleert foutbehoud. Inactieve antwoordvolgordes zijn afzonderlijk in zes Rust-proeven gecontroleerd. Volledige ongewijzigde frames, zonder uitsneden of maskers, vergelijken binnen dezelfde eigen versie. Geen oorspronkelijke suite-/pixel-, fysieke platform- of installatiegoedkeuring.','vergelijkingen':uit,'eerste_samengevoegde_toetsklik':'Geen bewijs voor een notitie-bewaarconflict; Writer meldde Opgeslagen. Opdracht-eigendom bij zeer snelle toetsen/tabwissels blijft afzonderlijk te onderzoeken.'},ensure_ascii=False,indent=2)+'\n');print({'vensterstappen':38,'afgekeurde_alpha44_herhaling':True,'gecorrigeerde_alpha45_herhaling':True,'bronnen_behouden':True})
