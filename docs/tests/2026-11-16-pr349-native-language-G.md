# PR #349 — native taalstatus op combinatie G

**Linux geslaagd: 32 taalstatusasserties plus opslag/procescontroles. macOS: dezelfde 32 taalasserties en native opslag/procescontroles geslaagd via het expliciete alternatieve Control+Home/End-protocol. Volledige native vrijgave blijft geblokkeerd door standaard Cmd-navigatie en onzichtbare documentglyphs bij openen/heropenen.** De vier eerdere mislukte G-proeven blijven behouden; resultaten van F worden niet naar G overgezet. Geen applicatiecode gewijzigd, geen merge naar `main`, geen issue gesloten.

## Vastgelegde combinatie en pakket

Applicatie **9e0ad565402815082e8edf11a4c23943455fb6ce** (G), tree **b79ec077abb3a7a3b199c05a45f2fb6908dc2ace**. De integratiechat heeft PR #354 eenmaal toegevoegd en de CI-only #355-workaround behouden. Onze eigen branch `codex/writer-349-native-language-2026-11-16` levert uitsluitend unieke testhelpers/workflows en bewijs; centrale rootbestanden blijven ongemoeid.

De [standaard desktoprun 43856368812](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43856368812), Linux-job **133261557496**, heeft het brongebonden pakket en pakketrapport gepubliceerd. Run-head en workflowpad zijn onafhankelijk gecontroleerd: exact G, `.github/workflows/desktop.yml`.

- Installers-artifact **14221851734**, ZIP-SHA256 **3925b646da482ed8a2a6afd0acac553fb07ec5cd66fb01207b7ac226b21cfed3**.
- Pakketrapport-artifact **14222026568**, ZIP-SHA256 **330f69a2901bcba683f7379acace587ed26e8573bc3a1beae92ac059f568ff53**. Ook onafhankelijk lokaal gedownload/gehasht; DEB **383792274 bytes**, SHA256 **6b254885cb8ba65c8e3cd75f29f132a473b0a32652b035ae4f2d5ee9719e67b9**.
- De CI-verifier controleert opnieuw run/head/workflow, vaste artifact-ID's en beide vaste ZIP-digests, en streamt het grote archief naar disk. De native helper eist de exacte DEB-hash vóór installatie/bediening en vergelijkt de geïnstalleerde executable met de uitgepakte DEB-payload.
- Geïnstalleerde executable en payload: **38fddbfdd4a550b86f13256b1dad83364f2cdb4cf29c37d69df5b00ab9b5e76d**. De afzonderlijke centrale native-basisproef op G rapporteert dezelfde hash; haar artifact **14222116423**, ZIP-SHA256 **b8d27093f88054b43fbdcbd9e8975b5a25ce562627dbb2d2cef67c211e534738**, is onafhankelijk gedownload/gehasht. Dit is een vergelijking van beide echte G-proeven, geen hergebruik van F-uitvoer.

## Werkelijke Linux-bediening

Eigen run [43858722629](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43858722629), harness **736f6b08861d6c8325a2a34dd96cd6c286d61fe8**, is **SUCCESS**. Resultaatartifact **14222162568**, **364079 bytes**, lokaal gecontroleerde ZIP-SHA256 **6a35076d431c88317fb9b09356ea74e3cdaa2c3975af168339cb23ed0e9bb5f9**.

Dezelfde afgebakende testopzet als de F-bronproef, nu opnieuw daadwerkelijk uitgevoerd op G: twee via echte native opstartargumenten geopende DOCX-bestanden met identieke basistekst maar verschillende taalmarkeringen, native muisklikken en toetsen, zichtbare taalstatus, geen SDK/modelbridge of namaak-IPC. De native backend is aanwezig en de productieapp bevat geen editor-meetbrug.

- 32 onafhankelijke taalstatusasserties: NL→EN-grens, Franse alinea, invoer na rust, grensverschuiving door één ingevoegd teken, Undo/Redo/herstel, DE/IT in het tweede document, tweemaal tabwissels met bewaarde caret-taal en opnieuw gecontroleerde grenzen, en taalstatus na volledig afsluiten/heropenen.
- Echte Ctrl+S slaat precies `Nederlands English`, `Bonjour`, `Nogmaals Nederlands slot` op. Onafhankelijke ZIP/XML-uitlezing bevestigt de exacte teksten én runmarkeringen `nl-NL`/`en-GB`, `fr-FR`, `nl-NL`.
- Het tweede bestand blijft bytegelijk en behoudt `de-DE`/`en-GB`, `it-IT`, `en-US`. De opgeslagen A-hash is **4108aa0ecc466370c7add1a4639471cc76781aca410f2fb301b0dad598aa4a38** en verandert niet door navigatie/heropenen.
- Eerste app-PID **4445** sluit volledig; heropenen gebruikt PID **4536**. Alle eigen app-processen zijn na afloop afgesloten.
- Originele saved-/tabs-/reopened-PNG's zijn visueel geïnspecteerd: tekst leesbaar, correcte EN/IT/FR-status. Opnames wachten twee frames plus 250 ms; dat is geen snelheidsmeting of aangepaste functionele assertion.

