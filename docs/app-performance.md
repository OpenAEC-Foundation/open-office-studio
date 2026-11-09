# Performance van Spreadsheet en Presentation

Deze wijzigingen beperken werk van de statusbalk. De meetbasis is commit `e741e504`; de functionele branches van de andere chats worden afzonderlijk ontwikkeld. Dit rondt de bredere spreadsheetperformance-issue #74 niet af.

## Spreadsheet

De oude statusbalk las maximaal 200.000 cellen synchroon en maakte twee extra lagen arrays om hun waarden te tellen. Rastermutaties tijdens scrollen planden diezelfde volledige lezing opnieuw.

`SelectieStatistieken` houdt uitsluitend de huidige berekening vast, met de werkmapversie, stabiele blad-ID en selectiegrenzen als sleutel. Scrollen met dezelfde selectie hergebruikt het resultaat. Nieuwe berekeningen lezen maximaal 500 cellen per blok en geven tussen blokken de hoofdthread terug. Het aantal cellen en de limiet van 200.000 blijven gelijk. De teller verwerkt waarden rechtstreeks, in dezelfde rijvolgorde als voorheen. Het resultaat wordt alleen gepubliceerd wanneer selectie, editor en werkmapversie nog actueel zijn. Bij een nieuwe selectie zijn de oude statistieken leeg zolang de berekening loopt.

Tests controleren de blokgrens, hergebruik, onderbreking bij een andere selectie of gesloten editor, versie-invalidering, brede selecties, getalvolgorde en de bestaande bovengrens. Een echte werkmaptest controleert formuleherberekening en Undo/Redo.

### Browserproef

Playwright en Chromium moeten beschikbaar zijn. Met `PLAYWRIGHT_MODULE` kan een bestaande externe installatie worden gebruikt; de app krijgt geen extra runtimeafhankelijkheid.

```powershell
node scripts/spreadsheet-proef-prestaties.mjs
pnpm exec vite build --configLoader runner --config scripts/app-performance.config.ts --outDir .local/performance-kandidaat
$env:PLAYWRIGHT_MODULE = 'C:/pad/naar/playwright/index.mjs'
node scripts/meet-spreadsheet.mjs .local/performance-kandidaat kandidaat 4
```

De aparte meetconfig injecteert een brug naar de editor en statuswinkel. Deze brug zit niet in de gewone productieconfig. Het script opent 10.000 rijen met 100.000 getallen en 10.000 formules, selecteert 100.000 cellen, scrolt en wijzigt A1. Het bewaart methode-tellers, lange taken, frame-intervallen en een CPU-profiel onder `.local/`. Na opslaan heropent het bestand met de meegeleverde rekenkern en controleert het alle 110.000 waarden en alle 10.000 formules.

Een instrumenteerde proef met viermaal vertraagde Chromium-CPU gaf:

| Meting                                                | Oorspronkelijk | Blokken van 500 |
| ----------------------------------------------------- | -------------: | --------------: |
| Grootste statuslezing                                 | 100.000 cellen |      500 cellen |
| Langste `readCells` tijdens eerste selectie           |       3.494 ms |         28,4 ms |
| `readCells`-aanroepen tijdens scrollen                |              7 |               0 |
| Totale tijd scrollproef                               |        15,55 s |          4,27 s |
| Totale tijd tot selectiestatistiek                    |         5,43 s |          6,45 s |
| 95e percentiel frame-interval tijdens eerste selectie |       883,3 ms |         16,8 ms |

De som is in beide gevallen 500.500.000 vóór en 500.500.998 na de bewerking. Alle waarden/formules blijven behouden na opslaan en heropenen. Een eerdere kandidaat met blokken van 2.000 had nog individuele lezingen tot 105 ms; daarom is de blokgrootte verkleind.

Het opdelen geeft invoer en tekenen tussendoor ruimte, maar verhoogt de totale afrondtijd. Dit zijn afzonderlijke verkennende runs, geen algemene FPS-garantie of representatieve hardwarebenchmark. De volledige app heeft nog andere lange taken: in de laatste selectieproef was het maximale frame-interval nog 1,18 s en tijdens scrollen 350 ms. CPU-vertraging simuleert geen gebrek aan RAM. Herhaal op echte zwakke hardware vóór een releaseclaim.

### Vervolg: rastergeometrie voor Spreadsheet-koppen

De rij-/kolomkoppen maakten tijdens scrollen nog een tweede native `displayList` voor hetzelfde venster als de engine. `volgKopRaster` bewaart uitsluitend de geometrie van het laatst getekende raster, met documentversie, actief blad en viewport als sleutel. De native tekenaanroep blijft altijd doorgaan. Na de eerste meting wachten de koppen op die echte tekenaanroep in plaats van zelf alvast een frame te bouwen. Wijzigingen wissen de metadata. Er wordt slechts één raster bewaard, zonder cellen of tekenprimitieven. Bij opruimen wordt de methode alleen hersteld als geen andere laag hem inmiddels heeft omhuld; dit is afgestemd met de voorwaardelijke-opmaakchat.

De laatste browserproef bevatte 11 native `displayList`-aanroepen tijdens de scrollreeks, tegenover 22 vóór deze aanpassing. Er zijn nog steeds nul herlezingen van selectiecellen tijdens scrollen. Vergelijking met onafhankelijke `displayListProfiled`-geometrie bevestigt de kopposities na selecteren, scrollen, zoomen, aanpassen van kolombreedte, verbergen van een rij en Undo/Redo. Alle 110.000 waarden en 10.000 formules blijven na opslaan/heropenen correct. Echte-engine tests controleren ook de begrensde cache, structuurwijzigingen, editorisolatie en wrapperopruiming.

