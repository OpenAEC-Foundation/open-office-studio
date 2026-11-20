# Conceptreleasenotes — 2026.47.1 in voorbereiding

**Besluit 20 november:** vandaag geen publicatie, tag of wijziging aan `main`. Integratie bereidt de overdracht voor zaterdag 21 november voor. Resterende Linux-/macOS-risico's zijn niet geaccepteerd. Nieuwe productfixes vragen een opnieuw vastgelegde bron en passende controles; de lopende build blijft uitsluitend bewijs voor zijn eigen bron. De vorige bewaking stopte om 15:18. Op een nieuwe expliciete gebruikersopdracht is dit noteswerk om 15:22 hervat, met een nieuwe harde stop om **15:50**; daarna geen automatische voortzetting.

**Voorbereiding, niet gepubliceerd.** De intake sloot om **15:25** op kandidaat **`420af640c10ab9ada6c66c844c0098caea87c493`**, tree `c1334c8f4d92914e9d2114d56e467ef11eab9646`, versie **2026.47.1**, branch `codex/release-prep-2026-11-20` / PR #367. Basis is integratie `771fd66e` met de geteste I3-app `7f126f4b` / tree `8bc60848`. De eerdere versievoorbereiding `e92b93a6` bevat de twee nieuwe Linux-correcties niet; releasebuild 44747669364 kan ze dus niet certificeren. Voor kandidaat `420af640` is nog geen volledige ondertekende zeven-app-releasebouw of native pakketacceptatie geleverd. Definitieve hashes en downloadlinks blijven leeg. Geen publicatie, tag of mainactie.

## Nieuwe Linux-correcties: opgenomen, nog niet volledig geaccepteerd