Runtime: Node **22.23.4**, tauri-driver **2.1.0**, driver-SHA256 **a71b247ca519f3ed02a364cd8692d71d381ffe81279c94c6ed65ec300d217868**, WebKitGTK/driver **2.50.4-0ubuntu0.22.04.1**. Effectieve graphics: X11, software, DMABUF-override **1**, compositing-override **null**. Deze instelling blijft beperkt tot de CI-uitvoerstap.

De [JSON-receipt](2026-11-16-pr349-native-language-G.json) bewaart het volledige G-rapport, onafhankelijke tekst-/runcontrole, screenshotdigests, artifactdigests en vergelijking met de centrale basisproef.

## Native macOS op exact hetzelfde G-pakket

Het canonieke Mac-pakket uit desktoprun **43856368812** is nu beschikbaar en daadwerkelijk bediend. Installer-artifact **14224840906**, ZIP-SHA256 **857547ea62ea9a5b29e3b07943e4a9f39c8dee52c6b7a2ea485044fd8d53a2d4**; pakketrapport-artifact **14224925527**, ZIP-SHA256 **7fec1c11df425c75dcb1ac53bf5c243b08ea248c343c562962ca8b03deab26af**. De eigen verifier eist run/head/workflow en deze vaste artifact-ID's/digests voordat de app wordt uitgepakt. Er wordt geen eigen app gebouwd.

- DMG `Open Office Studio_2026.46.2_aarch64.dmg`, **373702917 bytes**, SHA256 **9b90dbf2845ab12887b52168f986f3cbd85dfe3d17fc9886223f99595d904dc6**; vóór mount expliciet vastgezet in de latere proeven.
- Executable SHA256 **fc73826cd8fc8e6cedbf64c0b94c06a33fe8550a9b13eacd0aa06d9639650814**, plist **5644059abdb0769f40320a31437149d047082e4584b1bcd5e944eecdd9283bda**, volledige appboom **6a59d8fd600859e427ecd28077e9d06d0bf6204eb38c7fed452034fb0554388c**. Alle pogingen hebben dezelfde hashes; het meegeleverde manifest is ook onafhankelijk gehasht.
- Bouwomgeving macOS 26 ARM64; **daadwerkelijke bediening macOS 15.8.2 ARM64** op `macos-15`. Dat is geen bedieningstest op macOS 26.
- Echte native CG-muisklikken binnen AX-tabnaamgrenzen, actieve venstertitel vóór invoer, bodyklik binnen AX Page 1, native toetsen en Cmd+S. Geen model-/SDK-bridge, geen volledige textarea-value uitlezen, geen TCC-/entitlements-/signing-/beveiligingswijzigingen.

| Native run | Harness | Geslaagde taalasserties vóór stoppen | Vastgelegd resultaat |
| --- | --- | ---: | --- |
| [43862834105](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43862834105) | `3933729fe3da0f11dea953f4315696a121614758` | 2 | Actieve tab A bewezen; generieke textarea-focus onvoldoende. Grens rechts bleef Dutch. Paginaglyphs onzichtbaar. |
| [43865097119](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43865097119) | `00f8685269c11e1d51ecf55e7612ddfc05901ad4` | 3 | Bodyklik geeft de juiste Dutch/English-grens. Toegevoegde clipboarddiagnose bleef leeg en blokkeerde de proef; dit bewijst geen clipboardbug. Paginaglyphs onzichtbaar. |
| [43866052742](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43866052742) | `d680447c6e9f7785adb175cf90b52f01c1a769fc` | 5 | Q-invoer + CmdS bewijst offset 11; Undo + CmdS herstelt exact. Daarna verkeerde Cmd-navigatie: screenshot toont `Bonjourx` en `Nogmaals N slotederlands`; deze twee edits zijn niet opgeslagen. Grens links mislukt. |
| [43867278004](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43867278004) | `7830f5de599d83ae45921fda13b641ad1541143a` | 5 | Expliciete native CG Command/arrow-events; opnieuw dezelfde verkeerde eindpositie, nu door werkelijk opgeslagen DOCX/XML bewezen. Gestopt bij eindpositiecheckpoint. |
| [43869351009](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43869351009) | `8c19fe83ff1a4c7d32d4534894891f8575d5214a` | **32** | Alternatieve native Control+Home/End-route. Beide opgeslagen positiecheckpoints, Undo/Redo, Save As inspecteren/annuleren, CmdS, tabretentie, volledig CmdQ en heropenen geslaagd. Visuele beperking blijft. |

