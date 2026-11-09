# Werkstand Spreadsheet #59, #60, #61, #66 en #67

De vijf hoofdissues blijven open: deze bundel bevat concrete reparaties en
uitbreidingen, met de resterende acceptatiepunten expliciet hieronder.

| Issue | Opgenomen | Resterende acceptatie |
| --- | --- | --- |
| #59 | PR210 behoudt foutwaarden in functievoorbeelden; de geselecteerde foutcel krijgt uitleg, ook voor kringen en rekenlimieten; formule-notatie is expliciet en functiedekking is gepubliceerd | Optionele iteratie en volledige onafhankelijke functiedekking/praktijkcorpus |
| #60 | PR223 behoudt handmatige maten; standaard XLSX-outlinegroepen met rij-/kolomkeuze, geneste groepen en in-/uitklappen | Cellen verschuiven bij invoegen/verwijderen; outlineknoppen naast rasterkoppen; gesplitst venster; volledige structuur-/naamverwijzingsmatrix |
| #61 | PR204 navigatie en PR186 structuurbeveiliging; native verplaatsen met formule-/undo-behoud, slepen, Ctrl-slepen opent kopie-opties; verbergen/zichtbaar maken en tabkleuren | Volledige kopie met alle objecten, andere werkmappen, groepsselectie en groepsbewerking |
| #66 | PR202 bronverwijzingen; trendlijnen lezen/bewaren/bewerken en in het editorvoorbeeld tekenen; bronopmaak en onbekende uitbreidingen blijven behouden | De werkelijke documenttekenlaag toont nog geen trendlijnen; volledige secundaire-asbediening, eigen grafiekbladen en formaatcorpus. Grafiekoverdracht wordt afzonderlijk geïntegreerd uit #82 |
| #67 | Regelbeheer, presets, aangepaste formules, prioriteit, toepassingsbereik, verwijderen en stop-if-true; schalen/balken/pictogrammen; native undo/redo en XLSX-opslag | Volledige bestaande XLSX/ODS-varianten: extra DXF-facetten zoals randen/getalnotaties worden behouden maar niet conditioneel getekend; thema-/formuledrempels en alle pictogramvarianten; volledig interop-/praktijkcorpus |

## Belangrijk gedrag

Regelbeheer gebruikt één native transactie. De eerste toepasselijke regel heeft
voorrang per opmaakeigenschap. Stop-if-true wordt niet aangeboden voor schalen,
gegevensbalken en pictogrammen. Bewerken van een formule of bereik behoudt onbekende
bronuitbreidingen. Bij uitgebreide bronstijlen blijven de opmaakknoppen geblokkeerd,
zodat bewerken de extra DXF-facetten niet stil verwijdert.

De voorwaarden worden alleen-lezen op de echte broncel geëvalueerd. Relatieve en
absolute verwijzingen, ROW/COLUMN, lokale namen, hele rijen/kolommen en 1904-datums
gebruiken de native rekenkern. Er komt geen tijdelijk blad of werkboek, geen
herberekening van vluchtige bronwaarden, geen bronstijlmutatie en geen extra
undo-stap. De oorspronkelijke tekenlijst houdt waarden en geometrie. Regels en
rekenresultaten worden gecachet; gewoon typen of scrollen exporteert niet telkens
het XLSX-pakket. De formulequery is begrensd op 4.096 vragen, 1 MiB formuletekst en
het gedeelde native rekenbudget per batch; een beperkte uitkomst wordt niet als
ware voorwaarde gebruikt.

De pakketroute voor outlinegroepen, bladzichtbaarheid en tabkleuren herlaadt de
editor en wist de undo-geschiedenis. De vensters melden dat vóór toepassen. Een
outlinebewerking is begrensd tot 10.000 rijen. Structuur- en bladbeveiliging worden
vooraf gecontroleerd. Het laatste zichtbare blad kan niet worden verborgen;
veryHidden-bladen worden niet als gewone verborgen bladen aangeboden.

## Rekenkerndelta

De bestaande keten-, regio- en herberekende-opslagpatches blijven aanwezig. Twee
extra patches voegen CF-vervanging/-opslag en alleen-lezen formulevragen toe.
De publieke WASM-imports/-exports en snapshotlayout blijven gelijk.

De eerste echte save/reopen-proef vond nog een bronfout: de schrijver hergebruikte
de oude sqref uit de bronwrapper bij een gewijzigd toepassingsbereik. De nieuwe
schrijver wijzigt uitsluitend die wrapper-attribuutwaarde en bewaart onbekende
attributen en uitbreidingen. Zowel native als JS/WASM hebben hiervoor een regressie.

De kandidaat is schoon gebouwd en getest in
[run 42625934529](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42625934529)
op bronpatchcommit `34ca6426045ca88f363babd5d168cc46af873e9f`.
De vastgelegde WASM telt 7.712.658 bytes met SHA-256
`ad3d40536ad80eaebfa4a06dc2099885a485d850160e65e23f6306ba99abbe1e`.
Bron, alle patchchecksums, gereedschappen en bouwresultaat staan in
[de metadata](../../patches/rekenbladengine-lange-ketens.json) en
[bouw.json](../../vendor/rekenbladengine/bouw.json).

