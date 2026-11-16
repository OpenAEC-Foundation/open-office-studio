# PR #349 — aanvullende native taalstatusacceptatie

De ontbrekende Linux-taalstatusproef is geslaagd op het oorspronkelijke F-pakket met de CI-only workaround voor #355. De macOS-proef op hetzelfde applicatiepunt heeft het pakket geopend en AX-bediening bereikt, maar faalt bij het controleren van het actieve document vóór de eerste taalassertie. **Geen macOS-taalstatus-/invoer-/opslagpass.** Deze branch verandert geen applicatiecode en merge niets naar `main`.

## Bron en taakverdeling

De integratiechat wees Linux én het aanvullende macOS-349-deel aan deze chat toe. De #30-runtimechat houdt zijn eigen c0-converter-/soffice-scope; zijn resultaten worden niet naar F overgezet. Centrale helpers/workflows en productbronnen blijven hier onaangeroerd. Eigen branch: `codex/writer-349-native-language-2026-11-16`, gebaseerd op integratiepunt `594da6332be308c79e00681fdb7a9d4cd1af30c0`.

Applicatiepunt **e1f84f84f4d72e5ce8ab967e376a6f38344edf39** (F), tree **2e6123201cd3a357ac3b2df8126fa15760fce865**. De applicatie-inputs omvatten de vrijgegeven #349-patch; native bewijzen worden op F gelabeld, niet als herbouw op de PR-head. Alle nieuwe helpers/workflows krijgen eigen bestandsnamen. De workflow checkt F en de vaste harnessref afzonderlijk uit en hergebruikt de oorspronkelijke source-geverifieerde artifacts van desktoprun **43838167666**.

## Linux: werkelijke native bediening en onafhankelijke data

Oorspronkelijk DEB SHA256 **14d588cdfcebc6e50607033a324c3e6c37a77f440a5aebd36b5a6356d4ea3eb5**, payload én geïnstalleerde executable **170a7caaf7a9e44ef8616becc5a3492bace4d78d14f0ac081d2e011a9b6e8b85**. tauri-driver 2.1.0, WebKitGTK/driver **2.50.4-0ubuntu0.22.04.1**. Alleen de CI-uitvoerstap erft `WEBKIT_DISABLE_DMABUF_RENDERER=1`; X11/softwaregraphics, compositing-override niet ingesteld. Geen pakketbouw of productflag.

Twee synthetische DOCX-bestanden openen via echte opstartargumenten/native backend. Beide hebben dezelfde teksten; A heeft NL/EN, FR en NL, B DE/EN, IT en EN-US. De test gebruikt native WebDriver-toetsen en muisklikken en leest de zichtbare DOM-taalstatus; geen SDK-bridge, modeluitlezing of namaak-IPC.

- 32 taalstatusasserties: oorspronkelijke NL→EN-rungrens, volgende Franse alinea, invoer na rust, verschoven grens na één toegevoegd teken, Undo/Redo en herstel, DE/IT in B, twee reeksen tabwissels met bewaarde caret-taal en opnieuw gezochte grenzen, en taalgrenzen na volledig app-proces afsluiten en heropenen met andere PID.
- Echte Ctrl+S schrijft exact `Nederlands English`, `Bonjour`, `Nogmaals Nederlands slot`. De onafhankelijke DOCX-parser bevestigt niet alleen de teksten maar ook de opgeslagen runmarkeringen `nl-NL`, `en-GB`, `fr-FR`, `nl-NL`.
- B blijft bytegelijk en houdt `de-DE`/`en-GB`, `it-IT`, `en-US`. Navigatie/heropenen wijzigt A's opgeslagen bytes niet. Alle eigen app-processen worden afgesloten.
- Saved-/tabs-/reopened-PNG's zijn visueel bekeken: tekst leesbaar, footer respectievelijk EN/IT/FR. De eerste proef maakte de laatste screenshot vóór de definitieve compositorframe-update; die ruwe opname blijft bewaard. De tweede proef wacht twee animatieframes plus 250 ms vóór een opname en registreert de taalstatus bij de capture. Functionele assertions zijn niet verzwakt.

| Proef | Harness | Run / artifact | Lokaal geverifieerde ZIP-SHA256 |
| --- | --- | --- | --- |
| Eerste uitvoering, 32 taalasserties en data/proces geslaagd | `3a65fe5946c993955082283d47becd323c4cefc0` | [43851372572](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43851372572), 14216694428 | `941d67205f7d60910ab271f2b6ce937f8b1bad96842f51a1f04a42ad1c1cee31` |
| Met gesynchroniseerde beeldopname, dezelfde 32 assertions en data/proces geslaagd | `f509fb1699e7dce6ab4e40c5ad2d5c12582eca78` | [43852260625](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43852260625), 14218711086 | `55dc4bffc23986b5b20919dcea7bdf0ece13eef1987aad7f1a22a733a9b8693f` |

De [JSON](2026-11-16-pr349-native-language.json) bewaart beide rapporten, onafhankelijke run-/tekstcontrole en originele beeldhashes. Een frame-wachttijd is geen prestatiemeting; deze proef doet geen CPU-/RAM- of algemene snelheidsclaim.

## macOS: eigen vaste-pakketproef