De eerste vier attempts zijn mislukt en tellen niet als volledige Mac-acceptatie. Het tweede DOCX-bestand is in alle vijf gedownloade artifacts onafhankelijk bytegelijk aan het eigen inputbestand bevonden. De appboommanifesten, originele screenshots, rapporten en artifact-ZIP's zijn gehasht; de [JSON-receipt](2026-11-16-pr349-native-language-G.json) bevat elk ongewijzigd UTF-8-rapport en de onafhankelijke DOCX-uitlezing. Geen geslaagde build wordt als geslaagde bediening aangeduid.

## Afgebakende navigatieblokkade en laatste alternatieve proef

De native [Command+Up/Down-documentnavigatie](https://support.apple.com/en-us/102650) is apart geregistreerd in [#358](https://github.com/OpenAEC-Foundation/open-office-studio/issues/358), na controle van open/gesloten duplicaten en hun beschrijvingen en afstemming met de integratiechat. Geen productieoplossing binnen deze acceptatieopdracht.

Run **43867278004** slaat na Cmd+Down en ` slot` werkelijk `Nogmaals N slotederlands` op, SHA256 **45d833aa39f1f28bd219e2034a1741a54ab7a4d21ddebb222842ae246bf89727**. Verwacht is `Nogmaals Nederlands slot`. De onafhankelijke XML-uitlezing bevestigt invoeging op offset 10 in plaats van aan het einde. Vooraf is de echte positie 11 in de eerste alinea bewezen met `Nederlands QEnglish` + CmdS en exact herstel via Undo + CmdS. De taalstatus alleen had de verkeerde eindpositie niet aangetoond.

De gepinde SDK 0.5.1-input, SHA256 **d17b7a630163623e99d73b8c4b3678397ec0598e332237df1e4737767799e58d**, behandelt ArrowUp/Down met het whole-document-argument `false`; Home/End gebruikt `metaKey || ctrlKey`. Dat ondersteunt één begrensde alternatieve proef met echte **Control+Home/End**, zoals door de integratiechat geautoriseerd. Het wijst geen regressie aan PR #354 of fout in de #327-taalcache toe.

Deze ene alternatieve proef [43869351009](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43869351009), harness **8c19fe83ff1a4c7d32d4534894891f8575d5214a**, is **SUCCESS** op hetzelfde G-pakket. Resultaatartifact **14226578771**, **2127574 bytes**, onafhankelijk gedownloade ZIP-SHA256 **06384b091264789acb196d8e123f872475c7cd1a044db763037f92314b258e93** komt overeen met GitHub. Het rapport labelt de toetsen expliciet als alternatief protocol; er volgen geen extra toetsvarianten of rendererwijzigingen binnen deze ronde.

- **32 oorspronkelijke taalasserties** geslaagd: Dutch/English-grens 10/11, French, invoer na rust, verschoven grens 11/12, Undo/Redo/herstel, onafhankelijk German/Italian in B, twee tabcycli met bewaarde caret-taal en opnieuw gecontroleerde grenzen, alle heropeningscontroles.
- Echt `Q` + CmdS bewijst `Nederlands QEnglish` op offset 11, probe-SHA256 **971bf2896ee44bb3931a15c0669d8e3f8a2865cade86da26655502da1af20820**; Undo + CmdS herstelt precies de oorspronkelijke drie alinea's, SHA256 **baccf94ced6c694add16468726fbf7042e715c5f2f29014120a84705ed6603cb**.
- Het eindpositiecheckpoint slaat exact `Nogmaals Nederlands slot` op, SHA256 **61273872b9f170db6e36769dc961ec9cf055eb8a9b341ba7d4cd256082e3b6c0**. Het beginpositiecheckpoint slaat `xNederlands English` plus de overige twee correcte alinea's op, SHA256 **a0168efd4411a925e8fed4e14eb3b7072eae3fc3bd10097431eb9782c70daa34**. Deze bewijsstappen doen echte native edits en CmdS, geen afleiding uit de taalstatus.
- Cmd+Shift+S toont de echte Save As-modal met het juiste naamveld `349 native language A`; screenshot en AX-modal/filenamecontrole bevestigd, daarna native Escape en gesloten modal geverifieerd. Dit is inspectie/annuleren, geen converter- of alternatieve-formaatacceptatie.
- De uiteindelijke CmdS-opslag en onafhankelijk uit het gedownloade DOCX gelezen XML zijn exact `Nederlands English`, `Bonjour`, `Nogmaals Nederlands slot`, met runmarkeringen `nl-NL`/`en-GB`, `fr-FR`, `nl-NL`. A-SHA256 **768e79aedee0a531bdaae06e0e1954e5b082790d80e5b23a000ab433e42f7c5b** blijft gelijk bij tabwissels/heropenen. B blijft bytegelijk met `de-DE`/`en-GB`, `it-IT`, `en-US`.
- Eerste PID **2087** sluit volledig via native CmdQ; de nieuwe app heeft PID **3072**, controleert de taalgrenzen opnieuw en sluit ook via native CmdQ. `ownedAppClosed=true`, `ownMountDetached=true`.

De onafhankelijke lokale audit controleert de vijf gedownloade ZIP-digests, vaste G/pakkethashes, volledige manifestdigest, DOCX-tekst/runmarkeringen, B-inputhashes en cleanup. Voor de geslaagde proef controleert zij bovendien 32 verwachte taalwaarden, beide opgeslagen navigatiecheckpoints, Q-bewijs/herstel, modalcontrole en de twee verschillende proces-ID's. Alle ingebedde rapporten zijn na UTF-8-serialisatie opnieuw gelijk bevonden aan de originele UTF-8-rapporten; het bestaande Linux-rapport is ongewijzigd gebleven.

## Beperkingen en cleanup

Het eerste Mac-documentbeeld mist in alle vijf proeven de tekstglyphs; rode spellingmarkering en soms de caret zijn wel zichtbaar. Na de Q-edit/save/restoration wordt de tekst in de latere proeven leesbaar. Alle zeven originele PNG's van de geslaagde alternatieve proef zijn visueel bekeken: `saved.png` toont correcte leesbare A-tekst en English-status, `tabs.png` leesbare B-tekst met Italian, en `final-state.png` leesbare B-tekst met German. **`reopened.png` toont opnieuw ontbrekende A-glyphs, met wel correcte French-status.** De leesbare Save As-modal bewijst alleen die modal. Leesbaarheid na een edit of in B heft de lege A-weergave bij openen/heropenen niet op.

Er is geen aangetoonde gelijkheid met Linux-issue #355, geen bewezen app-versus-capture/readinessoorzaak en geen productie-rendererinstelling gewijzigd. De integratiechat reserveert de aparte onderzoeksmelding voor deze glyphwaarneming; deze chat maakt geen dubbel issue en doet geen rendereronderzoek. De geslaagde alternatieve taalproef geeft standaard Cmd-navigatie en de documentweergave niet vrij.

Elke afgeronde eigen Mac-proef rapporteert `ownedAppClosed=true` en `ownMountDetached=true`; na incomplete proeven is alleen het eigen app-proces beëindigd. De screenshots zijn afzonderlijke remote `screencapture`-opdrachten, geen vastgehouden lokale Computer Use-/schermopnamesessie. Er is geen lokale Windows-GUI/opname gestart en geen gedeeld proces beëindigd. De historische F-proef blijft afzonderlijk beschreven in de [F-receipt](2026-11-16-pr349-native-language.md).

De Linux-proef betreft de geïnstalleerde DEB op Xvfb; geen fysieke zwakke computer, Wayland, AppImage-bediening of algemene prestatie-/RAM-vrijgave. Windows-native, de ondersteunde browserroute en de volledige G-combinatie blijven afzonderlijke platformcontroles bij de integratiechat; eerdere F-bewijzen krijgen geen G-label. De afgebakende Mac-taalstatusacceptatie is voltooid onder alternatief protocol. De standaard Cmd-route en volledige visuele native vrijgave blijven geblokkeerd. Save As en de latere taal-/tab-/heropeningscontroles werden alleen in de vijfde G-poging bereikt; eerdere fouten zijn niet als geslaagd herschreven.
