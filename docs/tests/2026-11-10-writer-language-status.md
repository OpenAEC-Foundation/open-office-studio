# Writer-taalstatus #327 — bron en testbewijs

Geteste applicatiebron: **`3c2595ca22134bc776132a4790e3e6851d07196a`**, branch `codex/writer-language-status-performance-2026-11-10`. Dit afzonderlijke bewijscommit wijzigt geen applicatiecode. De codebranch blijft op dat vaste punt staan.

De taalstatus bewaart geen documenten of talen in een versiecache. Hij bundelt leeswerk tijdens invoer en leest na 350 ms rust vers; gepubliceerde inhoud/metadata wordt direct verwerkt. Gewone cursorbewegingen blijven actueel. Oude payloads, vervangen API's, sluiten en stoppen worden afgevangen.

## Metingen en gerichte controles

Alle vergelijkingsfasen hieronder bevatten dezelfde 1.200 ms rust en wachten op een lege taalstatusplanner. Het meetpunt `languageStatus.*` omvat de taalopzoeking met eventuele documentlezing en `setTaal`; selectie-info en ander callbackwerk staan erbuiten, maar tellen mee in de totale fase en methode-tellers.

| Typen inclusief rust | Taalopzoekingen na selectie | Tijd taalopzoeking na selectie | Inhoudsmeldingen / taalopzoektijd | Alle publieke documentlezingen / tijd | Totale fase |
| --- | ---: | ---: | ---: | ---: | ---: |
| Vooraf A2, CPU4 | 7 | 366,7 ms | 2 / 6,4 ms | 13 / 522,5 ms | 6,38 s |
| Vast bronpunt, CPU4 | 1 | 23,8 ms | 1 / 0,6 ms | 6 / 755,1 ms | 8,42 s |
| Vast bronpunt, CPU8 | 1 | 3,2 ms | 2 / 0,1 ms | 4 / 74,4 ms | 6,49 s |

De ongunstige totale CPU4-tijd en totale documentleestijd zijn behouden. Metingen op een gedeelde computer en native batching lopen sterk uiteen. Deze cijfers onderbouwen minder herhaald taalstatuswerk, geen algemeen percentage voor typ-, cursor- of scrollsnelheid en geen bewijs over totaal RAM.

- 33 gerichte tests in vier bestanden, TypeScript en normale productiebuild slagen op het vaste bronpunt. De productie bevat 214 JS-assets zonder meetbrug/planner- of projectietellers.
- CPU4 en CPU8 behouden ieder alle 600 alineateksten, de exacte cursorpositie, 92 zichtbare spellingrechthoeken en SDK-opslaan/heropenen. Alle 29 onafhankelijke geometriecontroles slagen.
- Elf taal-/opslag-/tabwisselcontroles slagen in de aparte meetbuild.
- De normale productiebrowser slaagt voor openen, typen, scrollen, vensterwijziging, echte Ctrl+S/Opslaan-als-download en heropenen; alle 600 opgeslagen teksten zijn exact.
- Een aanvullende echte productieproef op Chromium 151 / Windows met CPU4 slaagt voor 25 taalcontroles zonder SDK-meetbrug of Tauri-simulatie. Hij verifieert ook de taalgrens na één ingevoegd teken en na Undo/Redo/herstel, exacte opgeslagen tekst, heropenen en drie behouden documenten met verschillende taalmetadata. Er zijn geen JavaScript-fouten.

De [JSON](2026-11-10-writer-language-status.json) bevat bron/tree, fasecijfers, browserresultaten, pakketrapporten, CI-status en beperkingen. Het [exact gebruikte productieproefscript](2026-11-10-writer-language-status-probe.mjs) is als bewijs bewaard; de SHA256 staat in de JSON.

## Platformen en vrijgave

[Desktop-CI 42811197323](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42811197323) is rechtstreeks gestart tegen hetzelfde broncommit. Windows en Linux slagen elk voor 2.098 Vitest-tests (drie bestaande skips), 58 Python-tests, engine/opdrachtcontroles en 110 Rust-desktoptests. Rust heeft vijf genegeerde gevallen op Windows en zes op Linux; die worden niet als geslaagd geteld. NSIS- en DEB/AppImage-pakketcontroles slagen. Installatie en native Writer-taalindicatorbediening zijn daarmee niet bewezen.

macOS stond bij de gesloten intake van 13:15 nog in de runnerwachtrij. #327 is daarom niet vrijgegeven voor die integratieronde en blijft apart voor de volgende week. De laatste vastgelegde platformstatus staat expliciet in de JSON; een wachtende of ontbrekende controle geldt niet als geslaagd. De bestaande Windows-acceptatieomgeving is niet naar deze bron overgeschakeld. `main` is niet gewijzigd.

De achtbestandenpatch past volgens een aparte tijdelijke Git-index op integratiepunt `959f04830e1ccc58b70d0cd7d1d4ac1d86d37aa1` nadat #303 (`da16cea1`) is toegepast. De gedeelde index, werkboom en integratiebranch zijn niet gewijzigd. Een latere combinatie vraagt opnieuw acceptatie door de integratie-eigenaar.

## Productieproef herhalen

Gebruik het vaste broncommit, de bestaande Playwright-module en een gewone build naar `.local/language-fixed-production`. Neem het proefscript vanuit dit bewijscommit over naar `.local/issue327-production-language.mjs` en voer het daar uit. Het script controleert zelf dat de geteste checkout exact `3c2595ca22134bc776132a4790e3e6851d07196a` is. Het gebruikt uitsluitend drie zelf gegenereerde alinea's en bewaart de download/resultaten onder `.local`.
