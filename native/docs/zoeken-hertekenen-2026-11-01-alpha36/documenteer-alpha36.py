"""Bewaar broncontrole en gerichte ontwikkelvensters zonder releasegoedkeuring."""
from pathlib import Path
import json,hashlib,shutil,gzip
r=Path.cwd();w=r/'.local/controle-2026-10-31';d=r/'native/docs';p=d/'zoeken-hertekenen-2026-11-01-alpha36'
assert (w/'native-alpha36-controleopdracht.log').read_text().endswith('Volledige bron vóór en na de controles bytegelijk.\n')
bron=json.loads((w/'native-alpha36-testbron.json').read_text());assert len(bron)==669
for n,h in bron.items():assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
assert json.loads((w/'native-alpha36-bronherstel.json').read_text())['geslaagd']
assert json.loads((w/'native-na-alpha35-momenten-bronherstel.json').read_text())['geslaagd']
assert json.loads((w/'gui-alpha35-writer-schaduw-gereed2-prototype/rapport.json').read_text())['geslaagd']
assert json.loads((w/'native-na-alpha35-schaduw-geladen-vensterpixelcontrole.json').read_text())['pixelgelijk']
p.mkdir();kopieen={}
def kopie(a,b):
 assert a.is_file();b.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(a,b);h=hashlib.sha256(a.read_bytes()).hexdigest();assert hashlib.sha256(b.read_bytes()).hexdigest()==h
 kopieen[b.relative_to(p).as_posix()]={'bron':a.relative_to(r).as_posix(),'sha256':h}
for a in sorted(w.glob('native-na-alpha35-*')):
 if a.is_file() and a.suffix in ['.log','.patch','.json','.png']:kopie(a,p/a.name)
for a in sorted(w.glob('native-alpha36-*')):
 if a.is_file() and a.suffix in ['.log','.patch','.json']:kopie(a,p/a.name)
for naam in ['controle-alpha36-definitief.py','finaliseer-alpha36.py','documenteer-alpha36.py','audit-alpha36.py','verifieer-alpha36-bron.py','verifieer-alpha36-momenten.py','gui-writer-alpha36-ci.py','venster-writer-alpha36-ci.py','zet-ci36-vast.py','ruim-oude-diagnosekopieen-alpha35.py','opruiming-oude-diagnosekopieen-alpha35.json','ruim-diagnosekopieen-tijdens-alpha36.py','opruiming-diagnosekopieen-tijdens-alpha36.json','ruim-oude-incrementele-cache-voor-alpha36.py','opruiming-oude-incrementele-cache-voor-alpha36.log']:
 kopie(w/naam,p/naam)
for a in sorted(w.glob('*prototype.py')):
 if a.name.startswith(('gui-heropen','venster-heropen','bouw-aanwijs','bouw-schaduw','gui-writer-alpha35','venster-writer-alpha35')):kopie(a,p/a.name)
for naam in ['gui-alpha35-writer-debug','gui-alpha35-writer-cursorcontrole-debug','gui-alpha35-writer-ci','gui-alpha35-writer-herkomst-prototype','gui-alpha35-writer-heropen-prototype','gui-alpha35-writer-heropen-aanwijs2-prototype','gui-alpha35-writer-heropen-aanwijs3-prototype','gui-alpha35-writer-heropen-aanwijs4-prototype','gui-alpha35-writer-heropen-aanwijs4-stapel-prototype','gui-alpha35-writer-heropen-aanwijs4-quad-prototype','gui-alpha35-writer-heropen-schaduw-prototype','gui-alpha35-writer-schaduw-prototype','gui-alpha35-writer-schaduw-gereed-prototype','gui-alpha35-writer-schaduw-gereed2-prototype','gui-alpha35-writer-heropen-aanwijs4-gereed-prototype','gui-alpha35-writer-heropen-schaduw-gereed-prototype','gui-alpha36-writer-ci']:
 a=w/naam;assert a.is_dir()
 for f in sorted(a.iterdir()):
  assert f.is_file()
  if f.suffix in ['.log','.json','.png','.docx']:kopie(f,p/naam/f.name)
