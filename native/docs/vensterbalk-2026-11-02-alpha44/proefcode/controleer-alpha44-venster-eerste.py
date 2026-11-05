from pathlib import Path
import hashlib,json
from PIL import Image
r=Path.cwd();w=r/'.local/controle-2026-10-31';g=w/'gui-alpha44-vensterbalk-v3';d=json.loads((g/'rapport.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert d['expliciet_gestopt'] and d['programma_eindcode']==-15
assert d['begindata_sha256']==d['einddata_sha256']=='c39c8cc6be54c175c037be585534c9faa6710521528fd15bbe57f2a796adad13'
for s in d['stappen']:
 p=g/s['beeld']['bestand'];assert sha(p)==s['beeld']['sha256'];im=Image.open(p);assert im.format=='PNG' and im.size==(1440,900)
 assert s.get('bron_sha256',d['begindata_sha256'])==d['begindata_sha256']
assert (g/'Bewaarde-notitie.json').read_bytes()==(g/'Notitie-vensterbalk.json').read_bytes()
v=json.loads((g/'Notitie-vensterbalk.json').read_text());assert v['boeken'][0]['secties'][0]['paginas'][0]['gemaakt']=='2026-11-02T01:23:39.037Z'
her=json.loads((g/'derde-bronherkomst.json').read_text());assert sha(Path(her['bron']))==sha(Path(her['eigen_kopie']))==her['sha256']
from zipfile import ZipFile
from xml.etree import ElementTree
with ZipFile(her['eigen_kopie']) as z:
 xml=ElementTree.fromstring(z.read('word/document.xml'));assert 'Ruimte voor ideeën.' in ''.join(xml.itertext())
# Handmatige visuele beoordeling van de volledige ongewijzigde PNGs; deze
# booleans zijn gericht op de beschreven Linux-debugproef, geen pixelpariteit.
beoordeeld={n:sha(g/(n+'.png')) for n in ['instellingen-open','opslaan-als-afgerond','laatste-tab-gesloten-gereed','bewaarde-notitie-heropend','middelste-notitie-actief','middelste-notitie-behouden-na-sluiten-links','writer-tab-metadata','writer-zonder-panelen','writer-panelen-hersteld','notitie-na-sluiten-writer','start-met-gereed']}
uit={'omvang':'Eigen daadwerkelijk gebouwde Linux-debug-GUI, geen volledige suite-, oorspronkelijke pixel-, fysieke platform- of installatiegoedkeuring. De opnamen direct na sommige opdrachten bevatten nog het vorige frame; de afzonderlijke wachtopnamen tonen het afgeronde beeld. Na GTK-dialogen is focus expliciet gekozen in de eigen Xvfb zonder windowmanager.','stappen':len(d['stappen']),'expliciet_gestopt':True,'programma_eindcode':d['programma_eindcode'],'wrapper_exitcode':0,'bron_en_opgeslagen_kopie_bytegelijk':True,'derde_documentbron_bytegelijk':True,'tijdstempel_behouden':True,'vensterbalk_acties_visueel_beoordeeld':['Thema wisselen','Instellingen openen/sluiten','Opslaan als via GTK','Openen via GTK','Opslaan','Panelen wisselen/herstellen'],'tabblad_acties_visueel_beoordeeld':['Laatste document sluiten geeft Gereed','Middelste notitie tussen drie documenten selecteren','Links sluiten bewaart actieve notitie','Writer-tab toont eigen titel en status','Actieve Writer sluiten activeert notitie','Laatste notitie sluiten geeft Gereed'],'beoordeelde_volledige_beelden':beoordeeld,'eerste_pogingen':[{'map':'gui-alpha44-vensterbalk','afgesloten':False,'reden':'Geen interactieve stdin: proef na eerste beeld beëindigd.'},{'map':'gui-alpha44-vensterbalk-v2','afgesloten':False,'reden':'Testhelper telde de GTK-tooltip als tweede bestandsdialoog; de unieke-focusassertie weigerde terecht. In v3 is alleen een groot eigen dialoogvenster selecteerbaar.'}],'rapport_sha256':sha(g/'rapport.json')}
(w/'native-alpha44-venster-controle.json').write_text(json.dumps(uit,ensure_ascii=False,indent=2)+'\n');print({'stappen':uit['stappen'],'bron_exact':True,'wrapper_exitcode':0})
