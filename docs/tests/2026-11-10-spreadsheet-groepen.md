# Spreadsheet: geneste DrawingML-groepen (#75)

Vervolg op de formulekoppelingen van `2eb45a39`, in dezelfde gestapelde PR263.
De spreadsheetkern en vendorbestanden blijven ongewijzigd.

## Gedrag

- Geïmporteerde groepen tonen hun afbeeldingen, basisvormen en tekst, ook bij
  geneste groepen, afwijkende lokale oorsprongen, schalen, draaien en spiegelen.
- De gebruiker verplaatst, hernoemt en vergroot/verkleint de groep als geheel.
  De dialoog toont dit expliciet en biedt geen misleidende tekst- of vormstijlvelden.
- Alleen het buitenste celanker wordt aangepast. Afbeeldingen, relaties,
  onderliggende object-XML en onbekende uitbreidingen blijven behouden.
- Invoegen/verwijderen van rijen en kolommen gebruikt de bestaande native
  ankeradministratie; de structurele Undo/Redo-proef controleert het groepsanker.
- Scherm, afdrukbereik, afdrukcanvas en vector-PDF gebruiken dezelfde geometrie.
  Gedraaide onderdelen die buiten het groepskader uitsteken blijven zichtbaar.

DrawingML combineert de posities van middelpunten door de volledige hiërarchie,
maar combineert rotaties en asschalen apart. Een gewone vermenigvuldiging van alle
rechthoektransformaties zou onderdelen bij niet-uniforme schaal scheeftrekken.
Spiegeling werkt op de geometrie en afbeeldingen; tekst behoudt zijn leesrichting.
Zie de [ECMA-primer, secties 5.7.4–5.7.6](https://download.microsoft.com/download/e/1/4/e14fb96f-83b8-4a2a-84db-7fa8acbe061a/Office%20Open%20XML%20Part%203%20-%20Primer.pdf)
en [Microsofts beschrijving van groepscoördinaten](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.transformgroup?view=openxml-3.0.1).

## Herhaalbare controles

```powershell
pnpm exec tsc --noEmit
pnpm exec vitest run --maxWorkers=2 --reporter=json --outputFile=.local/tests-groups.json
node scripts/controleer-i18n.mjs
pnpm exec vite build --outDir .local/dist --logLevel error
node scripts/test-rekenblad-objecten-gui.mjs
$env:OOS_TEST_REKENBLAD_WASM='.local/formula-query-compat/query-engine.wasm'
$env:OFFICE_TEST_UIT='.local/proef-rekenblad-objecten-query-engine'
node scripts/test-rekenblad-objecten-gui.mjs
Remove-Item Env:OOS_TEST_REKENBLAD_WASM,Env:OFFICE_TEST_UIT
node scripts/test-rekenblad-objecten-print.mjs
python scripts/test-rekenblad-objecten-pdf.py
$env:OPENAEC_CONVERSIE_PROGRAMMA='pad/naar/soffice'
python scripts/test-rekenblad-groepen-libreoffice.py
```

De query-kern wordt vooraf hash-gecontroleerd klaargezet met
`node scripts/test-rekenblad-koppeling-vragen.mjs`. De PDF-controle gebruikt
`pypdf==6.10.0`, `pypdfium2==5.14.0` en `Pillow==13.0.0`. De LibreOffice-proef
gebruikt de bestaande Python-afhankelijkheden van de formatenmatrix, een eigen
wegwerpprofiel, het productieconversieprofiel en de bestaande limiet van 45 seconden.

De volledige lokale suite had 2.059 geslaagde tests, tien bestaande skips en twee
5-seconden-time-outs in bestaande CSV- en vertaaldtests. De twee betreffende
testbestanden slagen bij een herhaling met één worker: 28 tests, zonder wijziging
van de tijdslimiet. TypeScript, de Vite-productiebundel en de vertaalcontrole
slagen. De JSON-bijlage bevat de uitkomsten van de volledige suite, beide browserkernen,
de afdrukproef en de onafhankelijke PDF- en LibreOffice-inspecties. De zes nieuwe
groeptests dekken onder andere behoud van kind-XML en media, verplaatsen/schalen,
structurele Undo/Redo, uitstekende onderdelen, niet-uniforme schaal, geneste
spiegeling en een onbruikbare lokale coördinaatruimte.

De browserproef heeft twintig scenario's per kern, waaronder vijf groepsscenario's.
De screenshotproef controleert een echt blauw bronpixel op de onafhankelijk
berekende positie na spiegeling en 30° rotatie. Een afzonderlijke PDFium-rendering
meet de hoofdas van de oranje vorm: circa 45° zonder buitenste rotatie en 75° bij
de gespiegelde groep met 30° rotatie. De PDF-reader controleert tevens echte,
doorzoekbare tekst en een ingesloten afbeelding per pagina.

## Grenzen

Onbekende kindvormen blijven benoemde placeholders binnen de groep. Groepen met
een nulbereik, meer dan zestien niveaus of een overschreden gedeeld budget van
10.000 groepskinderen vallen terug op behouden placeholders. Dit is geen algemene
renderer voor alle DrawingML-geometrieën, effecten, SmartArt of ingesloten objecten.
De bestaande afbeeldingslimieten blijven gelden, ook binnen groepen.

Kinderen zijn niet afzonderlijk te bewerken. De bestaande melding dat een directe
objectpakketwijziging de eerdere bewerkingsgeschiedenis herlaadt blijft gelden;
deze wijziging introduceert geen native Undo voor die pakketwijzigingen.
LibreOffice kan bij het opslaan de groepskaders herberekenen rond uitstekende
onderdelen; de onafhankelijke proef controleert de celpositie, hiërarchie en namen.

De lokale standaardbuild strandt vóór TypeScript/Vite op de reeds bestaande
spellingmodulebouw. De spreadsheetcontrole gebruikt daarom expliciet TypeScript
en de productie-Vite-bundel. De eerdere formulecheckpoint `2eb45a39` heeft alle acht
CI-controles groen, waaronder de desktopbuilds op Windows, Linux en macOS.
Twee herhaalde LibreOffice-proeven onder gelijktijdige bouwbelasting bereikten de
ongewijzigde 45-secondenlimiet; de eerste onafhankelijke proef slaagde in 33,8 s.
Dit is geen prestatiegarantie voor grote werkboeken. Issue #74 blijft open.
