# Voortgang migratie en open issues

Peildatum: 2 november 2026. Ontwikkelbasis: Tauri/Rust met React/TypeScript, commit `bdab16e`, lokale testversie `2026.45.7` (getest op 3 november).

## Huidige waarheid

- De volledige Rust-interface is nog niet af; `native/docs/migratie.json` blijft leidend voor acceptatie.
- Writer-invoer en selectie zijn nog te traag. De nieuwe geïsoleerde native WebKit-proef verwerkt 98 tekens in circa 15,2 seconden; de eerdere ronde duurde circa 22,7 seconden. Dit is nog onvoldoende en geen algemene benchmark.
- Voor 2026.45.4 zijn 1.545 automatische tests, 68 Writer-opdrachtcontroles en gerichte Linux-GUI-controles geslaagd. Dit bewijst geen volledige functiedekking.
- De suite en zes losse edities van 2026.45.6 zijn op Windows, Linux en macOS gebouwd. De volledige GUI-matrix blijft open; de nieuwere 45.7 is lokaal op Linux getest.

## Werkvolgorde

1. Writer: invoer-/selectievertraging, workerlevensduur, groot plakken en behoud van getypte tekst.
2. Voorkomen van sessie-/gegevensverlies: onder meer rekenbladissue #120.
3. Concrete Writer-regressies #122–#133 met reproductie, bewaren/heropenen en undo/redo.
4. Overige modulefuncties en open issues; applicatielogica stapsgewijs naar de Rust-kern verplaatsen.
5. Rust-interface per module pas vervangen bij aantoonbare functionele en visuele gelijkwaardigheid.
6. Distributie: suite plus losse edities, installatie/upgrade, ondertekening en echte platformproeven.
7. Database blijft de laagste moduleprioriteit.

## Open issues op de peildatum

Deze inventaris heeft **106** items. “Open” betekent niet dat de fout in deze ronde al is gereproduceerd. Een bestaand testbestand of ouder verslag is geen nieuwe uitvoering.

