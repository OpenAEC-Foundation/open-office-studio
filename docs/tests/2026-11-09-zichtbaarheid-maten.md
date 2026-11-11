# Rijhoogte en kolombreedte behouden bij zichtbaar maken (#60)

Basis: `f4a03889eff1306fe503a72d7acb21c754d5ac8d`.

De interface verborg rijen/kolommen met `setRowHeight: 0` of `setColWidth: 0`
en maakte ze zichtbaar met dezelfde opdrachten en `null`. De kern bewaart
bij verbergen wel de aangepaste maat, maar `null` verwijdert die maat. Een
rij van 45 punten of kolom met breedte 27 kreeg daardoor na zichtbaar maken
de standaardmaat. Dit is bevestigd in het opgeslagen werkblad-XML.

De helpers gebruiken nu de reeds beschikbare `setRowVisibility` en
`setColVisibility`, met `hidden: true/false`. De maat wordt daarbij niet
gewijzigd. Deze ruwe opdrachten zijn ook toegevoegd aan de lokale
`RuweOp`-typebeschrijving; de rekenkern zelf is niet aangepast.

## Controle

Zes tests roepen de echte interfacehelpers aan met een echte
`@betteroffice/xlsx`-werkmap. Alleen de geselecteerde cel/range en het
UI-wijzigingssignaal zijn vervangen door een testadapter.

- Rijhoogte en kolombreedte blijven behouden na verbergen/zichtbaar maken.
- Hetzelfde werkt wanneer het verborgen blad eerst wordt opgeslagen en
  opnieuw geopend; er is geen afhankelijkheid van een tijdelijke maatcache.
- De opgeslagen XML bewaart `ht="45"` en `width="27"`; `hidden="1"` verdwijnt.
- Meerdere rijen/kolommen behouden ieder hun eigen maat.
- De hele selectie is één Undo-stap; Undo/Redo herstellen zichtbaarheid en
  maten. Een opnieuw geopend resultaat heeft nog steeds dezelfde maat.

Alle zes regressies falen op de oorspronkelijke code en slagen met de fix.
TypeScript en de Vite-productiebouw slagen. De volledige suite geeft 1.992
geslaagde tests, tien bestaande overslagen en één timeout na 5,4 seconden in
de ongewijzigde `nootopmaak-engine.test.ts`. Het volledige betrokken bestand
slaagt afzonderlijk met alle 23 tests, ook met de oorspronkelijke vijfseconden-
limiet. Er is geen tweede volledige run uitgevoerd.

```text
node node_modules/vitest/vitest.mjs run src/rekenblad/zichtbaarheid-maten.test.ts --maxWorkers 2
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build --outDir .local/issue60-build
```

De vastgezette afhankelijkheden zijn via een lokale node_modules-junction
naar een bestaande installatie gebruikt. De directe Vite-build voert geen
voorbereiding van de lettertype-/spellingcaches uit. Browserbediening en een
nieuwe native installer zijn niet afzonderlijk getest. #60 blijft open voor
de overige criteria zoals groepering en gesplitste weergaven.
