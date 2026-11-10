# Presentatie Studio: werkpakket #76–82

Eigen integratiebranch: `codex/presentation-76-82-2026-11-09`, basis
`f4a03889eff1306fe503a72d7acb21c754d5ac8d`. De exacte broncommits van PR201,
PR211, PR213 en PR237 zijn lokaal samengevoegd, zodat bestaande correcties en
voettekstfuncties behouden blijven. Andere chats zijn geïnformeerd dat deze zeven issues bij
deze branch horen; #83–87 en de formaatissues blijven apart.

| Issue | Bestaande functionaliteit | Werk dat nog moet worden afgerond |
|---|---|---|
| #76 | Diasorteerder en secties; bewerkbaar overzicht; hergebruiken van PPTX-dia's en kopiëren/plakken tussen presentaties met bronmasters, media en interne koppelingen. | Andere diaformaten passend schalen; conflicterende notitiemodellen, ingesloten fonts en globale commentaarauteurs samenvoegen. |
| #77 | Indelingen toepassen op één/alle/geselecteerde dia's; masters en indelingen kopiëren/hernoemen; ongebruikte indelingen verwijderen; placeholderposities herstellen. Meerdere masters en PPTX-behoud getest. | Grafische master-/placeholdereditor, logo's, volledig opmaakherstel en ODP-behoud. |
| #78 | Drie thema's met voorbeelden; aanpassen/bewaren van kleuren/lettertypen; export/import van eigen .oos-theme presets; gerichte toepassing met geïsoleerde masters; kleur-, verloop- en afbeeldingsachtergronden op dia/layout/master. | Themakleuren in alle kleurkiezers en organisatiebrede huisstijl. Native opslagroute voor het nieuwe themabestand wacht op CI; lokale compile geblokkeerd door Application Control. |
| #79 | Notities, timer, volgende dia, tweede venster, schermkeuze, nummernavigatie, zwart/wit, aanwijzer en inkt. PR201 behoudt native knopbediening. Nieuw op de afzonderlijke branch van 10 november: rijk notitiepaneel, eigen undo/redo, diaconcepten, Ctrl+S/opslag met opmaakbehoud en rijke presentatorweergave; zie [bewijs en grenzen](../tests/2026-11-10-presentatie-rijke-notities.md). | Overige presentatorcriteria en fysieke/native opstelling gericht toetsen; complexe notitiestructuren blijven alleen-lezen. |
| #80 | Slepen/vergroten, stapelvolgorde. Nieuw: meerdere objecten samen uitlijnen/verdelen, gedraaide randen en exacte geometrie; afbeeldingen bijsnijden/vervangen/transparantie; echte groepen en opheffen met Ctrl+G/Ctrl+Shift+G, geneste groepen, verplaatsing/schaal/draaiing/spiegeling en PPTX-behoud. | Hulplijnen, opmaak kopiëren; complexe groepen met afschuiving/effecten/animatieverwijzingen en gedraaide grafiek-/tabelcontainers. |
| #81 | Tabellen invoegen/bewerken, drie stijlen, rijen/kolommen, samenvoegen/splitsen, celopmaak en TSV/HTML-plakken. Renderen en PPTX-behoud getest. | Functionele criteria afgedekt; beoordeling en samenvoegen van de PR. |
| #82 | Gedeelde grafiekeditor, ingesloten gegevensblad en kopiëren vanuit Spreadsheet via knop/Ctrl+V. Alle elf typen, actuele broncellen, bronbehoud, renderen en opslag/heropening getest. | Functionele criteria voor ondersteunde gedeelde typen afgedekt; nieuwe #66-functies blijven afgestemd met hun eigenaar. |

Dit document onderscheidt bestaande/nieuwe deelresultaten van nog open
acceptatiecriteria. De zeven brede issues zijn niet gesloten.
