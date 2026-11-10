# Integratie — 10 november 2026

## Vast codepunt voor de volgende Windows-testbuild

**`14db5c1ccdf357ba75ae827c9050d5bb9393c565`** bevat **68 bron-PR's / 78 leveringen**, met daarnaast 17 eerdere PR's binnen de bundels. Bronintake voor deze kandidaat is gesloten. De exacte bronheads, mergecommits en gerichte tests staan in [het register](integratie-2026-11-09.md). De voorbereiding gebeurde op `codex/integratie-kandidaat-2026-11-10`; de gezamenlijke branch blijft `codex/integratie-2026-11-09`, met concept-PR [248](https://github.com/OpenAEC-Foundation/open-office-studio/pull/248).

Deze versie is **nog niet vrijgegeven voor installatie**. De laatste gecombineerde volledige suite, productiebuild en browsercontroles worden op dit vaste codepunt uitgevoerd. Latere rapportwijzigingen mogen de applicatiecode niet veranderen. `main` en officiële releases blijven ongemoeid.

## Laatste acceptatiecorrectie

De eerste volledige eindcontrole op `e9eabc3c` slaagt met **3.141 tests, 0 fouten, 7 skips in 300 bestanden**, productiebuild en negen talen / 7.949 sleutels. De hoofdgroepen voor Presentatie, Spreadsheet en Writer-opslag/heropening slagen, inclusief rijke notities met dianummers in dezelfde download, echte tabellen met DXF, bewerkbare vormen en exacte afbeeldingsbytes, driemaal verwijzingen onder CPU-vertraging 4, vergelijkingen en volledige mailmerge.

De tabeltoetsbevinding was een te vroege API-selectie in de proef, geen gereproduceerde gebruikersfout. De test-only opvolging `c3232dd7` wacht op de zichtbare pluginselectie en gebruikt echte pijltoetsbediening; alle zes stappen slagen in de centrale controle en drie eigenaar-runs.

De zes custom-story-stappen slagen inhoudelijk, maar maken een afzonderlijke bestaande timerfout zichtbaar: na werkelijk openen en snel sluiten/herladen verschijnt ten onrechte een foutmelding. Dat is concreet vastgelegd als #302 en gericht gecorrigeerd via PR #307 / `2da5abe3`, zonder andere nieuwe functies toe te voegen. De zes nieuwe gedragsregressies slagen; een echte mislukking blijft een melding geven. Daarom wordt de volledige eindcontrole op het hierboven aangepaste codepunt herhaald. De oude e9-dist blijft alleen als negatieve controle bewaard. De Windows-chat ontvangt pas na de nieuwe controles één vervangend, exact installatiecheckpunt.

## Opgenomen wijzigingen

De ochtendfix voor offline Writer-opslag bereidt opslagcode en OPC/parser in dezelfde documentworker voor, met behoud van lui laden in de alleen-lezen viewer. De uiteindelijke kandidaat combineert daarnaast Writer-vormen en ingesloten afbeeldingen, efficiëntere spelling/status/cursornavigatie, gerichte story-/stijlcorrecties, Spreadsheet-koppelingen, werkbladkopieën, outlinebediening, DrawingML-groepen, tabellen en DXF-opmaak, Presentatie-media/diagrammen/opmaak kopiëren/rijke notities/dianummers, ODF-overgangsbehoud en gedocumenteerde legacy-formatgrenzen.

De Spreadsheet-kern is exact de achtpatch-versie `52b25be9f50cb30215a547d5ee074eefc00c8a3726b19c0a3dc83870fda91cfa` (7.745.388 bytes); de binary en alle acht patchhashes zijn onafhankelijk gecontroleerd. Nieuwe negende/tiende patches voor grotere werkboeken zijn niet meegenomen.

De werkelijk gevonden Writer-fouten hebben eigen meldingen: [#282](https://github.com/OpenAEC-Foundation/open-office-studio/issues/282), onbedoelde referentiestijl/superscript na Enter achter een noot, is opgenomen via PR #290 / `66018850`; [#284](https://github.com/OpenAEC-Foundation/open-office-studio/issues/284), uitgestelde herlaadnavigatie die een nieuwe selectie overschrijft, via PR #266 / `617f23bf`. De eigenaar heeft beide laatste bronheads expliciet vrijgegeven na volledige tests en echte browser-opslag/heropening. Acceptatie in de nieuwe gecombineerde native Windows-app volgt nog.

## Verificatie tot de bronfreeze

- Eerste gecombineerde suite: 2.916 geslaagd, 0 mislukt, 7 overgeslagen in 280 bestanden (`6bbcf79e`). Productiebuild en de browsergroepen voor opmaak kopiëren, volledige werkbladkopieën en diagrammen slagen.
- Uitgebreide combinatie met achtpatch-kern, tabellen/DXF, vormen en rijke notities: **3.016 geslaagd, 0 mislukt, 7 overgeslagen in 290 bestanden** (`828dcbeb`). De standaard testlimiet bleef vijf seconden; de lokale volledige run gebruikte één worker wegens hostbelasting.
- Latere vrijgegeven bronnen zijn afzonderlijk gericht getest: #266 22 tests, #278 30, #272 44, #291 19 en #290 12. Het register bewaart ook alle eerdere gerichte resultaten.
- Alle Windows/Linux-controles op het voorafgaande centrale punt `d978918d` zijn groen. Dat resultaat geldt niet automatisch voor deze nieuwe code; de huidige CI wordt apart gecontroleerd.
- Nieuwe issue-afspraken staan in `AGENTS.md`. De screenshots van PR #283 tonen alleen het synthetische native-testdocument; er is geen implementatie van #280/#281 geclaimd.

De finale uitslagen worden vastgelegd in [het kandidatenrapport](integratie-kandidaat-2026-11-10.json). De [ochtendverificatie](integratie-2026-11-10-verificatie.json) en de overdracht van 9 november blijven historische momentopnamen.

## Opslagcombinaties en browserverdeling

De eindcontrole omvat echte offline Ctrl+S/Opslaan als/heropening, verwijzingen en vergelijkingen, de Writer-vormen, Spreadsheet-tabellen/celstijlen/DXF/objecten/kopieën en Presentatie-opmaak/diagrammen/notities. Extra combinatieproeven bewaren rijke notities en gecorrigeerde dianummers in dezelfde echte download, en bewaren een echte tabel met overlappende DXF-regels zonder de oorspronkelijke getallen te veranderen.

Writer-chat `9d3b` controleert de zes custom-storygevallen en vier nootvervolggevallen tegen dezelfde verse productie-dist; de centrale chat voert die groep niet dubbel uit. Alleen buildchat `0fc9` downloadt/installeert en bedient de native Windows-kandidaat na expliciete vrijgave van één exact SHA. Deze bronfreeze is nog geen installatievrijgave.

## Native ochtendcontrole en resterende grenzen

De eerder geïnstalleerde `4175e5f1` passeerde de uitgevoerde regressiestappen voor #188/#189/#196/#199/#205/#209, opslaan/sluiten/heropenen, kopteksten, noten, paginanummers en onafhankelijk bekeken DOCX/PDF. Daarin werd #282 daadwerkelijk gevonden; daarom bleef `fullNativeAcceptance=false`. De nieuwe build moet #282 en #284 opnieuw toetsen. De melding over lege bibliografische custom XML is als niet-blokkerende overmelding geclassificeerd.

MacOS-jobs kunnen op runnercapaciteit wachten; rapporteer die platformstatus afzonderlijk. Live Y-app-opslag is op verzoek van de gebruiker niet getest. De legacy-/ODF-beperkingen uit de bronrapporten blijven gelden. Brede roadmapissues worden niet automatisch gesloten. De vermeende statusbug #268 is ingetrokken: de oude proef liet Save as open; de gecorrigeerde elf taal-/tabcontroles slagen zonder daarvoor appcode te wijzigen.

Nieuwe Writer-theme-/compare-, Spreadsheet-grootte-/CF- en formatvervolgen blijven in afzonderlijke branches voor een volgende ronde. Alleen aangetoonde acceptatieblockers kunnen deze gesloten kandidaat nog veranderen. Gebruik de exacte heads uit het register en pas reeds opgenomen bundels niet opnieuw toe.
