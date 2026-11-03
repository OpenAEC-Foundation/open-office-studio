# Afzonderlijke Rust-plakbatch

De nieuwe [reproduceerbare Rust-proef](../../native/onderzoek/writer-plakbatch/README.md)
bereidt een complete gestructureerde plakactie voor als één transactie op een
afzondelijke replica. De bestaande suite gebruikt deze route nog niet. Dit is
een gecontroleerde implementatiestap naar de gedeelde Rust-kern, geen oplossing
van de ernstige Writer-vertraging of de open stabiliteitsafkeuringen.

## Behoud en foutafhandeling

De vastgelegde lokale bouw, twee Rust-tests, 27 SDK-vergelijkingen, acht
negatieve aanvragen en de grote bronproef slagen. De 27 gevallen controleren
alle verhalen/opmaak/alinea-identiteiten, cursor, bronexacte undo/redo, alle
uitgepakte DOCX-onderdelen en tekst na heropenen. Zij bevatten Unicode, meerdere
alinea's, cellen, geneste tabellen, afbeeldingen, hyperlinks, bladwijzers en
bijgehouden wijzigingen. Bij beide bewaarroutes staat uitsluitend het automatisch
wijzigen van de documentdatum uit; geen pakketonderdeel wordt overgeslagen.
Ongeldige aanvragen, inclusief een fout na een eerste geldige alinea, leveren
geen gedeeltelijke uitvoerdelta op.

De grote eigen bron wordt verdubbeld van 128 naar 256 tabellen, van 897 naar
1.793 bodyalinea's en van 769 naar 1.537 verhalen. De cursor, alle opmaak en
identiteiten en de gehele geschiedenis zijn gelijk aan de bestaande SDK-route.
Alle veertien uitgepakte DOCX-onderdelen zijn bytegelijk; zelfs de volledige
opgeslagen DOCX-bestanden hebben dezelfde SHA-256. Na heropenen zijn alle
verhaalteksten langs hun structurele tabel-/celpaden gelijk. De proef verifieert
dat werkelijk ieder verhaal wordt bereikt.

Een nieuwe DOCX-opening hoeft de interne celverhaalnamen van de oude sessie
niet te behouden. De eerste grote testopstelling verwachtte dat ten onrechte
en faalde op een niet-gevonden celverhaal. Het eerdere rapport blijft bewaard;
de definitieve controle volgt ieder echt tabel-/celpad, zonder verhalen weg te
laten. Dit was een fout in de nieuwe proefopstelling, geen gerepareerde
productfout. Een andere directe vergelijking vond een afwijkende positietelling
bij een ingesloten stringwaarde in de experimentele leesroute. Die is
gecorrigeerd en blijft als regressiegeval in de Rust-test aanwezig.

## Snelheid en architectuur

Het eerdere [native plakprofiel](writer-plakprofiel.md) wees vooral naar de vele
losse structurele invoegingen op de hoofdthread. De nieuwe proef gebruikt dezelfde
inhoudelijke invoegregels, maar één transactie en kleinere tijdelijke lezingen.
Het zoeken naar alineamarkeringen en het dragen van bladwijzers kopiëren geen
hele verhaalteksten meer.

De losse een-transactie-ontwikkelproeven vragen aanvankelijk 29.943 ms en na de
leeswijzigingen 16.840 ms. De definitieve reproduceerbare grote proef vraagt
16.856 ms voor de native voorbereiding; de SDK-gegevensbewerking vraagt
27.252 ms. Die laatste twee metingen gebruiken verschillende runtimes en brug-/
kopieerkosten. Er is geen ABBA-reeks, geen algemene prestatiewinst en geen
GUI-snelheidsacceptatie. Zeventien seconden is bovendien nog steeds te traag
voor de gewenste gebruikerservaring.

De Rust-code bereidt een delta voor op een kopie. Een desktopaansluiting moet
daarna de documentidentiteit, bronversie en geordende invoer bewaken en de delta
als lokale bewerking met geschiedenis overnemen. Alleen een achtergrondtaak
starten of de interface blokkeren is daarvoor niet voldoende. Die aansluiting,
haar echte GUI-proeven en verdere schaalbaarheid zijn de volgende stappen.

## Reproduceerbaarheid en grenzen

Het afzonderlijke pakket bevat bronhash-gebonden patches, een voorbereider die
uitsluitend eigen bibliotheekkopieën wijzigt, de testbron en alle testprogramma's.
De [aparte CI-route](../../.github/workflows/writer-rust-plakbatch.yml) bouwt en
controleert die proef zonder iets uit te geven; haar eerste uitvoering moet na
push nog afzonderlijk worden beoordeeld. De normale native werkruimte en de
geïnstalleerde suite zijn niet door deze proef vervangen.

De [gegevens](2026-11-03-writer-rust-plakbatch.json) binden de geteste bron,
binary, oorspronkelijke bronkopie en rapporten op checksum. De volledige
upstream-tests zijn niet uitgevoerd; sommige bronfixtures ontbreken in de
gepubliceerde registerpakketten. Kop-/voetteksten, noten, opmerkingen/ankers,
volledige corpusgrenzen, echte invoer-/selectie-/bewaarvolgorde en platformen
blijven open. Geen issue of volledige migratievlag wordt hiermee gesloten.
