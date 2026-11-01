"""Bewaar afgeronde proeven; ruwe CRLF-bronnen blijven verliesloos gecomprimeerd."""
from pathlib import Path
import hashlib,json,gzip,subprocess
r=Path.cwd();w=r/'.local/controle-2026-10-31';uit=r/'native/docs/notities-2026-11-01-alpha37';uit.mkdir();bestanden={}
def sha(b):return hashlib.sha256(b).hexdigest()
def kopie(p,naam):
 data=p.read_bytes();compressie=p.suffix in ['.log','.eml','.txt','.patch'] and b'\r\n' in data
 q=uit/(naam+('.gz' if compressie else ''));q.parent.mkdir(parents=True,exist_ok=True);assert not q.exists()
 inhoud=gzip.compress(data,mtime=0) if compressie else data;q.write_bytes(inhoud)
 assert (gzip.decompress(q.read_bytes()) if compressie else q.read_bytes())==data
 bestanden[q.relative_to(uit).as_posix()]={'bron':p.relative_to(r).as_posix(),'sha256':sha(inhoud),'bron_sha256':sha(data),'codering':'gzip' if compressie else 'identiek','bron_bytes':len(data)}
for p in sorted(w.glob('native-alpha37-eind-*')):
 if p.is_file():kopie(p,'volledig/'+p.name)
for naam in ['native-na-alpha36-notities-basis-voor.patch','native-na-alpha36-notities-basis-voor.json','native-na-alpha36-notities-basis-voor.log','native-na-alpha36-notities-afkeuring-bronherstel.json','native-alpha37-geteste-bron.patch','native-alpha37-geteste-bron.json','native-alpha37-unicode-voor.json','native-alpha37-notities-unicode-voor.log','native-alpha37-notities-unicode-na.log','native-alpha37-controle-incidenten.json','native-alpha37-herhaling-onderbreking.json','native-alpha37-notities-gericht.log','native-alpha37-definitief-tests.log','native-alpha37-definitief-stuur.log','native-alpha37-herhaling-definitief-tests.log','native-alpha37-herhaling-stuur.log']:
 kopie(w/naam,'onderzoek/'+naam)
for naam in ['opruiming-inactieve-clippy-cache-voor-alpha37.json','opruiming-inactieve-clippy-cache-voor-alpha37-bestanden.json.gz','native-alpha37-ci-linux-pakket.log','native-alpha37-ci-verwerking.log','notities-alpha37-beide-vakken.json','notities-alpha37-zichtbare-formaatgreep-afkeuring.json','notities-alpha37-echte-kaarthoek.json','email-alpha36-eerste-dialoogomgeving.json','email-alpha36-v2-dialoogomgeving.json','email-alpha36-v2-eigen-vensters.json','email-alpha36-v2-testvensterfocus.json','email-alpha36-v2-focus-open.json','email-alpha36-v2-focus-na-heropen.json','email-alpha36-v2-alleen-lezen.json']:
 kopie(w/naam,'overig/'+naam)
for mapnaam in ['native-alpha37-eind-definitief-uitvoer','native-alpha37-eind-runtime-uitvoer','native-alpha37-eind-conversie-uitvoer']:
 for p in sorted((w/mapnaam).rglob('*')):
  if p.is_file():kopie(p,'uitvoer/'+mapnaam+'/'+p.relative_to(w/mapnaam).as_posix())
for mapnaam in ['gui-alpha36-notition-verkenning-ci','gui-alpha36-presentatie-verkenning-ci','gui-alpha36-email-verkenning-ci','gui-alpha36-email-verkenning-ci-v2','gui-alpha37-notition-release-ci']:
 for p in sorted((w/mapnaam).iterdir()):
  if p.is_file():kopie(p,'vensters/'+mapnaam+'/'+p.name)
for naam in ['gui-notities-verkenning-alpha36.py','venster-notities-verkenning-alpha36.py','gui-presentatie-verkenning-alpha36.py','venster-presentatie-verkenning-alpha36.py','gui-email-verkenning-alpha36.py','venster-email-verkenning-alpha36.py','gui-email-verkenning-alpha36-v2.py','venster-email-verkenning-alpha36-v2.py','maak-eigen-emailproef.py','eigen-emailproef.eml','focus-eigen-testvenster.py','gui-notities-release-alpha37.py','venster-notities-release-alpha37.py','controle-alpha37-eind.py','finaliseer-alpha37.py','gui-alpha36-email-v2-sessie.log','gui-alpha37-notities-ci-sessie.log']:
 kopie(w/naam,'proefbron/'+naam)
