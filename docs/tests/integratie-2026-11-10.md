# Integratie — 10 november 2026

## Vast codepunt en bevoegdheden

Alle platform- en runtimebewijzen in deze ronde horen bij **`1e5afa399117fd84df628955ec82b0e597993c83`**, applicatiecode `14db5c1ccdf357ba75ae827c9050d5bb9393c565`. De kandidaat bevat **68 bron-PR's / 78 leveringen**, plus 17 eerdere PR's binnen bundels. De [leveringshistorie](integratie-2026-11-09.md) bewaart exacte bronheads en mergecommits. De gezamenlijke branch is `codex/integratie-2026-11-09`, concept-PR [#248](https://github.com/OpenAEC-Foundation/open-office-studio/pull/248). Bronintake is gesloten; latere fixes blijven in de volgende wachtrij.

De exacte Windows-build is vrijgegeven en geïnstalleerd voor ontwikkeling en native acceptatie. **Dit is geen toestemming voor een merge naar `main`, issue-sluiting of officiële release.** Latere overdrachtscommits wijzigen alleen documentatie en het reproduceerbare hosted-testscript; zij vervangen het hierboven vastgelegde runtimecodepunt niet.

## Gecombineerde controles

- Volledige lokale suite: **3.147 geslaagd, 0 mislukt, 7 expliciete corpus-skips, 301 bestanden**. De skips staan afzonderlijk in het [platformrapport](integratie-platforms-2026-11-10.json).
- TypeScript, normale productie-assets/build (**27,35 s**) en vertalingen (**9 × 21 namespaces, 7.949 sleutels**) slagen; de 23 bestaande waarschuwingen betreffen inactieve taalmappen.
- De normale productie-dist bevat 544 bestanden, geen Writer-debugglobals; onafhankelijk gecontroleerde boomhash `9853b6676fdb361f11cde6191d37eaaaa5d1749d7501ec331d670cb4a41bfb4c`.
- Alle zes custom-story-/stijlgevallen en vier nootvervolggevallen slagen op exact dezelfde verse dist, zonder app-/JS-fouten. De snelle kop-/voettekstsluiting van circa 66/84 ms geeft geen onterechte foutmelding meer.
- De eerder uitgevoerde combinatieproeven slagen: rijke notities plus gecorrigeerde dianummers in dezelfde download, tabellen plus overlappende DXF met behouden waarden, vormen/groepskinderen/afbeeldingsbytes, offline opslag/heropening, verwijzingen onder CPU4, vergelijkingen en volledige mailmerge. Hun oorspronkelijke codepunten blijven vermeld; ongewijzigde groepen worden niet onnodig herhaald.

De tabelbevinding was een synchronisatiefout in de test, opgelost met test-only `c3232dd7`; de echte pijltoetsbediening en alle zes stappen slagen. De aangetoonde snelle-sluitfout #302 is gericht opgelost door PR #307 / `2da5abe3`; zes nieuwe gedragstests bewaken ook echte mislukking. Deze noodzakelijke acceptatiecorrectie verklaart de laatste codepuntwijziging; er is geen nieuwe featurebatch toegevoegd.

## Platformmatrix op hetzelfde exacte SHA

| Platform | Build/pakket                                                                             | Functionele controle                                                                                                                          | Openstaande acceptatie                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows  | Desktop- en database-CI geslaagd; installer/ZIP-hashes gecontroleerd                     | Echte geïnstalleerde1e5-app: #282 nootvervolg/Undo/Redo/opslaan/sluiten/heropenen geslaagd; onafhankelijke DOCX/PDF-controle geslaagd         | #284/#302 en custom-story-opslag nog in uitvoering bij de exclusieve Windows-operator                                                                                               |
| Linux    | Desktop/database-CI, Rust- en padtests, echte deb/AppImage-uitpakcontrole geslaagd       | CI Chromium offline Writer bewerken/opslaan/heropenen geslaagd; aparte Legacy/Writer/ODF/Presentatie-native-converterworkflows op1e5 geslaagd | Geen interactieve geïnstalleerde Linux-GUI/open-with-proef; algemene desktop-converterstappen waren overgeslagen wegens ontbrekende runtimevariabelen, dus niet als geslaagd geteld |
| macOS    | Desktop- en databasejob wachten op runner                                                | Niet uitgevoerd; workflow bevat native openen bij starten/in draaiende app en koppelingencontrole                                             | Build, pakket en native open/systemkoppelingen blijven expliciet open                                                                                                               |
| Browser  | `pnpm build:hosted` geslaagd (38,02 s); ondersteunde zelfstandige hostedroute `/office/` | Echte Writer/Spreadsheet/Presentatie laden, bewerken, downloaden en heropenen zonder Tauri-bridge geslaagd in Chromium151 op Windows          | Firefox/WebKit/Safari en geïnstalleerde Chrome/Edge niet getest; live Y/Workplace-opslag op verzoek van de gebruiker uitgesloten                                                    |

Exacte jobs, stappen, overgeslagen stappen, bewijshashes en resterende controles staan in [de machineleesbare platformmatrix](integratie-platforms-2026-11-10.json). Een groene build is geen bewijs van werkende native bediening. Er is geen beschikbare interactieve Linux/macOS-testhost; macOS-runnerwachttijd is niet voorspelbaar.

Herhalen van de echte hosted-route: `pnpm build:hosted`, daarna `node scripts/proef-hosted-platforms.mjs`. Het script voert de bestaande productie-UI-proeven uit onder `/office/`, controleert de echte URL en weigert een aanwezige native bridge. Dit betreft de zelfstandige downloadroute, geen live Y/iframe/postMessage-opslagdienst.

## Native bestanden en resterende fouten

Voor #282 bewaart het native DOCX beide gewone vervolgruns zonder Reference-stijl of vertAlign; de echte voet-/eindnootverwijzingen behouden Reference en superscript. Alle body-/nootteksten blijven aanwezig. De onafhankelijk gerenderde PDF toont beide vervolgteksten op 11,0002 pt. DOCX-SHA256: `4a1ed5040bdb34a80d9da1f0b5b296c45308895535f39e83652c5739c6e44541`; PDF-SHA256: `a596a10edd647340dcac8f66b557658069e25badccbe2c5080748ea2cbd984a2`.

#284 herlaadnavigatie en #302 foutmelding worden nog door dezelfde Windows-operator afgerond. De oorspronkelijke Application-Control-blokkade is door de gebruiker afgehandeld; er is geen beveiligingsomweg toegepast. De oude geïnstalleerde4175-regressies voor #188/#189/#196/#199/#205/#209 blijven historisch bewijs en worden niet als een nieuwe1e5-nativeproef aangeduid.

## Issues en volgende ronde

Het [acceptatieregister](integratie-issues-2026-11-10.md) koppelt **75 issues** aan exacte opgenomen bronnen, testbewijs en concreet resterend werk. De 31 aangeleverde implementatiekandidaten zijn geen goedgekeurde sluitlijst; 43 bredere issues hebben een compact Engelstalig voortgangsbericht gekregen, met de commentlinks in het JSON-register. Er zijn momenteel geen goedgekeurde automatische sluitverwijzingen: native/platformacceptatie is nog niet volledig rond. Labels, prioriteiten en toewijzingen blijven behouden; er worden geen checkboxes automatisch afgevinkt of issues gesloten.

PR #220 / `4a21ad18` is een beschikbare bronfix voor afbeeldingsvervanging onder #49 maar géén ancestor van deze kandidaat. De eigenaar controleert de overdracht voor de volgende ronde; de fix wordt niet stilzwijgend als geïntegreerd geteld. PR #253 is een onvastgezet prototype. PR #300, #301, #304, #306, #309, #312, #314, #315 en concept #317 plus spellingcachecommit `da16cea1` voor #303 blijven eveneens buiten deze freeze. De laatste #306-head bevat #315 al; pas die afhankelijkheid later niet dubbel toe. Exacte heads/claims/grenzen staan in [het kandidatenrapport](integratie-kandidaat-2026-11-10.json).

De Spreadsheet-WASM blijft exact de achtpatch-versie `52b25be9f50cb30215a547d5ee074eefc00c8a3726b19c0a3dc83870fda91cfa` (7.745.388 bytes); alle acht patchhashes zijn gecontroleerd. Writer-WASM blijft `9e2025adc926c8831c16894bb60ccd996d0dfdd9d04bddd3dc08e0ddd3ca5acc`. Nieuwe negende/tiende Spreadsheet-patches en nieuw Writer-bronwerk zijn niet opgenomen. De [ochtendverificatie](integratie-2026-11-10-verificatie.json) en de overdracht van9november blijven historische momentopnamen.
