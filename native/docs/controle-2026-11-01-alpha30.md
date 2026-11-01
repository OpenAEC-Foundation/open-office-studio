# Native controle, 1 november 2026: alpha 30

**2026.44.9-alpha.30** bewaart standaardrijhoogte, vaste hoogte en standaard verborgen rijen ook bij volledig nieuwe spreadsheetmodeluitvoer. De [correctie en oorspronkelijke afkeuringen](modeluitvoer-correctie-2026-11-01-alpha30/LEESMIJ.md) leggen vijf eigen kernproeven, twintig combinaties en 23 onafhankelijk teruggelezen XLSX-bestanden vast. De 382 oorspronkelijke parsertests slagen afzonderlijk vóór en na de wijziging. Alle pakketversies en features blijven bij de parserpatch gelijk; uitsluitend de bron van die parser wordt lokaal vastgepind. De vier eigen workspaceversies gaan daarna naar alpha 30.

- **333 reguliere Rust-tests**, inclusief **118 UI-tests**, zes runtimeproeven en zeven Python-tests geslaagd.
- Rustfmt, Clippy met waarschuwingen als fouten, bronhashcontroles en onafhankelijke bestands-/conversielezers geslaagd. **660 productiebronbestanden** blijven vóór en na de ronde bytegelijk.
- [51 volledige native widgetbeelden](schermen-2026-11-01-alpha30.json); vijftien documentbeelden en acht letterbeelden blijven bytegelijk aan alpha 29. Vijf oorspronkelijke renderer-goldens blijven gecontroleerd.
- De gezamenlijke workflow verwacht nu de werkelijke 51 beelden. De [alpha-29-CI-afkeuring](ci-diagnose-2026-11-01-alpha29/LEESMIJ.md) blijft behouden; een afzonderlijke lokale hertelling daarvan slaagt op 102 volledige native beeldparen.

De [lokale alpha-29-releasebouw](bouw-2026-11-01-alpha29-lokaal.json) slaagt in 27m06s met beide programma’s vastgezet en pakket-/bronregressiecontrole. De [lokale](vensterproef-2026-11-01-alpha29-lokaal/LEESMIJ.md) en [CI-Linux-Writer-vensterproef](vensterproef-2026-11-01-alpha29-ci/LEESMIJ.md) slagen ieder op achttien gerichte stappen. Die oudere programmahash keurt de nieuwe alpha 30 niet goed; de eigen releasebouw, CI-ronde en echte releasevensterproef moeten nog worden afgerond.

De [vier volledige oorspronkelijke UI-vergelijkingen](pixelcontrole-alpha30/rapport.json) blijven rood: Writer **108.317**, Spreadsheet **382.436**, Presentation **560.042**, Notition **666.026**. Elk beeld heeft 943.736 pixels; geen maskers, herschaling of kleurtolerantie. Dit is geen functiedekkingspercentage.

Alle tien acceptatiegebieden blijven open: volledige rijke Writer-/ribbonbediening, rasterfuncties, presentatieobjecten, notitieherstel, complete mailbediening, native Database, overige import/afdrukken, installers/losse edities en fysieke platform-/IME-/systeemdialoog-/schermlezerproeven. Geen volledige functie-, test- of pixelpariteit en geen stabiele native vrijgave.
