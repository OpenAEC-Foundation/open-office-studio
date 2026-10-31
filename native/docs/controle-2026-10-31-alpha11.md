# Native controle, 31 oktober 2026: alpha 11

**2026.44.9-alpha.11** bewaart de Writer-layoutengine tussen paginawissels.
De interface blijft volledig in Rust. Alle tien acceptatiegebieden blijven
open; deze preview is geen volledige of pixelgelijke suitevervanging.

## Begrensde layoutcache

Een nieuwe pagina hoefde in alpha 10 niet volledig gerasterd te worden, maar
de documentengine werd wel opnieuw opgebouwd. Een sessie kan nu dezelfde
engine, afbeeldingsbronnen, fontaanvraag en opgeloste alineaopmaak behouden.
De hele bron blijft gepagineerd; alleen de gevraagde pagina wordt getekend.

Er blijft maximaal één layoutengine per werkdraad bewaard. Documentidentiteit,
de SHA-256 van de daadwerkelijk getekende bron en de generatie van het
fontregister moeten overeenkomen. Bij een verschil wordt de vorige engine
losgelaten vóór de volgende opbouw. Een fout laat geen half opgebouwde cache
achter. Het sluiten van de bijbehorende sessie op de werkdraad ruimt de engine
op; het sluiten van een ander document wist haar niet.

De drie bestaande bewaarde paginabeelden blijven begrensd. Ook een vierde of
latere pagina kan nu de engine hergebruiken. Zelfstandige `Document`-rondgangen
blijven verse berekeningen, zodat de onafhankelijke broncontrole niet toevallig
hetzelfde bewaarde resultaat terugkrijgt. Dit is een verbetering van
paginawissels; het versnellen van de eerste documentopening is hiermee niet
aangetoond.

## Betekenisvolle regressieproeven

Drie nieuwe cacheproeven controleren:

- Zeven bezoeken aan zes pagina's, voorbij de cache van drie beelden. Elke
  pagina heeft exact dezelfde PNG, klikgeometrie, tekstvelden en opmaak als
  een onafhankelijk geopende bron. De engine wordt uitsluitend bij het eerste
  bezoek opgebouwd.
- Een gewist fontregister en een ander document dwingen een nieuwe engine af;
  het sluiten van het vorige document wist de actieve engine niet.
- Bewerken, undo, exacte bronherstelling en een ongeldige bron laten geen oude
  of onvolledige layout achter.

De bestandscontrole heeft daarnaast `--meet-paginas sessie|vers` met een
begrensde expliciete paginavolgorde. Niet-bestaande pagina's worden geweigerd.
Het [meetprogramma](../scripts/meet-paginas.py) voert beide modi in afzonderlijke
processen uit en vergelijkt bron-, PNG-, klikgeometrie- en veldhashes. De eigen
zesbladige bron is opnieuw genereerbaar en onafhankelijk teruggelezen,
inclusief vijf pagina-eindes en de oorspronkelijke kop-/voettekstvarianten.
De CI-matrix voert deze vergelijking op de echte releasecontroleur uit.

## Lokale controles

- **175 reguliere Rust-tests geslaagd**, zes runtimeproeven afzonderlijk.
- **Zeven Python-tests geslaagd**; Rustfmt, Clippy met waarschuwingen als fouten
  en de vastgepinde bronhashcontrole groen.
- DOCX/XLSX/PPTX, formules, Unicode-selecties, stijlerfenis, halve punten,
  secties, velden en kop-/voetteksten onafhankelijk teruggelezen.
