# Native controle, 1 november 2026: alpha 29

**2026.44.9-alpha.29** verbindt de alineastructuur met directe Writer-paginainvoer. Enter maakt een echte nieuwe alinea; Shift+Enter blijft een zachte regelovergang. Een selectie verwijderen en splitsen gebeurt in één brontransactie. Backspace en Delete voegen op de alineagrens uitsluitend aangrenzende alinea’s binnen dezelfde tekst of tabelcel samen. De cursor keert terug op de verwijderde grens. Bestaande runopmaak, invoer in de nieuwe lege alinea, snelle vervolgtekst en bronexacte undo/redo blijven behouden.

- **328 reguliere Rust-tests geslaagd**, inclusief **118 UI-tests**; zes runtimeproeven en zeven Python-tests geslaagd.
- Rustfmt, Clippy met waarschuwingen als fouten, gepinde bronhashcontroles en onafhankelijke bestands-/conversielezers geslaagd. **615 bronbestanden** blijven vóór en na de controles bytegelijk.
- [Vijf nieuwe kern- en negen widgetproeven](writer-alineatoetsen-2026-11-01-alpha29.json), met vijf onafhankelijk teruggelezen DOCX-bestanden. De [oorspronkelijke drie afkeuringen en de eerste afgekeurde implementatie](invoerdiagnoses-2026-11-01-alpha29/LEESMIJ.md) blijven behouden.
- [51 volledige native widgetbeelden](schermen-2026-11-01-alpha29.json). Vijftien gedeelde documentbeelden en acht letterbeelden blijven bytegelijk aan alpha 28; vijf oorspronkelijke renderer-goldens blijven gecontroleerd.

![Enter met directe vervolginvoer](screenshots/writer-alinea-invoer.png)

![Selectie verwijderen en splitsen in één bewerking](screenshots/writer-alinea-selectie.png)

De alpha-29-releasebouw, platformronde en echte releasevensterproef moeten nog worden afgerond. De [alpha-28-releasebouw](bouw-2026-11-01-alpha28-lokaal.json) slaagt in 33m49s met pakket-/bronregressiecontrole en beide programma’s vastgezet. De [alpha-28-platformronde](platformen-2026-11-01-alpha28.json) slaagt op vijf taken met 1357 bytegelijke bronbestanden per pakket, 98 exacte native schermparen en 21 paginabezoeken. De [echte CI-Linux-alpha-28-vensterproef](vensterproef-2026-11-01-alpha28-ci/LEESMIJ.md) slaagt op 21 gerichte stappen. Deze eerdere programmahash keurt de nieuwe alpha29-versie niet goed.

De [vier volledige oorspronkelijke UI-vergelijkingen](pixelcontrole-alpha29/rapport.json) blijven rood: Writer **108.318**, Spreadsheet **382.435**, Presentation **560.043**, Notition **666.031** afwijkende pixels, elk op 943.736 pixels. Geen maskers, herschaling of kleurtolerantie; versieletters beïnvloeden de telling. Geen functiedekkingspercentage.

Alle tien acceptatiegebieden blijven open. Volledige rijke Writer-/ribbonbediening, opmaak kiezen op lege posities, selecties over alinea’s, rijke klembordinhoud, volledige rasterbediening, presentatieobjecten, notitieherstel, complete mailbediening, database-interface, overige import/afdrukken, installers/losse edities en fysieke platform-/IME-/systeemdialoog-/schermlezerproeven ontbreken nog. Nieuwe modelwerkmapuitvoer verliest nog sheetFormatPr waaronder zeroHeight. Geen volledige functie-, test- of pixelpariteit en geen stabiele native vrijgave.