- **Find/Replace-invoer (#368):** Ctrl+Z, Ctrl+Shift+Z en Ctrl+Y gebruiken de bestaande invoergeschiedenis in het gefocuste bewerkbare veld op Tauri/Linux. De documentgeschiedenis blijft apart. Het nieuwe bronhelpermechanisme slaagt voor 32 invoer- en 8 documentcontroles in de ongewijzigde I3-app; dit is nadrukkelijk geen pass van een nieuw gecompileerd pakket.
- **Toetsenbordfocus in het lint (#369):** bestaande toetsenbordroutes vragen expliciet een zichtbare focusindicatie. De kleine GTK-controle onderscheidt twee falende oude pijltoetsstaten van drie Tab- en twee expliciete-optiestaten met ring; 16 begrensde componentbrowsercases slagen. Geen volledige Office/native breedte-/thema-/groepsmatrix geclaimd.

Alle vijf overgenomen bronbestanden zijn bytegelijk aan de aangeleverde productcorrecties. Het gecombineerde bronrapport bevestigt **37 tests geslaagd / 0 mislukt**; integratie meldt daarnaast een geslaagde typecheck. Nieuwe native pakketten en platformacceptatie blijven nodig; de inmiddels geverifieerde browseruitslag staat in de CI-aanvulling hieronder.

## Bouw- en CI-stand bij laatste controle

Waargenomen 15:33 CET, 20 november. Hieronder zijn API-status en bronmetadata gecontroleerd; daadwerkelijke checkout-witnesses en nieuwe artifactreceipts zijn nog niet centraal afgerond.

| Bron | Controle | Stand |
| --- | --- | --- |
| e92 (oud) | [Old release 44747669364](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44747669364) | in_progress; versie: success, Bouwen – Linux: success, Bouwen – Windows: failure, Bouwen – macOS: in_progress |
| 420 | [Desktop 44753496663](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44753496663) | in_progress |
| 420 | [Database 44753496748](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44753496748) | in_progress |
| 420 | [Example 44753496637](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44753496637) | completed / success |
| 420 | [Writer formats 44753496701](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44753496701) | completed / success |
| 420 | [Document matrix 44753496566](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44753496566) | completed / success |
| 420 | [Spreadsheet matrix 44753496662](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44753496662) | completed / success |
| 420 | [Presentation ODF 44753496653](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44753496653) | in_progress |
| 420 via externe QA | [Browser QA 44753552773](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44753552773) | in_progress |

De Windows-job van e92 faalde in **Pakket bouwen (Windows, ondertekend)**; geen oorzaak of signingpass afgeleid. Linux-e92 is groen, macOS-e92 heeft nog geen complete uitslag in deze momentopname. Die resultaten blijven bij e92. De eigen oude-runbewaking is beëindigd; integratie beheert verdere CI-, artifact-, signing- en downloadaudit. Er wordt niet op extra CI gewacht voor deze overdracht.

## Aanvulling geverifieerde CI van 420af640

Stand 15:43 CET. Integratie bevestigt dat de overdracht voor 21 november **inhoudelijk compleet** is; zij werkt de centrale current-handoff-, cleanup-, status- en pushverwijzingen nog af. Dit betekent geen releasevrijgave.

De browser-QA `44753552773` slaagt op alle drie OS'en en beide routes. De centrale audit controleerde drie ZIP-digests, zes bron/tree-receipts, 24 issuerapporten, zes Office-rapporten met elk negen cases en zes opgeslagen DOCX-bestanden. APP420/treec133 en externe QA c493 zijn gebonden. De CI-assetmappen zitten niet in die ZIPs: geen onafhankelijke herhashclaim voor de 727 assetbytes en geen native of universele eerste-paintacceptatie.

Vijf hulpworkflows slagen, inclusief Presentation-ODF op alle drie platforms. De eerste vier gebruiken PR-mergecommit `a57837f03705b34c8b191b76a6cb48271f1e39a6`, **niet** commit420. De volledige Git-boom is aantoonbaar exact `c1334c8f4d92914e9d2114d56e467ef11eab9646`, met ouders771/420. Daardoor is de inhoud gelijk; de commitmetadata blijft apart vastgelegd. Presentation-ODF heeft als vijfde workflow juist een **exacte checkout van420af640**. Alle vijf checkout-proofbestanden en oorspronkelijke loghashes zijn gecontroleerd.

| Controle nieuwe kandidaat | Actuele API-stand |
| --- | --- |
| Desktop 44753496663 | in_progress; desktop (windows-latest): Run node scripts/voorbereiden-kantoorruntime.mjs |
| Database 44753496748 | in_progress |
| Example 44753496637 | completed / success |
| Writer formats 44753496701 | completed / success |
| Document matrix 44753496566 | completed / success |
| Spreadsheet matrix 44753496662 | completed / success |
| Presentation ODF 44753496653 | completed / success |
| Browser QA 44753552773 | completed / success |

De nieuwe Desktop-Windowsfout zit in `Run node scripts/voorbereiden-kantoorruntime.mjs`; dit is een andere run en stap dan de oude e92-signingbouwfout. Geen oorzaak afgeleid. Nieuwe native pakketten, signing en echte downloads blijven ongeaccepteerd. De eerdere e92-momentopname hierboven blijft ongewijzigd historisch bewijs; deze aanvulling ververst alleen420-CI.

## Eerder opgenomen vier fixes

Deze vier fixes en de hieronder genoemde eerdere functionele resultaten behoren tot I3. De code zit ook in kandidaat `420af640`; de oude resultaten zijn geen native pass voor nieuwe installers van `420af640`.

- **EPUB openen (#356):** de geteste invoer behoudt leesvolgorde, tekst, lijsten, tabellen en de gebruikte afbeelding. Browserbewerking en DOCX-download/heropenen zijn gecontroleerd; native openen, opslaan en heropenen slagen op de drie platforms. Dit bewijst niet alle EPUB-varianten of native bewerken.
- **Writer Undo/Redo na een tabelkolomcommando (#361):** de invoerfocus wordt hersteld, zodat direct ongedaan maken en opnieuw uitvoeren zonder extra documentklik werkt in de geslaagde routes. De onderstaande Linux- en macOS-grenzen blijven gelden.
- **Writer-lint (#362):** meer verticale ruimte voor gestapelde knoppen en de focusrand van ingeklapte groepen. De browsermatrix en afgebakende Windows-controles slagen; volledige native platformdekking is niet bereikt.
- **Writer-stijlbeheer (#363):** leesbare vertaalde namen en hints, met de huidige stijlnaam correct ingevuld. Engels, Nederlands en ondersteunde terugval zijn afgedekt; de native Mac-wissel Engels → Nederlands → Engels is bevestigd. Centraal geaccepteerd binnen deze label-/hintscope.

Eerder opgenomen: de macOS Command+↑/↓-navigatiefix (#358) en PR #349 maken aantoonbaar deel uit van deze integratiegeschiedenis. Dit zijn eerdere integraties, geen nieuwe fixes in deze vierfixronde. Er wordt geen algemene snelheidswinst of garantie voor zwakke computers geclaimd.

## Bekende beperkingen

- **Linux:** de oorspronkelijke I3/e92 Find-Undo- en lintfocusfouten blijven historisch vastgelegd. Correcties #368/#369 zijn in `420af640` opgenomen, maar nieuwe pakketacceptatie en de volledige native lintmatrix ontbreken nog. Horizontale lintpassing is niet volledig vrijgegeven. De graphicsworkaround betreft alleen CI, geen hardwarecertificering.
- **macOS:** onderzoek op de oude I3-app vond geen productoorzaak of fix. De body bleef bij zes fixturevarianten leeg, terwijl de saved-EPUB-controle leesbaar was; gewone activatie, alleen tabellen en enkele font/default-varianten verklaren het verschil niet. Bewijsbranch `55a16e07` is alleen documentatie. Geen Mac-bodyfix opgenomen en geen volledige native tabel-Undo/lintacceptatie op `420af640`.
- **Uitgesteld — #366:** gebruiker meldt na herhaald kopiëren/verdubbelen minstens twee minuten **10 van 10**, terwijl **15 pagina's** worden verwacht. Nog niet onafhankelijk gereproduceerd; het werkelijke eindtotaal is niet vastgesteld. Geen fix in deze ronde en geen algemene claim dat de paginateller is opgelost.
- De centrale I3-beoordeling geeft nog geen volledige vrijgave voor main. Definitieve releasebeslissing en acceptatie van resterende risico's blijven bij de gebruiker/integratie.

## Installaties en updates

Zeven producten: Open Office Studio, Open Writer Studio, Open Spreadsheet Studio, Open Presentation Studio, Open Email Studio, Open Notition Studio en Open Database Studio. Elke app heeft een eigen identiteit en profiel. Per app worden vier installers verwacht: Windows 10/11 x64 NSIS, macOS Apple Silicon DMG, Linux x64 DEB en AppImage — **28 totaal**. Geen RPM-, Intel-Mac- of ARM-Windows-installer in deze matrix. Browser-QA controleerde de echte `/`- en `/office/`-routes; een webbuild is geen installer of universele browsercertificering.

Handmatig bijwerken met de installer van dezelfde app. Op dit codepunt is de publieke Office-updatersleutel leeg; automatische updates worden niet beloofd. Losse studio's hebben geen suite-updater. Behoud eigen gegevens; Office/Notition-profielen en e-mailaccounts worden niet automatisch tussen apps overgezet.

## Controlelijst voor de definitieve installers en downloads

Alle onderstaande uitvoercontroles staan **open**. De bestaande I3-devpakketten zijn historisch testbewijs en leveren geen definitieve releasehashes of signingpass.

De oude e92-build gebruikt `publiceren=false`: de publicatiejob, de gezamenlijke releaseverzamelpoort en Linux-OpenPGP-/checksumondertekening worden daarmee niet uitgevoerd. Een groene bouwuitslag alleen kan deze checklist dus niet afronden. De centrale finale artifact-, signature- en downloadaudit ligt bij de integratiechat; deze noteschat start geen parallelle downloads of GUI-proeven.

Werk de platformcontroles parallel af zodra het eigen pakket en de tester beschikbaar zijn; wacht daarbij niet op een andere platformbuild of download. Alleen de gezamenlijke volledigheids- en publicatiepoort vereist alle platformresultaten. Voorkom twee operators op dezelfde lokale app of pc.

1. **Bron en versie vastzetten.** Integratie sluit de intake van de ronde en legt één volledige kandidaatcommit/tree, versie en eventuele tag vast; controleer alle manifesten met `pnpm versie:check`. Houd nieuwe ontdekkingen en latere fixes voor de volgende ronde, tenzij een noodzakelijke correctie expliciet een nieuw codepunt en hercontroles krijgt. Verklaar iedere delta ten opzichte van I3 en herhaal daardoor ongeldig geworden controles. Versiewijzigingen leveren nieuwe binaries/hashes op. Een tag of dispatch volgt alleen na afzonderlijke toestemming.
2. **Echte productbuild verifiëren.** Noteer run-ID, broncheckout en alle drie afgeronde platformjobs. Een handmatige proefrun kan onondertekend zijn: behandel een groene build niet als signingbewijs. Verifieer de zeven app-identiteiten en vier platformbundels per app.
3. **Signing van de uiteindelijke bytes.** Windows: Authenticode met tijdstempel op installer, geïnstalleerde executable én uninstaller; WebView2-loader aanwezig. macOS: de app uit iedere DMG controleren met `codesign --verify --deep --strict`, `spctl --assess --type execute` en `xcrun stapler validate`. Linux: alle 14 DEB/AppImage-bestanden en `SHA256SUMS` met OpenPGP verifiëren; vergelijk de sleutelfingerprint met een onafhankelijk vertrouwde bron. Bewaar werkelijke logs/receipts, geen secretwaarden.
4. **Volledigheid en pakketinhoud.** Exact 28 unieke installercombinaties en 14 Windows/Linux-pakketrapporten. Voer `node scripts/controleer-uitgave.mjs <map> <versie>` vóór de rapporthernoeming uit. Controleer app/versie/architectuur, grootte en hash tegen de daadwerkelijke pakketten. De publieke rapportnamen zijn `package-verification-*.json`; de interne validator verwacht `pakketcontrole-*.json`.
5. **Bestandsnamen en manifest.** Publicatienamen gebruiken punten in plaats van spaties, bijvoorbeeld `Open.Writer.Studio_<VERSIE>_x64-setup.exe`. Maak na signing/notarisatie en deze naamnormalisatie `SHA256SUMS`, de detached signatures, publieke sleutel en fingerprint. Controleer het volledige bestandsoverzicht zonder ontbrekende bestanden te negeren. Definitieve hashes en links staan nu bewust leeg in het JSON-bestand.
6. **Werkelijke downloads opnieuw controleren.** Download na toegestane upload alle 28 installers en bijbehorende verificatiebestanden vanaf de uiteindelijke asset-URL's naar een lege map. Vergelijk naam, grootte, SHA256 en signatures met het vastgelegde buildmanifest; `sha256sum --check SHA256SUMS` voor de complete set. Leg HTTP/downloadresultaat en exacte URL vast; een workflowartifact of releasepagina alleen bewijst geen juiste downloadbytes. Voer de inhoudsvalidator uit op bytegelijke rapportkopieën met hun interne namen.
7. **Definitieve pakketten bedienen.** Begin per platform zodra bron, versie, identiteit en relevante pakket-/signingcontroles van het eigen pakket kloppen en de tester vrij is. Controleer vóór brede bediening kort het juiste document/invoerveld en de focus, platformspecifieke Ctrl-/Command-sneltoetsen en werkelijk opslaan/heropenen. Hergebruik geldige preflights. Controleer daarna op de echte vier pakketvormen: juiste app/versie/werkruimte/profiel, relevante vierfixregressies in Office/Writer, passend bestand/openen/opslaan/heropenen in suite en gerichte apps, normaal afsluiten en eigen testresources/opname opruimen. Onderscheid driverfouten van productfouten met behoud van de functionele eisen. Noteer iedere niet uitvoerbare Linux/macOS-case afzonderlijk. Een build of andere app is geen vervanging voor native bediening van deze download.
8. **Besluit en publicatie.** Bundel de definitieve installerreceipts, downloadcontrole en bekende beperkingen. Controleer desgewenst updaterartefacts apart wanneer integratie die werkelijk configureert; beloof anders handmatige updates. Laat integratie het releasebesluit nemen binnen de expliciete gebruikertoestemming. Deze checklist voert geen van die acties uit en heft de bestaande native blokkades niet op.

## Bronnen en overdracht

Alle basisrepobronnen zijn gelezen op integratiecommit `771fd66e`: `docs/tests/integratie-2026-11-16.md/json`, `assets/studios.json`, `docs/studios.md`, `.github/workflows/release.yml`, `scripts/controleer-uitgave.mjs`, `src-tauri/tauri.conf.json`, `docs/updates.md` en `README.md`. De acht-bestanddelta naar de eerdere versievoorbereiding `e92b93a6` is afzonderlijk gecontroleerd; de I3-functionele resultaten worden niet tot native productbuildbewijs herlabeld. #366 is apart via GitHub gelezen. De volledige pipelineaudit van chat 750b is geverifieerd: MD SHA256 `71f623f44f45addb268f280889ad1ba84f4b42eccd04f2089731232684cb46d3`, JSON SHA256 `a1d0a8e49c7afb8bdfb98bc00c45ee1af5d07b31686a9c2791682dd8c60d6d11`; de exacte paden staan in het eigen JSON-overdrachtsbestand. Root beheert versie, gedeelde workflows, het centrale overzicht en de finale pakketaudit. De oorspronkelijke conceptbestanden van 14:53 blijven bytegelijk bewaard als `release-notes-2026-11-20.before-build-update-1453.md/json`.

Nieuwe-kandidaatbewijs: de freeze, het 37-testenrapport, de twee eigenaarreceipts en hun exacte hashes zijn opgenomen in het JSON-bestand. Mac-onderzoek: [bewijscommit 55a16e07](https://github.com/OpenAEC-Foundation/open-office-studio/blob/55a16e07e969152632b241ce1a29bbb165659581/docs/tests/2026-11-20-mac-native-body-diagnostic.md). De eerdere notesversie van 15:18 en de expliciete hervattingsversie zijn bytegelijk bewaard; de verwijzingen staan in hetzelfde JSON-bestand.
