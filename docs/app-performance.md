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

| Meting | Oorspronkelijk | Blokken van 500 |
| --- | ---: | ---: |
| Grootste statuslezing | 100.000 cellen | 500 cellen |
| Langste `readCells` tijdens eerste selectie | 3.494 ms | 28,4 ms |
| `readCells`-aanroepen tijdens scrollen | 7 | 0 |
| Totale tijd scrollproef | 15,55 s | 4,27 s |
| Totale tijd tot selectiestatistiek | 5,43 s | 6,45 s |
| 95e percentiel frame-interval tijdens eerste selectie | 883,3 ms | 16,8 ms |

De som is in beide gevallen 500.500.000 vóór en 500.500.998 na de bewerking. Alle waarden/formules blijven behouden na opslaan en heropenen. Een eerdere kandidaat met blokken van 2.000 had nog individuele lezingen tot 105 ms; daarom is de blokgrootte verkleind.

Het opdelen geeft invoer en tekenen tussendoor ruimte, maar verhoogt de totale afrondtijd. Dit zijn afzonderlijke verkennende runs, geen algemene FPS-garantie of representatieve hardwarebenchmark. De volledige app heeft nog andere lange taken: in de laatste selectieproef was het maximale frame-interval nog 1,18 s en tijdens scrollen 350 ms. CPU-vertraging simuleert geen gebrek aan RAM. Herhaal op echte zwakke hardware vóór een releaseclaim.
