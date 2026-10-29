# OpenAEC-stijl in de kantooromgeving

De weekuitgave 2026-W43.3 gebruikt de officiële [OpenAEC-style-book](https://github.com/OpenAEC-Foundation/OpenAEC-style-book), revisie `dfdcd415b26604081b1699560621d3e9ae7ea6bf`. Op 23 oktober 2026 is de hoofdbranch opnieuw opgehaald en gecontroleerd: er is geen nieuwere bronrevisie gepubliceerd. Deze update sluit de applicatie beter aan op de bestaande desktopreferentie en de actuele themavariabelen.

## Toepassing

- Construction Amber `#D97706` voor accenten, tabranden en focus; Deep Forge `#36363E` voor tekst, primaire knoppen en de statusbalk.
- Blueprint White `#FAFAF9`, Concrete `#F5F5F4` en warme randkleuren voor de werkruimte en panelen.
- Inter voor bediening en Space Grotesk 700 voor koppen en het productmerk. Lettertypen worden lokaal meegeleverd.
- Het officiële OpenAEC-symbool in de titelbalk (en in de kopbalk van de losse database-app).
- Forge als standaardweergave: Deep Forge-ribbon, een bovenbalk van `#44444C`, lichte tekst en amber accenten. Het officiële Light-thema is met de zon-/maanknop beschikbaar. De keuze wordt lokaal bewaard; documenten en notitiepagina’s blijven licht.
- Een titelbalk van 32 pixels, linttabbladen van 28 pixels, een opdrachtpaneel van 94 pixels, een documentbalk van 30 pixels en een statusbalk van 22 pixels (zie *Vensterindeling*).
- Ribbonknoppen, keuzelijsten, kleurkiezers en ingebouwde menu’s volgen hetzelfde thema. Groeplabels en scheidingslijnen volgen het gedeelde ribbonpakket.
- Startnavigatie en de notitieboekkolom volgen de gekozen appweergave; de paginalijst en het vrije canvas houden hun lichte ondergrond.
- Dezelfde stijl voor Tekst, Rekenblad, Presentatie en de afzonderlijke database-app. Documentinhoud en celopmaak behouden hun eigen kleuren en lettertypen.
- Donkere databasepanelen gebruiken Deep Forge en Night Build met lichte tekst. Kleine actieve bedieningselementen krijgen een amber accent.

De titelbalkhoogte en de bovenrand van het bestandsmenu delen één CSS-variabele (`--office-kophoogte`), zodat het menu de volledige ribbon blijft bedekken. Het inkappen van het lint en bestaande toetsenbordbediening blijven beschikbaar.

## Vensterindeling

Sinds 2026-W44 volgt elk venster de vaste regio’s van de [OpenAEC Blueprint](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint): `design/blueprint/blueprint-instellingen.png`, `crates/openaec-ui/src/design/chrome.rs` (`title_bar`), `crates/openaec-ui/src/frame.rs` (`document_bar`, `status_bar`), `crates/openaec-ui/src/design/widgets.rs` (`toast`) en `design/document-bar-review.html`, plus de Style Book-template (`TitleBar.tsx`, `DocumentBar.css`, `StatusBar.css`, `App.tsx` op revisie `dfdcd41`). Van boven naar beneden:

1. **Titelbalk** (`src/Titelbalk.tsx`): links het beeldmerk (naar Start) en de snelle toegang (Opslaan, Openen, Opslaan als), in het midden de venstertitel, rechts het venstermenu, thema, instellingen en in de desktopapp de vensterknoppen. De desktopvensters hebben geen systeemtitelbalk meer (`decorations: false`); het lege deel van de titelbalk is het sleepvlak (dubbelklik maximaliseert).
2. **Bestand/lint-tabs en lint** van het actieve tabblad. Elk lint blijft in de React-boom van zijn editor, maar wordt via een portal in een eigen plek boven de documentbalk gezet (`src/lintplek.tsx`).
3. **Documentbalk** (`src/TabBalk.tsx`): Start en de open documenten, direct boven het document.
4. **Inhoud** van het actieve tabblad.
5. **Statusbalk**.

**Venstertitel** (`src/venstertitel.ts`): `Ontwerpnotitie.docx — Open Office Studio (Tekst)`, met een stip achter de naam bij niet-opgeslagen wijzigingen; voor modules `Open Office Studio (Notities)`; op Start alleen `Open Office Studio`. Dezelfde tekst staat in de titelbalk, in `document.title` en in de OS-venstertitel.

**Meldingen** (`src/Meldingen.tsx`, `src/meldingen.ts`) zweven rechtsonder boven de statusbalk (bij rechts-naar-links linksonder) en verschuiven het document niet. Ze horen bij een tabblad (wisselen toont de meldingen van dat tabblad) of bij het hele venster. Info en Gelukt verdwijnen na zes seconden in beeld (niet zolang de muis of de focus erop staat); Let op en Fout blijven tot sluiten. Fouten hebben `role="alert"`, de rest `role="status"`; Escape sluit de melding met de focus.

**Vensters** (desktopapp, één proces met onafhankelijke Tauri-vensters): elk venster is een volwaardige Office Studio met dezelfde indeling. Een tabblad dat buiten de documentbalk wordt losgelaten, opent een nieuw venster; boven een ander Office Studio-venster gaat het naar dat venster (`vensters::venster_onder_punt`). Het contextmenu van een tabblad biedt ook *Verplaatsen naar …* voor elk ander venster, het venstermenu *Nieuw venster*. Nieuwe bestanden van het besturingssysteem gaan naar het laatst actieve venster. Een venster met gewijzigde documenten sluiten vraagt per document; het laatste venster sluiten stopt de app.

## Herkomst en onderhoud

De overgenomen tokens en het ongewijzigde SVG-symbool staan in `src/stijl`, samen met bronrevisie en de CC BY-SA 4.0-licentie. `openaec-tokens.css` is uit de meegeleverde JSON-tokens afgeleid. `openaec-shell.css` bevat de Light- en Forge-declaraties uit `project-templates/Tauri+React/src/themes.css`: alleen de selectors en het variabelevoorvoegsel zijn aangepast, zodat andere editoronderdelen niet worden geraakt. De kleurwaarden zijn ongewijzigd. `openaec-office.css` past deze waarden toe op de bestaande componenten. De licentie en bronvermelding worden in beide distributies meegenomen. Deze bronvermelding geldt voor de overgenomen stijlonderdelen; overige onderdelen behouden hun eigen licentie.

Bij een volgende stijluitgave eerst de bronrevisie en JSON-tokens bijwerken, daarna de CSS aanpassen en beide apps visueel controleren. De oudere schermafbeeldingen blijven als historische testreferentie beschikbaar.
