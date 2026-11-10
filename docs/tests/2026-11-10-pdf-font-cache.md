# PDF-lettertypen na beschikbaarheid van systeemlettertypen (#311)

10 november 2026. Afgebakend vervolg op #22, afgestemd met de integratiechat.
Bronbasis: `e9eabc3c1874414f3f79bfeeb5ca4b07d118fc0a`, SDK 0.5.1.

## Reproductie en wijziging

De PDF-resolver bewaart zowel gevonden lettertypen als `null` en metrische
vervangers. Op de bronbasis bleef een eerdere `null` bestaan nadat de bestaande
toestemmingsroute de systeemlettertypencatalogus had gevuld. Een eerder gekozen
vervanger bleef eveneens in gebruik.

De resolver volgt nu eenmaal de bestaande beschikbaarheidsmelding en leegt dan
zijn cache. Zonder melding blijven lopende en afgeronde aanvragen gedeeld.
Een oude lopende aanvraag schrijft zijn resultaat niet opnieuw in de cache.
De observer wordt pas na de bestaande dynamische import geregistreerd; de
zelfstandige Database Studio behoudt zijn vroege terugkeer zonder Office-fonts.

## Gerichte controles

- 53 tests groen in `lettertypebron-beschikbaarheid.test.ts`, `pdf.test.ts`,
  `vector.test.ts` en `lettertypen.test.ts`. De zes nieuwe regressietests toetsen
  de eerdere null, metrische vervanger, gedeelde aanvragen, eenmalige observer,
  oude lopende aanvraag en Database Studio. Ze gebruiken de echte TrueType-parser
  met de meegeleverde Liberation Sans- en Source Sans 3-bestanden.
- `tsc --noEmit` groen.
- Normale Vite-productiebuild groen; bestaande waarschuwing voor grote chunks.
- Vier browsercontroles groen, zonder browserfouten, op de productiegebouwde
  geïsoleerde proefpagina met de echte resolver, catalogusroute en PDF-export.
- De echte productie-app opent daarnaast een DOCX via de browserbestandsinvoer,
  downloadt een PDF via Opslaan als, vraagt via de bestaande fontkeuzeknop de
  systeemlettertypen op en downloadt opnieuw een PDF. De eerste PDF bevat
  Liberation Sans als vervanger; de tweede bevat de aangeboden Source Sans 3.
  Geen automatische fontaanvraag vóór de knop, daarna precies één aanvraag,
  zonder browserfouten. Ook hier is uitsluitend `queryLocalFonts` gecontroleerd.

De browserproef levert gecontroleerde `queryLocalFonts`-invoer met echte
TrueType-bytes. De knop voert de bestaande `laadSysteemLettertypen(true)` uit.
De proef bedient geen native toestemmingsdialoog of geïnstalleerde desktopapp.

| Controle | Bronbasis | Met fix |
| --- | --- | --- |
| Resolver vóór toegang | `null`, gedeelde Promise | `null`, gedeelde Promise |
| Automatische lokale-fontaanvragen vóór knop | 0 | 0 |
| Resolver na knop en catalogusmelding | oude `null` | Liberation Sans |
| Eerdere Arial-vervanger na melding | Liberation Sans | Source Sans 3 |
| Lokale-fontaanvragen na knop | 1 | 1 |
| PDF vóór toegang bevat `/FontFile2` | nee | nee |
| PDF na toegang bevat `/FontFile2` | nee | ja |

Na de melding blijven herhaalde aanvragen hetzelfde resultaat delen en nemen
de lokale fontbestandlezingen niet toe. De canvasweergave gebruikt voor en na
toegang dezelfde echte fontbytes; de vergelijking toetst de PDF-inbedding.

## Herhalen

Vanuit de repository met geïnstalleerde afhankelijkheden:

```powershell
node scripts/kopieer-assets.mjs
node node_modules/vitest/vitest.mjs run src/export/pdf/lettertypebron-beschikbaarheid.test.ts src/export/pdf/pdf.test.ts src/export/pdf/vector.test.ts src/lettertypen/lettertypen.test.ts --maxWorkers 1
node scripts/test-pdf-font-cache.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build --outDir .local/font-cache-app-build
node scripts/test-pdf-font-app.mjs .local/font-cache-app-build
```

Indien Playwright buiten de repository staat, accepteert de browserproef
`OFFICE_PLAYWRIGHT_MODULE` als module-URL. Resultaten en twee PDF-bestanden
staan onder `.local/pdf-font-cache-fixed/`. Met `--baseline` verwacht de proef
het oorspronkelijke foutgedrag; gebruik dit op de bronbasis. `--no-build`
hergebruikt een eerder gemaakte proefbuild. De HTML/TypeScript-proefpagina
wordt niet door de applicatie geïmporteerd.

De fix verandert geen toestemmingsbeleid en behandelt geen andere tijdelijke
fontbestand- of netwerkfouten. Native acceptatie en de combinatietest blijven
bij de integratiechat; de bevroren Windows-kandidaat is niet gewijzigd.

## Platformstatus

De definitieve commit wordt vastgelegd in de PR en de overdracht. Alle resultaten
hier gelden voor de daarin vastgelegde broncode; er is geen SDK-wijziging.

| Platform | Build/pakket | Functionele controle | Resterend |
| --- | --- | --- | --- |
| Windows | TypeScript en Vite groen; geen nieuw native pakket gebouwd | 53 gerichte tests en Chromium-proeven groen | Native fonttoegang en desktopbediening niet uitgevoerd |
| Browser | Normale productiebuild en geïsoleerde proefbuild groen | Echte Writer-open/fontkeuze/PDF-downloadroute plus vier resolver/PDF-controles groen | Echte OS-toestemmingsdialoog niet bediend |
| Linux | Bestaande CI-matrix `desktop.yml` beschikbaar; resultaat nog niet binnen | Nog geen resultaat op deze fix | CI-build/pakket/tests en native bediening |
| macOS | Bestaande CI-matrix `desktop.yml` beschikbaar; resultaat nog niet binnen | Nog geen resultaat op deze fix | CI-build/pakket/tests en native bediening |

De PR gebruikt de bestaande CI voor Windows, Linux en macOS. Een geslaagde
build geldt niet als bewijs van native bediening. Pending of geblokkeerde
CI-resultaten worden afzonderlijk in de PR en overdracht vermeld, met het
exacte codepunt. Er wordt niets naar `main` samengevoegd of gepusht.
