# Native controle, 31 oktober 2026: alpha 15

**2026.44.9-alpha.15** sluit de opgeslagen spreadsheetlettertypen aan op de
native paginarasterizer. Alle tien acceptatiegebieden blijven open. Dit is
nog geen volledige functie-, test- of pixelpariteit.

## Spreadsheetletters

De rasterizer negeerde de opgeslagen familie en tekende alles met zijn eigen
reguliere letter, met synthetische vet-/cursiefvormen. De facade gebruikt nu
dezelfde vastgepinde fontcatalogus als de cel-editor. Meten, regelterugloop,
getalopmaak, gewone, gedraaide en gestapelde tekst krijgen hetzelfde gezicht.
Waar echte vet-/cursiefgezichten beschikbaar zijn, wordt de vorm niet nogmaals
synthetisch verzwaard of scheef gezet. De brongegevens worden niet gewijzigd.

De leverancier geldt alleen binnen de betreffende aanroep en draad. Geneste
aanroepen herstellen hun voorganger, ook na een fout of paniek. De bestaande
facade blijft cel- en pixelbudgetten bewaken. De standaardaanroep van de
meegeleverde renderer behoudt zijn oorspronkelijke ingebouwde letter. Alle
vijf oorspronkelijke goldenbeelden worden zonder nieuwe referenties of
tolerantie vergeleken. De achttien vendored bestanden zijn vastgepind met
herkomst, oorspronkelijke hashes, twee wijzigingen en twee aanvullingen.

De [fontproef](spreadsheetletters-2026-10-31-alpha15.json) tekent twee families,
elk normaal, vet, cursief en vet-cursief. Alle acht beelden verschillen. De
opgeslagen werkmap wordt onafhankelijk teruggelezen op familie, stijl, grootte,
samenvoeging, formules en overige gegevens. Twee undo-stappen herstellen zowel
de oorspronkelijke bronbytes als het beeld. Volledige glyph-terugval,
gemengde scripts en systeemletters zijn hiermee niet bewezen.

## Uitgevoerde controles

- **197 reguliere Rust-tests geslaagd**, waaronder 46 GUI-tests, vijf oorspronkelijke rasterbeelden, twee scope-/budgetproeven en de fontmatrix.
- **Zes runtimeproeven afzonderlijk geslaagd**. De [onafhankelijke conversiecontrole](conversie-2026-10-31-alpha15-lokaal.json) bevestigt zes inhoudsrondgangen en drie PDF-handtekeningen.
- **Zeven Python-tests**, Rustfmt, Clippy met waarschuwingen als fouten en alle vastgepinde bronhashes geslaagd.
- DOCX/XLSX/PPTX onafhankelijk teruggelezen, inclusief de nieuwe spreadsheetletterproef.
- **37 native schermen** met [bron- en loghashes](schermen-2026-10-31-alpha15.json).
- [Dertien gedeelde documentbeelden](documentbeelden-2026-10-31-alpha15.json) blijven bytegelijk aan alpha 14; daarnaast zijn acht spreadsheetletterbeelden vastgelegd.

De GUI-proeven gebruiken echte Iced-widgetgebeurtenissen en werkdraadtaken,
met een eigen klembord en synthetische IME-Commit. Ze bewijzen geen fysieke
GUI, systeemklembord-, IME-, systeemdialoog- of schermlezerbediening.

## Beeldvergelijking en bouwstatus

De [volledige vergelijkingen](pixelcontrole-alpha15/rapport.json) blijven met
nul tolerantie rood: Writer **120.589**, Spreadsheet **382.426**,
Presentation **560.034** en Notition **666.025** afwijkende pixels, elk op
943.736 pixels. Het spreadsheetverschil neemt met 30 pixels toe tegenover
alpha 14. Functioneel correcte fonts bewijzen geen visuele pariteit. Er zijn
geen maskers, herschaling of nieuwe referentiebeelden gebruikt.

De laatste afgeronde [platformronde betreft alpha 14](platformen-2026-10-31-alpha14.json):
vijf CI-jobs groen, 761 verpakte bronbestanden bytegelijk per platform,
74 exacte native beeldparen en zeven exacte paginabezoeken per platform.
De lokale alpha-14-release en pakketcontrole zijn ook afgerond. Alpha 15
heeft nog een eigen release- en platformronde nodig; bewijs van alpha 14
wordt niet aan deze versie toegeschreven.

Directe rijke Writer-invoer, volledige ribbons, rastervirtualisatie,
bereikselecties, presentatieobjecten, automatisch notitieherstel, complete
mailbediening, database-interface, native installers en fysieke platformproeven
blijven open. Er is geen stabiele native vrijgave gemaakt.
