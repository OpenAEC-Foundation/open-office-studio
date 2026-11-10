# Presentatie: objectopmaak kopiëren (#80)

**Schikken → Opmaak kopiëren** kiest een bron en één of meer doelen op de
huidige dia. Vulling, rand en effecten en tekstopmaak kunnen afzonderlijk
worden toegepast. Het venster beschrijft dat de eerste bronalinea en
tekststijl op alle doeltekst worden toegepast. Tekst, velden, hyperlinks,
object-ID's, geometrie, afbeeldingen en overige pakketgegevens blijven
behouden. De bron verandert niet.

De bediening ondersteunt vormen, tekstvakken, verbindingslijnen en
afbeeldingsranden. Groepen, tabellen en grafieken zijn uitgesloten van deze
eerste bediening; zij krijgen geen onbedoelde wijzigingen. Bij tekstopmaak
zijn doelen zonder tekst niet selecteerbaar. Bronwisselingen verwijderen
ongeschikte geselecteerde doelen. Vulling kan een kleur, verloop of andere
bestaande DrawingML-vulling zijn; dezelfde-dia-relaties blijven beschikbaar.

Tekstopmaak combineert de directe eigenschappen van de eerste alinea en
tekstreeks met alinea-/lijststandaarden in het bronobject. Voor geërfde
basistypografie worden font, grootte, kleur, vet/cursief/onderstreping en
uitlijning uit de publieke native displaylist gelezen. Die uitlezing gebeurt
eenmaal bij openen. Geavanceerde opmaak die uitsluitend in master/layouts is
vastgelegd, wordt nog niet volledig gematerialiseerd. Kopiëren tussen dia's
met verschillende thema's valt buiten deze bediening.

Alle doelbewerkingen vinden plaats in één pakketmutatie. De dialoog meldt
vooraf dat herladen een nieuwe undo-geschiedenis begint. Een gewijzigde
documentversie, andere API of alleen-lezen opdrachtstatus blokkeert toepassen.

## Verificatie

- 13 tests in `src/presentatie/opmaakKopie.test.ts` met de echte PPTX 0.5.1-kern:
  meerdere doelen, vulling/rand, tekstopmaak, native save/heropenen, geërfde
  titeltypografie, uitsluitend object-/tekstopmaak, doelhyperlinks en
  extensies, verloop, beeldbytes/uitsnede/transparantie, alinea-defaults,
  veldidentiteit/waarde, geen bronhyperlink overnemen, atomair weigeren en
  overige pakketonderdelen/interne relaties.
- Zes productie-Chromiumgevallen in `scripts/test-presentatie-opmaak-kopie.mjs`:
  echte bron-/doelselectie, meerdere objecten, geërfde titelopmaak, beeldrand,
  annuleren/selectieveiligheid, verouderde bewerking en echte Opslaan als-
  download met onafhankelijk native én nieuwe browsercontext-heropenen.
  Geen paginafouten; de donkere dialoog is visueel beoordeeld.
- Volledige suite: **2806 geslaagd, 10 bestaande skips, 270 bestanden**,
  twee workers en 15 seconden testlimiet. TypeScript, Vite-productiebouw en
  localecontrole slagen. Alleen de 23 bestaande niet-aangeboden taalmappen
  geven waarschuwingen.

Basis is het vastgelegde integratiecheckpoint
`0d860e9d5487ff3b87dc079f943d31aef8fe5871`, met PPTX/PPTX React 0.5.1 en de
geteste legacySyncApi. De eigen vervolgbranch wijzigt geen SDK-versies,
native kern, slotbestand of centrale integratiebranch.

Reproduceren na productiebuild en de gebruikelijke assetkopie:

```powershell
node node_modules/vitest/vitest.mjs run src/presentatie/opmaakKopie.test.ts
$env:OFFICE_TEST_DIST='.local/presentation-build'
node scripts/test-presentatie-opmaak-kopie.mjs
```

Zo nodig wijst `OFFICE_PLAYWRIGHT_MODULE` naar de geïnstalleerde Playwright-
module. Browserartefacten staan in `.local/proef-presentatie-opmaak-kopie`,
de volledige testuitslag in `.local/format-all-tests.json`. Native installers
en ODP/PPT-conversie zijn voor dit vervolg niet opnieuw getest. #80 blijft
open voor hulplijnen en de genoemde uitgebreidere opmaakgevallen.