for n in [36,37]:kopie(w/f'native-alpha{n}-ci-linux-vast/herkomst.json',f'programmas/alpha{n}-ci-linux.json')
kopie(Path(__file__).resolve(),'documenteer-alpha37.py')
(uit/'bewijskopieen.json').write_text(json.dumps({'bestanden':bestanden,'omvang':'Alle afgebeelde bronbestanden zijn rechtstreeks gekopieerd. Ruwe CRLF-logboeken en de MIME-bron zijn als gzip bewaard om Git-regelafbrekingsnormalisatie te vermijden; decompressie levert exact de oorspronkelijke bytes. Geen profiel- of sleutelbestanden gekopieerd.'},ensure_ascii=False,indent=2)+'\n')
(uit/'LEESMIJ.md').write_text('''# Notities en aanvullende vensterproeven: alpha 37

De productiebron is `09d787f8a86acaab5c54d94448c5971baf978b85`. De volledige ronde telt 395 reguliere Rust-tests, 155 UI-tests, zes runtimeproeven en zeven Python-tests. Alle 671 geteste bronbestanden zijn vastgelegd. De onafhankelijke rapportcontrole eindigt met status 0. De terminal meldde na de afgeronde onderliggende controles status 143; die afwijking en de voltooide slotlog blijven afzonderlijk bewaard.

De negen gerichte Notities-proeven slagen na twee aanvankelijke fouten en een aanvullende Unicode-afkeuring. De echte geoptimaliseerde CI-Linux-alpha37-proef bevestigt eerste-klik-invoer in twee tekstvakken, gezamenlijk bewaren, vergroting via de echte kaarthoek, verplaatsen en bronexacte undo. Canvas naar Markdown en terug maakt gevulde kopieën met behoud van de bronsecties.

**De alpha37-vensterproef is afgekeurd.** De zichtbare formaatgreep staat boven de echte kaarthoek en vergroot het vak niet. De 23e geregistreerde handeling, terugklikken naar de Markdownkopie, eindigt in een Rust-panic doordat de editorcache tijdens de paginawissel niet klopt. De twee oorspronkelijke secties en beide opgeslagen kopieën blijven volledig leesbaar. De daaropvolgend ingevoerde proefacties zijn niet uitgevoerd. De pijp naar tee gaf status 0; de onderliggende proef gaf status 1. Dit is geen geslaagde GUI-ronde.

De aanvullende Presentation- en Email-vensters gebruiken bewust de vastgezette alpha36-release. Presentation bewaart gewijzigde diatekst en sprekersnotities; onafhankelijke controle ziet telkens één gewijzigd XML-deel. Bij afzonderlijk voltooide undo en bewaren keert de oorspronkelijke bron bytegelijk terug. Directe diainvoer, automatische selectie na toevoegen en snel opeenvolgend undo/bewaren blijven open. Email bewaart de volledige MIME-bron met bijlage en Unicode bytegelijk in het eigen IFCX-bewaarprofiel. Sluiten, opnieuw openen, tekst kopiëren en alleen-lezeninvoer zijn gecontroleerd. Dit bewijst geen volledige mailclient- of IFCX-semantiek.

De eerste Email-dialoogopstelling activeerde haar eigen portal op het verkeerde scherm. Die eigen bus is gestopt. De herhaling gebruikt korte eigen XDG-paden en werkt de activeringsomgeving van uitsluitend de eigen sessiebus bij. Programma en GTK-backend zijn op hetzelfde eigen Xvfb-scherm en dezelfde bus gecontroleerd. Afzonderlijke vensterfocusstappen zijn vastgelegd; dit zijn geen teksteditorfocusoperaties. Handelingnamen in ruwe logs zijn geen goedkeuringsvlaggen: een sluitpoging met Ctrl+W slaagde niet; sluiten met de kruisjesknop en echt opnieuw openen zijn apart vastgelegd.

`bewijskopieen.json` verbindt iedere kopie met haar oorspronkelijke bytes. Voor bestanden met codering gzip moet eerst worden gedecomprimeerd voordat de bronhash wordt vergeleken. De oude afkeuringen, afgebroken schijfcontrole, onderbroken onderzoeksronde en de nieuwe crash worden niet vervangen door latere geslaagde proeven. Alle dertig migratieacceptaties blijven false.
''')
print(json.dumps({'kopieen':len(bestanden),'bytes':sum((uit/n).stat().st_size for n in bestanden)},ensure_ascii=False))