| Issue | Onderwerp | Status |
| --- | --- | --- |
| [#1](https://github.com/OpenAEC-Foundation/open-office-studio/issues/1) | Open Office Studio: browser-kantoorsuite voor de SuperCloud (onderzoek en opzet) | Open; controle per issue nodig |
| [#2](https://github.com/OpenAEC-Foundation/open-office-studio/issues/2) | Documenten: bestaande DOCX-editor losmaken en bestandsbehoud toetsen | Open; controle per issue nodig |
| [#3](https://github.com/OpenAEC-Foundation/open-office-studio/issues/3) | Rekenbladen: XLSX-adapter en onafhankelijke formulecontrole | Open; controle per issue nodig |
| [#5](https://github.com/OpenAEC-Foundation/open-office-studio/issues/5) | Integratie: live Y-app-opslagproef en gedeeld editorcontract | Open; controle per issue nodig |
| [#6](https://github.com/OpenAEC-Foundation/open-office-studio/issues/6) | Validatie: praktijkcorpus, bundelmetingen en ODF-vervolg | Open; controle per issue nodig |
| [#8](https://github.com/OpenAEC-Foundation/open-office-studio/issues/8) | Open Access Studio: oude databases openen inclusief VBA-scripts | Open; controle per issue nodig |
| [#12](https://github.com/OpenAEC-Foundation/open-office-studio/issues/12) | Routekaart: Open Office Studio als volwaardig kantoorpakket | Open; controle per issue nodig |
| [#13](https://github.com/OpenAEC-Foundation/open-office-studio/issues/13) | Algemeen: recente bestanden in startscherm en bestandsmenu | Open; controle per issue nodig |
| [#14](https://github.com/OpenAEC-Foundation/open-office-studio/issues/14) | Algemeen: automatisch herstel na een crash of stroomstoring | Open; controle per issue nodig |
| [#17](https://github.com/OpenAEC-Foundation/open-office-studio/issues/17) | Algemeen: bestanden openen door ze op het venster te slepen | Open; controle per issue nodig |
| [#19](https://github.com/OpenAEC-Foundation/open-office-studio/issues/19) | Algemeen: sneltoetsen volgens gangbare kantoorconventies, met overzicht | Open; controle per issue nodig |
| [#20](https://github.com/OpenAEC-Foundation/open-office-studio/issues/20) | Algemeen: klembord met en zonder opmaak, ook tussen programma's | Open; controle per issue nodig |
| [#21](https://github.com/OpenAEC-Foundation/open-office-studio/issues/21) | Algemeen: spellingcontrole en autocorrectie in het Nederlands en Engels | Open; controle per issue nodig |
| [#22](https://github.com/OpenAEC-Foundation/open-office-studio/issues/22) | Algemeen: systeemlettertypen en vervanging van ontbrekende lettertypen | Open; controle per issue nodig |
| [#23](https://github.com/OpenAEC-Foundation/open-office-studio/issues/23) | Algemeen: instellingenvenster | Open; controle per issue nodig |
| [#24](https://github.com/OpenAEC-Foundation/open-office-studio/issues/24) | Algemeen: toegankelijkheid van lint, dialogen en documentvlak | Open; controle per issue nodig |
| [#25](https://github.com/OpenAEC-Foundation/open-office-studio/issues/25) | Algemeen: bestandskoppelingen op macOS en Linux | Open; controle per issue nodig |
| [#26](https://github.com/OpenAEC-Foundation/open-office-studio/issues/26) | Algemeen: automatische updates | Open; controle per issue nodig |
| [#27](https://github.com/OpenAEC-Foundation/open-office-studio/issues/27) | Algemeen: sjablonen maken, beheren en gebruiken | Open; controle per issue nodig |
| [#28](https://github.com/OpenAEC-Foundation/open-office-studio/issues/28) | Algemeen: statusbalk met module-informatie en zoomschuif | Open; controle per issue nodig |
| [#29](https://github.com/OpenAEC-Foundation/open-office-studio/issues/29) | Algemeen: uitgebreid zoeken en vervangen in alle modules | Open; controle per issue nodig |
| [#30](https://github.com/OpenAEC-Foundation/open-office-studio/issues/30) | Formaten: alle ondersteunde formaten openen zonder afzonderlijk geïnstalleerd conversieprogramma | Open; controle per issue nodig |
| [#31](https://github.com/OpenAEC-Foundation/open-office-studio/issues/31) | Formaten: ODT (OpenDocument-tekst) openen en opslaan | Open; controle per issue nodig |
| [#32](https://github.com/OpenAEC-Foundation/open-office-studio/issues/32) | Formaten: ODS (OpenDocument-rekenblad) openen en opslaan | Open; controle per issue nodig |
| [#33](https://github.com/OpenAEC-Foundation/open-office-studio/issues/33) | Formaten: ODP (OpenDocument-presentatie) openen en opslaan | Open; controle per issue nodig |
| [#34](https://github.com/OpenAEC-Foundation/open-office-studio/issues/34) | Formaten: DOC (binair tekstformaat 97–2003) openen en opslaan | Open; controle per issue nodig |
| [#35](https://github.com/OpenAEC-Foundation/open-office-studio/issues/35) | Formaten: XLS en XLSB openen en opslaan | Open; controle per issue nodig |
| [#36](https://github.com/OpenAEC-Foundation/open-office-studio/issues/36) | Formaten: PPT en PPS openen en opslaan | Open; controle per issue nodig |
| [#37](https://github.com/OpenAEC-Foundation/open-office-studio/issues/37) | Formaten: PDF-export zonder conversieprogramma | Open; controle per issue nodig |
| [#39](https://github.com/OpenAEC-Foundation/open-office-studio/issues/39) | Formaten: RTF, TXT, HTML en Markdown openen | Open; controle per issue nodig |
| [#40](https://github.com/OpenAEC-Foundation/open-office-studio/issues/40) | Formaten: melding bij onvolledige ondersteuning bij openen en opslaan | Open; controle per issue nodig |
| [#41](https://github.com/OpenAEC-Foundation/open-office-studio/issues/41) | Formaten: wachtwoordbeveiligde documenten openen en opslaan | Open; controle per issue nodig |
| [#43](https://github.com/OpenAEC-Foundation/open-office-studio/issues/43) | Formaten: minder gangbare en oudere formaten uit de catalogus | Open; controle per issue nodig |
| [#44](https://github.com/OpenAEC-Foundation/open-office-studio/issues/44) | Tekst: kop- en voetteksten, paginanummers en velden | Open; controle per issue nodig |
| [#45](https://github.com/OpenAEC-Foundation/open-office-studio/issues/45) | Tekst: stijlen maken, wijzigen en beheren | Open; controle per issue nodig |
| [#46](https://github.com/OpenAEC-Foundation/open-office-studio/issues/46) | Tekst: lijsten met meerdere niveaus en kopnummering | Open; controle per issue nodig |
| [#48](https://github.com/OpenAEC-Foundation/open-office-studio/issues/48) | Tekst: uitgebreide tabelbewerking | Open; controle per issue nodig |
| [#49](https://github.com/OpenAEC-Foundation/open-office-studio/issues/49) | Tekst: afbeeldingen bijsnijden, positioneren en beschrijven | Open; controle per issue nodig |
| [#50](https://github.com/OpenAEC-Foundation/open-office-studio/issues/50) | Tekst: inhoudsopgave invoegen en bijwerken | Open; controle per issue nodig |
| [#51](https://github.com/OpenAEC-Foundation/open-office-studio/issues/51) | Tekst: voetnoten en eindnoten | Open; controle per issue nodig |
| [#52](https://github.com/OpenAEC-Foundation/open-office-studio/issues/52) | Tekst: bijschriften, kruisverwijzingen en bladwijzers | Open; controle per issue nodig |
| [#53](https://github.com/OpenAEC-Foundation/open-office-studio/issues/53) | Tekst: wiskundige formules invoegen en bewerken | Open; controle per issue nodig |
| [#54](https://github.com/OpenAEC-Foundation/open-office-studio/issues/54) | Tekst: afdruk samenvoegen met een adreslijst | Open; controle per issue nodig |
| [#55](https://github.com/OpenAEC-Foundation/open-office-studio/issues/55) | Tekst: tekstkolommen en secties met eigen pagina-instelling | Open; controle per issue nodig |
| [#56](https://github.com/OpenAEC-Foundation/open-office-studio/issues/56) | Tekst: vormen, tekstvakken en tekenobjecten in documenten | Open; controle per issue nodig |
| [#57](https://github.com/OpenAEC-Foundation/open-office-studio/issues/57) | Tekst: twee versies van een document vergelijken | Open; controle per issue nodig |
| [#58](https://github.com/OpenAEC-Foundation/open-office-studio/issues/58) | Rekenblad: formulebalk, naamvak en functie-invoeghulp | Open; controle per issue nodig |
| [#59](https://github.com/OpenAEC-Foundation/open-office-studio/issues/59) | Rekenblad: formulefuncties, herberekening en Nederlandse notatie | Open; controle per issue nodig |
| [#60](https://github.com/OpenAEC-Foundation/open-office-studio/issues/60) | Rekenblad: rijen en kolommen invoegen, verwijderen, verbergen en vastzetten | Open; controle per issue nodig |
| [#61](https://github.com/OpenAEC-Foundation/open-office-studio/issues/61) | Rekenblad: bladen beheren | Open; controle per issue nodig |
| [#64](https://github.com/OpenAEC-Foundation/open-office-studio/issues/64) | Rekenblad: getalnotaties met Nederlandse landinstellingen | Open; controle per issue nodig |
| [#66](https://github.com/OpenAEC-Foundation/open-office-studio/issues/66) | Rekenblad: grafieken maken en bewerken | Open; controle per issue nodig |
| [#67](https://github.com/OpenAEC-Foundation/open-office-studio/issues/67) | Rekenblad: voorwaardelijke opmaak | Open; controle per issue nodig |
| [#68](https://github.com/OpenAEC-Foundation/open-office-studio/issues/68) | Rekenblad: gegevensvalidatie en keuzelijsten | Open; controle per issue nodig |
| [#69](https://github.com/OpenAEC-Foundation/open-office-studio/issues/69) | Rekenblad: draaitabellen | Open; controle per issue nodig |
| [#70](https://github.com/OpenAEC-Foundation/open-office-studio/issues/70) | Rekenblad: benoemde bereiken en naambeheer | Open; controle per issue nodig |
| [#71](https://github.com/OpenAEC-Foundation/open-office-studio/issues/71) | Rekenblad: opmerkingen en notities bij cellen | Open; controle per issue nodig |
| [#72](https://github.com/OpenAEC-Foundation/open-office-studio/issues/72) | Rekenblad: blad- en werkmapbeveiliging | Open; controle per issue nodig |
| [#73](https://github.com/OpenAEC-Foundation/open-office-studio/issues/73) | Rekenblad: celstijlen en een bereik opmaken als tabel | Open; controle per issue nodig |
| [#74](https://github.com/OpenAEC-Foundation/open-office-studio/issues/74) | Rekenblad: grote werkmappen vlot bewerken | Open; controle per issue nodig |
| [#75](https://github.com/OpenAEC-Foundation/open-office-studio/issues/75) | Rekenblad: koppelingen, afbeeldingen en vormen in werkbladen | Open; controle per issue nodig |
| [#76](https://github.com/OpenAEC-Foundation/open-office-studio/issues/76) | Presentatie: diasorteerder en overzichtsweergave | Open; controle per issue nodig |
| [#77](https://github.com/OpenAEC-Foundation/open-office-studio/issues/77) | Presentatie: diamodellen en indelingen bewerken | Open; controle per issue nodig |
| [#78](https://github.com/OpenAEC-Foundation/open-office-studio/issues/78) | Presentatie: thema's toepassen en aanpassen | Open; controle per issue nodig |
| [#79](https://github.com/OpenAEC-Foundation/open-office-studio/issues/79) | Presentatie: notities en presentatorweergave | Open; controle per issue nodig |
| [#80](https://github.com/OpenAEC-Foundation/open-office-studio/issues/80) | Presentatie: objecten uitlijnen, verdelen, groeperen en bijsnijden | Open; controle per issue nodig |
| [#81](https://github.com/OpenAEC-Foundation/open-office-studio/issues/81) | Presentatie: tabellen in dia's | Open; controle per issue nodig |
| [#82](https://github.com/OpenAEC-Foundation/open-office-studio/issues/82) | Presentatie: grafieken in dia's | Open; controle per issue nodig |
| [#83](https://github.com/OpenAEC-Foundation/open-office-studio/issues/83) | Presentatie: overgangen tussen dia's | Open; controle per issue nodig |
| [#84](https://github.com/OpenAEC-Foundation/open-office-studio/issues/84) | Presentatie: animaties van objecten | Open; controle per issue nodig |
| [#85](https://github.com/OpenAEC-Foundation/open-office-studio/issues/85) | Presentatie: video en audio | Open; controle per issue nodig |
| [#86](https://github.com/OpenAEC-Foundation/open-office-studio/issues/86) | Presentatie: diagrammen correct weergeven en eenvoudig bewerken | Open; controle per issue nodig |
| [#87](https://github.com/OpenAEC-Foundation/open-office-studio/issues/87) | Presentatie: dianummers, datum en voettekst | Open; controle per issue nodig |
| [#88](https://github.com/OpenAEC-Foundation/open-office-studio/issues/88) | Database: relaties tonen in een relatiediagram | Open; controle per issue nodig |
| [#89](https://github.com/OpenAEC-Foundation/open-office-studio/issues/89) | Database: query's uitvoeren | Open; controle per issue nodig |
| [#90](https://github.com/OpenAEC-Foundation/open-office-studio/issues/90) | Database: eigen bewerkbare database | Open; controle per issue nodig |
| [#91](https://github.com/OpenAEC-Foundation/open-office-studio/issues/91) | Database: verbindingen met externe databronnen | Open; controle per issue nodig |
| [#92](https://github.com/OpenAEC-Foundation/open-office-studio/issues/92) | Database: formulieren en rapporten | Open; controle per issue nodig |
| [#93](https://github.com/OpenAEC-Foundation/open-office-studio/issues/93) | Onderzoek: tekenmodule voor diagrammen en vectortekeningen | Open; controle per issue nodig |
| [#94](https://github.com/OpenAEC-Foundation/open-office-studio/issues/94) | Open Agenda Studio: agenda naar voorbeeld van de Y-app | Open; controle per issue nodig |
| [#95](https://github.com/OpenAEC-Foundation/open-office-studio/issues/95) | Agenda: dag-, week- en maandweergave met navigatie | Open; controle per issue nodig |
| [#96](https://github.com/OpenAEC-Foundation/open-office-studio/issues/96) | Agenda: items maken, verslepen en van lengte veranderen in het raster | Open; controle per issue nodig |
| [#97](https://github.com/OpenAEC-Foundation/open-office-studio/issues/97) | Agenda: afspraakvenster met alle gangbare velden | Open; controle per issue nodig |
| [#98](https://github.com/OpenAEC-Foundation/open-office-studio/issues/98) | Agenda: herhalende afspraken en uitzonderingen | Open; controle per issue nodig |
| [#99](https://github.com/OpenAEC-Foundation/open-office-studio/issues/99) | Agenda: bronnen en agenda's naast elkaar, met kleur en aan/uit | Open; controle per issue nodig |
| [#100](https://github.com/OpenAEC-Foundation/open-office-studio/issues/100) | Agenda: lokale agenda's bewaren en ICS openen, importeren en exporteren | Open; controle per issue nodig |
| [#101](https://github.com/OpenAEC-Foundation/open-office-studio/issues/101) | Agenda: tijdzones, hele dagen en Nederlandse notatie | Open; controle per issue nodig |
| [#102](https://github.com/OpenAEC-Foundation/open-office-studio/issues/102) | Agenda: externe agenda's via iCal-abonnement (https / webcal) | Open; controle per issue nodig |
| [#103](https://github.com/OpenAEC-Foundation/open-office-studio/issues/103) | Agenda: CalDAV- en JMAP-agenda's lezen en schrijven | Open; controle per issue nodig |
| [#104](https://github.com/OpenAEC-Foundation/open-office-studio/issues/104) | Agenda: uitnodigingen versturen en beantwoorden | Open; controle per issue nodig |
| [#105](https://github.com/OpenAEC-Foundation/open-office-studio/issues/105) | Agenda: online vergaderlinks toevoegen en openen | Open; controle per issue nodig |
| [#106](https://github.com/OpenAEC-Foundation/open-office-studio/issues/106) | Agenda: Y-app als bron (afspraken, taken, verlof, timesheets, collega's) | Open; controle per issue nodig |
| [#108](https://github.com/OpenAEC-Foundation/open-office-studio/issues/108) | Algemeen: voorvertoning van kantoorbestanden herbruikbaar maken voor Y-next | Open; controle per issue nodig |
| [#113](https://github.com/OpenAEC-Foundation/open-office-studio/issues/113) | Signing van installers borgen — audit 29-10-2026 | Open; controle per issue nodig |
| [#120](https://github.com/OpenAEC-Foundation/open-office-studio/issues/120) | Rekenblad: lege ISOWEEKNUM-aanroep maakt bewerken en opslaan onmogelijk | Bron, kern-/browser-/nativeproeven en platformbouw geslaagd in 45.6; merge nog open |
| [#122](https://github.com/OpenAEC-Foundation/open-office-studio/issues/122) | Writer: opsommingstekens ontbreken na klikken op de opsommingsknop | Open; controle per issue nodig |
| [#123](https://github.com/OpenAEC-Foundation/open-office-studio/issues/123) | Writer: genummerde lijst wordt na Enter niet voortgezet | Open; controle per issue nodig |
| [#124](https://github.com/OpenAEC-Foundation/open-office-studio/issues/124) | Writer: pijltjes in lettergrootteveld passen geselecteerde tekst niet aan | Hersteld in 45.7; browser en native Linux inclusief bewaren/heropenen geslaagd; merge en andere platforms open |
| [#125](https://github.com/OpenAEC-Foundation/open-office-studio/issues/125) | Writer: bestaande tekst bewaart donkergrijze markering terwijl nieuwe invoer geel wordt | Open; controle per issue nodig |
| [#126](https://github.com/OpenAEC-Foundation/open-office-studio/issues/126) | Writer: extern gekopieerde tekst plakt niet; intern plakken werkt via lint en Ctrl+V | Open; controle per issue nodig |
| [#127](https://github.com/OpenAEC-Foundation/open-office-studio/issues/127) | Writer: Ga naar pagina moet de cursor aan het begin van de gekozen pagina plaatsen | Open; controle per issue nodig |
| [#128](https://github.com/OpenAEC-Foundation/open-office-studio/issues/128) | Writer: Tab in laatste tabelcel verlaat tabel zonder nieuwe rij toe te voegen | Open; controle per issue nodig |
| [#129](https://github.com/OpenAEC-Foundation/open-office-studio/issues/129) | Writer: selectie van meerdere tabelcellen is onvoldoende zichtbaar | Open; controle per issue nodig |
| [#130](https://github.com/OpenAEC-Foundation/open-office-studio/issues/130) | Writer: splitsen van bovenste cel lijkt kolombreedtes in andere rijen te verschuiven | Open; controle per issue nodig |
| [#131](https://github.com/OpenAEC-Foundation/open-office-studio/issues/131) | Writer: zichtbare labels toevoegen aan rij en kolom verwijderen in het tabellint | Bron aangepast; GUI 1440/960 en opslaan gecontroleerd; nog niet vrijgegeven |
| [#133](https://github.com/OpenAEC-Foundation/open-office-studio/issues/133) | Writer: beeld verspringt bij verticale celuitlijning terwijl tekst al zichtbaar is | Open; controle per issue nodig |

## Laatste onderzochte stap

- Canvas-lettertypeadapter: twee nieuwe regressieproeven faalden op de oude bron; de adapter stelt nu iedere opgave eenmaal in. Numerieke familienamen worden vooraf hersteld. De drie nieuwe tests en bestaande lettertypetests slagen. Dit bewijst geen oplossing voor alle typvertraging.
- Nieuwe tests en metingen worden hier met bronrevisie en beperkingen toegevoegd.
- De geopende gebruikersapp en onopgeslagen documenten worden behouden.

### Invoerronde 2 november, avond

- De volledige automatische ronde slaagt: **134 testbestanden, 1.551 tests**. De module-opdrachtproeven voor tekst, rekenblad en presentatie zijn uitgevoerd; details volgen in het vrijgaveverslag.
- Een echte geïsoleerde Linux-proef op de bewaarde 2026.45.4-binary vergelijkt directe native `beforeinput` met de bestaande route: 98 tekens in **16.082 ms**, vervolgens zonder adapter **29.642 ms**, vervolgens met adapter **14.004 ms**. Alle drie rondes behouden de ingevoerde tekst exact. Hetzelfde document groeit tijdens deze A/B/A-proef: dit is gericht bewijs voor de invoerroute, geen algemene snelheids- of praktijkgoedkeuring.
- De native voorinvoeradapter is nu opgenomen in de gepinde React-enginepatch. Drie gerichte tests controleren afhandeling, compositieterugval, eerder geannuleerde gebeurtenissen en opruimen. De eerdere FIFO- en workerstarttests blijven slagen.
- Het uitstellen van de DOM-spiegel en uitschakelen van native spelling gaven geen overtuigende winst en zijn **niet** overgenomen.
- De GUI-proef voor #131 controleert zichtbare labels op 1440 en 960 pixels, werkelijke rij-/kolomverwijdering en de opgeslagen 2×2-tabel.
- Afgerond voor 2026.45.5: productiebuild, native Linux-build, echte invoer-/selectieproef op de bewaarde binary, onafhankelijke DOCX-teruglezing en heropenen via de publieke editor-API. Zie [het verslag](tests/2026-11-03-writer-invoer.json).

### Vervolg na de lokale testversie

- De 45.5-proef behoudt 98 tekens exact, snelle tekstselectie/vervanging, Backspace, undo/redo en twee alinea’s na bewaren/heropenen. De gebruikssnelheid is nog niet goedgekeurd.
- De vorige suitebron `bdab16e` heeft op [Windows, Linux en macOS een geslaagde CI-bouwronde](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41467677830). Dat is geen 45.5-goedkeuring en geen fysieke GUI-proef op ieder platform.
- #120 is op de huidige rekenbladkern 0.3.0 gereproduceerd: lege ISOWEEKNUM-aanroep veroorzaakt een paniek en een onbruikbare handle. De geïsoleerde 0.5.1-kern geeft een celfout, bewaart andere bewerkingen en heropent correct. Volgende stap: de drie rekenbladpakketten samen bijwerken, alle adapters/typecontroles/rondgangen uitvoeren en de GUI hertesten.
- Daarna: resterende Writer-regressies en de asynchrone aansluiting van de bestaande Rust-documentwerker in de WebView-route; geen acceptatiegebied wordt voortijdig afgevinkt.

### 2026.45.6 in controle (3 november, nacht)

- Drie rekenbladpakketten staan samen op 0.5.1, in lijn met de Rust-kern. De bestaande synchrone hostadapter is voorlopig expliciet behouden; dit is geen voltooide asynchrone migratie.
- #120: twee nieuwe proeven falen op 0.3.0 en slagen op 0.5.1. Zeven kernproeven en twee formulevoorbeeldproeven controleren de foutwaarde, vervolgbewerking en bewaren/heropenen.
- Bestaand letterverlies bij snel beginnen in een cel is op 45.5 én de bijgewerkte kern gereproduceerd. De formulehulp draait nu na de React-invoerafhandeling. De oude productiebuild blijft in de vergelijking fout; de aangepaste bron behoudt de formule.
- De nieuwe herhaalbare productie-GUI-proef slaagt in vier afzonderlijke browsersessies, inclusief snelle invoer zonder F2, normale formuleberekening, een celfout, vervolgbewerking en een nieuw geopende bewaarkopie. De proef wordt in beide Linux-CI-routes uitgevoerd.
- Volledige Vitest-ronde: **136 bestanden, 1.560 proeven geslaagd**. TypeScript, alle module-opdrachten, 44 Python-proeven en de productiebuild slagen.
- De rekenbladmatrix slaagt op acht fixtures, inclusief 6.001 formulecellen en 229 herkende namen uit 519 kandidaten. Drie bekende afwijkingen voor onbekende/gebruikersfuncties blijven streng gemeld. Dit bewijst geen volledige ondersteuning van alle 229 functies.
- CSV, HTML en Markdown gebruiken een berekende werkkopie, zodat ontbreken van cachewaarden geen lege formulebedragen oplevert. De exportproeven controleren 924 en totaal 3068.
- De 45.5-platformronde [41542519654](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41542519654) is niet groen: de Windows-Pythonproef bleek afhankelijk van de kloktijd van een extra ZIP-verpakking. De test vergelijkt nu rechtstreeks de deterministische fixturebytes. De platformronde moet na push van de correctie opnieuw lopen.
- De 45.6-native Linux-bouw en echte toetsenproef zijn geslaagd. Een nieuw native proces heropent de bewaarde XLSX met exact 7, #VALUE!, 14 en 53. De gebundelde lettertypen worden werkelijk als fontbestand geladen. Zie [het volledige verslag](tests/2026-11-03-rekenbladkern.json). De lokale testversie is 45.6; bron `db81946` is gecommit en gepusht. De nieuwe [bouwronde voor zeven edities op drie platforms](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41547290342) is geslaagd; de drie platformartefacten zijn beschikbaar. Publiceren is bewust niet ingeschakeld. De oude run is als verouderd geannuleerd; zij blijft geen groene vrijgave.

- Nieuwe bevinding bij de native visuele controle: het lege `<workbookProtection/>` in het meegeleverde sjabloon geeft onterecht een beschermingswaarschuwing. Niet als foutloos afgevinkt; de zichtbare melding staat in het verslag.
- De gedeelde Rust-werker wordt nu losgemaakt uit de Iced-interface naar `office-core`. Vier nieuwe gerichte proeven en de aansluitende werkruimtecontroles zijn geslaagd; vastgelegd in `e7762c6`. De Dioxus-interface gebruikt deze werker nog niet.

### Volgende stappen na 45.6

- #124 is in de bron hersteld: native cijferpijltjes en pijltjestoetsen bevestigen de getoonde grootte, zonder gewone veldklikken te bevestigen. De oude productiebuild faalt op 11→12 pt; de nieuwe productieproef slaagt op elf bewaar-/invoer-/geschiedenis-/heropenstappen. 1.560 tests en alle module-opdrachten blijven groen. De native Linux-bouw, echte muis-/toetsenproef en heropenen in een nieuw native proces zijn geslaagd. De lokale testversie is bijgewerkt naar 45.7; zie [het verslag](tests/2026-11-03-lettergrootte.json).
- De productie-GUI-proef voor rekenbladen slaagt ook na de gedeelde lintaanpassing opnieuw in alle vier sessies.
- De Rust-kernronde slaagt op 192 proeven. De brede werkruimtecontrole met desktopcode heeft ook 198 Iced-interfacetests, 51 mailtests en 15 conversietests uitgevoerd. Zes expliciet optionele proeven zijn daarbij niet uitgevoerd. De extra X11-proef vond eerst Xvfb niet op PATH en is daarna met dezelfde testbinary en expliciet pad geslaagd. Elf resterende WebView-proeven en Clippy met desktopcode/alle doelen zijn groen. Samen zijn 468 Rust-proeven uitgevoerd en zes optionele proeven overgeslagen; zie [het verslag](../native/docs/gedeelde-werker-2026-11-03.json). De Dioxus-aansluiting blijft open.

- Bij controle van de oudere Rust-CI zijn twee afzonderlijke vrijgaveproblemen gevonden: de pakketnaam wordt door een stijlpad overschreven en de WebView-vensterproef hergebruikt een map uit de bouwcache. De Tauri-platformbouw hierboven blijft geslaagd; de Rust-previewroute is hierdoor nog niet volledig groen. Correctie en hertest lopen.

### Rust-WebView: bewaren buiten de interfacethread

- Een bewaarkopie bevat alleen bronbytes, hash, doelpad en de eigen document-/opdrachtidentiteit. Het bestandswerk wacht buiten de UI op de gedeelde achtergrondvoorziening.
- Een voltooid ouder bewaarsnapshot maakt nieuwe invoer niet schoon. Navigeren of een andere tab kiezen verplaatst de bevestiging niet; een gesloten tab komt niet terug. Gelijktijdig bewaren naar dezelfde oude schijfversie heeft maximaal één winnaar.
- Vier nieuwe modelproeven, alle vijftien gerichte WebView-proeven, volledige Clippy en de echte Linux-vensterproef slagen. De laatste heeft 45 clientbeelden en tien inhouds-/afsluitcontroles. Zie [het verslag](../native/docs/webview-bewaren-2026-11-03/LEESMIJ.md).
- Dit is een geteste debugbuild van de preview. Openen, enginebewerkingen en weergave moeten nog op de documentwerker worden aangesloten; dit lost de Writer-typvertraging van de bestaande Tauri-app niet op.
