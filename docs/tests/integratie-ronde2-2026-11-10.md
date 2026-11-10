# Integratieronde 2 — 10 november 2026

De tweede ronde bevat **21 nieuwe vrijgegeven leveringen**: totaal **89 bron-PR's / 99 leveringen**, plus17 eerdere PR's in bundels. Bronintake sloot **13:15 Europe/Amsterdam**; veilige overdracht uiterlijk **15:30**. Geen toestemming voor `main`, officiële releases of issue-sluiting. Concept-PR: [#248](https://github.com/OpenAEC-Foundation/open-office-studio/pull/248).

## Vast codepunt

Alle nieuwe combinatie-, browser-, platform- en native bewijzen zijn vastgelegd op **`4a7a3acf3c8a8747f5de081556e3192f303cb2fc`**. Zowel `codex/integratie-2026-11-09` als `codex/integratie-kandidaat2-2026-11-10` bevatten dat codepunt. Latere overdrachtscommits wijzigen documentatie en vervangen dit runtimecodepunt niet. De definitieve documentatiecommit gebruikt `[skip ci]` om dezelfde volledige builds niet opnieuw te starten; JSON/Markdown/diff-controles worden wel uitgevoerd. Voor een eventuele latere main-merge moeten de dan vereiste checks expliciet beoordeeld worden. De CI-checkout `15d87a0b6f8f9e7a07b86cfd4a16991e04e56023` heeft exact dezelfde Git-boom `3a49ea4f704f8171a60e11913936cd9d0b1b5b86`.

Het [ronde-2-register](integratie-ronde2-2026-11-10.json) bewaart bronheads, mergecommits, issues en gerichte controles. De [centrale leveringshistorie](integratie-2026-11-09.md) blijft behouden. De eerdere ronde op `1e5afa39` blijft historisch. Van de aanvankelijke freeze `68cc7fc5` naar `4a7a3acf` veranderde alleen het actieve kern-bytegetal; appcode, WASM en patches zijn gelijk.

## Gecombineerde controles

- **3.408 lokale tests geslaagd, 0 mislukt, 7 expliciete skips, 317 bestanden.** Vier encryptiecorpusgevallen ontbreken lokaal; drie Access/VBA-gevallen zijn bestaande skips. Windows-/Linux-CI hebben het encryptiecorpus en slagen met **3.412 tests / 3 skips**.
- TypeScript en normale productiebuild slagen (**42,01s**); strikte hosted build slaagt (**30,73s**), zonder externe bronnen of absolute paden.
- Vertalingen: **9 ×21 namespaces /8.034 sleutels**,23 bestaande waarschuwingen over inactieve taalmappen. Tien echte engine-opdrachten en Writer/Spreadsheet/Presentation-opslagproeven slagen. Deze resultaten op `68cc7fc5` blijven geldig omdat hun invoer niet veranderde door de metadata-correctie.
- **22 normale browsergroepen** slagen:17 centrale en5 Spreadsheet-groepen op byte-identieke productie-distkopieën. Onder andere Writer-vergelijking, individueel/bulk accepteren/weigeren, Save/Undo/Redo/heropenen, beeldvervanging, PDF-velden/fontcache, thema/replies, tabellen/DXF en presentatie/media.
- De echte zelfstandige **`/office/`-route** slaagt voor Writer, Spreadsheet en Presentation: wijzigen, downloaden, heropenen. Ook5 veld-PDF-gevallen en aanvullende CF-/trendlijnproeven slagen. Geen Tauri-bridge of nagebootste kern. Live Y/Workplace-opslag is op gebruikersverzoek uitgesloten.
- Aanvullend onafhankelijk Spreadsheet-bewijs op hetzelfde bronpunt:56 browserstappen/9rapporten,0JS-fouten. Die eigen build had een onvolledige asset-prebuild; dit is extra functioneel bewijs, geen centrale dist-/installerdigestclaim.

Normale dist: **727 bestanden**, boomhash `0308956997dcd676dc72c2239d3383cfcfc2b92b45cf166372f4b33e25d098d2`. Hosted: **727 bestanden**, `7b07608f17a39c9ff5315e56a180e5217b41b672c3ba70fe9a56215e13825345`. Beide bevatten de vastgelegde kern en geen productie-Writer-debugbridges. Gedelegeerde kopieën zijn vóór/na de proeven bytegelijk gecontroleerd.

Voor reproductie van de boomhash wordt de opgeslagen `files[]`-manifestvolgorde gebruikt: per bestand `path TAB sha256 TAB bytes NEWLINE`, UTF-8. De oorspronkelijke capture sorteert Windows Path-objecten hoofdletterongevoelig en per padcomponent; opnieuw sorteren als gewone Unicode-strings geeft een andere volgorde. Alle727 bestandsbytes/hashes en beide digests zijn onafhankelijk opnieuw gecontroleerd.

De synthetische pivotprobe klikte na import hardcoded op het verkeerde blad/bereik. De echte ODS-fixture slaagt zonder adapter; het correct geselecteerde geïmporteerde bereik slaagt ook. Geen productiepatch gemaakt; toekomstige test-only correctie apart bewaard.

CI-stabiliteit blijft een apart vervolg: de eerste `68cc`-Windows-desktop/databasejobs faalden uitsluitend op de bestaande bibliografietest met een5000ms-time-out (5361/5550ms). De definitieve `4a7`-jobs slagen; de metadata-correctie wordt niet als oplossing van die time-out gepresenteerd. Vergelijkbare meldingen op de latere losse bron-PR's blijven open. Oude foutlogs en jobresultaten zijn behouden; alleen hun achterhaalde queued macOS-kopieën zijn geannuleerd. De geslaagde oudere presentatie-macOS-job wordt evenmin hernoemd tot bewijs op `4a7`.

## Platformmatrix

Exacte jobs, pakketcontroles en hashes staan in het [ronde-2-platformrapport](integratie-ronde2-platforms-2026-11-10.json).

| Platform    | Build/pakket                                                           | Functioneel                                                                                                             | Nog open                                                                                               |
| ----------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Windows x64 | Desktop/database geslaagd; NSIS/EXE/WebView2 en bronboom gecontroleerd | CI3.412 tests; exacte testinstaller geïnstalleerd; native3pagina-PDF en DOCX-save/heropenen onafhankelijk gecontroleerd | Native Compare/review Save/Undo/Redo en beide Medium2-save/heropenroutes groen; overige UI-scopes open |
| Linux x64   | Desktop/database geslaagd; DEB/AppImage uitgepakt en gecontroleerd     | CI3.412 tests plus Rust; presentatie-ODF geslaagd                                                                       | Geen geïnstalleerde interactieve Linux-testhost                                                        |
| macOS       | Desktop/database/presentatie nog queued in huidige snapshot            | Geen resultaten op dit codepunt                                                                                         | Build, pakket, functioneel en native bediening onbewezen                                               |
| Browser     | Normale/strikte hosted build geslaagd                                  | Chromium151 normale groepen/hosted groen; Firefox153 en Windows-WebKit26.5 ieder drie hostedroutes groen                | Echte Safari/macOS, OS-klembord en live Y niet getest                                                  |

De Windows-ontwikkel-/QA-installatie is expliciet vrijgegeven voor job **129833698436**, run [42817352468](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42817352468), bron `4a7a3acf`. ZIP SHA256 `29391cc54e3803824da84090058221accc39f07942497660872fa4a0556f0a71`; installer `68a31bd38604894794fe9e05461f41e9c3b0b689cf8696e5d6ae5f17f00689f1`; geïnstalleerde EXE `c5607da784846b48053391c64bd5d59fc38d000bdb05389ae155fbdf779162f7`. Geen officiële release of volledige platformgoedkeuring.

Voor #323 is de echte native PDF met Poppler gerenderd en op alle3pagina's onafhankelijk bekeken. Volledige42tekenbestandsnaam, auteur/titel leesbaar; FILENAME→AUTHOR op alle pagina's **8,41017pt**, zonder overlap. DOCX-packageonderdelen blijven bytegelijk behalve de verwachte naamcache en wijzigingsdatum/revisie. PAGE/NUMPAGES/FILENAME/AUTHOR/TITLE, hoofdtekst, stijlen en noten blijven behouden. [Onafhankelijk bewijs met paden/hashes/geometrie](integratie-ronde2-native-pdf-2026-11-10.json).

De [definitieve Windows-native receipt](integratie-ronde2-native-windows-2026-11-10.json) bevestigt daarnaast #297/#313: echte Compare met rode DEL/blauwe INS van elk zeven tekens; losse DEL accepteren en bulk Accept/Reject, steeds Save→canvas Undo→Save→Redo→Save. Alle negen snapshots zijn onafhankelijk als XML gecontroleerd. Alle drie finale documenten zijn na een volledige appherstart native heropend. Voor #322/#324 zijn expliciete en impliciete Medium2 op A1:B5 visueel gelijk; B2→6 blijft na native opslaan/sluiten/heropenen behouden, met bytegelijke styles/table-XML. Alleen de equivalente numerieke defaultrepresentatie wijzigt mee. #280 is gedeeltelijk native gecontroleerd voor thema/papier en voorkeur na herstart; geen volledige print-/beeldmatrix. #318 is later gedeeltelijk native gecontroleerd; #325 is niet native uitgevoerd; #340 blijft een bekende open route en is met canvasfocus vermeden.

Na de eerdere native326-proef waren alle documenttabs schoon gesloten, zonder saveprompt. De oorspronkelijke donkere app-/papierinstelling is hersteld. Die eerdere proef eindigde op Start. De actuele native318-sessiestatus staat hieronder; de latere Escape-stop is na expliciete gebruikershervatting opgelost en het profiel is hersteld. `fullNativeAcceptance` blijft **false**.

Beide exact geteste browserdistributies zijn samen bewaard in `.local/round2-frozen-browser-4a7a3acf.zip` (inhoud per SHA256 gededupliceerd, twee manifesten met originele paden). Archiefhash en herstelbeschrijving staan in het platformrapport; dit is een lokale bewijsbackup, geen release.

## Aanvullende QA op gebruikersverzoek vóór15:15

De [aanvulling met exacte bewijzen](integratie-ronde2-aanvulling-2026-11-10.json) blijft op ongewijzigde runtime `4a7a3acf`. Firefox153 en PlaywrightWebKit26.5 slagen elk voor de echte hosted `/office/`-routes van Writer, Spreadsheet en Presentation op **Windows x64**. Spreadsheet gebruikt nu aantoonbaar de echte **Save as→browserdownload→heropenen** in Chromium, Firefox en WebKit. Beide727-bestandsdistributies zijn daarna volledig byte-/hashgelijk geverifieerd.

Dit is **geen echte Safari- of macOS-test**: de Windows-WebKit-user-agent noemt Safari/macOS, maar de host en `navigator.platform` zijn Windows. De synthetische Firefox-plakproef heeft een gecontroleerde test-only clipboardpayload-adapter nodig omdat de eventconstructor data weglaat; geen OS-klembordacceptatie. De WebKit-spreadsheetprobe wacht expliciet tot het heropende documenttabblad actief is; de oorspronkelijke stale-ribbonfout van de test blijft als bewijs bewaard. Appcode en bestaande bewakers zijn ongewijzigd.

Native #326 slaagt nu ook op de begrensde twee-diafixture: zoekresultaten15→5→3, losse/bulkvervanging, Save/Undo/Redo en volledige appherstart/heropening. Alle vijf PPTXsnapshots zijn onafhankelijk gecontroleerd: alleen bedoelde tekst verandert, alle overige packageparts/opmaak/geometrie blijven gelijk; beide Undo-uitvoeren zijn byte-identiek aan de bron. Native NLlabel, checkboxkeyboard/ShiftEnter/versionretry en andere corpora/platforms blijven ongetest. Eén CtrlS-poging met het zoekpaneel open sloeg niet op; opslaan na sluiten van het paneel werkt. Dit is alleen een niet-getrieerde observatie, geen nieuw geregistreerde bug of extra fix.

De oorspronkelijke bewijsarchieven blijven onveranderd. De aanvulling heeft een apart lokaal archief met hash in JSON. macOS-CI staat ook in de laatste snapshot nog queued; alle documenten/browsers zijn na de proeven schoon gesloten. Geen nieuwe bronintake of main-merge.

## Laatste aanvullende controle: antwoordinitialen

Het [318-rapport met bron-/uitvoerhashes](integratie-ronde2-antwoordinitialen-2026-11-10.json) legt de laatste proef vast. De echte hosted Firefox- en Windows-WebKit-routes slagen elk voor drie gevallen: aanmaaktijdinitialen, behouden oude identiteiten/annuleren, sluiten/heropenen/opnieuw opslaan. Zes gedownloade DOCXbestanden zijn onafhankelijk als XML gecontroleerd.

Native slaagt de begrensde RX-variant: nieuw antwoord met testnaam `QA Native Reply` en expliciet `RX`, opslaan, document sluiten/heropenen en opnieuw opslaan. Na herstel van het oorspronkelijke profiel bewaart nogmaals opslaan dezelfde antwoordidentiteit. Drie native snapshots zijn onafhankelijk gecontroleerd: auteur/initialen/id/datum, twee bestaande reacties, hoofdtekst/stijlen en ouderdraad blijven behouden. Geen tweedeRY-/annulerings-/IDreuse-/ander-corpusproef of volledige appherstart voor318 uitgevoerd.

De fysieke Escape-stop werd eerst gerespecteerd. De gebruiker heeft daarna in de native chat expliciet hervatting en profielherstel opgedragen, en in de integratiechat alleen herstel bevestigd. Dezelfde operator heeft via Settings de oorspronkelijke lege naam en initialen hersteld, beide opnieuw gecontroleerd en het opgeslagen document schoon gesloten. De eerdere herstelbehoefte is **opgelost**; geen omweg via configuratiebestanden of andere operator. Het oorspronkelijke onderbroken bewijs blijft in het aparte318-archief bewaard. `fullNativeAcceptance` blijft false en macOS-CI staat nog queued.

## Voorbereiding volgende integratieronde vóór15:25

De [mergevoorcontrole](integratie-volgende-ronde-2026-11-10.json) vergelijkt zeven vastgelegde late leveringen met de laatste overdrachtsbasis `75968e5d`. Alle zeven zijn afzonderlijk én in een virtuele combinatie Git-technisch conflictvrij; whitespacecontrole slaagt. Alleen lokale Git-objecten zijn berekend: geen checkout/index/branch of applicatiecode gewijzigd, geen nieuwe gecombineerde tests/build uitgevoerd en niets uit de wachtrij geïntegreerd.

Volgorde: #327, PR337→346,341,343,344,342. De enige gedeelde bronpaden betreffen de bekende337→346-afhankelijkheid; die afstamming is bewezen. PR317 blijft op gebruikersverzoek geparkeerd. #327 heeft een open performance-afweging en342 is onderzoek, geen productfix; conflictvrij is geen automatische opnamevrijgave.

De actuele bron-CI is apart opgeslagen. PR344 heeft in Windows naast de bibliografietime-out drie tekenopmaaktest-time-outs (3416geslaagd/4mislukt/3skips); oorzaak niet als opgelost of als338-regressie aangemerkt. Ook de overige beschreven bron-CI/native/platformgaten blijven gelden. macOS van de huidige4a7-runtime staat nog queued. Bij hervatting eerst bronacceptatie beoordelen, daarna pas een nieuwe kandidaat samenvoegen en de volledige combinatie op één exact codepunt testen. `main` blijft onaangeraakt.

## Scope en grenzen

Writer: schermthema/contrast, bibliografiewaarschuwing, PDF-fontcache, reply-initialen, spellinggeometrie, review-Undo/tekenopmaakvergelijking, beeldvervanging en PDF-veldlettertypen. Spreadsheet: CF, begrensde pivots, ingebouwde/impliciete tabelstijlen, structuurregressies en startup/trendlijnkern. Presentation: ODF-volume/medianamen/replay en helewoordenzoekoptie. Afhankelijkheden315→306 en304→316→328 eenmaal toegepast; teruggetrokken reviewheads uitgesloten.

Kern: gevalideerde **15-patch-superset**, SHA256 `2b1b74a572ad97bfe0f5bf25798fd123a46505a85b80a477792a180a13deddad`, **7.794.993bytes**. Eerste14 patches bytegelijk319;15e onafhankelijke lineaire-trendlijncorrectie. ZIPdigest,15patchhashes, strikte actieve checksum/pinmetadata en ABI gecontroleerd; geen guard uitgeschakeld.

#74 blijft gedeeltelijk: begrensde300k/50k-proeven bewijzen geen volledige100k×30, async-hoofdeditor of algemeen geheugenverbruik. #69 behoudt grenzen, alleen-lezen onbekende layouts en refresh/history-beperkingen. Native fonttoestemming en verse documenten met ingebedde fonts hebben aparte acceptatie nodig. Een build bewijst geen native bediening.

## Wachtrij volgende week

Deze leveringen blijven **buiten** de freeze; exacte heads en beperkingen staan in JSON:

- #327 taalstatusperformance: `3c2595ca`, bewijs `f0c3fb71`; minder lookups is geen bewezen algemene versnelling.
- PR317/#30 gebundelde runtime: niet vrijgegeven en inmiddels op gebruikersverzoek geparkeerd tot volgende week; eigen converters gestopt.
- PR337/#336 handmatig gepauzeerde media en afhankelijke PR346/#345 poster-capture-race. Afzonderlijke brede Windows-CI heeft een onopgeloste bestaande bibliografietime-out; gerichte proeven slagen.
- PR341/#339 afgekapt presentatiezoekresultaat; PR343/#340 muis-tabfocus/Ctrl+Z. #340 is een open beperking van de huidige combinatie.
- PR344/#338 interne PDF-bestemmingslinks: apart getest, native3platformacceptatie open.
- PR342/#93 Draw-onderzoek: alleen onderzoek/proefcode, geen Draw-module/productfix.
- Test-only pivotprobe-reparatie; geen productiebug.

Volgende week: begin hier en bij PR248; controleer gepushte branches en open macOS-jobs. Hervat ontbrekende platformacceptatie op exact `4a7a3acf`, beoordeel daarna nieuwe intake. Nieuwe bronheads niet stilzwijgend substitueren. Oude bewijzen blijven historisch beschikbaar.

Vóór een later expliciet toegestane main-merge moet geërfde commit `a40a6662…` met sluittekst voor #189 afzonderlijk worden beoordeeld, of een goedgekeurde squashtekst worden gebruikt. Een lege PR-sluitlijst neutraliseert die committekst niet. Er wordt nu niets gesloten of naar `main` gemerged.
