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

De [alpha-12-platformronde](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/41184367055)
is afgerond: alle vijf jobs groen. De [pakket- en beeldcontrole](platformen-2026-10-31-alpha12.json)
bevestigt **718 verpakte bronbestanden bytegelijk op elk platform**, de juiste
programmaarchitecturen, bronregressie en **68 exacte native beeldparen**.
Zeven bezoeken aan de eigen bron met zes pagina’s zijn op
[Linux](paginameting-2026-10-31-alpha12-Linux.json),
[Windows](paginameting-2026-10-31-alpha12-Windows.json) en
[macOS](paginameting-2026-10-31-alpha12-macOS.json) exact gelijk tussen verse en
behouden engines. De rapporten zijn aan de werkelijk verpakte controleur gekoppeld.
Dit is geen fysieke platform- of installatieproef en bewijst geen gelijkheid
met de bestaande interface.

De lokale Linux-release is vanaf het vaste Git-archief van commit
`7ac7af40c4cf94b2ef2002bfbdcab46658a66be0` gebouwd. Het uitgepakte pakket
is op alle 718 bronbestanden, controlesommen, bronpinnen, licentieteksten en
beide programmaversies gecontroleerd. De
[vastgepinde bronregressie](bronregressie-2026-10-31-alpha12-release.json)
slaagt ook met deze lokale release.

De [brede corpusronde met de lokale alpha-12-release](corpus-2026-10-31-alpha12-release.json)
heeft **579 geslaagde, 68 geweigerde bronnen en één time-out**, uit 648
geselecteerde OOXML-bronnen. Eén proces, 30 seconden en 3 GiB adresruimte
per bron; er draaiden andere controles mee. De drie grote bronnen slagen
[afzonderlijk binnen 120 seconden](corpus-2026-10-31-alpha12-grote-bronnen.json).
Dit is geen volledige inhouds-, stijl- of functiecontrole; de overige 918
bestanden zijn hiermee niet native getest.

Directe rijke paginainvoer, volledige ribbons, doorlopende spreadsheetbediening,
presentatieobjecten, automatisch notitieherstel, volledige mailbediening,
database-interface, native installers en fysieke platformproeven blijven open.
Er is geen stabiele native release gemaakt.
