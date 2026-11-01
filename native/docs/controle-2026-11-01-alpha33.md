# Native controle, 1 november 2026: alpha 33

**2026.44.9-alpha.33** verbindt [alineastijlen in Writer](alineastijlen-2026-11-01-alpha33/LEESMIJ.md) via de gedeelde OpenAEC-keuzelijst. De actieve ondersteunde alinea krijgt een bestaande stijl zonder verlies van directe opmaak, ook leeg of in een tabel. Oorspronkelijke dubbele stijl-ID’s en ongeldige ketens worden veilig geweigerd. Keuzes zijn aan document, bronhash en alinea gebonden.

- **359 reguliere Rust-tests**, inclusief **135 UI-tests**, zes runtimeproeven en zeven Python-tests geslaagd.
- Rustfmt, Clippy zonder toegestane waarschuwingen, bronpins en onafhankelijke bestands-/conversielezers geslaagd. **664 bronbestanden** blijven vóór en na de volledige ronde bytegelijk.
- [56 volledige native widgetbeelden](schermen-2026-11-01-alpha33.json); vijftien gedeelde documentbeelden en acht letterbeelden blijven bytegelijk aan alpha 32. Vijf oorspronkelijke renderer-goldens blijven gecontroleerd.
- Vier nieuwe kern- en vier widgetproeven; twee bewaarde DOCX onafhankelijk heropend. Oorspronkelijke afkeuringen, bronpatches en hertests blijven behouden.

De volledige [alpha-32-build- en vensterbewijzen](controle-2026-11-01-alpha32.md) blijven aan broncommit e4fb4b5 gekoppeld: alle vijf platformtaken, 110 native beeldparen en 21 paginabezoeken slagen. De lokale bouw duurt 28m02s. Zowel de lokale als CI-Linux-release slaagt voor elf Writer- en zes spreadsheetvensterstappen; drie aanvullende rustige Writer-beelden per programma zijn bytegelijk. Dit is geen alpha-33-venstergoedkeuring. De eigen alpha-33-releasebouw, platformronde en nieuwe echte stijlvensterproef moeten afzonderlijk worden afgerond.

De [vier volledige oorspronkelijke UI-vergelijkingen](pixelcontrole-alpha33/rapport.json) blijven rood: {'writer': 108842, 'spreadsheet': 382433, 'presentation': 560039, 'notition': 666024}. Elk beeld heeft 943.736 pixels; geen maskers, herschaling of kleurtolerantie. Dit is geen functiedekkingspercentage.

Alle tien acceptatiegebieden blijven open op volledige functie-, test- en pixelpariteit. Geen stabiele native vrijgave.
