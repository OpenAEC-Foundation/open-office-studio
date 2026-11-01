# Native controle, 1 november 2026: alpha 32

**2026.44.9-alpha.32** corrigeert [eerste rasterfocus, lange rijkoppen en snelle Writer-lintinvoer](invoer-2026-11-01-alpha32/LEESMIJ.md). Nieuwe en geopende spreadsheets ontvangen de eerste toetsen zonder celklik. Lange rijnummers passen op één regel; layout, tekenen, klikken en toegankelijkheid delen de gemeten kopbreedte. Writer behoudt een al actieve paginacursor tijdens aangesloten opmaakknoppen, zodat een gewone toets vóór het asynchrone focuswerk niet verloren gaat.

- **351 reguliere Rust-tests**, inclusief **131 UI-tests**, zes runtimeproeven en zeven Python-tests geslaagd.
- Rustfmt, Clippy met waarschuwingen als fouten, gepinde broncontroles en onafhankelijke bestands-/conversielezers geslaagd. **662 bronbestanden** blijven vóór en na de ronde bytegelijk.
- [55 volledige native widgetbeelden](schermen-2026-11-01-alpha32.json); vijftien gedeelde documentbeelden en acht letterbeelden blijven bytegelijk aan alpha 31. Vijf oorspronkelijke renderer-goldens blijven gecontroleerd.
- Vier nieuwe spreadsheet- en drie Writer-widgetproeven, oorspronkelijke negatieve rondes en afzonderlijke hertests blijven behouden. De eerste volledige alpha-32-ronde slaagt op 348 tests binnen haar toenmalige omvang; de later gevonden Writer-lintinvoergap was daarin nog niet afgedekt.

De [werkelijke alpha-30-spreadsheetproef](vensterproef-2026-11-01-alpha30-schaars/LEESMIJ.md) blijft historisch afgekeurd op beginfocus en afbrekende lange rijnummers. Ook de [werkelijke alpha-31-Writer-proeven](vensterafkeuring-2026-11-01-alpha31-ci/LEESMIJ.md) blijven afgekeurd: de eerste bevat een ontoereikende bronvoorwaarde; de strengere hertest toont daadwerkelijk toetsverlies. Software-widgethertests vervangen deze oude afkeuringen niet. De eigen alpha-32-releasebouw, platformronde en werkelijke nieuwe releasevensters blijven afzonderlijk af te ronden.

De [vier volledige oorspronkelijke UI-vergelijkingen](pixelcontrole-alpha32/rapport.json) blijven rood: {'writer': 108316, 'spreadsheet': 382434, 'presentation': 560041, 'notition': 666026}. Elk beeld heeft 943.736 pixels; geen maskers, herschaling of kleurtolerantie. Dit is geen functiedekkingspercentage.

Alle tien acceptatiegebieden blijven open op volledige functie-, test- en pixelpariteit. Geen stabiele native vrijgave.
