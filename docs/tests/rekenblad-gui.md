# Herhaalbare GUI-proef voor rekenbladen

Voer vanuit de repository uit:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm exec playwright install chromium
node scripts/test-rekenblad-gui.mjs
```

Linux-CI installeert ook de browserafhankelijkheden met
`pnpm exec playwright install --with-deps chromium`. Zowel de desktopcontrole
als de uitgavebouw voert de proef uit en bewaart het bewijs als artifact.

De proef opent de productiebuild op een eigen lokale poort en maakt vier
afzonderlijke browsersessies. Drie rondes beginnen direct met snel typen in een
cel; de vierde gebruikt F2. De formuletekst moet vóór en na Enter exact gelijk
blijven. Een geldige weekformule geeft 53; een lege aanroep geeft `#VALUE!`.
Daarna moeten invoer, de berekening `7 × 2 = 14`, bewaren en openen in een
nieuwe editorsessie blijven werken.

Voor selectie, inspectie en serialiseren gebruikt de proef de host-API van de
editor. Tekst komt via echte toetsen binnen; heropenen gaat via de bestandsinvoer
van de applicatie. Dit controleert geen volledige muisbediening, extern
klembord, fysieke toetsenbordindelingen, toegankelijkheid of native installaties.

Uitvoer staat in `.local/proef-rekenblad-gui`: het JSON-verslag, vier XLSX-kopieën
en volledige schermafbeeldingen. `OFFICE_TEST_UIT` kiest een andere proefmap;
`OFFICE_TEST_DIST` kiest een andere productiebuild. Met `OFFICE_TEST_CHROMIUM`
kan een reeds geïnstalleerde Chromium-binary worden gebruikt.

De native Linux-proef van 2026.45.6 is afzonderlijk vastgelegd in
[het vrijgaveverslag](2026-11-03-rekenbladkern.json). Een browserproef vervangt
die native controle niet.
