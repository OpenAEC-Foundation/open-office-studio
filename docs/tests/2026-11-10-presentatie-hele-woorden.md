# Presentatie: alleen hele woorden zoeken en vervangen (#326)

10 november 2026. Afgebakende enhancement onder #29, vooraf gereserveerd via
de integratiechat. Vaste basis `1e5afa399117fd84df628955ec82b0e597993c83`,
PPTX SDK 0.5.1. Het definitieve codepunt staat in de PR en overdracht.

## Gedrag

Het bestaande paneel had alleen Hoofdlettergevoelig. De nieuwe optie Alleen
hele woorden staat standaard uit en gebruikt de bestaande vertaling
`writer:find.pane.wholeWords`. Tellen, volgende/vorige, vervangen en alles
vervangen gebruiken dezelfde gefilterde native treffers. Wisselen van de
optie wist de vorige selectie en status, zodat een eerdere deelmatch niet
alsnog vervangen wordt.

Letters, combining marks, getallen en underscore horen bij een woord.
Leestekens en emoji vormen grenzen. De aangrenzende tekens worden als hele
Unicode-codepunten getoetst, terwijl de oorspronkelijke UTF-16-posities van
de editor behouden blijven. De filter gebruikt alleen de tekst van hetzelfde
verhaal en dezelfde gelezen versie. Bij een versiewijziging blijft de optie
ook tijdens de bestaande herhaalpoging behouden.

De bestaande limiet van de native zoekopdracht blijft 10.000 treffers per
schrijfwijze. Er zijn geen wijzigingen aan regexondersteuning, notitie-opslag,
presentatorweergave, ODP, media, SDK, installers of gedeelde hostbestanden.

## Gerichte tests en productie-browserproef

- Alle 10 zoek-/vervangtests groen: de vijf bestaande tests plus vijf nieuwe
  tests voor hoofdletterkeuze/defaultgedrag, Unicode/UTF-16, verhaalgrenzen en
  letterlijke leestekens, versieherhaling en één vervangtransactie.
- TypeScript en normale Vite-productiebuild groen. De build geeft de bestaande
  waarschuwingen voor grote chunks/dependency directives.
- Alle negen aangeboden interfacetalen gecontroleerd: 21 namespaces,
  7.949 bronsleutels in orde; 23 bestaande waarschuwingen voor voorbereide talen.
- Zeven echte productie-browsergevallen groen, nul JavaScript-fouten.
  De definitieve proef gebruikt geen React-interne API, testbridge of
  gesimuleerde editor. Alleen het synthetische invoerbestand en de gedownloade
  PPTX-bestanden worden buiten de UI met de vastgezette parser gelezen.

De basisproef bevestigt het ontbrekende vakje in de echte app. Dezelfde
twee-dia-invoer geeft deze aantallen:

| Keuze | Resultaat |
| --- | --- |
| Bestaand deelwoordzoeken, optie uit | 15 |
| Hele woorden aan | 5 |
| Hele woorden en hoofdlettergevoelig aan | 3 |

De browserproef controleert vervolgens:

1. Een geselecteerde deelmatch in `katten` vervalt na inschakelen; Vervangen
   selecteert eerst een geldige nieuwe treffer en wijzigt nog geen tekst.
2. Prefixen, suffixen, accents/combining marks, astrale letters, getallen en
   underscores tellen niet mee; emoji en haakjes staan complete woorden toe.
3. Volgende, vorige en Shift+Enter lopen rond over beide dia's; de combinatie
   met hoofdlettergevoeligheid blijft werken.
4. Vervangen wijzigt alleen het geselecteerde hele woord na de emoji. De
   gedownloade tekst bevestigt de juiste UTF-16-range; één Undo herstelt haar.
5. Alles vervangen wijzigt precies vijf woorden. Eén Undo herstelt alle vijf,
   één Redo past ze opnieuw toe. Elke stap wordt werkelijk als PPTX gedownload.
6. De opgeslagen PPTX opent opnieuw in een nieuwe browserpagina. De deelwoorden
   blijven aanwezig; zoeken naar hele `kat` vindt nu niets.
7. Het Nederlandse vakje heeft de bestaande vertaling en werkt met toetsenbord
   Space; het staat ook bij een nieuw geopende dialoog standaard uit.

De proef verifieert ook dat de overige tekstvakken, vormgeometrie en het
Arial-20-lettertype behouden blijven. Vastgelegde basis-/fixrapporten staan
in `presentatie-hele-woorden-2026-11-10/`.

## Herhalen

Met geïnstalleerde afhankelijkheden en voorbereide assets:

```powershell
node node_modules/vitest/vitest.mjs run src/lint/presentatie-zoeken.test.ts --maxWorkers 1
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build --outDir .local/whole-word-fixed
node scripts/test-presentatie-hele-woorden.mjs
node scripts/controleer-i18n.mjs
```

De browserproef accepteert `OFFICE_PLAYWRIGHT_MODULE` voor een externe
Playwright-module, `OFFICE_TEST_DIST` voor een bestaande productiebuild en
`OFFICE_TEST_UIT` voor de uitvoermap. Standaard bevat
`.local/presentation-whole-word-fixed/` het rapport, de invoer en de werkelijk
gedownloade PPTX-bestanden. `--baseline` verwacht de ontbrekende functie en
gebruikt de oorspronkelijke build in `.local/whole-word-baseline/`.

## Platformstatus

| Platform | Build/pakket | Functionele controle | Resterend |
| --- | --- | --- | --- |
| Windows | Lokale TypeScript-/Vite-build groen; geen native pakket gebouwd | 10 gerichte tests en zeven Chromium-UI-gevallen groen | Platform-CI en native bediening |
| Browser | Echte productie-app groen | Zoeken/vervangen, toetsenbord, Undo/Redo, downloaden en heropenen groen | Andere browserengines niet getest |
| Linux | Bestaande CI-matrix beschikbaar; nog geen resultaat bij bronoplevering | Niet als geslaagd geclaimd | CI-build/pakket/tests en native bediening |
| macOS | Bestaande CI-matrix beschikbaar; nog geen resultaat bij bronoplevering | Niet als geslaagd geclaimd | CI-build/pakket/tests en native bediening |

De platform-CI wordt op hetzelfde definitieve broncodepunt gestart; resultaten
en resterende controles worden in de PR en overdracht apart vermeld. Een
geslaagde build bewijst geen native bediening. Het overkoepelende #29 blijft
open; de bevroren kandidaat en `main` worden niet gewijzigd.
