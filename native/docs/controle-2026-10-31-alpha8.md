# Native controle, 31 oktober 2026: alpha 8

**2026.44.9-alpha.8** herstelt een weergaveregressie en brengt de schil en
liniaal dichter bij de vastgelegde interface. Alle tien acceptatiegebieden
blijven open. Deze bouwstap is nog geen volledige suite- of pixelpariteit.

## Standaardfont in kop- en voettekst

De volledige alpha-7-corpusronde vond één extra weigering na het zichtbaar maken
van kop-/voetteksten: de renderfase vroeg `calibri|0|0`, terwijl de fontquery die
sleutel niet had geleverd. De vier stijlen van het ingestelde standaardfont
blijven nu altijd beschikbaar, naast de daadwerkelijk gevraagde families.
Dezelfde fontregistraties worden voor meten en tekenen gebruikt. Ongebruikte
families uit de fonttabel worden bij gewone documenten niet allemaal geladen.

De [echte bronregressie](bronregressie-2026-10-31-alpha8-debug.json) faalt met de
alpha-7-release en slaagt met de alpha-8-debugkern. De test downloadt de exacte
openbare bronrevisie en controleert de verplichte SHA-256 vóór het document wordt
geopend. Ook de echte downloadroute is uitgevoerd; een verkeerde bron wordt
voor documentopening geweigerd. De oorspronkelijke bron blijft buiten de repo
en distributiepakketten. CI krijgt deze proef ook met de echte releasebinary op
ieder platform. Die ronde is afgerond: dezelfde bron slaagt op Linux, Windows
en macOS met precies de controleur uit het bijbehorende pakket. Zie de
[pakket- en bronregressies](pakketten-2026-10-31-alpha8.json). Ook de
[lokale releaseproef](bronregressie-2026-10-31-alpha8-release.json) slaagt.

## Schil en liniaal

De titelbalk gebruikt nu de bestaande Office-kleuren: donker `#44444c` en licht
wit. Uitgeschakelde tekst en subtiele randen volgen dezelfde kleurvariabelen.
De Writer-werkruimte gebruikt `#f5f5f4`.

De liniaal volgt de bestaande schaal met kwartcentimeters, halve centimeters
en cijfers bij hele centimeters. De grijze papierstrook en witte inhoudsstrook
volgen de echte pagina- en inhoudsgrenzen. Buiten het papier verschijnen geen
verzonnen maatstreepjes. De bovenafstand van pagina en verticale liniaal is
gedeeld. Rotatie van verticale cijfers, kolomstroken en interactieve grepen voor
marges, inspringing en tabstops zijn nog niet volledig overgezet.

De afbeeldingen komen uit de werkelijke Iced-renderer. Er zijn geen mockups,
maskers, verschoven referentiebeelden of versoepelde pixeltoleranties gebruikt.

## Uitgevoerde controles

- **161 reguliere Rust-tests geslaagd**, zes runtimeproeven standaard apart.
- **Alle zes runtimeproeven afzonderlijk geslaagd**: vijf conversieproeven en
  de native exportketen voor PDF en CSV.
- **Vijf Python-tests geslaagd**, inclusief een echte Cargo-bouwproef voor
  correct hergebruik van ongewijzigde bron en herbouwen van gewijzigde bron.
- Rustfmt, Clippy met waarschuwingen als fouten en de vaste bronhashcontroles
  zijn groen; DOCX/XLSX/PPTX en conversie-uitvoer zijn onafhankelijk teruggelezen.
- De 31 native schermen zijn gerenderd. De 13 gedeelde document-PNG's zijn
  byte-gelijk aan alpha 7; de nieuwe standaardregistratie verandert deze
  bestaande documentvoorbeelden niet.

Bouwronde **41170415375** is volledig groen: Windows x64, Linux x64, macOS
ARM64 en de aparte conversieruntime. De 31 native beelden zijn op elk platform
pixelgelijk aan de lokale native uitvoer:
[Linux](nativebeelden-2026-10-31-alpha8-Linux.json),
[Windows](nativebeelden-2026-10-31-alpha8-Windows.json) en
[macOS](nativebeelden-2026-10-31-alpha8-macOS.json). Dit is geen pixelpariteit
met de bestaande suite.