## Controleerbare proeven

- `voorwaardelijke-opmaak.test.ts`: 10 echte-kernproeven voor regels, prioriteit,
  stop/undo, visuele regels, bronbehoud, bereikwijziging, beveiliging en weigering
  van verouderde/alleen-lezen opdrachten.
- `voorwaardelijke-weergave.test.ts`: 9 echte-kernproeven voor broncelcontext,
  formuleverwijzingen, vluchtige waarden, recalc/undo, prioriteit, geen save bij
  gewoon typen, vastzetten en samengevoegde cellen bij afdrukken.
- `formulenotatie.test.ts`: 2 echte-kernproeven voor Nederlandse/Engelse regio,
  gebruikersinvoer, canonieke opslag en heropenen.
- `formulefouten.test.ts`: 8 echte-kernproeven, inclusief directe en kruisbladkringen.
- `bladen-verplaatsen.test.ts`: 3 echte-kernproeven voor kruisbladformules,
  opslaan/heropenen, undo/redo en structuurbeveiliging.
- `bladEigenschappen.test.ts`: 6 proeven voor zichtbaarheid, veryHidden en
  structuurbeveiliging, formulebehoud, RGB/thema/index/tint, native verplaatsen/
  undo/redo en geen extra save bij gewoon typen. De bestaande zichtbaarheidssuite
  telt daarnaast 8 proeven.
- `groepen.test.ts`: 7 pakket-/kernproeven voor geneste groepen, celbewerking,
  in-/uitklappen, handmatige maten en andere pakketonderdelen.
- `trendlijnen.test.ts` plus `grafieken.test.ts`: 53 proeven voor analytische
  regressies, XML-behoud en de bestaande DOCX/PPTX-routes.
- `pakket.test.ts`: 4 proeven voor lazy ZIP/XML-behoud bij grote onderdelen.

De afzonderlijke productiebrowserproeven staan in
`scripts/proef-bladverplaatsen.mjs`,
`scripts/proef-rekenblad-groepen-en-fouten.mjs` en
`scripts/proef-voorwaardelijke-opmaak.mjs`.
Ze gebruiken echte dialogen, downloaden via Opslaan als en openen het resultaat
opnieuw met de native kern. Spelling staat in deze proeven uit; de normale
spelling-assetbouw is hier niet opnieuw uitgevoerd.

De functiecatalogus en de grenzen van de bestaande onafhankelijke matrix staan in
[Formules: notatie en functiedekking](../rekenblad-functiedekking.md).

## Gecombineerde controle op 9 november 2026

De volledige suite slaagt: **2.095 geslaagd, 10 bestaande skips, 188 bestanden**.
Directe TypeScript-controle en productiebouw slagen. De vertalingscontrole slaagt
voor 7.003 bronsleutels; de 23 waarschuwingen voor aanwezige maar niet actieve
taalmappen blijven bestaan. Na visuele controle is de opmaakrij van het
CF-venster compacter gemaakt; de productiebouw en CF-browserproef zijn daarna
opnieuw uitgevoerd.

De productiebrowserproeven slagen voor acht bladgevallen, vijf groepen-/foutgevallen
en vijf CF-gevallen, zonder page errors. De CF-proef controleert werkelijk tekenen
op canvas, wijzigen met ROW(), native undo/redo, Opslaan als-download, het gewijzigde
toepassingsbereik na heropenen en verwijderen van de heropende regel.

De bestaande onafhankelijke Python-matrix is ongewijzigd opnieuw uitgevoerd op de
nieuwe productiekern. Alle gecontroleerde uitkomsten en pakketkenmerken blijven
behouden, met uitsluitend de drie reeds gemelde onbekende/afhankelijke functies
`Functies!C1`, `C2` en `C6`. De matrix bevestigt opnieuw 229 herkende namen van
519 kandidaten. Er is geen nieuwe onafhankelijke beoordeling van alle functies.
Op deze Windows-machine is uitsluitend de testlauncher tijdelijk naar de aanwezige
Python 3.13.17 uit LibreOffice geleid; de matrix, fixtures en evaluator zijn niet
aangepast.

[Controleoverzicht](../tests/2026-11-09-spreadsheet-vervolg/controles.json),
[matrixrapport](../tests/2026-11-09-spreadsheet-vervolg/matrix.json),
[CF-browserrapport](../tests/2026-11-09-spreadsheet-vervolg/voorwaardelijke-browser.json),
[regelvenster](../tests/2026-11-09-spreadsheet-vervolg/regelvenster.png) en
[getekende opmaak](../tests/2026-11-09-spreadsheet-vervolg/voorwaardelijke-opmaak.png)
leggen deze werkstand vast. Dit is geen nieuwe gepubliceerde installer.
