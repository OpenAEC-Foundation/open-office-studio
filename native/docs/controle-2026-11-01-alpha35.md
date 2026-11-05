# Native controle, 1 november 2026: alpha 35

**2026.44.9-alpha.35** bewaakt [uitgestelde zoekfocus](zoeken-focus-2026-11-01-alpha35/LEESMIJ.md) tegen latere bediening en bindt het doel aan paneel en document.

- **382 reguliere Rust-tests**, inclusief **145 UI-tests**, zes runtimeproeven en zeven Python-tests geslaagd.
- Rustfmt, Clippy zonder toegestane waarschuwingen, bronpins en onafhankelijke lezers geslaagd; **668 bronbestanden** vóór en na de volledige ronde bytegelijk.
- Acht nieuwe gerichte widgetproeven. De oorspronkelijke negatieve openingsfocusproef en de afzonderlijke testverwachtingscorrectie blijven met volledig herstelbare bron bewaard.
- **57 volledige native widgetbeelden**; vijftien gedeelde documentbeelden en acht letterbeelden bytegelijk aan alpha 34; vijf oorspronkelijke renderer-goldens blijven gecontroleerd.

De [volledige alpha-34-platformronde](platformen-2026-11-01-alpha34.json) slaagt op vijf taken met 2669 bytegelijke bronbestanden per pakket, 114 exacte native beeldparen en 21 paginabezoeken. De [echte alpha-34-vensters](vensterproeven-2026-11-01-alpha34/LEESMIJ.md) slagen voor gerichte lijst-, stijl- en rasterbediening, maar haar afzonderlijke Writer-zoekroute blijft afgekeurd. Dit is geen alpha-35-releasevenstergoedkeuring.

De eigen alpha-35-releasebouw, platformronde en echte vensterhertests blijven afzonderlijk vereist.

De vier [volledige browservergelijkingen](pixelcontrole-alpha35/rapport.json) geven {'writer': 108965, 'spreadsheet': 382435, 'presentation': 560041, 'notition': 666026}. De vier [afzonderlijke desktopvergelijkingen](pixelcontrole-alpha35-desktop/rapport.json) geven {'writer': 107219, 'spreadsheet': 368049, 'presentation': 559439, 'notition': 664658}. Elk volledig beeld heeft 943.736 pixels; geen maskers, herschaling of kleurtolerantie.

Alle tien acceptatiegebieden blijven open op volledige functie-, test- en pixelpariteit. Geen stabiele native vrijgave.