[Pakketcontrole](pakketten-2026-10-31-alpha8.json) controleert ZIP-CRC, SHA-256,
beide programmaheaders en alle 625 verpakte bronbestanden. Linux en macOS zijn
byte-gelijk aan het Git-archief. Windows heeft **146 tekstbestanden met CRLF**;
alle overige bytes zijn gelijk. Dit wordt als verschil vastgelegd, niet als
volledige bytegelijkheid. Alpha 9 legt LF voor eigen bron vast en neemt de
Git-instellingen mee in het bronpakket. De oorspronkelijke alpha-8-artefacten
blijven behouden.

CI testte de tijdelijke PR-mergecommit `25d11407a64748bf0b80e931552ff927df9d576f`.
De Git-bomen van native, public en docs zijn gecontroleerd gelijk aan broncommit
`c0f1bd59ea6c31f80144e49a826a502577083806`; Windows-checkoutregelafbrekingen
zijn hierboven afzonderlijk vermeld. Beide uitgepakte programmaversies en de
bron/notices zijn ook op het eigen CI-platform gecontroleerd. De
[conversie-uitvoer](conversie-2026-10-31-alpha8-ci.json) is onafhankelijk
teruggelezen. Fysieke GUI-, systeemdialoog-, IME-, schermlezer- en
schone-installatieproeven blijven open.

## Brede bestandsronde

De [lokale releasecontrole](corpus-2026-10-31-alpha8-release.json) selecteert
648 OOXML-bronnen uit het manifest met 1.566 bestanden: **579 rondgangen slagen,
68 worden geweigerd en één overschrijdt 30 seconden**. De overige 918 formaten
zijn hiermee niet native gecontroleerd. Er zijn geen gevonden rondgangverschillen
in de vergeleken tekstvelden. De ronde controleert de eerste werkweergave en
zichtbare velden, niet alle pagina's, stijlen of functies.

De [twee grote Writer-bronnen](grote-writer-2026-10-31-alpha8.json), met 953 en
15.935 alinea's, slagen afzonderlijk met één bestandsproces en 120 seconden per
bron. Het grootste document kost ongeveer 16,6 seconden voor de eerste
weergave en 37,6 seconden voor de hele rondgang. Andere controles liepen tegelijk;
dit is geen geïsoleerde benchmark. De grens van 30 seconden blijft in de brede
ronde terecht als mislukte tijdscontrole staan.

## Strikte vergelijking met de bestaande suite

| Module | Alpha 7 | Alpha 8 | Resultaat bij nul tolerantie |
| --- | ---: | ---: | --- |
| Writer | 350.978 | 126.880 | Niet gelijk |
| Spreadsheet | 624.298 | 595.469 | Niet gelijk |
| Presentation | 592.529 | 563.545 | Niet gelijk |
| Notition | 695.640 | 665.981 | Niet gelijk |

Elke opname heeft 943.736 pixels. De volledige oorspronkelijke PNG's worden
vergeleken, inclusief vensterbalken, panelen en versietekst. Dit zijn
beeldverschillen, geen percentages voltooide functionaliteit. De eerste
referenties komen uit de bestaande browserinterface; native vensterbediening
en de desktopreferentie vragen ook een afzonderlijke vergelijking.

De vier [nul-tolerantierapporten](pixelcontrole-alpha8) blijven terecht rood.
Volledige ribbons, directe documentinvoer en de overige functies moeten nog
verder worden overgezet. De vrijgavecontrole wordt niet omzeild.

## Kortere en beter controleerbare CI-rondes

De schermartefacten worden voortaan vóór de lange releasecompilatie geüpload.
De bronregressie krijgt een eigen artefact. CI bewaart geen debugsymbolen in
ontwikkel-/testartefacten; debugasserties blijven ingeschakeld.

De bouwcache gebruikt broninhoud in de sleutel en bewaart gecontroleerde
bronstempels. Alleen exact dezelfde bestandsbytes krijgen hun vorige stempel.
Nieuwe of gewijzigde bytes krijgen een verse stempel. De regressietest bouwt
een echt klein Rust-programma: ongewijzigde bron hergebruikt dezelfde binary;
gewijzigde bron met zelfs een oude stempel geeft aantoonbaar de nieuwe uitvoer.
De werking in een volgende volledige CI-cachehergebruikronde moet nog worden
gemeten; er wordt nog geen gemeten CI-versnelling geclaimd.
