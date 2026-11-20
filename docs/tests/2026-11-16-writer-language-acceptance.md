# Writer #327 — acceptatieherbeoordeling, 16 november 2026

**Besluit: gericht vervolg nodig.** De ongewijzigde #327-patch voldoet in de huidige geïsoleerde CPU4-proeven aan de gemeten, afgebakende prestatievoorwaarde: beide kandidaatmetingen vallen lager uit dan alle vier baselines, met behoud van tekst, caret, geometrie en opslag. Er is nu geen meetbewijs dat een nieuwe functionele aanpassing aan #327 nodig maakt. PR #349 blijft echter concept: de oude basis moet eerst worden geactualiseerd en de gekozen combinatie moet op één exact eindcommit worden gecontroleerd. Dit verslag geeft geen toestemming voor integratie, `main` of publicatie.

## Exacte bronpunten

- A: huidige basis `93fcc6194904f70fa12d0a3546c23dac9c673ee5`, tree `3a932e559fd519763f70d0d2e00582f3133625d6`.
- B: diagnostisch commit `e5db41f2aa02fbca50a7170a064af4a292ae1f9d`, tree `79af4a45f9f1801f594324888efcf0f6c5aab268`, branch `codex/writer-language-acceptance-isolated-2026-11-16`.
- B bestaat uit A plus uitsluitend de bestaande patch van `3c2595ca` ten opzichte van zijn parent. Toepassen gaf geen conflicten. De vier betreffende applicatie-/testbestanden zijn bytegelijk aan de oorspronkelijke levering. Twee meetwijzigingen uit die patch waren al aanwezig in A. Er is geen nieuwe functionele fix gemaakt.
- PR #349/head `8bf19ef697569c45b42ddd13fd7f513ba9da763a` deelt merge-base `fb66ff92` met A, maar verschilt in 93 bestanden. Die verouderde branch is niet als causale vergelijking met A gemeten.

De eigen A/B-worktrees en meetdistributies staan los van de centrale distributies. Beide bronpunten waren voor en na iedere proef schoon. `main`, release en de bestaande native testhost zijn niet gewijzigd.

## Methode en resultaten

Windows 10.0.26200, i7-14650HX, 24 logische CPU's, circa 16 GB RAM; Playwright 1.62.1 en een eigen vastgelegde Chromium 151.0.7922.34-binary. CPU4-emulatie; 600 alinea's, 79 pagina's, 2.400 opzettelijke spelfouten. Meetconfig, driver, lockfile en fixture zijn voor A en B bytegelijk en met SHA256 vastgelegd. Het afgeleide proefscript voegt alleen tijdstempels voor deelstappen toe; broncode en invoer blijven gelijk.

Eerst A1/B1/A2, daarna ter bevestiging A3/B2/A4 wegens de spreiding en eerdere tegengestelde uitkomsten. Geen pogingen zijn verwijderd. Iedere fase omvat invoer, flush plus twee frames, dezelfde 1.200 ms rust en wachten op een lege taalstatusplanner. Uitgestelde taalstatuslezingen blijven daardoor meetellen. De gerapporteerde taalopzoektijd betreft het taalopzoek-/setTaal-blok, niet alle callbacktaken. Er is niet beweerd dat iedere SDK-achtergrondtaak na deze rust klaar is.

Het meetvenster liep van **09:17:43 tot 09:31:36 Europe/Amsterdam**. Centrale normale/hosted builds en gerichte tests waren vooraf klaar; native testwerk werd aangehouden. Deze chat voerde tijdens de getimede proeven geen zware lokale taken uit. Resterende systeembelasting is niet volledig uitgesloten. Het hostpercentage omvat ook de eigen browser en alle correctheidscontroles; het wijst geen extern proces als oorzaak aan.

| Proef | Typen incl. rust | Taalopzoekingen selectie / tijd | Alle publieke documentlezingen / tijd | Caret incl. rust | Scroll incl. rust | Hostgemiddelde |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A1 | 6.485,19 ms | 7 / 459,7 ms | 13 / 626,2 ms | 3.063,40 ms | 8.187,35 ms | 19,73% |
| B1 | 5.414,65 ms | 1 / 2,5 ms | 4 / 87,4 ms | 2.753,36 ms | 6.049,37 ms | 20,18% |
| A2 | 9.153,53 ms | 2 / 606,7 ms | 8 / 795,4 ms | 9.073,75 ms | 22.807,16 ms | 31,12% |
| A3 | 6.022,21 ms | 7 / 365,3 ms | 11 / 456,2 ms | 2.745,05 ms | 5.646,85 ms | 18,84% |
| B2 | 5.815,82 ms | 1 / 2,6 ms | 4 / 46,6 ms | 2.116,64 ms | 4.764,73 ms | 12,12% |
| A4 | 6.331,01 ms | 6 / 321,0 ms | 12 / 511,3 ms | 3.073,93 ms | 5.757,73 ms | 11,87% |

