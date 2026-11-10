# Escape bij gemengde dialoogvensters — deel van #24

## Fout en correctie

`Modal` en `Dialoog` hielden elk hun eigen lijst met open vensters bij.
Bij twee gemengde vensters en focus op `document.body` verwerkte de listener
van het onderste venster Escape als eerste. Dat sloot het verkeerde venster,
verplaatste de focus naar de achtergrond en verwijderde daar `inert`, terwijl
het bovenste venster nog openstond.

Beide componenten registreren zich nu bij dezelfde dialoogstack. Alleen het
laatst geregistreerde venster mag Escape zonder actieve bediening afhandelen.
Sluiten ruimt de registratie en listener op. De bestaande afhandeling van
Escape binnen een venster en het focusherstel blijven van toepassing.

## Onafhankelijke browserproef

Getest op Windows met headless Chromium via Playwright, met een Vite-productiebouw
van een React-proefpagina die de echte `Modal` en `Dialoog` importeert. De pagina
opent eerst het onderste venster en vervolgens het bovenste. Een knop in het
bovenste venster verwijdert zichzelf bij klikken; dit brengt de focus werkelijk
naar `body`, zonder een nagebootste toetsafhandeling.

Voor de correctie faalden beide volgordes: `Modal` onder `Dialoog` en `Dialoog`
onder `Modal`. Na Escape bleef uitsluitend **Bovenste** open, kreeg **Begin**
buiten de vensters focus en had de achtergrond geen `inert` meer.

Na de correctie slagen vier scenario's: beide venstervolgordes, elk met behouden
focus en met weggevallen focus. Bij behouden focus zijn ook Tab en Shift+Tab
binnen het bovenste venster gecontroleerd. In alle gevallen:

- sluit de eerste Escape uitsluitend het bovenste venster;
- blijft de achtergrond `inert` en krijgt de openingsknop in het onderste venster focus;
- sluit de volgende Escape het onderste venster en wordt de achtergrond weer bereikbaar;
- werkt opnieuw openen en sluiten zonder achtergebleven listener.

## Overige verificatie

- `pnpm exec vitest run --configLoader runner --maxWorkers=2`: 176 bestanden,
  1.991 geslaagde tests, tien bestaande overgeslagen tests.
- Vier nieuwe stackregressies controleren sluitvolgorde, al afgehandelde toetsen,
  focus binnen het venster, afwijkende opruimvolgorde en opnieuw registreren.
- `pnpm exec tsc --noEmit`: geslaagd.
- `pnpm exec vite build --configLoader runner`: geslaagd.
- `git diff --check`: geslaagd.

Dit is een gerichte deelfix. De bredere toegankelijkheidscriteria van #24,
waaronder NVDA en VoiceOver, zijn hiermee niet afgetekend. #24 blijft open.
