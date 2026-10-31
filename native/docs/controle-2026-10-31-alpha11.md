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
De lokale releasebuild en nieuwe platformronde zijn nog niet afgerond.

## Visuele en functionele grenzen

De [vier volledige schermvergelijkingen](pixelcontrole-alpha11/rapport.json)
met versie 2026-W44.8 blijven rood, met nul tolerantie: Writer **126.880**,
Spreadsheet **595.469**, Presentation **563.544** en Notition **666.024**
afwijkende pixels, telkens op 943.736 pixels. De diagnose gebruikt geen maskers
of herschaling. Ook het documentvlak bevat nog pixelverschillen; alleen
bovenbalken aanpassen zou de vergelijking niet laten slagen.

De [afgeronde alpha-10-platformronde](platformen-2026-10-31-alpha10.json)
bevestigt 673 bronbestanden bytegelijk op alle drie platforms en 66 exacte
native beeldparen. Dat bewijs betreft alpha 10 en wordt niet als platformbewijs
voor alpha 11 gebruikt. De brede corpusronde betreft voorlopig alpha 9.

Directe rijke paginainvoer, volledige ribbons, doorlopende spreadsheetbediening,
presentatieobjecten, automatisch notitieherstel, volledige mailbediening,
database-interface, native installers en fysieke platformproeven blijven open.
Er is geen stabiele native release gemaakt.
