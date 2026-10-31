# Native controle, 31 oktober 2026: alpha 10

**2026.44.9-alpha.10** verbetert Writer-opmaak en automatiseert de controle
van de drie platformpakketten. Alle tien acceptatiegebieden blijven open.
De suite is nog niet volledig gemigreerd of pixelgelijk aan de bestaande versie.

## Opmaak uit de werkelijke renderengine

De lintstatus gebruikte eerst alleen de eerste rechtstreeks geformatteerde
run. Een titel uit een stijl kon daardoor een leeg fontveld krijgen, en een
gemengde alinea kon onterecht als volledig vet worden behandeld.

De nieuwe aansluiting leest de opgeloste runattributen uit dezelfde engine die
de pagina tekent. Dit omvat standaard-, alinea-, teken-, thema- en tabelopmaak;
er is geen tweede overervingsalgoritme toegevoegd. De bronalinea moet exact
met de teruggelezen tekst overeenkomen voordat selectieranges bruikbaar worden.
Objecten en afwijkende tekstoffsets worden niet als gewone tekstranges behandeld.
De gedeelde metadataverzameling gebruikt `Arc`, zodat weergavekopieën haar niet
steeds diep kopiëren. De bestaande renderengine wordt niet opnieuw opgestart
uitsluitend om een lintstatus op te vragen.

De interface rekent editorposities om naar Unicode-tekens en gebruikt dezelfde
grenzen voor status en opdracht. De knop Vet wordt daadwerkelijk aangeklikt via
Iced-muisgebeurtenissen: alleen `Links 🏠 ` verandert, de cursieve tekst ernaast
blijft behouden, en undo herstelt de exacte bron. Een gemengde selectie toont
geen uniforme waarde. Zonder expliciete selectie blijven deze bestaande
opdrachten de hele alinea bedienen; dit is nog geen rijke invoegcursor op de
pagina. De opmaakstatus van lege alinea's en kop-/voettekstbewerking blijven open.

Ctrl/Cmd+B, I en U zijn aangesloten voor Writer, Spreadsheet en Presentation.
De opdrachten gebruiken de bestaande selectie- en modulegrenzen. Verborgen
postvakken, modale vragen en alleen-lezen inhoud mogen niet via de sneltoetsen
worden gewijzigd; de betreffende GUI-proeven nemen deze toetsen mee.

## Lettergrootte en opgeslagen waarden

De huidige Writer-serializer schrijft de numerieke grootte als gehele halve
punten. Het model wordt nu direct met precies dezelfde afronding bijgewerkt;
model, lint, paginabeeld en opnieuw geopende bron geven dezelfde waarde.
De proeven controleren 10,2 → 10, 10,25 → 10,5 en 10,7 → 10,5 punt, inclusief
undo en onafhankelijk teruglezen. De formaatdefinitie beschrijft daarnaast
maatwaarden met een eenheid; deze wijziging breidt de serializer niet naar die
route uit. Zie de [primaire formaatbeschrijving](https://raw.githubusercontent.com/dotnet/Open-XML-SDK/main/data/schemas/schemas_openxmlformats_org_wordprocessingml_2006_main.json).

## Controles tussen platforms als CI-poort

Na de native matrix komt een vijfde job voor pakketbron en platformbeelden.
Die vergelijkt alle verpakte bronbytes met de checkout, beide programmaheaders,
de vastgepinde bronregressie en de exact verpakte controleur. Daarna worden
alle **33** verwachte native PNG's tussen Linux, Windows en macOS met nul
tolerantie vergeleken. Een ontbrekend of extra scherm wordt geweigerd.
Programmaversies en notices worden vooraf op het eigen platform gecontroleerd.
Pillow is vastgezet op 13.0.0, de decoder uit de afgeronde alpha-9-matrix.

Het nieuwe controleprogramma is al uitgevoerd op de echte alpha-9-artefacten:
alle 650 bronbestanden op elk platform bytegelijk, 32 schermen gelijk. Een eigen
proef waarin één gedownload Windows-scherm tijdelijk ontbreekt, wordt terecht
geweigerd. Het oorspronkelijke scherm is daarna hersteld. De controle vervangt
geen vergelijking met de bestaande suite, fysieke GUI- of installatieproef.

## Uitgevoerde lokale controles

- **171 reguliere Rust-tests geslaagd**, zes runtimeproeven standaard apart.
- **Alle zes runtimeproeven afzonderlijk geslaagd**, inclusief PDF/CSV via de
  native interface en de geïnstalleerde conversieruntime.
- **Zeven Python-tests geslaagd**; Rustfmt, Clippy met waarschuwingen als fouten
  en de vaste bronhashcontrole groen.
- DOCX/XLSX/PPTX, stijlerfenis, Unicode-lintselectie, fontafronding en
  conversie-uitvoer onafhankelijk teruggelezen.
- **33 echte native schermen gerenderd**. De 13 gedeelde document-PNG's blijven
  bytegelijk aan alpha 9. Dit zijn widget-/renderproeven zonder fysiek venster.

De [vier strikte vergelijkingen met de bestaande interface](pixelcontrole-alpha10/rapport.json)
blijven rood: Writer 126.880, Spreadsheet 595.469, Presentation 563.547 en
Notition 666.025 afwijkende pixels, steeds op 943.736 pixels. Geen maskers,
herschaling of versoepeling. Verschillen zijn geen percentages functievoltooiing.

Alle vijf [CI-jobs van alpha 10](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41177523545)
zijn geslaagd. De [platformcontrole](platformen-2026-10-31-alpha10.json) bevestigt
alle 673 bronbestanden bytegelijk op elk platform en 66 volledige native
beeldparen exact gelijk. De geteste mergecheckout `523a842a2ead6e590a99adbcbb77753e6b772894`
heeft dezelfde bronbomen voor native, publieke bestanden, documentatie en
Git-attributen als branchcommit `1a6a62ab509454c31045f94fef5b602e4e6b77c0`.

Ook de lokale releasebuild is afgerond en uit het draagbare pakket gecontroleerd:
673 bronbestanden exact gelijk aan een Git-archief van die branchcommit,
zip-CRC en SHA-256 goed, beide uitgepakte programmaversies juist en notices
meegeleverd. De [vaste bronregressie](bronregressie-2026-10-31-alpha10-release.json)
slaagt met de lokale releasecontroleur. Dit zijn previewpakketten, geen native
installers of stabiele suitevervanging.

De [brede alpha-10-releasecorpusronde](corpus-2026-10-31-alpha10-release.json)
is afgerond: **579 geslaagd, 68 geweigerd en één time-out** uit 648 geselecteerde
OOXML-bronnen, met 30 seconden per bron, twee processen en 3 GiB adresruimte
per proces. De bron met 177 pagina's overschrijdt die grens. Alle drie
[grote bronnen slagen afzonderlijk](grote-bronnen-2026-10-31-alpha10.json) met
120 seconden en één proces. De ronde controleert één werkweergave en zichtbare
tekstvelden na bewaren; geen volledige inhouds- of stijlcontrole. De overige
918 formaten zijn hiermee niet native getest. Er draaiden andere lokale taken
mee; de tijden vormen geen geïsoleerde benchmark.

Directe rijke paginainvoer, volledige ribbons, continue spreadsheetbediening,
presentatieobjecten, automatisch notitieherstel, complete mailbediening,
database-interface, native installers en fysieke platformproeven blijven open.
Er is geen stabiele native release of volledige suitevervanging gemaakt.
