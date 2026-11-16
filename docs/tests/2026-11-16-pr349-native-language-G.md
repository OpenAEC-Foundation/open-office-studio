# PR #349 — native taalstatus op combinatie G

**Linux geslaagd: 32 taalstatusasserties plus opslag/procescontroles. macOS op G nog niet uitgevoerd: het gecontroleerde pakket ontbreekt.** Resultaten van het eerdere F-punt worden niet naar deze combinatie overgezet. Geen applicatiecode gewijzigd, geen merge naar `main`, geen issue gesloten.

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

## Resterende macOS-bediening en grenzen

De eigen Mac-driver is voorbereid voor G en handmatige uitvoering op macOS 15 ARM64. Native vensterbegrenzing, een echte muisklik binnen de AX-tabnaamgrenzen en verificatie van de daadwerkelijke actieve venstertitel vervangen de onbewezen AXPress-activatie uit de [mislukte F-bronproef](2026-11-16-pr349-native-language.md). De correctie is nog niet native gevalideerd. Voor G worden uitsluitend bron-/digest-gecontroleerde pakketten gebruikt; er is geen extra F-poging gestart. Het standaard macOS-buildpakket is bij dit checkpoint nog niet beschikbaar.

De G-Mac-driver gebruikt Cmd+Up/Down voor documentbegin/einde, overeenkomstig [de gedocumenteerde macOS-tekstbediening](https://support.apple.com/en-us/102650). De volgende alinea bestaat in deze kleine fixture uit één regel en wordt met gewone Down bereikt. Daarmee wordt een afwijkende Option+Down-betekenis niet met een taalfout verward. Undo/Redo gebruikt Cmd+Z/Cmd+Shift+Z; de 32 taalasserties blijven inhoudelijk behouden. De exacte native toetsen worden in het rapport geregistreerd.

MacOS 15-bediening zal afzonderlijk van de macOS 26-bouwomgeving worden gelabeld. Geen TCC-, entitlements-, signing- of beveiligingswijziging, geen volledige textarea-value lezen en geen lokale Windows-GUI/opname. De eigen Mac-app en DMG-mount van de afgesloten F-poging zijn opgeruimd.

Deze Linux-proef betreft de geïnstalleerde DEB op Xvfb; geen fysieke zwakke computer, Wayland, AppImage-bediening of algemene prestatie-/RAM-vrijgave. Windows-native, macOS-native, ondersteunde browserroute en de volledige G-combinatie blijven afzonderlijke platformcontroles bij de integratiechat; eerdere F-bewijzen krijgen geen G-label.
