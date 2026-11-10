# Writer donkere documentweergave — #280

Eigen branch: `codex/writer-dark-view-280-281-2026-11-10`.
Vaste basis van de integratie-eigenaar:
`d978918d998bd00485bcafc4cef3072314c1b918`, SDK 0.5.1.
Afgestemd met de Writer-, performance-, integratie- en Windows-testchats.

## Gedrag en implementatie

De Writer-weergave volgt standaard het toepassings-/systeemthema. In
Instellingen → Uiterlijk staat een afzonderlijke voorkeur: Thema volgen,
Wit papier of Donkere pagina. Beeld → Donkere pagina wisselt rechtstreeks
tussen de expliciete donkere en papierweergave. De bestaande normalisatie,
opslag en vensteruitwisseling van voorkeuren bewaren de keuze.

De SDK-chrome volgt nu het toepassingsthema in plaats van vast `light`.
Een geïsoleerde schermstijl verandert de presentatie van `.canvas-page` en
de scrollachtergrond. Er worden geen documentbewerkingen uitgevoerd en er
wordt niets in het canvas zelf herschreven. Afdrukmedia en geforceerde
systeemkleuren schakelen het schermeffect uit.

De donkere pagina past ook weergegeven kleuren en afbeeldingen aan. De
instellingen vermelden dit en bieden Wit papier om oorspronkelijke kleuren
te beoordelen. Bestanden, afdrukvoorbeeld, PDF en afdrukken gebruiken de
documentkleuren. Dit is een weergavevoorkeur, geen nieuwe papierkleur.

## Bewijs op Windows Chromium

`scripts/test-writer-dark-view.mjs` opent een echte synthetische DOCX met
zwarte tekst, een blauwe kop en gele markering in de productieapp.

- Thema volgen, beide expliciete keuzes en live systeemthemawisselingen
  werken; instellingenvoorbeeld, Annuleren, Opslaan en browserheropening
  herstellen/bewaren de verwachte keuze.
- Wisselen verandert `word/document.xml` niet en maakt het documenttabblad
  niet gewijzigd. De hash van de complete oorspronkelijke canvasbitmap is
  gelijk in beide weergaven.
- Het echte afdrukvoorbeeld levert dezelfde PNG-bytes. Twee werkelijk via
  Afdrukvoorbeeld gedownloade PDF's hebben dezelfde inhoud; uitsluitend de
  aanmaak-/wijzigingstijdstempels, hun XMP-tegenhangers en het daaruit afgeleide
  PDF-bestands-ID worden voor de vergelijking genormaliseerd.
- Een muisklik op de donkere pagina, typen en native engine-Undo behouden
  het verwachte invoer-/documentgedrag.
- In afdrukmedia en geforceerde kleuren is het schermeffect uitgeschakeld.
- De overige browsergevallen controleren #281; samen **10 gevallen groen**,
  zonder page errors.

Volledige suite: **2.856 geslaagd, 10 bestaande skips, 274 bestanden**.
TypeScript, productiebuild en de negen aangeboden interfacetalen slagen.
De bestaande 23 waarschuwingen over overige taalmappen en bundelwaarschuwing
over grote chunks blijven bestaan.

## Herhalen en grenzen

```text
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run src/instellingen.test.ts --maxWorkers 1
node scripts/controleer-i18n.mjs
node node_modules/vite/bin/vite.js build --outDir .local/dark-build
node scripts/test-writer-dark-view.mjs
```

De normale fontassets moeten in `public/fonts` staan. De browserproef gebruikt
`OFFICE_TEST_DIST` (standaard `.local/dark-build`) en optioneel
`OFFICE_PLAYWRIGHT_MODULE` met de module-URL van Playwright/Chromium. Uitvoer:
`.local/writer-dark-verified`, waaronder screenshots, PNG-/canvas-hashes en
beide PDF-downloads. `--baseline` ondersteunt het oude productieartifact.

Geen SDK, lockbestand, Rust-, installer- of centrale branchwijzigingen.
Native Windows-uitvoering en het herstarten van de desktopapp moeten na
integratie door de enige Windows-testchat worden getoetst. De tests hierboven
gebruiken de echte engine in headless Chromium, geen Tauri/WebView2-acceptatie.
De huidige vaste Windows-kandidaat is bewust niet aangepast.
