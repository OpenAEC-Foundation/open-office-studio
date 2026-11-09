# Tabellen op dia's (#81)

Invoegen → Tabellen opent een bewerkbaar rooster voor een nieuwe of bestaande
tabel op de huidige dia. De gebruiker kiest rij-/kolomaantallen en een van
drie stijlen, bewerkt tekst, voegt rijen en kolommen in/verwijdert ze en voegt
rechthoekige cellen samen of splitst ze. Selecteren kan met Shift+klik of een
getypt celbereik, zoals `B2:C3`. Celvulling, vier buitenranden, randdikte,
horizontale/verticale uitlijning en gelijke celmarges zijn instelbaar.

Ctrl+V accepteert tabgescheiden rekenbladwaarden en HTML-tabellen uit een
tekstdocument. HTML wordt uitsluitend uitgelezen, nooit in de app ingevoegd;
waarden, regeleinden en rechthoekige samenvoegingen worden DrawingML-cellen.
Plakken kan het rooster uitbreiden. Samengevoegde cellen die slechts deels
zouden worden overschreven worden geweigerd. Samenvoegen bewaart de inhoud
van de betrokken cellen in het anker. Een anker verwijderen verplaatst de
inhoud naar de overblijvende merge; een merge van meerdere cellen wordt
automatisch groter bij invoegen binnen die merge.

Niet-bewerkte rijke celtekst en onbekende cel-/rijuitbreidingen blijven
behouden. Celtekst vervangen behoudt de basisopmaak van de eerste alinea/run.
Bronrelaties en andere pakketonderdelen blijven intact. De bestaande engine
rendert de echte tabel; tabelgeometrie en samenvoegingen blijven na bewaren
en heropenen bewerkbaar. De dialoog vermeldt het herladen en de nieuwe
ongedaanmaakgeschiedenis. Annuleren verandert het document niet.

## Validatie

- 14 nieuwe tests voor roosters, mergegrenzen, invoegen/verwijderen,
  TSV/Unicode/letterlijke formuletekst, cellen voorbij kolom Z, bronbehoud,
  celopmaak, renderprimitieven en echte PPTX-opslag/heropening.
- Volledige suite: **2056 geslaagd, 10 bestaande skips, 180 bestanden**,
  twee workers en 15 seconden per test.
- TypeScript, Vite-productiebuild en de negen aangeboden interfacetalen: groen.
- `scripts/test-presentatie-tabellen.mjs`: zes Chromium-scenario's op de
  productieapp, met echte Ctrl+V voor TSV en een HTML-tabel met samengevoegde
  cellen en een regeleinde. Ook bestaande tabellen wijzigen, opmaak,
  afwijzen zonder documentwijziging, daadwerkelijke Opslaan als-download en
  heropening via zowel de engine als de app. Geen paginafouten.
- Donkere dialoog, selectiecontrast en celvulling visueel gecontroleerd.

Grenzen: 200 rijen, 50 kolommen en 5000 cellen. De plakroute neemt waarden en
samenvoegingen over; bronopmaak uit externe HTML wordt niet gekopieerd.
Dit werk verandert de native installatie en bestandsconversie niet.

Het rooster volgt de DrawingML-regels voor
[gridSpan, rowSpan, hMerge en vMerge](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/de4562ba-7901-48df-9803-414ded131f2b).
De vijf functionele criteria van #81 zijn hiermee in de implementatie en
regressieproeven afgedekt; sluiting kan volgen na samenvoegen van de PR.
