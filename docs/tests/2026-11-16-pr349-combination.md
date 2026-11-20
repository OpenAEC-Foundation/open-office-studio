# PR #349 — actuele combinatiecontrole, 16 november 2026

De PR is geactualiseerd naar **cb99e79ed2e1c9468f24bf69903572b6dc29ad82**, tree **225268c334e93b8c890d9e98171b4c5c6c63b58a**, rechtstreeks op basis **93fcc6194904f70fa12d0a3546c23dac9c673ee5**. De applicatiewijziging is de ongewijzigde oorspronkelijke #327-patch; daarnaast bevat de PR het bestaande meetbewijs/proeven van 16 november. Oude release-/issueafhandelingsdocumenten en de losse pivot-helperwijziging zitten niet in de nieuwe diff. De oude head is bewaard op [de back-upbranch](https://github.com/OpenAEC-Foundation/open-office-studio/tree/codex/archive/pr349-2026-11-16-8bf19ef6). De vervanging gebruikte uitsluitend de overeengekomen exacte lease tegen 8bf19ef6.

**Uitkomst: de beschikbare combinatiecontroles op deze vaste head slagen.** De bron kan onder de resterende voorwaarden naar de centrale integratievalidatie. PR #349 blijft concept en #327 blijft open. Er is geen nieuwe functionele fix gemaakt en niets naar main gemerged of als release gepubliceerd. Dit is geen algemene prestatievrijgave voor zwakke computers.

## Platformen op exact dezelfde head

De [desktopmatrix](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43833855766) en [browsermatrix](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43833860197) zijn rechtstreeks met workflow_dispatch tegen de vaste werkref gestart, zodat hun checkout exact de PR-head is. De logs bevatten de volledige SHA; de zes normale/hosted browserrapporten bevestigen hetzelfde codepoint en een schone werkboom. Automatische PR-controles zijn apart geregistreerd en vervangen deze exact-head-matrices niet.

| Platform | Tests | Bouw/pakket | Ondersteunde browserroute |
| --- | --- | --- | --- |
| Windows | 3480 / 3 skips; 58 Python; 113 Rust / 5 ignored | geslaagd | 9 gewone + 9 hosted gevallen geslaagd |
| Linux | 3480 / 3 skips; 58 Python; 113 Rust / 6 ignored | geslaagd | 9 gewone + 9 hosted gevallen geslaagd |
| macOS | 3480 / 3 skips; 58 Python; 113 Rust / 5 ignored | geslaagd | 9 gewone + 9 hosted gevallen geslaagd |

NSIS, DEB en AppImage zijn werkelijk uitgepakt en gecontroleerd; pakketnamen, maten en SHA256 staan in de JSON. macOS app/DMG, bestandskoppelingen en de native LaunchServices-proef voor openen bij starten en in de draaiende app slagen. Die openingsproef bewijst geen native Writer-typ-/taal-/opslagbediening. Windows/Linux-installatie en native taalindicatorbediening zijn niet uitgevoerd. De algemene Linux-nativecontrole blijft eigendom van de centrale integratiechat en is niet aan deze PR toegevoegd.

## Lokale gewone productie en hosted route

TypeScript, gewone Vite-productiefrontend, hosted frontend en de aparte meetbuild slagen op dezelfde head. De hosted-bundelcontrole vindt geen externe bronnen of absolute paden. Beide productiebundels bevatten 336 JS-assets zonder meetbruggen/plannertellers.

De gewone route / en echte hosted route /office/ slagen elk voor 25 taal-, invoer-, Undo/Redo-, opslag/heropen- en tabbehoudcontroles, zonder meetbrug of Tauri-simulatie. De aanvullende gewone productieproef opent 600 alinea's met spelling, bewerkt/scrolt/verandert de venstergrootte, gebruikt echte Ctrl+S/Opslaan-als-download en heropent exact alle 600 teksten. Er zijn geen paginafouten.

## CPU8: gepaarde A/B/A-proef

A is basis 93fcc619; B is de vaste PR-head cb99e79e. Bytegelijke meetinstrumentatie, lockfile, 600-alinea/79-paginafixture en Chromium 151.0.7922.34; CPU8-emulatie. Alle fasen bevatten dezelfde 1200 ms rust plus wachten op een lege taalstatusplanner. Alle uitgestelde taalstatuslezingen blijven meetellen. Een lege taalplanner betekent niet dat iedere SDK-achtergrondtaak klaar is.

Meetvenster **09:53:40–10:03:12 Europe/Amsterdam**. De integratiechat hield lokaal zware builds/tests/browser/nativebediening stil. Remote CI liep door. Hostgemiddelden omvatten ook het eigen browserwerk; de gedeelde host en native batching blijven bronnen van variatie. Alle pogingen, ook ongunstige, zijn bewaard.

| Proef | Typen incl. rust (ms) | Selectie-taalopzoekingen | Publieke documentlezingen | Caret (ms) | Scroll (ms) | Hostgemiddelde |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A1 | 7747.98 | 3 | 8 | 5410.24 | 11904.28 | 10.97% |
| B1 | 8167.27 | 1 | 5 | 5570.48 | 12052.78 | 13.66% |
| A2 | 10510.58 | 8 | 14 | 6693.03 | 12308.00 | 16.92% |

Alle drie proeven behouden exact alle 600 teksten, de caretpositie, alle 29 onafhankelijke geometriecontroles, 92 zichtbare spellingrechthoeken en SDK-opslaan/heropenen inclusief de heropende overlay, zonder paginafouten. De kandidaat doet één selectie-taalopzoeking tegenover drie en acht in de controles. De totale typefase ligt echter tussen de controles: **8,17 s versus 7,75 en 10,51 s**. Daaruit volgt geen algemene CPU8-versnelling. De eerdere gunstige CPU4-reeksen staan op hun eigen geïsoleerde bronpunt e5db41f2 vastgelegd; ze zijn niet als nieuwe cb99-metingen gelabeld. De eerdere ongunstige resultaten blijven in dat verslag en de back-uphistorie behouden.

## Resterende acceptatie en bewijs

Native taalindicator-/toetsenbord-/bewerk-/opslagbediening op alle drie desktopplatforms, fysieke zwakke computers en totaal proces-RAM blijven onbewezen. De toekomstige centrale combinatie moet op het gekozen eigen eindcommit worden gecontroleerd; resultaten worden niet zonder meer naar een ander codepunt overgezet. Main blijft buiten de verleende toestemming.

De [JSON](2026-11-16-pr349-combination.json) bevat exacte bronpunten/trees, CI-runs/jobs, testtellingen, pakketrapporten/hashes, alle browserresultaten en CPU8-fasen/correctheidscontroles. Het [gewone-productieproefscript](2026-11-16-pr349-production-language.mjs) en de [CPU8-runner](2026-11-16-pr349-cpu8-runner.mjs) zijn bytegelijk bewaard; hun SHA256 staat in de JSON. De gebruikte meetprobe is de reeds opgenomen 2026-11-16-writer-language-acceptance-probe.mjs. Voor herhaling: gebruik de beschreven eigen sibling-worktrees, de vaste bronpunten, dezelfde lokale Chromium-binary en herstel de instrumentatie-manifesten uit de JSON; kopieer de proefbestanden naar de daar beschreven .local-paden. Gebruik nieuwe labels zodat oude pogingen niet worden overschreven. Raw logs en CPU-profielen blijven in de eigen .local-mappen beschikbaar.
