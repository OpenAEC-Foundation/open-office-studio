# Rijke sprekernotities — deel van #79

Basis: `5dfb70242dfd38685e9ea6958752825431fb6049`, SDK/React 0.5.1.
Afgestemd met de presentatiechat (#83–87), de performancechat en de centrale
integratiechat. Eigen branch: `codex/presentation-rich-notes-79-2026-11-10`.

## Gedrag

Onder de dia staat een eigen notitiepaneel met vet, cursief, onderstrepen,
lettergrootte, tekstkleur, opsommingen, nummering en alinea-uitlijning.
Ctrl+B/I/U, Unicode-invoer, Enter/Shift+Enter, plakken en eigen ongedaan/
opnieuw horen bij de notities. Diaconcepten blijven bij hun brononderdeel,
ook na native herschikken. De weergaveknop Notities verbergt het paneel;
de diasorteerder en het overzicht hebben hun eigen werkvlak.

Ctrl+S neemt het huidige concept direct mee. Toepassen schrijft de notities
naar het pakket en herlaadt de presentatie. Het paneel vermeldt dat dit een
nieuwe geschiedenis voor diawijzigingen begint. Notitieconcepten hebben een
eigen geschiedenis, los van het native ongedaan maken van dia-objecten.

De openbare editor-API voegt concepten toe aan zowel `save()` als
`handle.save()`; `snapshot()` biedt de actuele platte notitietekst aan
bestaande afdruk-/exportconsumenten. Tijdens typen, opmaken en notitie-undo
wordt geen presentatie opgeslagen of opnieuw gesnapshot door de sessie.
De presentator leest rijke notities uit de al bestaande eenmalige
bestandsopname voor overgangen, animaties en media.

Alleen de body van een notesSlide wordt aangepast. Andere placeholders,
relaties, velden, hyperlinks en onbekende XML blijven behouden. Nieuwe
notities krijgen standaard DrawingML-paragrafen, relaties en inhoudstypen.
Een gewijzigde native notitietekst naast een concept blokkeert opslaan in
plaats van dat concept te overschrijven. Concept verwerpen laadt de actuele
native notities. Niet ondersteunde notitiestructuren blijven alleen-lezen;
een weigering van de notitiepakketlezer blokkeert het openen van dia's niet.

## Herhalen

```text
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run src/presentatie/notities.test.ts --maxWorkers 1
node scripts/controleer-i18n.mjs
node node_modules/vite/bin/vite.js build --outDir .local/presentation-build
node scripts/test-presentatie-rijke-notities.mjs
```

Voor de browserproef: stel `OFFICE_TEST_DIST=.local/presentation-build` in en
zorg voor Playwright/Chromium, eventueel via `OFFICE_PLAYWRIGHT_MODULE` met
een module-URL. De twee fontpakketten moeten zoals bij de normale assetstap
naar `public/fonts` zijn gekopieerd. De proef bouwt een echte PPTX-fixture,
opent de productieapp en schrijft downloads, screenshots en een JSON-verslag
naar `.local/proef-presentatie-rijke-notities`.

## Resultaat op 10 november 2026

- Volledige suite: **2.858 geslaagd, 10 bestaande skips, 274 testbestanden**.
  Daaronder 20 gerichte tests voor model, native PPTX-behoud en conceptsessie.
- TypeScript, productiebuild en negen aangeboden interfacetalen geslaagd.
  De taalcontrole meldt de bestaande 23 waarschuwingen voor overige taalmappen;
  de bundel houdt de bestaande waarschuwingen over grote chunks.
- **Tien productie-Chromiumscenario's geslaagd**, zonder page errors:
  bronopmaak; Unicode/Enter/undo/redo; werkbalkopmaak; veilige rijke HTML-paste;
  twee diaconcepten met Ctrl+S, native en nieuwe browserheropening;
  rijke presentatornotities met PageDown/PageUp; Toepassen; zichtbaar/verbergen
  en een venster van 640 × 800; dupliceren via de sorteerder met een concept;
  conflicterende native notities en expliciet concept verwerpen.
- Native pakkettests behouden onbekende XML, voettekstplaceholders,
  veldidentiteit en externe hyperlinkrelaties, controleren nieuwe zachte
  regeleinden en lossen alle interne relaties op. De performanceproef meet
  **nul native saves/snapshots** bij 20 tekstwijzigingen plus opmaak en undo/redo.

De laatste browserproef gebruikt de definitieve productiebuild en de echte
toetsenbord-/werkbalk-/downloadroutes. Alleen de test leest de publieke API via
React-context om native heropening en een gelijktijdige bronwijziging te toetsen;
de productieapp bevat geen testbrug.

## Grenzen

Basisopmaak wordt getoond en bewerkt. Bronopmaak zoals themakleuren,
bijzondere nummeringspatronen, inspringniveaus en complexe typografie blijft
in de bron-XML behouden, maar de weergave benadert deze waar nodig. Velden
worden als ondeelbare tekst behandeld. Meerdere notitiebody's en onbekende
paragraafkinderen zijn alleen-lezen. Grenzen: 1.000 alinea's, 200.000 tekens,
10.000 runs; de geschiedenis gebruikt maximaal 100 frames / 4 MiB.

Deze wijziging past geen SDK, lockbestand, native venster of installer aan.
Fysieke tweede monitoren, Tauri, externe PowerPoint/LibreOffice en volledige
IME-/schermlezertests zijn hiermee niet gevalideerd. De overige
acceptatiecriteria van #79 blijven open voor hun eigen controle.