De laatste CPU4-run had nog een maximaal scrollframe van 417 ms en een selectieframe van 1,15 s. De globale tijden varieerden sterk met de computerbelasting. Het gehalveerde aantal rasterlezingen is een concrete besparing; volledige soepelheid is hiermee nog niet aangetoond.

## Presentation

`DiaTelling` bewaart alleen het aantal dia’s voor de huidige documentversie. Navigatie en DOM-mutaties kunnen dat aantal hergebruiken. Invoegen, verwijderen, Undo/Redo en andere documentwijzigingen laten de teller opnieuw lezen. De statusbalk publiceert gelijke dia-/totaalaantallen niet opnieuw.

De profielanalyse wees daarnaast op veel werk in `lettertypen/canvasFont.ts`. De bestaande reparatie voor familienamen zoals `Source Serif 4` stelde ook geldige, ongewijzigde fonts herhaaldelijk opnieuw in. De nieuwe setter hergebruikt bewezen geldige absolute fontopgaven. Hij leest steeds de actuele native font: save/restore, canvas-resize en reset kunnen de toestand veranderen zonder de setter aan te roepen. Relatieve groottes, relatieve gewichten en opgaven met regelhoogte blijven via de native setter lopen. De cache houdt maximaal 256 korte opgaven van elk maximaal 512 tekens vast en bevat geen canvascontexten.

### Browserproef

```powershell
node scripts/presentation-proef-prestaties.mjs
pnpm exec vite build --configLoader runner --config scripts/app-performance.config.ts --outDir .local/performance-kandidaat
$env:PLAYWRIGHT_MODULE = 'C:/pad/naar/playwright/index.mjs'
node scripts/meet-presentation.mjs .local/performance-kandidaat kandidaat 4
```

De proef gebruikt 100 dia’s en 1.202 vormen, navigeert 15 keer en typt een vaste tekst. Hij telt ook de native canvas-font-toewijzingen. Vervolgens controleert hij tekstbehoud, Undo/Redo, de status na invoegen/verwijderen van een dia en alle opgeslagen teksten na heropenen met de echte engine. Met `--checks-only` worden de functionele controles uitgevoerd zonder de getimede navigatie-/typereeks.

`canvasfont-proef.mjs` vergelijkt de app met directe native fonttoewijzingen: tekstbreedtes, pixels en eigenschappen voor kerning, stretch, caps en spatiëring. Er zijn 23 browsergevallen voor gewone en Offscreen-canvassen, waaronder save/restore, resize, reset, relatieve CSS-grootte en een FontFace die pas later wordt geladen. Onnodige quotes rond een enkele familienaam zijn geen visueel verschil en worden voor de vergelijking van de fontstring genormaliseerd.

Twee runs met dezelfde uitgebreide instrumentatie en viermaal vertraagde CPU gaven:

| Meting                                     | Oorspronkelijk | Teller + fontcache |
| ------------------------------------------ | -------------: | -----------------: |
| Volledige snapshots tijdens navigatie      |             30 |                 15 |
| Native font-toewijzingen tijdens navigatie |        876.582 |            104.754 |
| Native font-toewijzingen tijdens typen     |        736.545 |             83.214 |
| Totale tijd navigatieproef                 |        53,51 s |            39,40 s |
| Totale tijd typeproef                      |        47,33 s |            34,58 s |

De resterende snapshots bij navigatie komen uit de editor zelf; alleen de statusbalklezingen worden vermeden. Tijdens typen verandert de documentversie, zodat de teller opnieuw moet lezen. De cache alleen verhelpt het tekenwerk niet.

De eerste verkennende runs, zonder native font-tellers, duurden 37,38/43,86 s (oorspronkelijk, navigatie/typen) en 76,19/76,79 s (alleen de teller). Ze zijn bewaard en illustreren de grote spreiding op deze gedeelde computer. De extra font-instrumentatie voegt bovendien werk toe. De tabel is daarom geen algemene snelheidsclaim. De aantallen toewijzingen laten wel zien welk herhaald werk vervalt. Ook met beide wijzigingen blijven er lange frames over; de apps moeten nog op echte zwakke hardware worden gemeten.

## Controles

```powershell
pnpm exec tsc --noEmit
pnpm exec vitest run --configLoader runner --maxWorkers 2 --testTimeout 30000 --hookTimeout 30000
pnpm exec vite build --configLoader runner
```

De gewone productiebuild gebruikt geen meetbrug. De uitgebreide status- en lettertypetests controleren ook dezelfde native documentengines als de app. Deze wijzigingen raken de werkmap-/presentatie-inhoud niet; andere chats houden hun functionele issuebranches en enginewijzigingen.

Afsluitende validatie van de gecombineerde bron: TypeScript en de gewone productiebuild slagen; 2.006 tests slagen en 7 bestaande tests zijn overgeslagen. De productie-assets bevatten geen meetbrug. De nieuwe Spreadsheet-browserproef controleert alle 110.000 waarden en 10.000 formules na heropenen, met nul selectielezingen tijdens scrollen en maximaal 23,9 ms per lezing tijdens de eerste selectie. De Presentation-controle bevestigt 100 dia’s, 1.202 vormen, tekstbehoud na heropenen, werkende Undo/Redo, bijgewerkte status bij invoegen/verwijderen en alle 23 canvasfont-gevallen.