Eigen workflow `writer-349-native-macos.yml`. Eerste driverpunt **6774cac88e159f84ddbac6ee58f37af5c1e6ba7f**, run [43852074084](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43852074084), is na circa tien minuten zonder runner **bevestigd geannuleerd vóór uitvoering**. Er is geen native uitslag of artifact uit die poging. Pas daarna is de vervanging gestart: driverpunt **ac2dbd39fc7db974b4f1990078bed5cdd7f0cb59**, run [43853798844](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43853798844), met vastgelegde `macos-15` ARM64-host in plaats van `macos-latest` (de oorspronkelijke F-buildlog noemt macOS 26.7.2 ARM64). [GitHub documenteert macos-15 als ondersteunde standaard ARM64-runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). Een eventuele geslaagde native bediening op macOS 15 wordt niet als macOS 26-bedieningsbewijs geëtiketteerd.

Oorspronkelijk macOS-artifact **14212893733**, ZIP-SHA256 **3fa471425d94c79866b6de10be775c888e90b1eefbaeb2d34a92ac546b1feee3**; pakketcontrole-artifact **14213985282**, ZIP-SHA256 **4e1db49af79b436a606f99c3950be07235ce8ae9de95584654fc3c8ae45c07ad**. De downloader controleert bron, workflow, artifact-ID en zowel vaste als actuele digest; daarna worden DMG, app-executable, plist en applicatieboom afzonderlijk gehasht.

De eigen AX-helper gebruikt de begrenzingsaanpak van de bestaande #30-helper op `9a9bfe39`, maar is een afzonderlijk bestand en past op F's eigen DOCX/labels. Geen TCC-, entitlements-, signing- of beveiligingswijziging. Geen volledige textarea-value uitlezen; wel begrensde controlmetadata en het eigen bestandsnaamveld in Save As. De geplande echte bediening omvat taalgrenzen, typen, Undo/Redo, Save As-modal/filename plus annuleren, Cmd+S en volledig proces-heropenen. Denial/timeouts worden expliciet als geblokkeerd vastgelegd; alleen build/startup of een toolbarlabel is geen pass.

De vervangende driver wacht expliciet op zowel taalstatus als een ingeschakelde native Save-control vóór invoer en gebruikt Cmd+Q voor de geteste volledige procesafsluiting. Alleen bij een onvolledige proef mag cleanup de eigen processen beëindigen. Hostversie/architectuur, commandofouten en opruimresultaten worden vastgelegd.

De vervanging is werkelijk uitgevoerd op **macOS 15.8.2 ARM64**. Beide vaste input-artifacts zijn geverifieerd, DMG SHA256 **b0ecb4b02d902f4005c74c766db112112f1cc476dc47cc9ff48c63668fbf0a4c**, app-executable **e1497df5a0f71be7ef4d826fb9f73d296e85e2d503f994284b50032bc2c6a73c**, plist **4fd716292636b71c8c56c1c8ce3b903c4fa1a25e0f28ab0dfc4aeba44364fe6f**, app-boom **aa3c9f110849a0b2b3521baa5384834ef954f03ea5542e482e4741973321b18a**. Het algoritme en bron-/driverhashes staan in het rapport.

Uitkomst [43853798844](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43853798844): **FAILED**, `initial A: expected Dutch`. De AX-client is `trusted=true`, vindt de ingeschakelde Save-control en kan metadata/focus uitlezen. AXPress op de radio-tab met titel A rapporteert succes; de latere boom bevat alleen tab B, venstertitel B en Duitse taalstatus. De finale PNG toont B en een gedeeltelijk buiten de 1024px-desktop geplaatst appvenster. Dit bewijst niet dat #327's taalstatus fout is: de proef heeft de beoogde actieve A-toestand niet vastgesteld en stopt vóór typen/Undo/Redo/modal/opslaan/heropenen. Geen volgende fase wordt als getest geteld.

Resultaatartifact **14221465862**, **75345896 bytes**, lokaal gedownloade en tegen Actions geverifieerde ZIP-SHA256 **e1e6240faa14c1402778765ba4113746a6af37e4cde10ce218b2787718f23bed**. Onafhankelijk gecontroleerd: beide input-DOCX-bestanden zijn bytegelijk aan hun beginhash; de in het artifact aanwezige app-executable matcht de gemelde hash. Eigen app-processen afgesloten, eigen DMG-mount ontkoppeld. De ruwe AX-snapshots en finale PNG blijven behouden.

Voor de volgende gecombineerde kandidaat is de eigen driver aangescherpt: eerst het hele venster via native windowbediening binnen de desktop zetten, tabactivatie met een echte muisklik binnen de AX-bestandsnaamgrenzen, en de daadwerkelijke venstertitel verifiëren vóór focus/typen. De aangepaste driver is **nog niet native gevalideerd**. De Mac-workflow is voortaan alleen handmatig te starten, zodat driverwijzigingen geen nieuwe F-poging uitlokken.

De integratiechat neemt intussen PR #354 in een nieuwe combinatie op. Conform die afstemming is geen extra F-Macproef gestart; kandidaatacceptatie wacht op het nieuwe exacte applicatiepunt en de gecontroleerde pakketten. Bovenstaande resultaten blijven uitsluitend F-bewijs en worden niet naar de nieuwe combinatie overgezet.

## Grenzen en behoud

Geen fysieke zwakke computer, Linux/Wayland of AppImage-bediening getest. Native Windows-bewijs en de echte browserroute worden vanuit de centrale platformmatrix op F hergebruikt met hun eigen grenzen. Deze gerichte proeven wijzigen geen bestaande prioriteiten/statussen en sluiten #327/#355/PR #349 niet. Er is geen lokale Windows-bediening of opnamesessie gestart. De integratiechat beslist over nieuwe bronintake; `main` blijft buiten de toestemming.