- **33 native schermbeelden gerenderd** met de Iced-software-renderer.
  De [13 gedeelde document-PNG's](documentbeelden-2026-10-31-alpha11.json)
  blijven bytegelijk aan alpha 10.
- De zesbladige debugmeting slaagt: alle zeven bezoeken zijn exact gelijk
  tussen verse berekeningen en sessiegebruik. Dit is geen geïsoleerde
  snelheidsbenchmark of bewijs voor alle documenten.

Alle **zes runtimeproeven zijn afzonderlijk geslaagd**, waaronder de volledige
conversiecatalogus en PDF/CSV-export via de interface en werkdraad. De
[onafhankelijke conversiecontrole](conversie-2026-10-31-alpha11-lokaal.json)
bevestigt zes inhoudsrondgangen en drie PDF-handtekeningen. Een eerste losse
runtimeopdracht miste de vereiste uitvoermap `OFFICE_TEST_UIT`; deze opzetfout
is hersteld en de volledige ronde is met een eigen uitvoermap uitgevoerd.
De lokale releasebuild en alle vijf CI-jobs zijn inmiddels afgerond en geslaagd.
Het lokale draagbare pakket is uitgepakt en gecontroleerd: alle **691**
bronbestanden bytegelijk aan het Git-archief van branchcommit
`28c1f96cfe2232fe4a3225ef4da28d5f37de517e`, geldige zip-CRC en SHA-256,
juiste uitgepakte programmaversies en meegeleverde notices. De
[vaste bronregressie](bronregressie-2026-10-31-alpha11-release.json) slaagt
met de lokale releasecontroleur.

## Visuele en functionele grenzen

De [vier volledige schermvergelijkingen](pixelcontrole-alpha11/rapport.json)
met versie 2026-W44.8 blijven rood, met nul tolerantie: Writer **126.880**,
Spreadsheet **595.469**, Presentation **563.544** en Notition **666.024**
afwijkende pixels, telkens op 943.736 pixels. De diagnose gebruikt geen maskers
of herschaling. Ook het documentvlak bevat nog pixelverschillen; alleen
bovenbalken aanpassen zou de vergelijking niet laten slagen.

De [afgeronde alpha-11-platformronde](platformen-2026-10-31-alpha11.json)
bevestigt alle **691** bronbestanden bytegelijk op Linux, Windows en macOS,
beide programmaarchitecturen en 66 exacte native beeldparen. De werkelijke
mergecheckout `66722203c29b77da47c43d33c5e206f058b3c808` heeft dezelfde relevante
Git-bomen als de branchcommit. De zeven paginabezoeken aan de eigen zesbladige
bron zijn ook op [Linux](paginameting-2026-10-31-alpha11-Linux.json),
[Windows](paginameting-2026-10-31-alpha11-Windows.json) en
[macOS](paginameting-2026-10-31-alpha11-macOS.json) exact gelijk tussen verse
en behouden engines. De meetprogrammahash is op elk platform gelijk aan de
werkelijk verpakte controleur.

De [brede releasecorpusronde](corpus-2026-10-31-alpha11-release.json) heeft
**579 geslaagde, 68 geweigerde bronnen en één time-out** uit 648 geselecteerde
OOXML-bestanden. De grens blijft 30 seconden, twee processen en 3 GiB
adresruimte per proces. De bron met 177 pagina's overschrijdt die grens. Alle drie
[grote bronnen slagen apart](grote-bronnen-2026-10-31-alpha11.json) met 120 seconden
en één proces; de overschrijding in de brede ronde blijft geregistreerd.
De overige 918 formaten zijn hiermee niet native getest. Deze ronde is geen
volledige inhouds-, stijl- of functiecontrole.

## Paginameting met grote bronnen

Het gedownloade Linux-CI-pakket is ook lokaal uitgepakt en volledig tegen het
Git-archief gecontroleerd. Met precies die releasecontroleur zijn verse en
behouden paginaberekeningen in afzonderlijke processen vergeleken, inclusief
bezoeken buiten de drie bewaarde beelden en aan de laatste pagina:

| Bron | Bezoeken | Verse berekeningen totaal | Sessie totaal | Exacte beelden, klikgebieden en velden |
| --- | --- | --- | --- | --- |
| [Eigen zesbladige bron](paginameting-2026-10-31-alpha11-klein.json) | 7 | 1.856 ms | 612 ms | gelijk |
| [953 alinea's, 53 pagina's](paginameting-2026-10-31-alpha11-953.json) | 7 | 14.040 ms | 5.098 ms | gelijk |
| [15.935 alinea's, 177 pagina's](paginameting-2026-10-31-alpha11-15935.json) | 7 | 121.882 ms | 31.893 ms | gelijk |

Deze tijden omvatten openen en alle gevraagde paginabezoeken. Er draaiden andere
lokale taken mee; dit zijn geen geïsoleerde benchmarks of vaste
snelheidsgaranties. De grote bron heeft nog 3.058 ms openen en 14.109 ms voor het
eerste sessiebeeld nodig; vervolgbeelden nemen in deze ronde 1.045–2.802 ms.
De meting toont geen volledige inhoudscontrole van alle 177 pagina's.

Directe rijke paginainvoer, volledige ribbons, doorlopende spreadsheetbediening,
presentatieobjecten, automatisch notitieherstel, volledige mailbediening,
database-interface, native installers en fysieke platformproeven blijven open.
Er is geen stabiele native release gemaakt.
