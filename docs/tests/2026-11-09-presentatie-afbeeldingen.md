# Presentatie: afbeeldingen bewerken (#80)

Via **Vormopmaak → Afbeelding bewerken** kunnen gebruikers een afbeelding op
de huidige dia kiezen, vier uitsneden in procenten wijzigen, transparantie
instellen of een PNG/JPEG ter vervanging kiezen. Het voorbeeld toont de
uitsnede en transparantie. De bestaande positie, afmetingen, draaiing en
spiegeling blijven behouden. Een nieuwe mediarelatie voorkomt dat andere
afbeeldingen met hetzelfde bronbestand mee veranderen.

De bewerking wijzigt het PPTX-pakket en herlaadt de presentatie. De dialoog
vermeldt daarom dat een nieuwe undo-geschiedenis begint. Een gewijzigde
documentversie, andere API of alleen-lezen document blokkeert toepassen.
Een afbeelding is maximaal 20 MB en 50 miljoen pixels; de browser decodeert
de vervanging voordat toepassen mogelijk wordt. Externe afbeeldingen worden
niet opgehaald. Bestaande overige XML en afbeeldingseffecten blijven behouden;
vervangen verwijdert verouderde SVG-fallbacks en ongebruikte beeldrelaties.

## Gerichte verificatie

- `src/presentatie/afbeeldingen.test.ts`: 12 tests met de echte PPTX-kern,
  waaronder uitsnede/alpha via layout, herhaald bewerken, native save/heropenen,
  gedeelde media, exacte geometrie, overige pakketonderdelen, negatieve
  uitsneden, ongeldige invoer, decodeergrenzen, SVG-extensies en gekoppelde
  afbeeldingen. Alle interne relaties blijven oplosbaar.
- `scripts/test-presentatie-afbeeldingen.mjs`: zes Chromium-scenario's tegen
  de productiebuild. Bediening van de echte dialoog, native canvaswaarden,
  foutieve uitsnede en vervanging, behoud van een tweede gedeelde afbeelding,
  verouderde bewerking, echte Opslaan als-download en onafhankelijk heropenen
  in een nieuwe browsercontext. Geen browserfouten.
- Schermafbeelding van de donkere dialoog visueel beoordeeld; alle labels en
  velden zijn leesbaar. Negen aangeboden interfacetalen hebben vertalingen.
- TypeScript, productiebuild en localecontrole slagen. De localecontrole meldt
  uitsluitend de 23 bestaande niet-aangeboden taalmappen.
- Volledige suite: 2111 geslaagd, 10 bestaande skips, 184 bestanden; twee
  workers en een testlimiet van 15 seconden. Resultaat in
  `.local/pictures-all-tests.json`.

Reproduceren na de productiebuild:

```powershell
$env:OFFICE_TEST_DIST='.local/presentation-build'
node scripts/test-presentatie-afbeeldingen.mjs
```

Als Playwright buiten het project is geïnstalleerd, zet
`OFFICE_PLAYWRIGHT_MODULE` op de module-URL. Uitvoer staat standaard in
`.local/proef-presentatie-afbeeldingen`.

Dit dekt het afbeeldingscriterium van #80. Groeperen, hulplijnen en opmaak
kopiëren blijven afzonderlijk werk. Native installers en ODP/PPT-conversie
zijn voor deze aanvulling niet opnieuw getest.
