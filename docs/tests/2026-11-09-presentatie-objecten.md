# Objecten uitlijnen en exact positioneren (#80)

Schikken → Objecten en positie toont de objecten van de huidige dia. Eén of
meer objecten kunnen worden gekozen voor uitlijnen op de selectie of de dia.
Vanaf drie objecten kan gelijke horizontale/verticale tussenruimte worden
toegepast. De berekening gebruikt de zichtbare randen van gedraaide objecten.
Bij één object kunnen X, Y, breedte en hoogte in centimeters worden ingevoerd.

De openbare `applyEdits`-route voert elke opdracht atomair uit als één
Undo-stap. Verwachte geometrie en versie worden bewaakt. Posities mogen
negatief zijn; afmetingen moeten positief zijn. De getoonde geometrie van
een placeholder kan uit de indeling komen, terwijl de bewerkingsbewaking
juist de werkelijk opgeslagen brongeometrie moet gebruiken.

## Controles

- Dertien tests slagen, inclusief alle zes uitlijningen, verdelen met
  verschillende maten, gedraaide randen en diareferentie.
- Echte PPTX-kernproeven controleren meerdere objecten als één Undo-stap,
  Redo, bewaren/heropenen, exacte maten, verouderde geometrie weigeren,
  geërfde placeholderposities en ongeldige maten zonder deelwijziging.
- Vijf productie-Chromiumproeven slagen: echte selectie via de dialoog,
  meerdere objecten uitlijnen/Undo, verdelen, centimeterwaarden inclusief
  negatieve X, ongeldige invoer weigeren en een echte Save As-download met
  onafhankelijk heropenen in de PPTX-kern. Geen paginafouten.
- De donkere dialoog is visueel gecontroleerd. De bestaande PR213-fix voor
  native licht/donker-bediening is in deze integratiebranch behouden.
- TypeScript, Vite-productiebouw en de zeventien i18n-controles slagen.
  Labels zijn toegevoegd in de negen aangeboden interfacetalen.

```text
node node_modules/vitest/vitest.mjs run src/presentatie/objecten.test.ts --maxWorkers 2
node scripts/test-presentatie-objecten.mjs
```

De browserproef gebruikt `OFFICE_TEST_DIST` en desgewenst
`OFFICE_PLAYWRIGHT_MODULE`, zoals de overzichtsproef. Hij bouwt zijn eigen
synthetische PPTX en gebruikt de volledige productie-app. Voor de browser
zijn beide meegeleverde fontpakketten gekopieerd en is spelling uitgezet.
Er is geen native installer gebouwd.

Groeperen, hulplijnen, afbeelding bijsnijden/vervangen/transparantie en opmaak
kopiëren blijven binnen #80 nog open. Deze deelfix claimt die niet.
