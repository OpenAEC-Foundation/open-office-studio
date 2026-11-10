# Bewerkbare grafieken uit Spreadsheet overnemen (#82)

Spreadsheet heeft onder Invoegen → Grafieken een knop Grafiek kopiëren.
Presentatie biedt dezelfde kopieerknop en Grafiek plakken. Ctrl+V op de dia
opent eveneens de gedeelde grafiekeditor met een voorbeeld en bewerkbare
gegevens. De luisteraar blijft buiten de tijdelijke lintinhoud gemonteerd;
verborgen documenten en invoervelden luisteren niet mee. De gebruikelijke
route om een nieuwe presentatiegrafiek in te voegen blijft dezelfde gedeelde
editor gebruiken.

De kopie bevat alleen het grafiekonderdeel en zijn afhankelijkheden. XML,
media, relatienamen en onbekende uitbreidingen blijven behouden. Interne
relaties worden naar nieuwe, vrije onderdeelnamen omgezet, ook bij cycli.
Bij plakken wordt een afzonderlijk ingesloten XLSX-gegevensblad gemaakt;
latere wijzigingen aan de presentatiegrafiek veranderen het bronrekenblad
niet. Het oorspronkelijke rekenblad wordt niet meegekopieerd.

Spreadsheet-kopieën lezen de huidige broncellen in één begrensde batch;
verouderde grafiekcaches zijn daarbij niet leidend. Verandering van de bron
tijdens die lezing wordt geweigerd. Ook het doel wordt tegen verouderde
editorinstanties en versies beschermd. Het klembordformaat accepteert LF
en de CRLF-regeleinden die Windows aanbrengt. Pakket-/onderdeellimieten
begrenzen ongeldige klembordinhoud. Native desktop gebruikt de bestaande
Tauri-tekstklembordkoppeling; de browser gebruikt de Clipboard API.

## Validatie

- 18 nieuwe tests: alle elf gedeelde grafiektypen, bewerkbare ingesloten data,
  native rendering/opslag, afhankelijkheden met cycli, onbekende XML, bronbehoud,
  actuele bronwaarden, versieconflicten, Windows-regeleinden en ongeldige input.
- Volledige geïntegreerde suite: **2090 geslaagd, 10 bestaande skips, 182 bestanden**,
  twee workers en 15 seconden per test.
- TypeScript, Vite-productiebuild en de negen aangeboden grafiekinterfacetalen:
  geslaagd.
- `scripts/test-presentatie-grafieken.mjs`: zeven Chromium-scenario's. Maak
  de bron via de echte Spreadsheet-editor, wijzig een broncel van 12 naar 777,
  kopieer en plak met echte Ctrl+V, wijzig de geplakte waarde naar 888,
  verander type/gegevens/opmaak, controleer dat de bron 777 blijft, weiger
  gewone tekst zonder mutatie, voeg een tweede grafiek in, download via
  Opslaan als en heropen in zowel engine als app. Beide grafieken blijven
  renderen; Ctrl+V na heropenen opent precies één venster. Geen paginafouten.
- Voorbeeld, gegevensblad en dialogen visueel gecontroleerd.

Deze route wisselt grafieken uit tussen Open Office Studio-documenten via
de expliciete grafiekkopie. OLE-/afbeeldingsklemborden van externe Excel- of
PowerPoint-processen vallen niet onder dit eigen uitwisselingsformaat.
Niet-ondersteunde bronsoorten worden geweigerd. Native installatiepakketten,
ODP/PPT-conversie en de Tauri-klemborddialoog zijn hier niet opnieuw getest.
De bestaande #66-werkstroom voor nieuwe grafiekfuncties loopt onafhankelijk;
dit werk gebruikt de gedeelde component en claimt dat brede issue niet af.

Het afzonderlijke trendlijncommit `7ecbce9f` van de eigenaar van #66 is daarna
geïntegreerd. Een extra native roundtriptest en dezelfde zeven browserroutes
controleren trendlijnbehoud bij overnemen en gegevens-/typewijzigingen. Het
gedeelde voorbeeld toont de trendlijn; het tekenen daarvan in de native
werkblad-/diacanvasroute blijft buiten deze claim, zoals de eigenaar meldt.

De vier functionele criteria van #82 zijn voor de ondersteunde gedeelde
grafiektypen afgedekt; sluiting kan volgen na samenvoegen van de PR.
