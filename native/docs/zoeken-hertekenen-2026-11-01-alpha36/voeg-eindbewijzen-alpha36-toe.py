"""Voeg uitsluitend reeds afgesloten aanvullende bewijsbestanden toe."""
from pathlib import Path
import json,hashlib,shutil
r=Path.cwd();w=r/'.local/controle-2026-10-31';p=r/'native/docs/zoeken-hertekenen-2026-11-01-alpha36';m=json.loads((p/'bewijskopieen.json').read_text())
def kopie(a,b):
 b.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(a,b);h=hashlib.sha256(a.read_bytes()).hexdigest();assert hashlib.sha256(b.read_bytes()).hexdigest()==h;m['bestanden'][b.relative_to(p).as_posix()]={'bron':a.relative_to(r).as_posix(),'sha256':h}
for naam in ['actualiseer-alpha36.py','bouw-alpha36.py','verwerk-ci-rapport-november.py','native-alpha36-actualiseren.log','native-alpha36-bewijslogherstel.log','native-alpha36-vensterpixelcontrole.json','proef-kleinkapitalen-voor.py','writer-kleinkapitalen-eigen.docx']:
 kopie(w/naam,p/naam)
kopie(Path(__file__).resolve(),p/Path(__file__).name)
(p/'bewijskopieen.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
visueel={'omvang':'Handmatige inspectie van volledige ruwe echte vensterbeelden; geen maskers of bewerkte referenties. Alleen de genoemde toestanden, geen volledige suite-/pixelpariteit.','beoordeeld':['gui-alpha36-writer-ci/writer-vet-heropend.png','gui-alpha36-writer-lokaal/writer-vet-heropend.png','gui-alpha36-writer-lijsten-ci/lijsten-rustig-1.png','gui-alpha36-writer-stijlen-hulpgherstel-ci/stijl-rustig-1.png','gui-alpha36-bestand-ci/bestand-open.png','gui-alpha36-bestand-ci/bestand-terug.png','gui-alpha36-schaars-lokaal/schaars-heropend.png'],'bevindingen':['De heropende 9 is geselecteerd; de lintbediening is hervat.','Nummering, rijke runs en stijlkeuze blijven zichtbaar.','Het bestandsscherm toont geen documentribbon ervoor; Escape herstelt de documentpagina.','Rijkop 1000000 staat op één regel; de bewaarde celwaarde is zichtbaar.']}
(p/'visuele-beoordeling.json').write_text(json.dumps(visueel,ensure_ascii=False,indent=2)+'\n')
lees=p/'LEESMIJ.md';s=lees.read_text();s+='\nZes volledige rustige vensterparen van lijsten en stijlen zijn ook tussen de lokale en CI-Linux-release pixelgelijk, telkens over alle 1.296.000 pixels. De afzonderlijke oorspronkelijke browser- en desktopvergelijkingen blijven afgekeurd.\n';lees.write_text(s)
print('Afgesloten eindbewijzen toegevoegd:',len(m['bestanden']))
