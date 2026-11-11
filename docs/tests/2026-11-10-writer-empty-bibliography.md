# Lege bibliografiemetadata geeft een onterechte melding — #305 / #40

Eigen branch `codex/writer-empty-bibliography-2026-11-10`, door de
integratiechat vrijgegeven scope en vaste basis
`e9eabc3c1874414f3f79bfeeb5ca4b07d118fc0a` (SDK 0.5.1).

## Gereproduceerd

De productiefrontend meldt aangepaste XML-gegevens bij het openen van
`public/templates/nieuw.docx` en bij het heropenen van het synthetische native
Writer-testbestand `writer-integratie-4175e5f1-2026-11-10.docx`. Dit is
zelfstandig in Windows Chromium gereproduceerd. De baseline gebruikt het
productieartifact van `b8426dc4`; de pakketcontrole en rapportcode daarvan
zijn gelijk aan die van de vaste basis hierboven. Er is geen nieuwe native
desktopbediening uitgevoerd.

Beide bestanden bevatten dezelfde drie bytegelijke customXml-onderdelen:
een lege `b:Sources` met APA-instellingen, de bijbehorende datastore-identiteit
en bibliografieschemaverwijzing en één interne relatie naar `itemProps1.xml`.
Er staan geen bibliografische bronnen in. Voorheen was ieder onderdeel onder
`customXml/` voldoende voor de algemene waarschuwing.

## Gerichte correctie

Een zelfstandige, Node-bruikbare helper herkent uitsluitend de volledige,
bekende driedelige lege metadata uit het eigen standaardsjabloon. Alleen
DOCX krijgt daarvoor een uitzondering op het risico `custom_xml`.

De vergelijking staat uitsluitend de bestaande XML-declaratie, een BOM en
XML-opmaakwitruimte toe. Andere identiteiten, stijlen, schema's, attributen,
tekst, commentaar, instructies, bronnen, bestandsnamen en relaties blijven
onbekend en blijven dus waarschuwen. Ook extra of ontbrekende customXml-
onderdelen houden de melding in stand. Dit is bewust geen algemene
herkenning van alle mogelijke lege bibliografiebestanden.

Preflight pakt alleen de drie vaste kandidaatnamen van maximaal 4 KiB per
onderdeel extra uit; onbekende grote custom-XML-payloads worden daarvoor niet
gelezen. De overige ZIP-limieten en risico-/opslagregels blijven ongewijzigd.
De helper schrijft niets en importeert geen browser-, grafiek- of i18n-parser.

## Validatie

- **71 gerichte tests groen:** bestaande pakketcontrole (23), rapporten (17)
  en de nieuwe herkenning plus positieve/negatieve regressies (31).
- Negatieven omvatten echte bronnen, extra en ontbrekende onderdelen,
  onbekende schema's/attributen/identiteiten, externe of extra relaties,
  hernoemde metadata, niet-XML-witruimte, DOCTYPE/instructies/commentaar,
  ongeldige XML, te grote onderdelen en XLSX/PPTX met dezelfde metadata.
- Overige waarschuwingen en VBA-signalen blijven werken. De herkenning laat
  de oorspronkelijke ZIP en ieder uitgepakt onderdeel exact ongewijzigd.
- Een directe Node-import van `src/pakketcontrole.ts` werkt zonder loader,
  browserconfiguratie of extra afhankelijkheden.
- TypeScript en de productiebuild slagen. De bestaande waarschuwing over
  grote bundelchunks blijft bestaan.
- Productie-Chromium: het lege sjabloon opent zonder custom-XML-melding;
  Ctrl+S/werkelijk downloaden/heropenen houdt dit zo en behoudt alle drie
  metadataonderdelen bytegelijk. Echte bronnen, extra custom XML en afwijkende
  eigenschappen geven elk nog de waarschuwing. Geen page errors.
- Het bestaande native-saved testbestand opent in dezelfde productieproef
  eveneens zonder de onterechte custom-XML-melding: **zes gevallen groen**
  wanneer `OFFICE_NATIVE_FIXTURE` is ingesteld (vijf draagbare basisgevallen).

## Herhalen

```text
node node_modules/vitest/vitest.mjs run src/pakketcontrole.test.ts src/import/rapport.test.ts src/import/legeBibliografie.test.ts --maxWorkers 1
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build --outDir .local/bibliography-build
node scripts/test-writer-empty-bibliography.mjs
```

Kopieer de normale fontassets naar `public/fonts`. De browserproef gebruikt
`OFFICE_TEST_DIST` (standaard `.local/bibliography-build`) en optioneel
`OFFICE_PLAYWRIGHT_MODULE` met de Playwright-module-URL. `--baseline`
verwacht de oude melding; `OFFICE_NATIVE_FIXTURE` kan het bestaande
synthetische native-saved testbestand toevoegen. Resultaten en screenshots
staan onder `.local/empty-bibliography-baseline` en
`.local/empty-bibliography-verified`.

De volledige combinatiesuite blijft bij integratie. Er zijn geen SDK-, lock-,
Rust-, converter-, installer-, UI- of andere rapportbeleidswijzigingen.
Het huidige vaste Windows-kandidaatpunt is niet gewijzigd. De bredere
acceptatiecriteria van #40 blijven open.
