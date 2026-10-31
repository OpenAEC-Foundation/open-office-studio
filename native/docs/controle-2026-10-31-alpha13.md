# Native controle, 31 oktober 2026: alpha 13

**2026.44.9-alpha.13** voegt directe celbewerking en enkele-celnavigatie toe.
Alle tien acceptatiegebieden blijven open. De suite is nog niet volledig
gemigreerd, volledig getest of pixelgelijk aan de bestaande versie.

## Directe celbewerking

Dubbelklik of F2 opent de bestaande celinhoud op het paginabeeld; typen op
een geselecteerde cel vervangt de inhoud. Cel en formulebalk gebruiken dezelfde
Iced-tekstinhoud. Enter bevestigt naar beneden, Shift+Enter naar boven, Tab
naar rechts en Shift+Tab naar links. Escape verwerpt het concept. Een klik op
een andere cel past een geldig concept toe voordat de selectie wisselt.

De cel-editor gebruikt de vastgepinde documentletters en de oorspronkelijke
lettergrootte, het gewicht, de stijl en de zoom. Een vertraagd plakantwoord is
ook aan de levensduur van de editor gebonden: annuleren en opnieuw openen van
eenzelfde lege cel mag een oud antwoord niet alsnog geldig maken.

De pijltjestoetsen verplaatsen de enkele-celselectie. De kern slaat de volledige
samenvoeging en verborgen rij-/kolombereiken over. Buiten de zichtbare cellen
verschuift het werkvenster. Navigeren verandert geen bronbytes of undo-stappen.
Een laat werkdraadantwoord mag de focus van instellingen, Bestand of een
modale sluitvraag niet terugnemen.

## Formulecontrole

Een onvolledige formule zoals `=1+` werd door de eerdere celinvoer opgeslagen.
De getypeerde documentopdracht controleert nu vóór de wijziging de grammatica
met dezelfde vastgepinde parser als de rekenkern. Het concept blijft zichtbaar
bij een weigering; bron en geschiedenis blijven intact. Een geldige formule
met een rekenfout, zoals `=1/0`, blijft toegestaan. Apostrofinvoer en cellen met
tekstopmaak bewaren een formuleachtige tekst letterlijk.

De directe celproef bewaart B2=7. Onafhankelijke teruglezing bevestigt D2=87,5
(7 × 12,5) en D4=117,5 (87,5 + 2 × 15), met behoud van de formules,
getalopmaak, kopopmaak en het tweede werkblad. Undo herstelt de oorspronkelijke
bestandsbytes.

## Uitgevoerde controles

- **187 reguliere Rust-tests geslaagd**, zes runtimeproeven afzonderlijk.
- **Alle zes runtimeproeven geslaagd**. De [onafhankelijke conversiecontrole](conversie-2026-10-31-alpha13-lokaal.json) bevestigt zes inhoudsrondgangen en drie PDF-handtekeningen.
- **Zeven Python-tests**, Rustfmt, Clippy met waarschuwingen als fouten en de vastgepinde bronhashes geslaagd.
- DOCX/XLSX/PPTX onafhankelijk teruggelezen, inclusief de rechtstreeks bewerkte spreadsheet, herberekening en letterlijke formuletekst.
- **35 native schermen gerenderd**, waaronder de cel-editor. De [schermherkomst](schermen-2026-10-31-alpha13.json) bevat de bron- en loghashes.
- [Dertien gedeelde documentbeelden](documentbeelden-2026-10-31-alpha13.json) zijn bytegelijk aan alpha 12.

De brede ronde vond een ontbrekend toegankelijkheidslabel op het nieuwe
focusbare raster. De controle is niet versoepeld: het label is toegevoegd en
de volledige reguliere ronde is opnieuw groen. De rasterproeven voeren echte
Iced-muis-/toets-/focusgebeurtenissen, werkdraadtaken en een synthetische
IME-Commit uit. Ze gebruiken een eigen klembord. Dit bewijst geen fysieke GUI,
systeemklembord-, IME-, systeemdialoog- of schermlezerbediening.

De [vier volledige PNG-vergelijkingen](pixelcontrole-alpha13/rapport.json)
blijven met nul tolerantie rood: Writer **120.590**, Spreadsheet **594.216**,
Presentation **560.032** en Notition **666.023** afwijkende pixels, telkens
op 943.736 pixels. Geen maskers, herschaling of versoepeling.

## Bouwstatus en resterend werk

De nieuwe release- en platformronde zijn nog niet afgerond. De
[afgeronde alpha-12-ronde](controle-2026-10-31-alpha12.md) heeft vijf CI-jobs
groen, alle 718 verpakte bronbestanden bytegelijk per platform, 68 exacte
native beeldparen en zeven exacte paginabezoeken op elk van de drie platforms.
De lokale alpha-12-release heeft 579 geslaagde, 68 geweigerde bronnen en één
time-out uit 648 geselecteerde OOXML-bestanden. Dit platform- en corpusbewijs
betreft alpha 12.

Rasterkoppen, bereikselecties en -klembord, sleepbediening, volledige
bescherming en overige spreadsheetopdrachten blijven open. Ook directe rijke
Writer-invoer, volledige ribbons, presentatieobjecten, automatisch
notitieherstel, complete mailbediening, database-interface, native installers
en fysieke platformproeven zijn nog niet afgerond. Er is geen stabiele native
release gemaakt.
