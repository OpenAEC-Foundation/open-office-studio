# Native controle, 1 november 2026: alpha 34

**2026.44.9-alpha.34** verbindt [opsommingen en nummering in Writer](lijsten-2026-11-01-alpha34/LEESMIJ.md), inclusief vervolginvoer, beëindigen van een leeg item, stijlgebonden nummering, tabelcelgrenzen, behoud van de oorspronkelijke lijstbron en bronexacte undo.

- **374 reguliere Rust-tests**, inclusief **137 UI-tests**, zes runtimeproeven en zeven Python-tests geslaagd.
- Rustfmt, Clippy zonder toegestane waarschuwingen, bronpins en onafhankelijke bestands-/conversielezers geslaagd. **667 bronbestanden** blijven vóór en na de volledige ronde bytegelijk.
- **57 volledige native widgetbeelden** vastgelegd. Vijftien gedeelde documentbeelden en acht letterbeelden blijven bytegelijk aan alpha 33; vijf oorspronkelijke renderer-goldens blijven gecontroleerd.
- Vijftien nieuwe gerichte proeven; twee bewaarde lijstdocumenten onafhankelijk teruggelezen. Oorspronkelijke afkeuringen en bronmomentopnamen blijven behouden. Een complete bronpatch herstelt alle geteste bronbytes vanaf de werkelijke Git-basis.

De [volledige alpha-33-platformronde](platformen-2026-11-01-alpha33.json) slaagt op alle vijf taken met 2428 bytegelijke bronbestanden per pakket, 112 volledige native beeldparen zonder platformafwijking en 21 paginabezoeken. De [metadataherbouw](bouw-2026-11-01-alpha33-metadata-lokaal.json) levert lokaal en in CI beide programma’s bytegelijk aan de al werkelijk beproefde alpha-33-programma’s. Dit is geen alpha-34-releasevensterproef.

De eigen alpha-34-releasebouw, nieuwe platformronde en werkelijke vensterproeven blijven afzonderlijk vereist. De [vier aanvullende oorspronkelijke Linux-desktopreferenties](referentie-desktop-2026-11-01/LEESMIJ.md) zijn visueel beoordeeld en per module tweemaal bytegelijk vastgelegd. Ook de [vier volledige desktopvergelijkingen](pixelcontrole-alpha34-desktop/rapport.json) blijven afzonderlijk zichtbaar; de vaste browserreferenties worden niet vervangen.

De vier [volledige oorspronkelijke UI-vergelijkingen](pixelcontrole-alpha34/rapport.json) blijven afgekeurd: {'writer': 108959, 'spreadsheet': 382430, 'presentation': 560035, 'notition': 666021}. Elk beeld heeft 943.736 pixels; geen maskers, herschaling of kleurtolerantie. Ribbon, tabstrook en statusbalk zijn zichtbaar nog niet gelijk. Dit is geen functiedekkingspercentage.

Alle tien acceptatiegebieden blijven open op volledige functie-, test- en pixelpariteit. Geen stabiele native vrijgave.
