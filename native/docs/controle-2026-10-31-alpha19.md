# Native controle, 31 oktober 2026: alpha 19

**2026.44.9-alpha.19** koppelt Writer-zoekresultaten aan de werkelijk getekende
documentpagina. Alle tien acceptatiegebieden blijven open. De volledige
migratie, functiepariteit en pixelpariteit zijn niet bereikt.

## Dezelfde layout voor beeld en navigatie

De nieuwe navigatieroute leest de getypeerde paginakaart van de behouden
layout-engine. Zij zoekt alinea-ID en UTF-16-positie in zichtbare
tekstfragmenten; herhaalde tabelkoppen tellen niet als de oorspronkelijke
tekstpositie. Unicode-selecties uit de editor worden vanuit scalaire tekens
vertaald. Een verouderde bronversie, ongeldige selectie of afgekapt resultaat
wordt geweigerd. Er wordt geen paginanummer geschat.

Tijdens het aansluiten bleek dat de laatste opgeloste documentsectie dubbel
aan de engine werd doorgegeven. De parser bevat deze sectie al; de losse
laatste broneigenschappen zijn alleen nog een terugval als de opgeloste lijst
leeg is. Een gerichte proef controleert twee bronsecties, twee metadatarecords
en een volledige getypeerde paginakaart met body- en tabeltekst.

De paginakaart wordt per bronversie naast de behouden layout bewaard.
Navigatie maakt geen documentbewerking en verandert geen undo-geschiedenis.
De actieve interface accepteert een antwoord pas als bron, paneel, query,
editorversie, selectie en scrollpositie nog overeenkomen. Nieuw typen wordt
niet geblokkeerd. Er loopt maximaal één navigatieopdracht; snelle nieuwe
keuzes vervangen alleen het laatste wachtende doel.

Ongedaan maken, opnieuw uitvoeren en Markdown-export krijgen expliciet het
getoonde onderdeel mee. Een verworpen oud navigatieantwoord kan zo geen
verborgen werkdraadpagina achterlaten die een volgende opdracht overneemt.
De pagina gaat voorlopig naar haar bovenkant. Exacte zoekmarkering op de
pagina, scrollen naar de gevonden regel en een directe rijke paginacursor
zijn nog niet geïmplementeerd.

## Uitgevoerde controles

- **227 reguliere Rust-tests geslaagd**, inclusief **61 GUI-tests**.
- **Zes runtimeproeven afzonderlijk geslaagd**; [zes conversierondgangen en drie PDF-handtekeningen](conversie-2026-10-31-alpha19-lokaal.json) onafhankelijk gecontroleerd.
- **Zeven Python-tests**, Rustfmt, Clippy met waarschuwingen als fouten en de bronhashcontroles geslaagd.
- De nieuwe [vijf kern- en drie GUI-proeven](writer-navigatie-2026-10-31-alpha19.json) toetsen pagina’s, tabellen, astrale tekens, bronbehoud, undo/redo en late antwoorden.
- DOCX/XLSX/PPTX onafhankelijk teruggelezen, inclusief alle bestaande opmaak- en zoekvervangingscontroles.
- **39 native schermen** met [bron- en loghashes](schermen-2026-10-31-alpha19.json).
- [Dertien gedeelde documentbeelden](documentbeelden-2026-10-31-alpha19.json) blijven bytegelijk aan alpha 18; [acht spreadsheetletterbeelden](spreadsheetletters-2026-10-31-alpha19.json) zijn afzonderlijk gecontroleerd.

![Zoeken bereikt de zesde documentpagina](screenshots/writer-zoeken-pagina.png)

Dit zijn echte Iced-widget- en werkdraadgebeurtenissen, met een testklembord
en synthetische IME-Commit. De [platformronde](platformen-2026-10-31-alpha19-afgekeurd.json) heeft drie
geslaagde native builds en een geslaagde runtimecontrole. De laatste CI-job
blijft afgekeurd op 17 pixels van de knipperende cursor in het nieuwe
zoekveld. Alle 944 verpakte bronbestanden per platform, programmaversies,
architecturen en bronregressies zijn wel gecontroleerd. De afzonderlijke
[21 paginabezoeken](paginametingen-2026-10-31-alpha19.json) slagen eveneens.

Een [lokale vervolgmeting van alle 78 volledige beeldparen](platformbeelden-2026-10-31-alpha19-vervolg.json)
vindt precies één afwijkend paar: Windows tegenover Linux voor
`writer-zoeken-pagina.png`, binnen `(120, 250, 121, 267)`. De andere 77 paren
zijn exact gelijk. Geen maskers, herschaling of tolerantie; de afgekeurde
CI-uitvoer blijft behouden. Een vaste testklok moet de knipperfase in de
volgende versie reproduceerbaar maken; alpha 19 wordt hierdoor niet groen.

De Linux-CI-release is afzonderlijk gecontroleerd: alle 944 pakketbronbestanden
zijn bytegelijk aan het vaste Git-archief. De
[echte twaalfstappenproef](vensterproef-2026-10-31-alpha19-release/LEESMIJ.md)
en de afzonderlijke [achtstappenproef voor paginanavigatie](paginavenster-2026-10-31-alpha19-release/LEESMIJ.md)
slagen. Drie bezoeken tonen het exacte verwachte papierblok, selectie wordt
via het systeemklembord gecontroleerd en de bronbytes blijven intact.
De [lokale alpha-19-release](bouw-2026-10-31-alpha19-lokaal.json) is na
38 minuten en 45 seconden Rust-bouwtijd afgerond. Beide binaries zijn vóór
de volgende release met versie en SHA-256 vastgezet. Pakketcontrole en de
[echte bronregressie](bronregressie-2026-10-31-alpha19-lokaal.json) slagen. Dit keurt geen volledige scherm- of fysieke
platformpariteit goed.

De [alpha-18-platformronde](platformen-2026-10-31-alpha18.json) heeft vijf groene
CI-jobs: 911 bytegelijke pakketbronbestanden per platform, 76 exacte volledige
native beeldparen en [21 exacte paginabezoeken](paginametingen-2026-10-31-alpha18.json).
De testmergebron is voor deze onderdelen bytegelijk aan de PR-bron; alleen
het verwachte schermaantal verschilt van de eerste alpha-18-broncommit.
De afzonderlijke [lokale release](bouw-2026-10-31-alpha18-lokaal.json), pakketcontrole,
bronregressie en [echte Linux-vensterproef met twaalf stappen](vensterproef-2026-10-31-alpha18-release/LEESMIJ.md)
zijn afgerond. Deze historische bewijzen keuren alpha 19 niet goed.

## Visuele vergelijking en open werk

De [vier volledige verliesloze referentievergelijkingen](pixelcontrole-alpha19/rapport.json)
blijven met nul tolerantie rood: Writer **108.310**, Spreadsheet **382.427**,
Presentation **560.035** en Notition **666.027** afwijkende pixels op elk
943.736 pixels. Er zijn geen maskers, herschaling of nieuwe referentiebeelden.
De kleine telverschillen tegenover alpha 18 zijn geen bewijs van een
inhoudelijk herontworpen lint of een voltooid functiegebied.

Directe rijke Writer-invoer, volledige ribbons, rastervirtualisatie en
bereikbediening, presentatieobjecten, notitieherstel, complete mailbediening,
database-interface, native installers/losse edities, fysieke IME-compositie,
systeemdialogen en schermlezers blijven open. Geen volledige functie-, test-
of pixelpariteit en geen stabiele native vrijgave.
