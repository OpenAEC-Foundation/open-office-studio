# Minder gebruikelijke en oudere formaten (#43)

De [matrix](matrix.md) registreert alle 84 unieke invoerextensies en de twee
uitsluitend uitgevoerde extensies uit `src/formaten.json`. `dekking.json` is de
bron. Iedere extensie heeft een concrete proef of een verklaring waarom een
invoervoorbeeld ontbreekt. Een historische export-/terugconversieproef is
zichtbaar onderscheiden van een onafhankelijke importfixture.

## Werkelijke bestanden

`bronnen.json` legt 32 bestanden uit de officiële LibreOffice-testverzameling
vast met repository, commit, bronpad, variant, omvang, Git-blobhash en SHA-256.
De bestanden worden niet heruitgegeven in deze repository: de proef haalt ze
uitsluitend op naar de lokale cache en verifieert de inhoud. De oorspronkelijke
rechten en licenties blijven gelden bij eventuele herdistributie. Het manifest
is reproduceerbaar; nieuwe upstreamcommits veranderen de gekozen bytes niet.

De Windows-proef gebruikt LibreOffice 26.8.2.2 en het productieprofiel
`src-tauri/src/conversieprofiel.xcu`. `resultaat-windows.json` bevat versie,
profiel-/Writer-WASM-hashes en de gemeten conversie- en editorresultaten. De
afzonderlijke uitvoerbestanden en logs blijven onder `.local/`.

Iedere bron doorloopt de echte `bereidOpenen`-functie met een echte
CLI-conversie volgens dezelfde filterkeuze, een afzonderlijk kort tijdelijk
profiel, 100 MB-grens en 45 seconden procesboomlimiet als de native app. De
uitvoer gaat door de pakketcontrole en de productie-WASM-editor: openen,
bewaren en heropenen. Bij presentaties blijft het dia-aantal gelijk. De
bronhash blijft ongewijzigd. Van de 32 bestanden doorlopen 31 deze openroute;
één onvolledig SYLK-regressiefragment zonder bestandskop wordt juist geweigerd
met een uitleg en alternatief. `expected` en `outcome` onderscheiden beide
uitkomsten; een geslaagde weigeringstest is geen geslaagde bestandsopening.
De minimale Ubuntu 22.04-runtime is LibreOffice 7.3.7.2: die weigert ook het
DBF-bronbestand en de SXI→PPTX-export. `expectedOn` legt uitsluitend deze exact
gemeten runtime/platformcombinatie vast; de standaardverwachting voor de
nieuwe runtime blijft openen. De fout en het alternatief worden ook bij die
weigeringen gecontroleerd. Dit is geen algemene uitsluiting van DBF of SXI.
Dit is geen native IPC-/installatieproef en geen
visuele vergelijking of volledige inhoudsvergelijking. Geen enkele geslaagde
proef bewijst alle bestandsvarianten of verliesvrij terugschrijven.

## Opnieuw uitvoeren

Vanuit de repository, met de afhankelijkheden geïnstalleerd:

```powershell
$env:OPENAEC_CONVERSIE_PROGRAMMA = 'C:/pad/naar/LibreOffice/program/soffice.com'
pnpm exec vitest run --config scripts/formatendekking.config.ts --configLoader runner
node scripts/controleer-formatendekking.mjs
pnpm exec vitest run src/formatendekking.test.ts src/import/formaatfouten.test.ts
```

Op Linux kan dezelfde proef met
`OPENAEC_CONVERSIE_PROGRAMMA=/usr/bin/soffice pnpm exec vitest run --config scripts/formatendekking.config.ts --configLoader runner`.
Writer, Calc en Impress moeten in de proefomgeving beschikbaar zijn.
De workflow `Legacy format coverage` herhaalt dit op Linux. Het expliciet
instellen van een runtime is alleen een voorwaarde voor deze ontwikkelaarsproef;
het oplossen van de distributieafhankelijkheid voor gebruikers valt onder #30.

De suite schrijft een unieke map onder `.local/formatendekking/`. Optioneel:
`OOS_DEKKING_UIT` kiest de verslagbasismap en `OOS_DEKKING_BRONNEN` de cache.
`OOS_DEKKING_SELECTIE` kan een kommagescheiden lijst bron-ID's kiezen voor een
gerichte herhaling; het vastgelegde verslag moet alle manifestbestanden dekken.
Een timeout of niet-nul exitcode blijft een fout, ook als al een uitvoerbestand
bestaat. Alleen de eigen procesboom wordt beëindigd. Tijdelijke profielmappen
worden na controle van het absolute doelpad verwijderd. Rapporten en OOXML
blijven beschikbaar voor inspectie.

Bij gewijzigd bewijs: beoordeel het nieuwe verslag, werk `dekking.json` en het
vastgelegde verslag bij en voer `node scripts/controleer-formatendekking.mjs --write`
uit. De reguliere suite controleert de exacte catalogusdekking, bronverwijzingen,
succesvolle vastgelegde bestandsproeven en de gegenereerde tabel.

## Grenzen die expliciet blijven

- WPD: WordPerfect 6 en een WP 2.1.3-document; WRI: Write 3.1;
  LWP: Lotus Word Pro 9.6; HWP: Hangul 97/HWP 3.0. HWP 5 en HWPX zijn hiermee
  niet bewezen; HWPX staat ook niet in de invoercatalogus.
- Pages 4 XML en Pages 5 IWA; Numbers alleen 2 XML; Keynote 1 XML en 6 IWA.
  Geen algemeen bewijs voor recente of met een wachtwoord beveiligde iWork.
- Works 6.0/DOS 2.00A en Keynote 6 leveren geen tekst in de geconverteerde
  hoofdinhoud op. Hun succes betekent alleen dat de technische route werkt.
  Ze worden niet gebruikt als bewijs van tekstbehoud.
  De openroute toont nu een waarschuwing bij Writer-/Impress-uitvoer zonder
  gedetecteerde zichtbare inhoud, met hetzelfde alternatief vanuit de bronapp.
  De echte bestandsproef controleert die waarschuwing voor deze drie bronnen.
  De controle is voorzichtig: afbeeldingen, tabellen, velden, formules en
  vormen tellen als mogelijke inhoud. Zij scant geen grote spreadsheetceldata
  opnieuw en vervangt geen visuele of inhoudelijke vergelijking.
- WK1 en WK3 zijn Lotus. De `.wk4`-fixture is **Microsoft Works 4.0 voor Mac**.
  Een regulier Lotus 1-2-3 WK4-voorbeeld is niet gevonden. Gelijke extensies
  betekenen hier verschillende interne bestandsformaten.
- DBF, SXW/SXC/SXI en twaalf aanvullende oudere formaten hebben een echte
  bestandsproef. StarOffice-sjablonen STW/STC/STI en de overige ontbrekende
  voorbeelden worden daardoor niet automatisch als getest aangemerkt.
- Bij SYLK werd eerst een onvolledig parserregressiefragment gevonden. Dat
  wordt met alternatief geweigerd. Een volledig bestand (`ooo80484-1.slk`, met
  `ID;PXL`-kop) wordt daarnaast afzonderlijk geopend en heropend.
- Ontbrekende voorbeelden staan per extensie in de matrix. De zoekscope staat
  in `dekking.json`; dit is geen claim dat nergens een voorbeeld bestaat.

Een onleesbare variant behoudt de concrete foutreden en krijgt een passend
alternatief vanuit de bronapp. Het origineel wordt niet overschreven door openen.
De gerichte foutproeven controleren ook ontbrekende runtime, ongeldige uitvoer,
een native foutcode zonder `Error`-object en behoud van native pakketfouten.
