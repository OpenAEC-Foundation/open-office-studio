# WordPerfect Macintosh 2.x / cataloguslabel 2.1.3 — begrensde route

**Begrensde PASS: 6 broncases × 4 OOXML-stadia, plus 3 negatieve oraclecontroles.**
Volledige formaat-/versie-/visuele acceptatie blijft **FALSE**. Alleen
`lo-wpd-2` is onderzocht; WordPerfect6/`lo-wpd-1` blijft afzonderlijk bewijs.

## Exacte bron en bronoracle vóór conversie

App: P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, versie `2026.48.1`.

Oorspronkelijke bestaande fixture:
[LibreOffice/core92c170f1 — WP3.wpd](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/writerperfect/qa/unit/data/writer/libwpd/pass/WP3.wpd),
504 bytes, Gitblob `75f4924e857f2b404579691af4bd08c2e89aa607`, SHA256
`812d181f1bef7da145ddb20370de0b50acbd48f40ab905b3bfc8fffe4e3b34a2`.
De oorspronkelijke bytes en LibreOffice-projectnotices zijn behouden in het
resultaat-ZIP; geen afzonderlijke CC0/per-bestandslicentie aangenomen.

De header bevat `FF575043`, documentoffset16 (LE), product1/type`2C`,
major2/minor2, nul encryptieveld. De familie komt overeen met
[PRONOM fmt/1220, Macintosh2.x](https://pronom.nationalarchives.gov.uk/fmt/1220).
De eigen tekst noemt WP2.1.3. Dat is geen geauthenticeerd bewijs van de unieke
producentversie; de naam WP3 maakt het bestand niet tot versie3.

De eigen stdlib-reader decodeert native tekst buiten control-gates, toetst
open/closing-gates en lengtes en inventariseert 26 events. De drie vooraf
geaccepteerde begin-alinea's zijn exact:

1. `This is a file created by WP 2.1.3`
2. `Bold` — expliciet C3-attribuut0 aan
3. `Italic` — expliciet C3-attribuut1 aan

Hun DC02-afsluitingen zijn native aanwezig. De framing en C3/DC-subset zijn
gelezen in de gepubliceerde primaire
[Corel Macintosh4-bestandspecificatie](https://mendelson.org/wpdos/WPMac4FileFormat.pdf)
(SHA256 `933b956fc612dc4aaef5ec11a9bc43c8fb82a51ce376a0cb390d84b2d93947ed`,
781.069 bytes); de attribuuttabel is ook visueel geïnspecteerd.
Dit latere manual is geen volledige Mac2-specificatie. De libwpd-code is alleen
ter framingcontrole gelezen, niet uitgevoerd; hij deelt parserlineage met de
converter. Zie `layout-crosscheck.json` voor exacte referentieblobs/SHA's.
Er is geen converteroutput gebruikt om de vooraf geaccepteerde tekst of stijl
te bepalen. Zie `source-oracle.json` en `scripts/qa-wpd213/native.py`.

De vooraf vastgelegde Windows-oracle heeft CRLF (7.596 bytes), SHA256
`1f15c1dbaf9e02e8183ce1a90b5024babc4216087b276b768d203b026d911eb9`,
zoals gecommit in `run-request.json` vóór CI. De Linux-oracle heeft LF
(7.181 bytes), SHA256
`5a9ffd1d8683e67a0e3dd6cb5d83186da625c7203d564c035020a88981367257`.
De extra herkomstcontrole stelde dit verschil vast. Beide ruwe vormen zijn
behouden; de audit staat uitsluitend CRLF→LF toe en bewijst verder bytegelijkheid.
De gewone bron-/runtime-/artifacthashes worden nooit zo genormaliseerd.

## Bestaand bewijs hergebruikt; ontbrekende stappen uitgevoerd

Het #43-verslag van 10 november bevat al een beperkte Windows technische
open/save/nieuwe-sessie-reopen-PASS, opgeslagen DOCX5.469B/SHA
`1ce451b27536508483a3800aae675c2ac3ae9260f84c232ea0950410b7a52fa2`.
Dat verslag is exact behouden in `retained/historical-windows-report.json`;
`reuse-ledger.json` onderscheidt het historische conversieprofiel van P2.
Het bevat geen inhouds-/stijl-/edit-/UndoRedo-/nieuw-proces-oracle en wordt
niet als actuele P2- of native platformtest hernoemd.

De nieuwe kleine Linux-job vult uitsluitend dat ontbrekende bewijs aan:

- Echte P2-productie-openhelper, `.wpd`-invoer naar gewone DOCX via private CLI
  met veilig P2-profiel; een CLI-adapter is geen Tauri-IPC-/native UI-test.
- Echte gepatchte P2-Word-WASM: drie begin-alinea's, prefix invoegen, Undo/Redo,
  DOCX-save, verse sessie en opnieuw bewaren.
- Een afzonderlijk Node-proces opent exact die opgeslagen bytes en bewaart
  opnieuw; gelijke kern-/JS-bindings en verschillende PID/startmomenten bewezen.
- Onafhankelijke OOXML-controle op converted/saved/reopened/fresh-process:
  gewone DOCX-type, drie exacte begin-alinea's, Bold-vet en Italic-cursief.
- Negatieve oraclecontroles wijzen gewijzigde hoofdletter, expliciet uitgezet
  vet en expliciet uitgezet cursief af. Dit zijn controles op de oracle,
  geen extra importfixtures of productweigeringstests.
- Browsergrens: werkelijke productiefuncties in Linux Node zonder Tauri-bridge
  weigeren met WPD/DOCX-alternatief. Geen browser-UI-/gehoste browseracceptatie.

CI [45369522154](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45369522154),
job138359857973, attempt1, harness
`1d973d6635e2c246b3984eae3f921757db8c2b40`, SUCCESS.
Artifact14907753708 (`wpd213-targeted-result`), 68.555 bytes, ZIP-SHA256
`c99b020b86c027b4437e9a6f621487be398a24f5e44c40b39f3a277f619b9c56`,
vervalt 22 februari2027 09:53:49UTC. Volledige kleine ZIP, officiële
run/job/artifactmetadata en afzonderlijke nieuwe procesreceipt zijn behouden.

De gedeelde input blijft runtime-only14805600515 uit45147346793/22a8577d:
ZIP `bac1a37b…487`, tar `f3308bea…2e3`, 15.082-entry manifest `79204b36…029`.
Volledige ZIP-digest, gedeelde verifier, bron/tree/versie/manifest/modes/symlinks/
launcher/ELF zijn gecontroleerd. Volledige pinnen staan in `runtime-binding.json`
en `scripts/qa-wpd213/runtime-input.json`; het veilige profiel is
`847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40`.
Verse queuecontroles vóór dispatch/start/runtime blokkeerden geen job.
Geen suite-/app-/Macbuild of volledige release-ZIP gebruikt.

## Grenzen en audit

Alleen de drie vooraf aangewezen alinea's en expliciete attribuutspans worden
geaccepteerd. De staarttekst/kolomvolgorde, hard-kolomeinde, overige formatter-
en stijlgroepen, geometrie, fonts, rendering, encryptie-/macrovarianten en
andere WordPerfect-versies zijn niet geaccepteerd. Een geheel ongecontroleerde
staart kan dus niet op basis van deze beperkte PASS worden goedgekeurd.
Volledige Mac2-normconformiteit en producent2.1.3 blijven onbewezen.

Windows/macOS/native Linux-bediening en visuele vergelijking zijn niet uitgevoerd.
Geen zelfstandig bevestigd productprobleem; open én gesloten `WordPerfect`-
zoekresultaten en de bestaande #30/#43-beschrijvingen zijn bekeken. Geen nieuw
issue, productfix, catalogus-/index-/intakewijziging, main/tag/publicatie.
Geen eigen lokale app-, server-, opname- of Office-runtime gestart.

Runtimevrije replay vanaf deze QA-worktree, met een nieuwe lege uitvoermap:

```text
python -B scripts/qa-wpd213/analyse.py --archive docs/tests/wpd213-2026-11-24/retained/result.zip --metadata docs/tests/wpd213-2026-11-24/retained/result-artifact.json --run docs/tests/wpd213-2026-11-24/retained/run.json --job docs/tests/wpd213-2026-11-24/retained/job.json --out .local/wpd213-review
```

Deze audit voert geen converter/Word/WASM uit en herhaalt geen runtimejob.
