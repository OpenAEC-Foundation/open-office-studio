# Native controle, 31 oktober 2026: alpha 12

**2026.44.9-alpha.12** voegt werkende tekstklembordknoppen toe en maakt het
opmaaklint compacter. Alle tien acceptatiegebieden blijven open. De suite is
nog niet volledig gemigreerd of pixelgelijk aan de bestaande versie.

## Bediening in het lint

Writer begint met compacte geschiedenisknoppen, Plakken/Knippen/Kopiëren,
lettertype/grootte, een rij opmaakiconen en uitlijning. Doorhalen en Uitvullen
zijn aangesloten voor Writer. Letterstappen werken ook boven 72 punt en vanaf
1 punt; 80 verkleinen wordt 79, en 1 vergroten wordt 2. De knoppen zijn bij de
grens uitgeschakeld. Gemengde of onbekende groottes krijgen geen verzonnen
uniforme waarde.

Export, Markdown en IFCX staan onder **Bestand**. Zoom en panelen staan bij
Writer, Spreadsheet en Presentation onder **Weergave**. Hierdoor worden de
rechterknoppen van het Start-lint niet meer afgekapt in de referentieweergave.
Het bestandsblad kan verticaal scrollen. De nieuwe routes zijn met echte
Iced-muisgebeurtenissen gecontroleerd; de tests openen geen systeemdialoog.

De knoppen tonen uitsluitend ondersteunde opdrachten. Onderstrepen bij
Spreadsheet en Doorhalen bij Presentation zijn nog niet aangesloten. Het
verkeerd gebruikte onderstreepicoon voor Doorhalen is vervangen door een eigen
lijnicoon. Sneltoets Ctrl/Cmd+U stuurt een spreadsheet niet meer naar een
opdracht die de huidige kern weigert.

## Tekstklembord en vertraagde antwoorden

De lintknoppen en Ctrl/Cmd+C/X/V bedienen de actieve teksteditor. Kopiëren en
Knippen gebruiken de expliciete selectie; Plakken vervangt de selectie of
voegt tekst bij de cursor in. Dit betreft platte tekst in de huidige editor,
geen rijke Office-inhoud, afbeeldingen of spreadsheetbereiken. Knippen en
Plakken maken eerst een zichtbaar concept; Toepassen gebruikt de bestaande
documentwerkdraad en undo.

Een leesantwoord is gebonden aan document, onderdeel, veld, bronhash,
editorinhoud en cursor/selectie. Bij een gewijzigd doel wordt het antwoord
geweigerd. Een leeg klembord wist geen selectie. Beveiligde documenten mogen
wel worden gekopieerd; Knippen en Plakken blijven geblokkeerd. Verborgen
postvakken, bestandsbladen, modale vragen, instellingen en bezige editors mogen
geen klembordopdracht voor een achterliggende editor uitvoeren.

De tests handelen uitsluitend eigen tekst via de echte Iced-klembordtaken en
antwoordkanalen af. Het systeemklembord en de persoonlijke inhoud daarvan
worden niet benaderd. Een fysieke systeemklembordproef staat nog open.

## Uitgevoerde controles

- **179 reguliere Rust-tests geslaagd**, zes runtimeproeven afzonderlijk.
- Daarna **alle 40 GUI-tests opnieuw geslaagd**, inclusief de laatste
  letterstapcorrecties bij 1 en 80 punt. Dit zijn widget-/renderproeven.
- **Alle zes runtimeproeven geslaagd**, inclusief PDF/CSV via de interface.
  De [onafhankelijke conversiecontrole](conversie-2026-10-31-alpha12-lokaal.json)
  bevestigt zes inhoudsrondgangen en drie PDF-handtekeningen.
- **Zeven Python-tests**, Rustfmt, Clippy met waarschuwingen als fouten en
  controle van de vastgepinde bronhashes geslaagd.
- DOCX/XLSX/PPTX onafhankelijk teruggelezen. Bij de klembordbewerking blijven
  de cursieve resttekst, tabellen, secties en kop-/voetteksten behouden.
  Doorhalen, uitvullen en de werkelijk opgeslagen lettergrootte kloppen.
- **34 native schermen gerenderd**, waaronder het zichtbare klembordconcept.
  De [13 gedeelde documentbeelden](documentbeelden-2026-10-31-alpha12.json)
  zijn bytegelijk aan alpha 11. Bron- en loghashes staan bij de
  [schermherkomst](schermen-2026-10-31-alpha12.json).

De [vier volledige PNG-vergelijkingen](pixelcontrole-alpha12/rapport.json)
blijven met nul tolerantie rood: Writer **120.590**, Spreadsheet **594.216**,
Presentation **560.034** en Notition **666.025** afwijkende pixels, telkens
op 943.736 pixels. Geen maskers, herschaling of versoepeling. Ook het
documentvlak en andere schermtoestanden vragen nog werk.

De nieuwe release- en platformronde zijn nog niet afgerond. De
[afgeronde alpha-11-ronde](controle-2026-10-31-alpha11.md) heeft alle vijf
CI-jobs groen, alle 691 verpakte bronbestanden bytegelijk op elk platform,
66 exacte native beeldparen en zeven exacte paginabezoeken op alle drie
platforms. Dat platformbewijs betreft alpha 11. De brede corpusronde van
alpha 11 heeft 579 geslaagde, 68 geweigerde bronnen en één time-out.

Directe rijke paginainvoer, volledige ribbons, doorlopende spreadsheetbediening,
presentatieobjecten, automatisch notitieherstel, volledige mailbediening,
database-interface, native installers en fysieke platformproeven blijven open.
Er is geen stabiele native release gemaakt.
