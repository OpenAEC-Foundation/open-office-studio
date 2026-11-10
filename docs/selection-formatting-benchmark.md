# Native selectie-opmaak in dezelfde browserbundel

De kandidaat uit `508839ab` bevat zeven gecontroleerde bronpatches, waaronder de uniforme selectie-opmaakroute uit PR #253. De Spreadsheet-eigenaar bouwde en testte deze kern in CI; deze proef bouwt geen tweede WASM en wijzigt geen actieve vendorbestanden. De kandidaat heeft SHA256 `fe2c14896c586601a72719413958fd15ea4563e14ecaddbc745032bd05211af0` en 7.743.000 bytes. De native bronbasis is `4e982c3aea0065578604c3fe7727938533888f66`; bouwbron `305d6ddf`, native CI-run `42779147979`.

```powershell
node scripts/meet-selectie-opmaak.mjs .local/writer-viewport oud 4
node scripts/meet-selectie-opmaak.mjs .local/writer-viewport nieuw 4 C:/pad/naar/kandidaat.wasm
```

Gebruik een meetbuild met `scripts/writer-performance.config.ts` of `scripts/app-performance.config.ts`, en zet zo nodig `PLAYWRIGHT_MODULE` op de externe Playwright-module. De proef gebruikt in beide gevallen dezelfde JavaScript-bundel en onderschept precies de Spreadsheet-WASM-aanvraag met de opgegeven bytes. Ook de controlerun gebruikt dezelfde onderscheppingsroute, met de oorspronkelijke asset. Hash, lengte en daadwerkelijk geladen aanvraag worden gecontroleerd/vastgelegd. De productieconfig blijft ongewijzigd.

De werkmap bevat 100.000 getallen en 10.000 SUM-formules. Zeven aparte native `selectionFormatting`-lezingen meten telkens `A1:J10000`; tussen lezingen krijgt de browser een frame. Alle eigenschappen moeten gelijk zijn aan één cel en de documentversie mag niet veranderen. Daarna volgen een afwijkende vette laatste cel, Undo en een buitenrand rond 100 cellen. De randmutatie moet werkelijk toegepast zijn en `outer` plus rood opleveren. De volledige semantische resultaten van de twee afgeronde kernels zijn gelijk. Opslaan/heropenen controleert alle 110.000 waarden en alle 10.000 formules.

## CPU4 op 10 november 2026

| Run | Mediaan van 7 opmaaklezingen | Langste lezing | Selectie plus statistiek gereed |
| --- | ---: | ---: | ---: |
| Oud A1 | 264,0 ms | 363,8 ms | 4,06 s |
| Nieuw B1 | 75,2 ms | 119,1 ms | 6,60 s |
| Nieuw B2 | 64,7 ms | 76,0 ms | 5,04 s |
| Oud A2 | 287,0 ms | 354,0 ms | 4,58 s |

De controlerun gebruikt de oorspronkelijke kern `3c6bcf0d11f3f66ce4410ae7ba5d55c042477949e9975f3977b4e421079781de`, 7.693.796 bytes. In de eerste A1/B1-versie van de proef was de sleutel voor de randmutatie fout (`borders` in plaats van `border`); die runs leveren alleen timing-, uniforme/mengopmaak- en tekst/formulebewijs. B2/A2 gebruiken de gecorrigeerde sleutel met expliciete mutatie-/rand-/kleurasserties. Alle vier heropencontroles slagen zonder JavaScript-fouten.

De afzonderlijke uniforme opmaaklezing blokkeert duidelijk korter in beide kandidaten. De totale selectietijd verbetert in deze runs niet: andere engine-, status- en renderwerkzaamheden blijven bestaan en de computer wordt gedeeld met andere taken. Zelfs de snellere opmaaklezingen duren langer dan één frame. Deze proef onderbouwt geen algemene snelheidsfactor, RAM-besparing of volledig soepele werking op zwakke hardware. Kernactivatie en integratie blijven bij de eigenaar van de gecombineerde kandidaat.
