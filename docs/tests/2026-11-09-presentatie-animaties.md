# Presentatie: objectanimaties (#84)

## Geteste uitbreiding

Diavoorstelling → Objectanimaties opent een modaal animatiepaneel met een
geordende lijst, toevoegen/verwijderen, omhoog/omlaag, start bij klikken,
met vorige of na vorige, duur en vertraging. Ondersteund zijn vervagen bij
ingang/uitgang, draaien als nadruk en een recht bewegingspad met horizontale
en verticale verplaatsing. Een tekstobject kan worden opgesplitst in
afzonderlijke alineadoelen. Het voorbeeld gebruikt de echte gepositioneerde
dia-inhoud en dezelfde animatieroutine als de voorstelling.

De browservoorstelling speelt deze effecten na de diaovergang af. Vooruit
start een klikgroep of rondt een lopende groep af; terug herstelt de vorige
groep. Een zwart/wit scherm pauzeert de objecttijdlijn. Automatisch doorgaan
wacht tot de ondersteunde objectanimaties zijn afgerond. Verminderde beweging
toont effecten direct op hun startmoment; wachttijd en volgorde blijven gelden.

De effecten staan als standaard PresentationML-timing in het PPTX-pakket.
Ongewijzigd toepassen geeft de oorspronkelijke bytes terug. Niet ondersteunde
effecten, interactieve timing, herhalingen en uitbreidingen worden volledig
behouden, niet herschreven. Het paneel staat dan alleen lezen toe en de
voorstelling meldt dat de dia zonder objectanimaties wordt weergegeven.

## Validatie op 9 november 2026

- Volledige suite op de #83-basis: **178 bestanden geslaagd, 2028 tests
  geslaagd, 10 overgeslagen**, met `--configLoader runner --maxWorkers=2`.
- 22 nieuwe tests controleren de bestaande P3-ingangsanimatie, vier
  gedragingen, klikgroepen, samen/na-vorige, alinea's, begrensde waarden,
  gerichte pakketwijzigingen, onbekende timingvarianten, verminderde beweging,
  openen/opslaan/heropenen met de werkelijke engine en behoud zonder bewerking.
- TypeScript en productiebuild geslaagd; bestaande chunkgroottewaarschuwing.
  Alle negen aangeboden interfacetalen geslaagd (23 bestaande waarschuwingen
  over andere taalmappen).
- Chromium/productiebuild: P3 wordt herkend en heeft een zichtbaar bewegend
  voorbeeld. Ingang afspelen, vorige stap, lopend effect afronden, drie
  afzonderlijke alinea's, draaien, bewegen, uitgang, volgorde wijzigen,
  ongeldige timing, downloaden/heropenen en start met vorige werken.
- Dezelfde browserproef controleert pauzeren bij een zwart scherm,
  verminderde beweging en een dialoog van 390 × 844 pixels. Onbekende timing
  blijft byte-identiek bij de echte opslagroute en krijgt zowel in het
  paneel als de voorstelling een melding. Geen JavaScript-paginafouten.
- De volledige #83-browserroute is opnieuw uitgevoerd na de nieuwe speler:
  vijf overgangspreviews, timingvalidatie, toepassen op alle dia's,
  opslaan/heropenen, klikbeleid, automatische voortgang, zwart scherm,
  WAV-upload/afspelen, herstel van geblokkeerde autoplay via Enter,
  verminderde beweging en smalle dialoog blijven slagen.
- Dialoog en smalle indeling visueel gecontroleerd in het donkere thema.

## Uitwisseling met een andere Office-implementatie

LibreOffice 26.8.2.2 opende de via de interface opgeslagen presentatie en
exporteerde opnieuw naar PPTX, in 17,687 seconden. Voor en na bevatten de
dia's vier `animEffect`-gedragingen (drie ingangen en één uitgang), één
`animRot`, één `animMotion` en zes `pRg`-verwijzingen (de drie alineadoelen
in zichtbaarheids- en effectgedrag). Geen van deze gedragingen/doelen verdween.
Dit bevestigt herkenning en behoud door die importer; het is geen handmatige
PowerPoint-afspeelproef. De subprocessproef gebruikte het eigen profiel uit
PR238/d2043ead en de twee child-env-printerinstellingen uit PR239/b957143e.

## Grenzen en integratie

Deze branch bouwt op #83/PR243, exact 78a84fd8. Voeg die twee commits eerst
toe, en daarna alleen het #84-commit; pas dezelfde #83-code niet tweemaal toe.

Het losse Tauri-toeschouwervenster toont de dia nog statisch en meldt dat
in de presentatorweergave. De hoofdvenster-/browserroute speelt wel af.
Twee fysieke schermen, Microsoft PowerPoint en ODP/PPT-rondreizen zijn nog
niet voor deze uitbreiding gecontroleerd. Extra effecten, bochtige paden,
interactieve triggers, complexe groepsopmaak en een permanent gedockt paneel
blijven vervolgwerk. #84 wordt daarom niet gesloten.

De voorstelling gebruikt vooraf gerasterde lagen met behoud van tekenvolgorde.
De animatierasterbreedte is maximaal 1920 pixels; buffers zijn begrensd op
8 miljoen dia-pixels, 16 miljoen opgeslagen laagpixels en 128 miljoen
scanpixels. Bij overschrijding volgt een gemelde statische weergave; de
instellingen blijven bewaard. Frameverloop veroorzaakt geen React-render
per frame. Toepassen van gewijzigde pakketgegevens herlaadt de presentatie
en reset eerdere undo-geschiedenis; het paneel meldt dit vooraf.

Primaire specificatiebronnen:
[Animation](https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-animation),
[AnimateMotion](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.animatemotion?view=openxml-3.0.1),
[AnimateRotation](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.animaterotation?view=openxml-3.0.1).
