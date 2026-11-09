# Toetsenbordbediening presentator — deel van #79

## Gereproduceerd

De vensterbrede capture-listener in `Voorstelling` behandelde Enter en spatie
op een gefocuste knop als volgende dia en voorkwam de normale knopactivering.
Een productiegebouwde browserproef met de echte component en de PPTX-engine
op `docs/voorbeelden/Ontwerpvisie.pptx` bevestigde beide gevallen: de timer
bleef lopen en de teller sprong van **Slide 1 of 3** naar **Slide 2 of 3**.

## Correctie

Enter en spatie op knoppen en koppelingen blijven bij het bedieningselement.
Invoervelden en bewerkbare tekst houden hun eigen toetsen. De doelnode wordt
zonder `instanceof HTMLElement` van het hoofdvenster herkend, zodat dezelfde
controle ook toepasbaar is in het afzonderlijke browservenster. Andere toetsen
en de bediening zonder knopfocus blijven door de presentatielogica lopen.

## Herhaalbare browserproef

Vanuit de repository, met een beschikbare Playwright-runtime en Chromium:

```text
node scripts/test-presentatie-toetsen.mjs [pad/naar/playwright/index.mjs]
```

Zonder argument wordt het pakket `playwright` uit de beschikbare Node-runtime
geladen. De proef bouwt uitsluitend haar eigen fixture, opent een tijdelijke
previewserver en sluit die en de browser na afloop. Uitvoer staat in
`.local/presentatie-toetsen-resultaten.json`.

Alle twaalf scenario's slagen op Windows Chromium:

- Enter en spatie op timer pauzeren/hervatten, pen, notitiegrootte, vorige dia
  en voorstelling afsluiten (tien scenario's).
- Enter, spatie en pijltjes zonder knopfocus navigeren nog tussen dia's.
- Enter in het dianummerveld bevestigt het ingevulde nummer.

Ook de zeventien bestaande presentatietests, TypeScript en de productiebuild
slagen. De proef gebruikt echte browserinvoer en een echt geopend PPTX-bestand;
alleen de omringende editor-API wordt beperkt tot de handle die `Voorstelling`
daadwerkelijk leest.

Een native Tauri-build, meerdere fysieke monitoren en schermlezers zijn in
deze proef niet getest. De bredere criteria van #79 blijven open.
