# Canvas- en Markdownsecties — 2026-W43.4

## Automatisch

- 83 tests geslaagd in 8 bestanden, waaronder 14 nieuwe Markdowncontroles.
- Native Rust-tests: 7 geslaagd, 2 conversieproeven overgeslagen omdat die een afzonderlijk ingesteld conversieprogramma vereisen. De nieuwe regressieproef controleert dat een lege Markdownpagina een werkelijk leeg bestand kan vervangen; lege conversie-invoer en niet-binaire invoer blijven geweigerd.
- TypeScript en de productiebuild van Office geslaagd.
- De afzonderlijke Database-build en bundelcontrole geslaagd; die blijft 507 kB JavaScript met een eigen worker.
- Weekversiecontrole: beide apps, Cargo en pakketconfiguraties gebruiken `2026.43.4`.
- De migratieproeven lezen formaatversies 1 en 2 zonder de bestaande opslag te wijzigen. De volgende opslag gebruikt versie 3. Vrije posities, tekst, taken en opmaak blijven behouden.
- Markdown wordt letterlijk geback-upt en geëxporteerd, inclusief witruimte en regelafbrekingen. Zoekresultaten en toegevoegde back-ups behouden de sectietypen.
- Kopiëren naar een ander type behoudt de oorspronkelijke sectie en gebruikt nieuwe identificaties. Lange Markdowntekst wordt bij een canvaskopie verdeeld zonder Unicode te breken; te grote omzettingen worden vooraf geweigerd.
- De voorbeeldproef controleert koppen, vet, cursief, tabellen, taken en code. Ruwe HTML wordt niet uitgevoerd, scriptlinks worden niet actief en externe afbeeldingen worden niet geladen.

## GUI in de productiebuild

Gecontroleerd op 1280 × 720 pixels met eigen lokale voorbeeldnotities en een werkelijk `.md`-bestand.

1. Een sectie met type Markdown aangemaakt. Bron, Naast elkaar en Voorbeeld zijn beschikbaar. Koppen, opmaak, tabellen en taken verschijnen in het voorbeeld.
2. Een `.md`-bestand via **Bewaren → Markdown openen** toegevoegd. De bestaande pagina bleef behouden. Het werkelijk gedownloade exportbestand is volledig gelijk aan de invoer.
3. Vier letters in de editor geselecteerd en met Ctrl+B vet gemaakt: `Een **idee** delen`. Ctrl+Z gaf `Een idee delen` terug; Ctrl+Shift+Z herstelde de vetopmaak.
4. Een canvassectie met drie tekstvakken naar Markdown gekopieerd. De gehele oorspronkelijke sectie is in de gedownloade back-up vergeleken met de eerdere back-up: gelijk, inclusief identificaties, coördinaten, afmetingen en inhoud.
5. De Markdownkopie weer als canvaskopie toegevoegd. De melding en nieuwe tekstvakken bevestigen dat de Markdownbron als tekst is overgenomen; de bronsecties blijven bestaan.
6. De pagina herladen en de nieuwe secties opnieuw geopend. Een zoekopdracht op tekst in de geïmporteerde Markdownpagina vond de juiste pagina.
7. Een gemengde back-up van formaatversie 3 via de GUI toegevoegd. Zes notitieboeken werden naast de bestaande toegevoegd. De volgende echte back-up bevatte dertien boeken en vier Markdownsecties; het nieuwe eigen voorbeeldboek en de herstelde Markdownbron waren beide aanwezig.
8. Een werkelijk Markdownbestand met Windows-regelafbrekingen geïmporteerd. Op de derde regel vier letters geselecteerd en Ctrl+B gebruikt: precies `idee` werd vet, met behoud van de andere inhoud. De opmaak gebruikt de selectieposities van het bronveld, dat regelafbrekingen normaliseert.
9. De compacte Markdownribbon past binnen het venster. Het bronveld heeft een amber focusrand. De browserconsole bevatte geen toepassingsfouten.

De onbewerkte schermafbeelding staat in `docs/screenshots/notities-markdown-2026-W43.4.jpg`.

## Grenzen

Het voorbeeld is alleen lezen. Opmaak en taken worden in de Markdownbron gewijzigd. Afbeeldingen blijven tekstverwijzingen. Er geldt maximaal 500.000 tekens per Markdownpagina; boven 100.000 tekens wordt het directe voorbeeld overgeslagen. De eerdere bestandsengines zijn niet gewijzigd. Native pakketcontroles vervangen geen schone installatie of native bedieningstest op ieder platform.