Alle zes proeven slagen voor alle 600 teksten, de exacte caretpositie, alle 29 onafhankelijke geometriecontroles, 92 zichtbare spellingrechthoeken en exact SDK-opslaan/heropenen inclusief de heropende overlay, zonder paginafouten. De gerichte tests slagen op A (19 in drie bestanden) en B (33 in vier bestanden); TypeScript en beide meetbuilds slagen. De aparte test op de oude PR-basis is niet als validatie van het nieuwe diagnostische punt hergebruikt.

## Oorzaakanalyse en grenzen

Minder calls is op zichzelf geen bewijs voor een snellere typefase. A2 heeft bijvoorbeeld minder taalopzoekingen dan A1, maar duurt langer: 4.003,30 ms zit in flush/twee frames tegenover 620,75 ms in A1. Ook na de vaste rust is de wachttijd in A2 langer. De bredere profilerduur voor typen plus caret, inclusief tussenliggende gaten en meetoverhead, is daarom naast de fasetijden bewaard: A1 10.846,64 ms, B1 9.147,26 ms, A2 27.975,17 ms; A3 9.935,57 ms, B2 8.505,50 ms, A4 10.722,58 ms. Die bredere vensters veranderen het teken van de huidige vergelijking niet.

De profielen bevatten veel `(program)`-tijd, DOM-werk en SDK/native verwerking. Ze geven geen sluitende oorzaak voor de eerdere ongunstige proeven. De oude waarnemingen 6,38→8,42 s en 6,557→8,822 s blijven behouden en zijn niet als fout of uitsluitend als hostbelasting afgedaan. De geïsoleerde, actuele bron maakt het effect nu beter te beoordelen; de uitkomst blijft beperkt tot dit scenario en deze gedeelde host. Twee kandidaatmetingen zijn geen universele snelheids- of statistische garantie en geen bewijs voor totaal RAM of fysieke zwakke computers.

Op diagnostisch punt B zijn vandaag geen nieuwe Linux/macOS-CI, native taalindicatorbediening of normale productie-browserproeven uitgevoerd. De eerdere groene CI/25 productiechecks op andere bronpunten bewijzen die huidige combinatie niet. Voor het einde van de integratie zijn de vereiste platform-, pakket- en functionele controles op het gekozen vaste eindcommit nog nodig. Dit is geen afkeuring van de huidige geïsoleerde prestatie-uitkomst en geen vrijgave van de oude PR.

## Bewijs en herhaling

De [JSON](2026-11-16-writer-language-acceptance.json) bewaart exacte commits/trees, instrumentatie- en dist-hashes, browserbinary-hash, start-/stoptijden, alle fasecijfers, hostgemiddelden, correctheidsresultaten, profielsamenvattingen en open controles. Raw logs, JSON en CPU-profielen blijven onder `.local` van de eigen A/B-worktrees. De ongewijzigde patch staat op de diagnostische branch; het bewijs staat apart op een branch vanaf A, zonder applicatiecodewijziging.

Het [afgeleide proefscript](2026-11-16-writer-language-acceptance-probe.mjs) en de [runner](2026-11-16-writer-language-acceptance-runner.mjs) zijn exact bewaard. Voor herhaling: zet de vaste bronpunten in eigen A/B-worktrees, bouw de bytegelijke meetconfig naar `.local/327-measurement`, kopieer het proefscript naar `.local/acceptance-meet.mjs` en gebruik dezelfde fixture en Chromium-binary. De runner verwacht de twee beschreven sibling-worktrees en de instrumentatie-manifesten in de oorspronkelijke eigen meetwerkboom; voer daar `node .local/run-327-aba.mjs A1 B1 A2` uit en gebruik nieuwe labels voor extra pogingen. Het script weigert gewijzigde bron, afwijkende instrumentatie en het overschrijven van eerdere pogingen. Gewone productie en native bediening vragen eigen controles.
