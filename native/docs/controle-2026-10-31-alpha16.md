# Native controle, 31 oktober 2026: alpha 16

**2026.44.9-alpha.16** herstelt opmaakverlies bij meerdere Writer-wijzigingen
binnen één concept en corrigeert de opmaakstatus rond zachte regelovergangen.
Alle tien acceptatiegebieden blijven open. Geen volledige functie-, test- of
pixelpariteit en geen stabiele native vrijgave.

## Writer-invoer

De oude aanpak vergeleek alleen begin en eind van de volledige alineatekst.
Bij een invoeging achteraan, gevolgd door een invoeging vooraan, werd ook de
ongewijzigde tekst ertussen als vervanging behandeld. Die tekst kreeg dan één
runopmaak. De [regressieproef](writer-invoer-2026-10-31-alpha16.json) is eerst
met aantoonbaar verloren cursief afgekeurd.

De GUI registreert nu afzonderlijke invoerstappen met begin/einde in
Unicode-tekens, verwachte tekst en ingevoegde tekst. De kern voert die op een
lokale alineakopie uit en schrijft pas na de laatste resultaatcontrole. Ook
een fout in een late stap mag de directe document-API niet gedeeltelijk
wijzigen. De reeks vormt één undo-stap. Gelijke herhaalde tekens worden op de
werkelijke selectielocatie vervangen of verwijderd; een vervanging aan een
opmaakgrens neemt de eerste geselecteerde run, geen onbedoelde linkerbuur.
Ongewijzigde runopmaak, alineagegevens en andere pakketdelen blijven behouden.

De proeven omvatten beide uiteinden van een rijke alinea, herhaalde tekens,
astrale letters, gecombineerde grafemen, Backspace/Delete, selectie, plakken,
regels, tabs, inspringen, lege alinea's, undo/redo, verkeerde tekstversies,
ongeldige grenzen/resultaten, budgetten en actieve documentbeveiliging.
De GUI-bron wordt ook met een onafhankelijke DOCX-bibliotheek teruggelezen.

Een zachte regelovergang wordt door de engine als een `break`-embed geleverd.
De opmaakadapter behandelde die als een onbekend object. Daardoor verdwenen
de exacte opmaakbereiken van de alinea. De adapter leest deze specifieke
zachte overgang nu als één nieuwelijnteken; onbekende objecten blijven apart
behandeld. De nieuwe Unicode-/regelproef is vóór deze correctie afgekeurd en
slaagt nu op de volledige opgeloste opmaak.

Dit blijft de gewone alinea-editor. Een rijke cursor op de documentpagina,
invoegopmaak op lege alinea's en de overige Writer-opdrachten zijn nog open.
De oudere API voor volledige tekstvervanging bevat geen afzonderlijke
cursorstappen; de GUI gebruikt daarom de nieuwe getypeerde reeks.

## Uitgevoerde controles

- **202 reguliere Rust-tests geslaagd**, inclusief 48 GUI-tests en de drie nieuwe kernproeven voor invoer.
- **Zes runtimeproeven afzonderlijk geslaagd**; [zes conversierondgangen en drie PDF-handtekeningen](conversie-2026-10-31-alpha16-lokaal.json) onafhankelijk gecontroleerd.
- **Zeven Python-tests**, Rustfmt, Clippy met waarschuwingen als fouten en alle bronhashcontroles geslaagd.
- DOCX/XLSX/PPTX onafhankelijk teruggelezen, inclusief de rijke alinea na meerdere conceptbewerkingen.
- **37 native schermen** met [bron- en loghashes](schermen-2026-10-31-alpha16.json).
- [Dertien gedeelde documentbeelden](documentbeelden-2026-10-31-alpha16.json) blijven bytegelijk aan alpha 15; de acht spreadsheetletterbeelden blijven afzonderlijk gecontroleerd.

De automatische GUI-tests gebruiken echte Iced-widgetgebeurtenissen en
werkdraadtaken, een eigen klembord en synthetische IME-Commit. Ze bewijzen
geen fysieke GUI, systeemklembord-, IME-, systeemdialoog- of
schermlezerbediening. De afzonderlijke Linux-vensterproef is nog niet geslaagd
en wordt niet als aanvullend bewijs geteld.

## Windows-bron en beeldvergelijking

De eerste alpha-15-Windowsronde weigerde de bronhashes van de nieuw opgenomen
rasterizer. Voor die map ontbrak de Git-regel om tekstomzetting uit te zetten.
Alpha 16 voegt die regel toe; de verwachte bronhashes en oorspronkelijke
rasterbeelden blijven intact. Een [lokale checkout met `core.autocrlf=true`](autocrlf-2026-10-31-alpha16.json)
slaagt op alle vastgepinde bronnen. Dit simuleert de regeleindinstelling,
geen Windows-build. Wijzigingen aan `.gitattributes` starten voortaan ook de
native workflow.

De [volledige vergelijkingen met de bestaande interface](pixelcontrole-alpha16/rapport.json)
blijven met nul tolerantie rood: Writer **120.587**, Spreadsheet **382.427**,
Presentation **560.034** en Notition **666.021** afwijkende pixels op elk
943.736 pixels. Geen maskers, herschaling of nieuwe referentiebeelden.
Dit zijn geen voltooiingspercentages.

De laatste volledig geslaagde [platformronde betreft alpha 14](platformen-2026-10-31-alpha14.json).
De lokale alpha-15-releasebuild loopt vanaf een afzonderlijk Git-archief.
Alpha 16 heeft nog een eigen release- en platformronde nodig. Geen bewijs van
een eerdere versie wordt aan deze versie toegeschreven.

Directe rijke Writer-invoer, volledige ribbons, rastervirtualisatie en
bereikbediening, presentatieobjecten, automatisch notitieherstel, complete
mailbediening, database-interface, native installers/losse edities en fysieke
platformproeven blijven open.
