# Native controle, 31 oktober 2026: alpha 14

**2026.44.9-alpha.14** maakt het spreadsheetwerkvlak schermvullend en voegt
vaste rij- en kolomkoppen toe. Alle tien acceptatiegebieden blijven open.
Dit is nog geen volledige functie-, test- of pixelpariteit.

## Raster en koppen

Het raster begint linksboven; de paginakaart, schaduw en buitenmarges zijn voor
Spreadsheet verwijderd. De kern levert koppen vanuit dezelfde celgeometrie
als het paginabeeld en de klikvlakken. Verborgen rijen en kolommen krijgen geen
verzonnen breedte of hoogte. Ook buiten het begin van het blad blijven
indexen en geometrie overeenkomen. Het begrensde werkvenster is uitgebreid
naar maximaal 60 rijen en 24 kolommen, met een rasterbeeld tot 1600 × 1400
pixels. Dit is nog geen volledige virtualisatie.

Rij- en kolomkoppen blijven staan tijdens scrollen. De cellen volgen de
zoom; de koppen houden hun leesbare UI-maat. Een klik op een vaste kop mag
geen cel eronder selecteren. Volledige rij-/kolomselectie via de koppen is nog
niet aangesloten. Een gevonden tekenvolgordefout is opgelost met een eigen
voorgrondlaag voor de vaste hoek.

De GUI-proef bedient de echte scrolloperatie bij 150% zoom en een offset van
150 × 240 pixels. De hoek blijft pixelgelijk, koppen blijven staan en een
klik in het zichtbare raster selecteert de door de brongeometrie bepaalde
cel D13. De scrolloffset komt uit het gewone widgetantwoord. De testdriver
voert Redraw en tekenen op dezelfde widgetboom uit; er wordt geen fysieke
bediening of schermlezerbrug mee bewezen.

## Navigatie en snelheid

Een zeer brede voorafgaande kolom kon de gekozen doelcel buiten de rastergrens
houden. Navigatie probeert nu zo nodig opnieuw vanaf de doelcel. Is het doel
zelf onzichtbaar, dan volgt een expliciete weigering en wordt het oude
werkvenster hersteld. Bron en undo blijven intact. De kernproef controleert
ook verborgen assen, samenvoegingen en het verre adres AZ1000.

Een selectiestap met dezelfde rasterbytes behoudt de Iced-imagehandle. Zo
wordt geen nieuwe afbeeldingsdecoder aangemaakt voor een identiek beeld.
Verborgen navigatie- en inhoudspanelen worden niet meer opgebouwd, waaronder
de celknoppen. Dit zijn gerichte besparingen; er is geen geïsoleerde algemene
snelheidsbenchmark uitgevoerd.

Toetsenbord- of IME-invoer beëindigt de vorige muisklikreeks. Daardoor wordt
een enkele klik na bewerken niet toevallig een dubbelklik. De productgrens
voor dubbelklikken blijft 300 ms. De proef stuurt beide klikken als één korte
gebeurtenisreeks, zodat werkdraad-/focuslayout tussen testklikken de grens
onder bouwbelasting niet kunstmatig overschrijdt.

## Uitgevoerde controles

- **189 reguliere Rust-tests geslaagd**, zes runtimeproeven afzonderlijk.
- Daarna **alle 46 GUI-tests opnieuw geslaagd**, inclusief scrollen/zoom, klikreeks en late modale focus. Deze worden niet bij de 189 opgeteld.
- **Alle zes runtimeproeven geslaagd**. De [onafhankelijke conversiecontrole](conversie-2026-10-31-alpha14-lokaal.json) bevestigt zes inhoudsrondgangen en drie PDF-handtekeningen.
- **Zeven Python-tests**, Rustfmt, Clippy met waarschuwingen als fouten en vastgepinde bronhashes geslaagd.
- DOCX/XLSX/PPTX onafhankelijk teruggelezen; rechtstreeks bewerkte cellen, formules, herberekening, letterlijke tekst, stijlen en overige bladen blijven gecontroleerd.
- **37 native schermen gerenderd**; de [schermherkomst](schermen-2026-10-31-alpha14.json) bevat bron- en loghashes. Scrollen en zoom hebben afzonderlijke bronbeelden.
- [Dertien gedeelde documentbeelden](documentbeelden-2026-10-31-alpha14.json) zijn bytegelijk aan alpha 13.

De proeven gebruiken echte Iced-widgetgebeurtenissen en werkdraadtaken met
uitsluitend eigen testtekst en een eigen klembord. Dit bewijst geen fysieke
GUI, systeemklembord-, IME-, systeemdialoog- of schermlezerbediening.

## Visuele vergelijking en bouwstatus

De [volledige PNG-vergelijkingen](pixelcontrole-alpha14/rapport.json) blijven
met nul tolerantie rood: Writer **120.590**, Spreadsheet **382.396**,
Presentation **560.028** en Notition **666.020** afwijkende pixels, elk op
943.736 pixels. Het spreadsheetverschil daalt vanaf alpha 13 met 211.820
pixels; dit is geen voltooiingspercentage. Geen maskers of herschaling.

De spreadsheet-rasterizer negeert nog de opgeslagen lettertypefamilie en
gebruikt zijn ingebouwde letter met synthetische vet-/cursiefvormen. De
familie en opmaak worden wel bewaard en de cel-editor gebruikt de vastgepinde
documentletters. Dat voorvertoningsverschil moet nog worden opgelost.

De nieuwe release- en platformronde zijn nog niet afgerond. De
[alpha-13-platformronde](controle-2026-10-31-alpha13.md) is volledig groen:
vijf CI-jobs, 741 verpakte bronbestanden bytegelijk per platform, 70 exacte
native beeldparen en zeven exacte paginabezoeken op elk van de drie platforms.
Het Linux-CI-pakket is ook lokaal uitgepakt en gecontroleerd. Dit platformbewijs
betreft alpha 13; de afzonderlijke lokale alpha-13-build loopt nog.

Bereikselecties/-klembord, slepen, filteren/sorteren, grafieken, volledige
bescherming en overige spreadsheetopdrachten blijven open. Ook de overige
modules, directe rijke documentinvoer, volledige ribbons, herstel, complete
mailbediening, database-interface, native installers en fysieke
platformcontroles zijn nog niet afgerond. Er is geen stabiele native release.
