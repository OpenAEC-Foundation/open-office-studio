# Presentatie: afgekapt zoeken niet als volledig behandelen (#339)

10 november 2026. Gerichte bugfix onder #29, gereserveerd via de
integratiechat. Vaste basis `68cc7fc512d3778115395d58bfc2c2cf33131d43`,
PPTX SDK 0.5.1. De definitieve commit staat in de PR en overdracht.
Deze levering valt buiten de gesloten integratie-intake.

## Onafhankelijke reproductie

Een synthetisch tekstvak bevat `katten ` 10.000 keer, gevolgd door `kat needle`.
De echte native `findText` geeft voor `kat` precies 10.000 treffers en
`truncated=true`. De bestaande resolver negeert dat signaal. Met Alleen hele
woorden filtert hij de geleverde deelmatches weg en geeft hij nul terug.
De echte productie-app meldt dan `Search term not found.`, terwijl de laatste
losse `kat` wel in het document staat. Nul JavaScript-fouten.

Dit is zowel op de eerdere #326-bron als op de ongewijzigde productiebuild van
bovenstaande basis bevestigd. De twee zoekbestanden zijn tussen die punten
gelijk. De mogelijkheid dat Alles vervangen een onvolledig aantal als volledig
meldt is daarnaast aan de bestaande controlestroom vastgesteld; er is geen
10.000-bewerkingen-baseline uitgevoerd of als native UI-bewijs geclaimd.

## Fix en gerichte controle

De resolver controleert na de bestaande versiecontrole het afkappingssignaal.
Bij een onvolledige schrijfwijze werpt hij een herkenbare limietfout voordat
een resultaatset kan worden gepubliceerd of vervangen. Het paneel wist zijn
oude huidige treffer en toont één vertaalde status met het verzoek de zoekterm
te verfijnen. Dit geldt voor zoeken, Vervangen en Alles vervangen.

De native limiet van 10.000 per schrijfwijze, SDK en herhaalgrens blijven gelijk.
Er komen geen extra scans, zoekpagina's, imports of documentmutaties bij.
Een reeds verouderde native respons wordt eerst opnieuw gelezen; zijn oude
afkappingssignaal wordt niet als huidige fout getoond.

- Alle 17 gerichte zoek-/vervangtests groen: tien bestaande tests plus zeven
  tests voor weigering bij hoofdletter-/hele-woordencombinaties, een later
  afgekapt resultaat, versieherhaling en exact 10.000 complete resultaten met
  `truncated=false`. Een afgebroken vervangroute bereikt geen edittransactie.
- TypeScript en normale Vite-productiebuild groen, met bestaande
  dependency-/JSON-import- en chunkgroottewaarschuwingen.
- Alle negen aangeboden talen en 21 namespaces zijn in orde: 8.035 bronsleutels,
  23 bestaande waarschuwingen voor voorbereide talen. Alleen de negen
  aangeboden locales krijgen de nieuwe specifieke melding.
- Vier nieuwe productie-browsergevallen groen, nul JavaScript-fouten. Geen
  React-interne API, diagnostische bridge of gesimuleerde editor in de proef.
- De zeven bestaande productie-browsergevallen van Hele woorden zijn groen
  op dezelfde nieuwe productiebuild, inclusief downloaden/heropenen, behouden
  deelwoorden, Unicode, vormgeometrie, lettertype en één Undo/Redo.

## Echte browsergevallen

| Geval | Uitkomst |
| --- | --- |
| Basis: afgekapt zoeken, Alleen hele woorden | Onterechte melding dat niets gevonden is |
| Fix: dezelfde zoekopdracht | Duidelijke melding om de zoekopdracht te verfijnen |
| Vervangen en Alles vervangen bij afkapping | Dezelfde melding; alle verhaalteksten gelijk in de gedownloade PPTX |
| Verfijnen naar `needle` | Eén geldig resultaat; één vervanging en één Undo bewaren/herstellen de verwachte tekst |
| Nederlandse interface | `Te veel zoekresultaten. Verfijn de zoekopdracht; er is niets vervangen.` |

De kleine-lettertype-invoer is uitsluitend een compacte synthetische
regressie; dit is geen prestatiemeting of claim over fysiek beperkte hardware.
De vastgelegde basis-/fixrapporten en bestaande browserregressie staan in
`presentatie-zoeklimiet-2026-11-10/`.

## Herhalen

Met geïnstalleerde afhankelijkheden en voorbereide assets:

```powershell
node node_modules/vitest/vitest.mjs run src/lint/presentatie-zoeken.test.ts --maxWorkers 1
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build --outDir .local/truncation-fixed
node scripts/test-presentatie-zoeklimiet.mjs
node scripts/controleer-i18n.mjs
$env:OFFICE_TEST_DIST='.local/truncation-fixed'
node scripts/test-presentatie-hele-woorden.mjs
```

Beide browserproeven ondersteunen `OFFICE_PLAYWRIGHT_MODULE`,
`OFFICE_TEST_DIST` en `OFFICE_TEST_UIT`. De nieuwe proef schrijft standaard
naar `.local/presentation-truncation-fixed/`. Met `--baseline` verwacht hij
het oorspronkelijke foutgedrag in `.local/truncation-baseline/`.

## Platformstatus en grenzen

| Platform | Build/pakket | Functionele controle | Resterend |
| --- | --- | --- | --- |
| Windows | Lokale TypeScript-/Vite-build groen; geen native pakket gebouwd | 17 gerichte tests en 11 Chromium-UI-gevallen groen | CI-/pakketresultaten en native bediening |
| Browser | Normale productie-app groen | Echte zoek-/vervang-, download-, herstel- en Nederlandse routes groen | Andere browserengines niet getest |
| Linux | Bestaande platform-CI beschikbaar; bij bronoplevering nog geen resultaat | Niet als geslaagd geclaimd | CI-build/pakket/tests en native bediening |
| macOS | Bestaande platform-CI beschikbaar; bij bronoplevering nog geen resultaat | Niet als geslaagd geclaimd | CI-build/pakket/tests en native bediening |

De platform-CI wordt op hetzelfde definitieve codepunt gestart. De PR en
overdracht vermelden afzonderlijk de resultaten en resterende controles.
Build-/pakketresultaten bewijzen geen native bediening. Geen SDK, gedeelde
host, notes/presenter, ODP/media, installers of `main` gewijzigd. Het brede
#29 en de bevroren integratiekandidaat blijven buiten deze fix.
