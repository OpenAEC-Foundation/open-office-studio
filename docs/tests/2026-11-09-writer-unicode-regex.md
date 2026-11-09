# Lege regex-treffers vóór emoji (#29)

Basis: `f4a03889eff1306fe503a72d7acb21c754d5ac8d`.

Een Writer-regex als `(?=😀)|x` is geldig en matcht niet op de lege
invoer waarmee `maakPatroon` controleert. In `a😀😀x einde` levert hij
eerst een lege treffer vóór de eerste emoji. `vindAlle` verhoogde
`lastIndex` met één UTF-16-code-eenheid. Omdat de regex Unicode gebruikt,
gaat `exec` vanaf het midden van het surrogatepaar terug naar dezelfde
lege treffer. De synchrone zoeklus stopt dan niet meer.

De correctie slaat bij een lege treffer één volledig Unicode-codepunt over
(twee code-eenheden voor een geldig surrogatepaar). Andere tekens en het
einde van de tekst gebruiken één code-eenheid. Echte treffers behouden hun
oorspronkelijke UTF-16-posities; lege treffers blijven overgeslagen.

## Controle

- Zes regressiegevallen: alleen een lege emoji-lookahead, een echte treffer
  na één/twee emoji, BMP-tekst, een ongepaarde surrogate en een lege treffer
  aan het einde van de tekst. Drie falen tegen de originele implementatie;
  alle zes slagen met de correctie. Een tijdelijke, uitsluitend op de
  onderzochte regex gerichte `exec`-bewaker voorkomt dat de oude fout de
  testworker blokkeert.
- Volledige suite: 175 testfiles geslaagd; 1.993 tests geslaagd en tien
  bestaande corpusoverslagen. TypeScript slaagt.
- Vite-productiebouw slaagt. Bekende meldingen over grote chunks,
  importattributen en afhankelijkheidsdirectieven blijven aanwezig.
- Vier Chromium-proeven met de echte Writer en een DOCX met emoji slagen:
  lege treffers geven geen resultaten, zoeken bereikt de volgende echte
  treffer, Vervang alles wijzigt uitsluitend die treffer, en normaal zoeken
  blijft werken. De opgeslagen `word/document.xml` bevat `a😀😀Y einde`.
  De gecorrigeerde browserproef gebruikt de oorspronkelijke `RegExp.exec`.
- Dezelfde browserproef tegen de originele productiebouw faalt op drie
  scenario's. Voor die baseline wordt een optionele bewaker ingeschakeld
  die de eindeloze regex na honderd `exec`-aanroepen afbreekt.

Herhalen vanuit de repository met een beschikbare Playwright-runtime:

```text
node node_modules/vitest/vitest.mjs run --maxWorkers 2
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build --outDir .local/unicode-fixed
```

Kopieer vóór de browserbouw beide `@betteroffice/fonts*/assets`-mappen
naar `public/fonts`. Stel `OOS_TEST_DIST=.local/unicode-fixed` en desgewenst
`OOS_PLAYWRIGHT_MODULE` op het absolute pad van Playwrights `index.mjs` in:

```text
node scripts/test-writer-unicode-regex.mjs
```

Voor een oude bouw: zet `OOS_TEST_DIST` op die uitvoermap en
`OOS_TEST_BASELINE_GUARD=1`. JSON-uitvoer staat standaard in
`.local/proef-writer-unicode-regex/rapport.json`.

De controle gebruikt de vastgezette afhankelijkheden via een lokale
node_modules-junction naar een bestaande schone installatie. De directe
Vite-bouw gebruikt de meegeleverde fonts; extra-font- en spellingcaches zijn
niet voorbereid en spelling staat uit tijdens deze browserproef. Een nieuwe
native Windows-installer is niet gebouwd. De overige doelen van #29 blijven
open; deze wijziging raakt de regexvalidatie van PR #197 niet.
