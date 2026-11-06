# Controle van open issues voor de Tauri-app

Momentopname: 5 november 2026; 118 open issues. Werkbranch:
`codex/tauri-issues`, basis `b5492ef` (Tauri/websuite 2026-W44.8).
Het afzonderlijke native migratietraject wordt niet aangepast.

Een melding op de migratiebranch is geen bewijs voor dezelfde fout op Tauri,
maar ook geen reden om een gedeelde interfacefout zonder controle uit te sluiten.
Brede functie-issues zijn pas afgerond wanneer hun acceptatiecriteria aantoonbaar
zijn gehaald. Een geslaagde webproef bewijst geen platformproef of installer.

## Werkwijze

Per melding: toepasselijkheid bepalen, reproduceren, repareren, een gerichte
regressieproef en waar mogelijk de echte interface gebruiken, daarna opslaan en
heropenen controleren. Elke afgeronde groep krijgt een eigen commit. Issues
worden niet gesloten op basis van alleen aanwezige knoppen of broncode.

## Register

| Issue | Stand in deze werkbranch | Bewijs of eerstvolgende controle |
| --- | --- | --- |
| [#146](https://github.com/OpenAEC-Foundation/open-office-studio/issues/146) | Hersteld en gecontroleerd | Eén aangeklikte letter vulde ook op Tauri de verkeerde tekst in. De volledige koppeling wordt nu vooringevuld; adreswijziging behoudt tekst en opmaak. Engine-, productie-interface-, undo/redo- en bewaar/heropenproeven groen. |
| [#145](https://github.com/OpenAEC-Foundation/open-office-studio/issues/145) | Hersteld en gecontroleerd | Tijdelijke cursor verstoorde de koppeling van de kop. Drie regressieproeven; beide automatische varianten tonen direct puntvulling. XML en heropenen gecontroleerd. |
| [#144](https://github.com/OpenAEC-Foundation/open-office-studio/issues/144) | Gereproduceerd; nog open | Voet- en eindnoten vanaf iii ingesteld; verwijzingen blijven 1. XML bewaart lowerRoman en numStart 3 correct. Onderzoek naar de nummerweergave in de geleverde engine loopt. |
| [#143](https://github.com/OpenAEC-Foundation/open-office-studio/issues/143) | Hersteld en gericht getest | Oorspronkelijke A5-proef gereproduceerd; juiste fragmentbreedtes via equivalente indelingsroute, acht regressieproeven, interface, opmaak en Ctrl+Z, bewaren en onafhankelijke XML-controle. |
| [#142](https://github.com/OpenAEC-Foundation/open-office-studio/issues/142) | Hersteld en gecontroleerd | 785 tekens reproduceerden de fout op Tauri; opmaakstukken vervangen binnen één bewaakte bewerking. Zeven engineproeven plus productie-interface, bewaren en heropenen. |
| [#141](https://github.com/OpenAEC-Foundation/open-office-studio/issues/141) | Gedeelde fout afgedekt door lijstherstel | Echte decimale definitie bij wisselen van opsomming naar nummering; engineproef met bewaren/heropenen en undo/redo. Productie-DOCX heeft decimale nummerverwijzingen. |
| [#140](https://github.com/OpenAEC-Foundation/open-office-studio/issues/140) | Hersteld en gericht getest | Eigen scheidingsteken leesbaar met en zonder focus in licht en donker; conversie naar a|b en c|d, Undo/Redo en gedownloade XML gecontroleerd. |
| [#139](https://github.com/OpenAEC-Foundation/open-office-studio/issues/139) | Hersteld en gericht getest | Splitsen binnen dezelfde sessie, één Undo/Redo-stap, behoud van eerdere geschiedenis en celopmaak, Ctrl+Z vanuit de cel en onafhankelijke XML-controle van de download. |
| [#138](https://github.com/OpenAEC-Foundation/open-office-studio/issues/138) | Hersteld en gericht getest | Klikken binnen hoge cellen, kolominvoegen, marges, tekstrichting, zoom, bewaren en heropenen gecontroleerd met echte engine en interface. |
| [#137](https://github.com/OpenAEC-Foundation/open-office-studio/issues/137) | Hersteld en gericht getest | Actuele celposities uit de tabelstructuur; Tab voegt een rij toe. Interfaceproef met vier cellen, undo/redo, gedownloade XML en heropenen. |
| [#136](https://github.com/OpenAEC-Foundation/open-office-studio/issues/136) | Hersteld en gericht getest | Vier actielabels en verschillende richtingspictogrammen. Alle vier invoegacties en vier Undo-stappen gecontroleerd; gelabelde menu’s bij 620 pixels lintbreedte bediend. |
| [#135](https://github.com/OpenAEC-Foundation/open-office-studio/issues/135) | Verwante fout hersteld; invoerproef geslaagd | Oude tekenopvragingen voor verwijderde cellen uit workersnapshots gefilterd. Conversie, Undo/Redo en nieuwe invoer zonder terugvalmelding; opmaak, marge-Undo en 3/1/2-invoer gecontroleerd. Oorspronkelijke initialisatiemelding niet afzonderlijk gereproduceerd. |
| [#133](https://github.com/OpenAEC-Foundation/open-office-studio/issues/133) | Hersteld en gericht getest | Rij van 4 cm; herhaald Boven, Midden en Onder behoudt scrollTop 108. Nieuwe cursor blijft zichtbaar; grensgevallen voor minimaal schuiven hebben drie proeven. |
| [#131](https://github.com/OpenAEC-Foundation/open-office-studio/issues/131) | Hersteld; bestaande lintproeven groen | Zichtbare labels in samengebracht voorstel #134. |
| [#130](https://github.com/OpenAEC-Foundation/open-office-studio/issues/130) | Niet gereproduceerd met de geleverde engine | Drie rijen: bovenste samengevoegde cel splitsen; onderste geometrie, raster, bewaren/heropenen en undo/redo gelijk. Geen algemene visuele vrijgave. |
| [#129](https://github.com/OpenAEC-Foundation/open-office-studio/issues/129) | Hersteld en gericht getest | Actuele selectie tot zes cellen direct zichtbaar in beide sleeprichtingen; gemeten kolombreedtes volgen de tabel. Samenvoegen en undo via het lint, bewaren en heropenen gecontroleerd. |
| [#128](https://github.com/OpenAEC-Foundation/open-office-studio/issues/128) | Hersteld en gericht getest | Actuele celposities uit de tabelstructuur; Tab voegt een rij toe. Interfaceproef met vier cellen, undo/redo, gedownloade XML en heropenen. |
| [#127](https://github.com/OpenAEC-Foundation/open-office-studio/issues/127) | Hersteld en gericht getest | Vier regressieproeven en invoegen na paginanavigatie. |
| [#126](https://github.com/OpenAEC-Foundation/open-office-studio/issues/126) | Herstel geïmplementeerd en gelaagd getest | Native systeemklembord op geïsoleerd X11-display, echte JS-opdracht via gesimuleerde IPC, browserlint/Ctrl+V, intern plakken en DOCX-heropenen groen. Native webviewbediening op de drie platforms nog niet uitgevoerd. |
| [#125](https://github.com/OpenAEC-Foundation/open-office-studio/issues/125) | Hersteld en gericht getest | Markering in XML en na heropenen; annuleren kleurkeuze. |
| [#124](https://github.com/OpenAEC-Foundation/open-office-studio/issues/124) | Hersteld en gericht getest | Toetsenbord, muispijltje en opgeslagen lettergrootte. |
| [#123](https://github.com/OpenAEC-Foundation/open-office-studio/issues/123) | Hersteld en gericht getest | Lijstvervolg in dezelfde invoerbewerking, echte engineproeven voor bewaren/heropenen en geschiedenis; productie-interface toont item 2 en de bewaarde DOCX heeft twee verwijzingen naar dezelfde decimale definitie. |
| [#122](https://github.com/OpenAEC-Foundation/open-office-studio/issues/122) | Hersteld en gericht getest | Lijstvervolg in dezelfde invoerbewerking, echte engineproeven voor bewaren/heropenen en geschiedenis; productie-interface toont item 2 en de bewaarde DOCX heeft twee verwijzingen naar dezelfde decimale definitie. |
| [#120](https://github.com/OpenAEC-Foundation/open-office-studio/issues/120) | Hersteld en gericht getest | WASM, formulebalk, opslag en heropenen; verslag van de herstelronde. |
| [#113](https://github.com/OpenAEC-Foundation/open-office-studio/issues/113) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#108](https://github.com/OpenAEC-Foundation/open-office-studio/issues/108) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#106](https://github.com/OpenAEC-Foundation/open-office-studio/issues/106) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#105](https://github.com/OpenAEC-Foundation/open-office-studio/issues/105) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#104](https://github.com/OpenAEC-Foundation/open-office-studio/issues/104) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#103](https://github.com/OpenAEC-Foundation/open-office-studio/issues/103) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#102](https://github.com/OpenAEC-Foundation/open-office-studio/issues/102) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#101](https://github.com/OpenAEC-Foundation/open-office-studio/issues/101) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#100](https://github.com/OpenAEC-Foundation/open-office-studio/issues/100) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#99](https://github.com/OpenAEC-Foundation/open-office-studio/issues/99) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#98](https://github.com/OpenAEC-Foundation/open-office-studio/issues/98) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#97](https://github.com/OpenAEC-Foundation/open-office-studio/issues/97) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#96](https://github.com/OpenAEC-Foundation/open-office-studio/issues/96) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#95](https://github.com/OpenAEC-Foundation/open-office-studio/issues/95) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#94](https://github.com/OpenAEC-Foundation/open-office-studio/issues/94) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#93](https://github.com/OpenAEC-Foundation/open-office-studio/issues/93) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#92](https://github.com/OpenAEC-Foundation/open-office-studio/issues/92) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#91](https://github.com/OpenAEC-Foundation/open-office-studio/issues/91) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#90](https://github.com/OpenAEC-Foundation/open-office-studio/issues/90) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#89](https://github.com/OpenAEC-Foundation/open-office-studio/issues/89) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#88](https://github.com/OpenAEC-Foundation/open-office-studio/issues/88) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#87](https://github.com/OpenAEC-Foundation/open-office-studio/issues/87) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#86](https://github.com/OpenAEC-Foundation/open-office-studio/issues/86) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#85](https://github.com/OpenAEC-Foundation/open-office-studio/issues/85) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#84](https://github.com/OpenAEC-Foundation/open-office-studio/issues/84) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#83](https://github.com/OpenAEC-Foundation/open-office-studio/issues/83) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#82](https://github.com/OpenAEC-Foundation/open-office-studio/issues/82) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#81](https://github.com/OpenAEC-Foundation/open-office-studio/issues/81) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#80](https://github.com/OpenAEC-Foundation/open-office-studio/issues/80) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#79](https://github.com/OpenAEC-Foundation/open-office-studio/issues/79) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#78](https://github.com/OpenAEC-Foundation/open-office-studio/issues/78) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#77](https://github.com/OpenAEC-Foundation/open-office-studio/issues/77) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#76](https://github.com/OpenAEC-Foundation/open-office-studio/issues/76) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#75](https://github.com/OpenAEC-Foundation/open-office-studio/issues/75) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#74](https://github.com/OpenAEC-Foundation/open-office-studio/issues/74) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#73](https://github.com/OpenAEC-Foundation/open-office-studio/issues/73) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#72](https://github.com/OpenAEC-Foundation/open-office-studio/issues/72) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#71](https://github.com/OpenAEC-Foundation/open-office-studio/issues/71) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#70](https://github.com/OpenAEC-Foundation/open-office-studio/issues/70) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#69](https://github.com/OpenAEC-Foundation/open-office-studio/issues/69) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#68](https://github.com/OpenAEC-Foundation/open-office-studio/issues/68) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#67](https://github.com/OpenAEC-Foundation/open-office-studio/issues/67) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#66](https://github.com/OpenAEC-Foundation/open-office-studio/issues/66) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#64](https://github.com/OpenAEC-Foundation/open-office-studio/issues/64) | Concept-PR #164; kern en invoerroutes gekoppeld | Aanvullende ingebouwde-datumaudit hersteld: tien JS/WASM-, 54 gerichte kern- en 1.874 unieke appproeven, native gemengde notaties en onbekende regio, bytegelijke herbouw. Volledige kernnacontrole 2.419 proeven groen; zes platformchecks op de definitieve revisie nog open; zie [getalnotatie](2026-11-06-getalnotatie.md). |
| [#61](https://github.com/OpenAEC-Foundation/open-office-studio/issues/61) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#60](https://github.com/OpenAEC-Foundation/open-office-studio/issues/60) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#59](https://github.com/OpenAEC-Foundation/open-office-studio/issues/59) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#58](https://github.com/OpenAEC-Foundation/open-office-studio/issues/58) | Gerichte reparatie en praktijkproeven geslaagd; brede functiecontrole loopt | Naamvak, F4-cyclus, functiehulp en opslaan/heropenen gecontroleerd. Rasterklik en slepen in uitgebreide formulebalk behouden nu concept en doelcel. Brede issue nog niet volledig afgetekend. |
| [#57](https://github.com/OpenAEC-Foundation/open-office-studio/issues/57) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#56](https://github.com/OpenAEC-Foundation/open-office-studio/issues/56) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#55](https://github.com/OpenAEC-Foundation/open-office-studio/issues/55) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#54](https://github.com/OpenAEC-Foundation/open-office-studio/issues/54) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#53](https://github.com/OpenAEC-Foundation/open-office-studio/issues/53) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#52](https://github.com/OpenAEC-Foundation/open-office-studio/issues/52) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#51](https://github.com/OpenAEC-Foundation/open-office-studio/issues/51) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#50](https://github.com/OpenAEC-Foundation/open-office-studio/issues/50) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#49](https://github.com/OpenAEC-Foundation/open-office-studio/issues/49) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#48](https://github.com/OpenAEC-Foundation/open-office-studio/issues/48) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#46](https://github.com/OpenAEC-Foundation/open-office-studio/issues/46) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#45](https://github.com/OpenAEC-Foundation/open-office-studio/issues/45) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#44](https://github.com/OpenAEC-Foundation/open-office-studio/issues/44) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#43](https://github.com/OpenAEC-Foundation/open-office-studio/issues/43) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#41](https://github.com/OpenAEC-Foundation/open-office-studio/issues/41) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#40](https://github.com/OpenAEC-Foundation/open-office-studio/issues/40) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#39](https://github.com/OpenAEC-Foundation/open-office-studio/issues/39) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#37](https://github.com/OpenAEC-Foundation/open-office-studio/issues/37) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#36](https://github.com/OpenAEC-Foundation/open-office-studio/issues/36) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#35](https://github.com/OpenAEC-Foundation/open-office-studio/issues/35) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#34](https://github.com/OpenAEC-Foundation/open-office-studio/issues/34) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#33](https://github.com/OpenAEC-Foundation/open-office-studio/issues/33) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#32](https://github.com/OpenAEC-Foundation/open-office-studio/issues/32) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#31](https://github.com/OpenAEC-Foundation/open-office-studio/issues/31) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#30](https://github.com/OpenAEC-Foundation/open-office-studio/issues/30) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#29](https://github.com/OpenAEC-Foundation/open-office-studio/issues/29) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#28](https://github.com/OpenAEC-Foundation/open-office-studio/issues/28) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#27](https://github.com/OpenAEC-Foundation/open-office-studio/issues/27) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#26](https://github.com/OpenAEC-Foundation/open-office-studio/issues/26) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#25](https://github.com/OpenAEC-Foundation/open-office-studio/issues/25) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#24](https://github.com/OpenAEC-Foundation/open-office-studio/issues/24) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#23](https://github.com/OpenAEC-Foundation/open-office-studio/issues/23) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#22](https://github.com/OpenAEC-Foundation/open-office-studio/issues/22) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#21](https://github.com/OpenAEC-Foundation/open-office-studio/issues/21) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#20](https://github.com/OpenAEC-Foundation/open-office-studio/issues/20) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#19](https://github.com/OpenAEC-Foundation/open-office-studio/issues/19) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#17](https://github.com/OpenAEC-Foundation/open-office-studio/issues/17) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#14](https://github.com/OpenAEC-Foundation/open-office-studio/issues/14) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#13](https://github.com/OpenAEC-Foundation/open-office-studio/issues/13) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#12](https://github.com/OpenAEC-Foundation/open-office-studio/issues/12) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#8](https://github.com/OpenAEC-Foundation/open-office-studio/issues/8) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#6](https://github.com/OpenAEC-Foundation/open-office-studio/issues/6) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#5](https://github.com/OpenAEC-Foundation/open-office-studio/issues/5) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#3](https://github.com/OpenAEC-Foundation/open-office-studio/issues/3) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#2](https://github.com/OpenAEC-Foundation/open-office-studio/issues/2) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |
| [#1](https://github.com/OpenAEC-Foundation/open-office-studio/issues/1) | Nog niet volledig afgetekend | Acceptatiecriteria vergelijken met bron, bestaande tests en werkelijke uitvoering. |

## Controle van deze herstelgroep

- Productiebuild en TypeScript geslaagd.
- 129 testbestanden: 1.530 geslaagde proeven, zeven overgeslagen corpusgevallen.
- De opdrachtcontroles voor de drie hoofdmodules en de basisrondgangen zijn groen.
- 44 Python-controles voor onder meer formaatcatalogus en bestandskoppelingen groen.
- Tauri-desktopschil: 109 gewone tests groen; de vijf standaard genegeerde
  conversieproeven zijn daarna expliciet uitgevoerd en alle vijf groen.
  Hiervoor is een ongewijzigde kopie van `src-tauri` onder `/tmp` gebruikt:
  de bovenliggende werkmap bevat een andere Cargo-workspace. De bronnen van
  het parallelle migratietraject zijn niet aangepast.
- De synthetische documentmatrix is uitgevoerd met de geleverde engines.
  De onafhankelijke referentieroute leverde twaalf uitvoerbestanden. Eerst
  verhinderde een programmawrapper de verbinding; met het systeemprogramma
  in het zoekpad slaagde deze route. Dit is geen praktijkcorpus of visuele
  vergelijking van alle pagina's.

De aansluiting voor Tab wijzigt uitsluitend twee gecontroleerde fragmenten
van de vastgezette hybride editorroute bij het bouwen. Een afwijkende
enginebron breekt de bouw af. De celbepaling zelf staat in getypeerde eigen
code en is met echte sessies getest. Er is geen extra asynchrone
Tab-afhandelaar: bewerken blijft in de bestaande invoerwachtrij.

[Heropende genummerde lijst in de productie-interface](../screenshots/test-tauri-lijstvervolg-2026-11-05.png).

Na de volledige testset is aanvullend gecontroleerd dat een voorgestelde
splitsing geen extra alinearevisie krijgt. Daarvoor blijft de oorspronkelijke
enginebewerking in gebruik; de opslagproef slaagt.

## Selectie van tabelcellen

De selectielaag tekent de hele celvlakken uit dezelfde tabelstructuur die de
bewerking gebruikt. Lege cellen, omgekeerd slepen, samengevoegde cellen en
zichtbare rijfragmenten hebben gerichte proeven. De gewone tekstselectie in
één cel houdt de engineweergave. Tabelgeometrie herkent nu ook de blijvende
cel-ids met een achtervoegsel die de huidige engine maakt.

De interfaceproef selecteert eerst vier gevulde cellen, daarna twee cellen
waarvan één leeg is. Alle bedoelde vlakken zijn zichtbaar, ook na het kiezen
van Tabelopmaak. Samenvoegen raakt precies de twee laatst geselecteerde cellen;
undo herstelt de zes oorspronkelijke cellen. Dit is een weergavelaag; het
bestand wordt niet door de selectie gewijzigd.

[Selectie inclusief lege cel](../screenshots/test-tauri-celselectie-2026-11-05.png).

Eindcontrole na deze wijziging: productiebuild en typecontrole groen;
130 testbestanden, 1.534 geslaagde proeven en zeven overgeslagen corpusgevallen.

## Verticale celuitlijning

Vóór herstel verschoof de weergave bij een volledig zichtbare tekst van 108
naar 154 pixels bij Midden en naar 167 bij Onder. De aansluiting wacht nu op
de indeling en de cursorlaag, beëindigt de eerdere cursorverankering via de
navigatie-API en behoudt de oude positie wanneer de nieuwe cursor daar past.
Anders wordt de minimaal nodige verplaatsing berekend. Een nieuwe muis-,
toetsenbord- of schuifhandeling onderbreekt de correctie; ook een gewijzigde
sessie of selectie maakt de oude correctie ongeldig.

De interfaceproef herhaalt Boven, Midden en Onder op een rij van 4 cm, vanaf
scrollTop 108. Na iedere afgeronde bewerking blijft die waarde 108; de cursor
blijft zichtbaar. Drie gerichte proeven controleren behouden, minimaal omhoog
en minimaal omlaag schuiven. De gewone opmaak- en opslagproeven blijven groen.

[Uitlijning met behouden weergave](../screenshots/test-tauri-celuitlijning-2026-11-05.png).

Eindcontrole: typecontrole, productiebuild en opdrachtcontroles groen;
131 testbestanden, 1.537 proeven geslaagd en zeven corpusgevallen overgeslagen.

## Extern plakken

De Tauri-app leest tekst via de officiële klembordkoppeling wanneer de
plakroute als platte tekst wordt uitgevoerd. Alleen tekst lezen is aan de
lokale appvensters toegestaan. Er is geen klembordcache of achtergrondlezer.
Ctrl+V en Ctrl+Shift+V gebruiken op desktop dezelfde route als de lintknoppen;
de browser behoudt zijn gewone paste-gebeurtenis. Een geweigerde native
opdracht valt niet terug op een mogelijk verouderde webviewkopie. De gewone
browserroute en de bestaande route voor rijke gegevens blijven beschikbaar.

Geteste lagen:

- Acht gerichte gevallen: browser, geweigerde of ontbrekende browser-API op
  desktop, nieuwe kopie, leeg klembord en geweigerde native opdracht.
- De werkelijk geleverde JS-koppeling doet uitsluitend de verwachte
  `plugin:clipboard-manager|read_text`-aanroep via een gesimuleerde IPC-host.
- De echte native klembordkoppeling is op een eigen X11-display gestart met
  twee afzonderlijke verbindingen. De lezer ontvangt zowel de eerste als de
  volgende systeemkopie van de andere verbinding. Deze proef slaagt; het
  gewone bureaubladklembord wordt daarbij niet gebruikt.
- Browserinterface: ‘Voor ’ typen, externe tekst via het lint plakken, een
  nieuwe externe kopie met Ctrl+V toevoegen, intern alles kopiëren en opnieuw
  plakken. De bewaarde DOCX bevat twee identieke volledige alinea's en toont
  deze ook na heropenen: 14 woorden, 88 tekens.

De klembordmodule en desktopschil gebruiken beide versie 2.3.2. De officiële
[API en rechten](https://v2.tauri.app/plugin/clipboard/) beschrijven de gekozen
tekst-opdracht. Dit is geen uitgevoerde Windows-, macOS- of native
webview-toetsenbordproef; #126 wordt daarom niet automatisch gesloten.

[Heropende plakproef](../screenshots/test-tauri-plakken-2026-11-05.png).

Laatste controle: productiebuild en typecontrole groen; 133 testbestanden,
1.546 proeven geslaagd en zeven corpusgevallen overgeslagen. De vernieuwde
Tauri-desktopschil heeft 109 gewone tests geslaagd en zes standaard
overgeslagen tests; de vijf conversieproeven en de afzonderlijke
klembordsysteemproef zijn in deze ronde expliciet uitgevoerd en geslaagd.

## Afronding en sluitselectie

De herstelronde gaat via PR #148 naar de standaardbranch. De gecontroleerde
sluitselectie bevat twintig concrete meldingen: #120, #122, #123, #124, #125,
#127, #128, #129, #131, #133, #136, #137, #138, #139, #140, #141, #142, #143,
#145 en #146. De PR bevat expliciete sluitverwijzingen; het register hierboven
is een momentopname van de werkbranch, geen actuele GitHub-status.

#126 blijft open voor bediening in de native webview. #130 is met de nieuwe
engine niet gereproduceerd en mist nog een overeenkomende visuele proef. #135
blijft open omdat de oorspronkelijke initialisatiefout niet afzonderlijk is
gereproduceerd. #144 heeft nog de bewezen fout in de nootverwijzingen.

De brede functie-, formaat-, integratie- en routekaartissues blijven open zolang
hun volledige acceptatiecriteria niet zijn afgetekend. Aanwezige implementaties
en afzonderlijke geslaagde proeven zijn daarvoor onvoldoende. De gerichte
formulebalkreparatie is bijvoorbeeld geen vrijgave van alle formulefuncties,
en de reparatie van inhoudsopgaven bewijst geen figurenlijst of PDF-koppelingen.

Bij het samenbrengen van #118 blijft de op de actuele engine geteste
formulebereikroute behouden; een tweede globale pointerafhandeling zou dezelfde
invoer dubbel onderscheppen. #119 levert een Laotiaanse interfacetaal. Ongeldige
engine-imports en een niet-bestaande CJK-variant zijn verwijderd; de engines
gebruiken hun bestaande Engelse terugval. Vijftien ontbrekende beschrijvingen
en argumentnamen zijn voorlopig aangevuld met de Engelse brontekst. De acht
bestaande installertalen blijven onderling gelijk.

Het IFCX-voorstel (#115) is afzonderlijk samengevoegd als documentatie en
experimentele bewaarproef; dit activeert geen nieuwe productieopslag. De
parallelle Rust-migratie (#116) blijft buiten deze herstelronde.

## Aanvullende native opslagronde — 6 november 2026

PR #154 voegt de daadwerkelijke Office-bronopslag van het IFCX-voorstel toe.
De [afzonderlijke herstel- en testbeschrijving](2026-11-05-ifcx-office.md) bevat
het bewijs, de formaatgrenzen en de reproduceerbare opdrachten. Bovenstaande
waarnemingen blijven de historische stand van de eerdere herstelgroep.

| Issue | Aanvullende uitkomst |
| --- | --- |
| #152 | Writer, Spreadsheet en Presentation: IFCX openen, bewerken, opslaan en heropenen; onafhankelijke bron-, formule- en hashcontrole. Native Linux Ctrl+S en Opslaan als/heropenen afzonderlijk uitgevoerd. |
| #135 | Initialisatiefout nu rechtstreeks gereproduceerd na opslaan in WebKit. Workerstart hersteld; ingevoerde tekst blijft na herhaalde native opslag behouden. |
| #153 | Te late versiemelding afzonderlijk gereproduceerd en hersteld. Native opgeslagen XML, revisiestatus, titel, tab en statusbalk gecontroleerd. Werkelijk latere invoer blijft gewijzigd. |
| #126 | Echte Linux-webview: extern en intern plakken via lint en Ctrl+V, met onafhankelijke DOCX-controle en schone toestand na iedere opslag. |

De lokale controles zijn groen: productiebuild, 146 testbestanden met 1.654
geslaagde proeven en zeven overgeslagen corpusgevallen, 44 Python-proeven en
de bestaande vertaalcontrole. De bestaande Rust-desktopschil heeft 110
geslaagde en zes standaard genegeerde proeven. Windows- en macOS-GUI-bediening
is hiermee niet vrijgegeven. De wijzigingen zijn pas na een geslaagde
platformcontrole en merge op de hoofdbranch beschikbaar; ze zitten nog niet
in de gepubliceerde release v2026.45.1. De overige open issues, waaronder
#144 en de brede klembordcriteria van #20, blijven afzonderlijk te toetsen.


## Actuele vervolgstand — 6 november 2026

GitHub heeft op deze controledatum 93 open issues. Bovenstaande oorspronkelijke
momentopname blijft herkenbaar als historie; de volgende gerichte afrondingen
zijn inmiddels gemerged en de betreffende issues zijn gesloten:

- PR #154: #126, #135, #152 en #153; native invoer, IFCX en opslag.
- PR #155: #144; nummering van voet-/eindnoot en verwijzing gelijk.
- PR #159: #58; formulebediening inclusief de lange vlakke formuleketen.
- PR #163: #70; volledig naambeheer, 45 regressieproeven en native
  maken/wijzigen/verwijderen, scopes, Undo/Redo, opslaan en heropenen.

De openbare release 2026-W45.2 bevat PR #154–#159. PR #163 is daarna gemerged.
Getalnotatie #64 wordt verder afgewerkt in concept-PR #164; de aanvullende
native datumproeven zijn groen. De brede issues #51, #60, #61, #71 en #73 zijn
opnieuw op hun volledige criteria gelezen en blijven open: onder meer
sectie-/paginanoten en formaatbehoud, venstersplitsing, bladen samen bewerken,
gespreksnotities en gestructureerde tabellen vragen nog afzonderlijke controle.