for naam in ['native-na-alpha35-herkomst-debug-vast','native-na-alpha35-aanwijs-debug-vast','native-na-alpha35-aanwijs2-debug-vast','native-na-alpha35-aanwijs3-debug-vast','native-na-alpha35-aanwijs4-debug-vast','native-na-alpha35-schaduw-debug-vast','native-alpha36-ci-linux-vast']:
 kopie(w/naam/'herkomst.json',p/naam/'herkomst.json')
for naam in ['gui-writer-alpha36-lokaal.py','venster-writer-alpha36-lokaal.py','vensters-alpha36-lokaal.py','gui-writer-lijsten-alpha36.py','venster-writer-lijsten-alpha36.py','gui-writer-stijlen-alpha36-hulpgherstel.py','venster-writer-stijlen-alpha36-hulpgherstel.py','gui-schaars-alpha36.py','venster-schaars-alpha36.py','gui-bestand-alpha36.py','venster-bestand-alpha36.py','controleer-gui-lijsten-alpha36.py','controleer-gui-stijlen-alpha36.py','controleer-writer-alpha36-ci.py','controleer-writer-alpha36-lokaal.py','verifieer-alpha36-release.py','corpus-alpha36-ci.py','ruim-schaduwprototype-na-ci36.py','opruiming-schaduwprototype-na-ci36.json']:
 kopie(w/naam,p/naam)
for naam in ['gui-alpha36-writer-lokaal','gui-alpha36-writer-lijsten-ci','gui-alpha36-writer-lijsten-lokaal','gui-alpha36-writer-stijlen-hulpgherstel-ci','gui-alpha36-writer-stijlen-hulpgherstel-lokaal','gui-alpha36-schaars-ci','gui-alpha36-schaars-lokaal','gui-alpha36-bestand-ci','gui-alpha36-bestand-lokaal']:
 for f in sorted((w/naam).iterdir()):
  assert f.is_file()
  if f.suffix in ['.log','.json','.png','.docx','.xlsx']:kopie(f,p/naam/f.name)
