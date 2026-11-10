# Overdracht integratie — 9 november 2026

De gebruiker heeft gevraagd uiterlijk **15:40 Europe/Amsterdam te stoppen** en morgen pas verder te gaan. Start na deze overdracht geen nieuw werk of automatische hervatting.

## Bewaarde versie

- Branch: `codex/integratie-2026-11-09`; concept-PR [248](https://github.com/OpenAEC-Foundation/open-office-studio/pull/248).
- Laatste codecheckpunt: `54406adbf6480a2b2d62ca119a7a025266cdd18c`. Een latere overdrachtscommit verandert alleen deze rapporten.
- Werkmap: `C:/Users/alper/Desktop/Documents/ChatGPT/code slaafjes/work/oos-integratie-9635`.
- 42 bron-PRs /45 leveringen samengevoegd;17 eerdere PRs via die bundels. Bronheads en mergecommits staan in [het register](integratie-2026-11-09.md).
- `main` is niet gewijzigd; geen release of installer gepubliceerd. De bron-PRs niet nogmaals cherry-picken.

## Gecontroleerd

De volledige applicatiesuite op `7b58503511c89e408c08b42e5fa8c148fe7aabf3` slaagt: **2796 geslaagd,0 mislukt,7 overgeslagen,269 bestanden**. De productiebuild inclusief assets en TypeScript slaagt. Negen talen/21 namespaces/7700 sleutels zijn gecontroleerd. De Python-suite heeft57 geslaagde controles en één platformskip.

De gecombineerde Presentation-browserreeks (groepen,thema's,afbeeldingen,tabellen,grafieken,hergebruik,objecten,ontwerp,overzicht,overgangen/geluid en animaties) en de Spreadsheet-browserreeks (groepen/fouten,voorwaardelijke opmaak,threaded opmerkingen,validatie,beveiliging,notities,objecten,print/PDF en50000 workerformules) slagen. Ook acht bladbewerkingsgevallen slagen.

Algemene modaltoetsen,Settings-tabvolgorde,sjablonen/auteurs/recente bestanden zijn getest; de datumproef is aangepast aan sessieopslag en de zes datum- en zes rapportgevallen slagen. De echte Writer-ODT-wrapper doorloopt vier behoudgevallen onder45s per conversie;12 officiële ODF1.3 pakket-/schemacontroles slagen. Beide volledige mailmergeproeven en vier formuleweergave-/PDF-gevallen slagen.

Machineleesbare resultaten, exact geteste revisies, CI-snapshot en resterende controles staan in [het verificatierapport](integratie-2026-11-09-verificatie.json). Ruwe lokale resultaten en screenshots blijven bewaard in `.local/`; die bestanden zijn bewust niet in Git opgenomen.

## Morgen eerst doen

1. Lees deze overdracht en het verificatierapport. Controleer `git status --short`, `git branch --show-current` en `git rev-parse HEAD`; werk op deze bestaande integratiebranch. Gebruik geen reset/forcepush en merge nog niet naar `main`.
2. Bekijk `gh pr checks 248`. De laatste Writer-formatproef is aangepast aan de geïntegreerde sjabloonsemantiek (DOT/OTT worden nieuwe DOCX-documenten); beoordeel de nieuwe CI-run. De voorbeeld-CI was al groen nadat de teksttest rekening houdt met meerdere canvas-tekstfragmenten. Native builds lopen in GitHub omdat lokaal Application Control4551 Cargo-buildscripts blokkeert. macOS was nog queued.
3. Onderzoek de wisselende Writer-verwijzingsproef. `node scripts/proef-verwijzingen.mjs dist` kan de Ctrl+klik-navigatieassertie missen; dit is **niet afgerond verklaard**. De gezamenlijke veld-/savequeue is in7b585035 op de stabiele documentsessie gezet en heeft een regressietest. Bewijs: `.local/verification/writer-proef-verwijzingen.log`, `.local/verwijzingen-uit.docx`, `.local/verwijs-fout.png`. Vergelijking-invoegen had eenmaal een opstarttimeout onder belasting; de zelfstandige herhaling slaagde. Herhaal de oorspronkelijke proef met expliciete editor-/layoutgereedheid.
4. De aanvullende Writer-browserreeks voor kop-/voetteksten, vervolgstijlen, stijlen/noten, Undo/regex en tabelsortering/thema is inmiddels volledig groen (acht scripts). De wisselende verwijzingsproef hierboven blijft afzonderlijk open. De privé-orchestratie staat in `.local/run-verification.mjs`; losse reproduceerbare scripts staan in `scripts/`. Gebruik `OFFICE_TEST_DIST=dist` voor Spreadsheet-proeven; sommige hebben anders een eigen `.local/...`-default. Sjabloon/datum/rapportproeven verwachten een bestaande frontend-URL. De fixture voor de volledige mailmerge staat in `.local/samenvoegen-volledig/studio.sqlite`; maak deze zonodig opnieuw via `OOS_MERGE_DATABASE_FIXTURE` en `src/gegevensbronnen/database.test.ts`.
5. Pas daarna een nieuwe batch beginnen. Nieuwe bronheads staan onder `nextBatch` in het verificatierapport. Geen hele dirty clone overnemen. PR253/niet-geactiveerde native kandidaat,Spreadsheet73/69 WIP en Writer56 WIP blijven uitgesloten.

## Afstemming

Alle betrokken chats zijn geïnstrueerd alleen geteste checkpoints op eigen branches aan te leveren; alleen deze chat schrijft de centrale branch. De andere chats hebben hun werk tot morgen bevroren. Late follow-ups zijn apart genoteerd; zij ontbreken dus niet stilzwijgend uit de vaste batch.

Conversiebeperkingen blijven gelden: de problematische oude DOC-import, DOC-objectafvlakking en ODP-overgangsverlies uit de bronrapporten zijn niet verdwenen. De gebruiker koos lokale tests zonder een echte Y-app-opslagomgeving. Brede issues worden pas na hun resterende criteria en uiteindelijke main-merge gesloten.

## Afsluiten

Alle lokale controles zijn beëindigd; er is geen automatische hervatting aangevraagd. Na de definitieve commit/push wordt HEAD gelijk aan de remote bevestigd. GitHub-CI mag online uitlopen; morgen eerst de actuele resultaten lezen. De code en deze overdracht hangen niet van een open Codex-venster af.
