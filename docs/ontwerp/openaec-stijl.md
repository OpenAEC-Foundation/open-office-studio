# OpenAEC-stijl in de kantooromgeving

De weekuitgave 2026-W43.3 gebruikt de officiële [OpenAEC-style-book](https://github.com/OpenAEC-Foundation/OpenAEC-style-book), revisie `dfdcd415b26604081b1699560621d3e9ae7ea6bf`. Op 23 oktober 2026 is de hoofdbranch opnieuw opgehaald en gecontroleerd: er is geen nieuwere bronrevisie gepubliceerd. Deze update sluit de applicatie beter aan op de bestaande desktopreferentie en de actuele themavariabelen.

## Toepassing

- Construction Amber `#D97706` voor accenten, tabranden en focus; Deep Forge `#36363E` voor tekst, primaire knoppen en de statusbalk.
- Blueprint White `#FAFAF9`, Concrete `#F5F5F4` en warme randkleuren voor de werkruimte en panelen.
- Inter voor bediening en Space Grotesk 700 voor koppen en het productmerk. Lettertypen worden lokaal meegeleverd.
- Het officiële OpenAEC-symbool in beide kopbalken.
- Forge als standaardweergave: Deep Forge-ribbon, een bovenbalk van `#44444C`, lichte tekst en amber accenten. Het officiële Light-thema is met de zon-/maanknop beschikbaar. De keuze wordt lokaal bewaard; documenten en notitiepagina’s blijven licht.
- Een compacte kopbalk van 40 pixels, linttabbladen van 28 pixels, een opdrachtpaneel van 94 pixels en een statusbalk van 22 pixels. De native vensterbalk blijft apart; de ingebouwde appbalk volgt de webmaat uit de migratiegids.
- Ribbonknoppen, keuzelijsten, kleurkiezers en ingebouwde menu’s volgen hetzelfde thema. Groeplabels en scheidingslijnen volgen het gedeelde ribbonpakket.
- Startnavigatie en de notitieboekkolom volgen de gekozen appweergave; de paginalijst en het vrije canvas houden hun lichte ondergrond.
- Dezelfde stijl voor Tekst, Rekenblad, Presentatie en de afzonderlijke database-app. Documentinhoud en celopmaak behouden hun eigen kleuren en lettertypen.
- Donkere databasepanelen gebruiken Deep Forge en Night Build met lichte tekst. Kleine actieve bedieningselementen krijgen een amber accent.

De kopbalkhoogte en de bovenrand van het bestandsmenu delen één CSS-variabele, zodat het menu de volledige ribbon blijft bedekken. Het inkappen van het lint en bestaande toetsenbordbediening blijven beschikbaar. Er zijn geen nieuwe vensterknoppen toegevoegd die in de browser niet werken; de desktopapp behoudt de native vensterbediening.

## Herkomst en onderhoud

De overgenomen tokens en het ongewijzigde SVG-symbool staan in `src/stijl`, samen met bronrevisie en de CC BY-SA 4.0-licentie. `openaec-tokens.css` is uit de meegeleverde JSON-tokens afgeleid. `openaec-shell.css` bevat de Light- en Forge-declaraties uit `project-templates/Tauri+React/src/themes.css`: alleen de selectors en het variabelevoorvoegsel zijn aangepast, zodat andere editoronderdelen niet worden geraakt. De kleurwaarden zijn ongewijzigd. `openaec-office.css` past deze waarden toe op de bestaande componenten. De licentie en bronvermelding worden in beide distributies meegenomen. Deze bronvermelding geldt voor de overgenomen stijlonderdelen; overige onderdelen behouden hun eigen licentie.

Bij een volgende stijluitgave eerst de bronrevisie en JSON-tokens bijwerken, daarna de CSS aanpassen en beide apps visueel controleren. De oudere schermafbeeldingen blijven als historische testreferentie beschikbaar.
