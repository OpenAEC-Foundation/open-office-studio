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
ieder platform; die ronde moet nog worden afgerond.

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

De laatst afgeronde platformronde betreft nog [alpha 7](controle-2026-10-31-alpha7.md):
Windows x64, Linux x64 en macOS ARM64, alle 31 native schermbeelden gelijk.
De alpha-8-releasepakketten, bronregressies en beelden moeten ook afzonderlijk
worden gecontroleerd. Fysieke GUI-, systeemdialoog-, IME-, schermlezer- en
schone-installatieproeven blijven open.

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