kopie(w/'native-alpha36-vast-lokaal/herkomst.json',p/'native-alpha36-vast-lokaal/herkomst.json')
a=w/'opruiming-oude-incrementele-cache-voor-alpha36.json';ingepakt=gzip.compress(a.read_bytes(),mtime=0);assert gzip.decompress(ingepakt)==a.read_bytes();(p/(a.name+'.gz')).write_bytes(ingepakt)
(p/'cacheopruiming.json').write_text(json.dumps({'bron_sha256':hashlib.sha256(a.read_bytes()).hexdigest(),'gzip_sha256':hashlib.sha256(ingepakt).hexdigest(),'omvang':'Alleen oude herbouwbare incrementele caches; volledig register verliesloos bewaard.'},ensure_ascii=False,indent=2)+'\n')
(p/'bewijskopieen.json').write_text(json.dumps({'omvang':'Ongewijzigde ruwe bestanden; oorspronkelijke afkeuringen blijven behouden. Programma’s worden niet meegecommit; hashes en bronherkomst blijven vastgelegd. Verwijderde niet-actieve debugkopieën staan in de afzonderlijke opruimregisters.','bestanden':kopieen},ensure_ascii=False,indent=2)+'\n')
(p/'LEESMIJ.md').write_text('''# Zoekherkomst en hertekenen, alpha 36

De echte alpha-35-Writer-route faalt lokaal in het ontwikkelprofiel en in de geoptimaliseerde CI-Linux-bouw. Drie aanvullende widgetproeven tonen twee openingsfocusfouten wanneer meerdere gebeurtenissen vóór de berichtafhandeling binnenkomen. Eén positieve zoek-/vervanginvoerproef slaagt al vóór de correctie. Alpha 36 bewaart daarom het invoergeneratiestempel van de oorspronkelijke widgetgebeurtenis; een latere paginaklik kan niet haar identiteit aan de eerdere focusvraag uitlenen.

De eerste gecorrigeerde ontwikkelbouw slaagt voor zoeken, directe vervolginvoer en bronexacte undo, maar faalt later bij heropenen en Home/selecteren/kopiëren. Twee aanvullende heropenproeven slagen in de testharnas, ook met wachtende navigatie. De echte werkdraad geeft na ongeveer 20–25 milliseconden de juiste cursor terug; de interface blijft vervolgens schaduwen rasteren. De ruwe stapelopnamen, tijdelijke diagnosepatches en negatieve vensters blijven bewaard. Tijdelijke diagnosecode maakt geen deel uit van de uiteindelijke bron.

De schaduwberekening gebruikt nu alleen het actuele fysieke hertekengebied en de pixelbuffer, met dezelfde globale monsterposities. Bestaande vier-schaalproeven en een extra proef met fractionele deelgebieden bewaken exacte pixels. Drie volledige, werkelijk geladen 1440×900-vóór-/nabeelden hebben nul afwijkende pixels. Een eerdere vergelijking bevatte een laadscherm en blijft afgekeurd als pixelbewijs. De gereedheidscontrole kon tekst op het startscherm herkennen; de aangescherpte controle verlangt de witte documentpagina, eigen koptekst en rijke alinea. Een aanvankelijk witcontrolepunt op tabeltekst is met vastgelegd screenshotbewijs naar een lege plek verplaatst; functionele en broneisen zijn niet afgezwakt.

Het vastgelegde ontwikkelprototype slaagt op elf echte Linux-vensterstappen: splitsen, bewaren, lintopmaak, directe invoer, bronexacte undo, zoeken sluiten, vervolginvoer, nogmaals undo, schoon sluiten en heropenen met systeemklembord. De afzonderlijke heropenproef slaagt op zes stappen. Een onafhankelijke bestandslezer bevestigt vet/cursief, de rijke alinea, tabel, twee secties en koptekst. Dit zijn ontwikkelproeven op een exact vastgelegde bronpatch, geen alpha-36-releasevenstergoedkeuring. De latere geoptimaliseerde lokale en CI-Linux-alpha-36-bouwen slagen ieder op 61 gerichte vensterstappen: elf Writer-structuur-/focusstappen, negentien lijststappen, twintig stijlstappen, zes schaarse-rasterstappen en vijf bestandsschermstappen. Hun afzonderlijke rapporten en ruwe volledige beelden blijven aan programmaversie en broncommit gekoppeld.

De volledige alpha-36-bronronde telt 388 reguliere Rust-tests, waaronder 151 UI-tests, zes runtimeproeven en zeven Python-tests. Formatteringscontrole, Clippy met waarschuwingen als fouten, bronpins en onafhankelijke lezers moeten alle slagen vóór dit rapport wordt geschreven. Alle 669 bronbestanden blijven vóór en na de ronde bytegelijk. Negen eerdere onderzoeksmomenten en de uiteindelijke bron zijn buiten de werkboom uit hun basiscommit en binaire patch hersteld en op alle bronhashes gecontroleerd.

Een extra byte-eis voor alle ZIP-delen buiten document.xml faalt: de kop-/voettekstwrappers worden bij bewaren herschreven. Hun volledige binnen-XML blijft bytegelijk; de oorspronkelijke naamruimtebetekenissen en tekst blijven onafhankelijk gecontroleerd. Deze inhoudscontrole vervangt de oorspronkelijke byteafkeuring niet.

Volledige oorspronkelijke functie-, test- en UI-pariteit, echte releasevensters op alle platforms en native installers blijven open. De migratieacceptatie wordt hierdoor niet op voltooid gezet.
''')
print('Ongewijzigde bewijskopieën:',len(kopieen),flush=True)
