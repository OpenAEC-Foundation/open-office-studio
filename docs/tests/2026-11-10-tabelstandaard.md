# Impliciete standaardcellen en tabelopmaak (#324)

## Afbakening en codepunt

De oorspronkelijke weergave sloeg cellen over zodra `captureFormat().sourceStyles`
`null` bevatte. Daardoor verdwenen ook volledig gedefinieerde custom-DXF-koppen
en rijbanden als een cel geen expliciet `s`-attribuut had. Dit is onafhankelijk
van de ingebouwde-stijlopzoeking in #322.

- Baseline: `1e5afa399117fd84df628955ec82b0e597993c83`.
- Vast functioneel codepunt: `a932c060752e16b714d44324c84cda72d03cc923`.
- Alleen de tabelprojectieguard en de nieuwe helper `tabelopmaakVoorrang.ts`
  veranderen productiegedrag. Latere commits voegen de proef, CI-koppeling en
  dit bewijs toe; de applicatiecode blijft gelijk aan dit vaste codepunt.
- De bestaande acht-patchkern blijft bytegelijk:
  `52b25be9f50cb30215a547d5ee074eefc00c8a3726b19c0a3dc83870fda91cfa`.
  Er is geen vendor-, SDK-, converter- of native bronwijziging.

`null` gebruikt nu de toepasselijke standaard-XF. Voor impliciete cellen worden
ook de actuele effectieve font-/vulfacetten vergeleken met die standaard; zo
blijven werkelijke geërfde rij-/kolomfacetten behouden. Expliciete cel-XFs en
latere voorwaardelijke projecties houden hun voorrang. Onbekende provenance of
een ontbrekende XF blijft conservatief. De helper leest alleen de al aanwezige
stijlenmetadata en de bestaande begrensde `captureFormat`-uitvoer; hij scant
geen werkblad en wijzigt geen model.

## Gerichte regressie en tegenproef

De definitieve nieuwe regressiefile is met de oorspronkelijke guard uit de
baseline uitgevoerd. Alle 12 gevallen falen; de oorspronkelijke bron is
daarna bytegelijk hersteld naar het vaste functionele codepunt. Met de fix
slagen diezelfde 12 gevallen. De uitgebreidere gerichte set slaagt 53/53:

```text
src/rekenblad/tabelstandaard.test.ts               12
src/rekenblad/tabelweergave.test.ts                 2
src/rekenblad/tabellen.test.ts                     13
src/rekenblad/celstijlen.test.ts                     8
src/rekenblad/voorwaardelijke-weergave.test.ts       10
src/rekenblad/voorwaardelijke-dxf.test.ts             8
```

De nieuwe gevallen gebruiken de echte gepinde WASM en gecontroleerde custom
DXFs, zonder ingebouwde-stijl-fallback. Ze vergelijken expliciete/impliciete
cellen, gemengde font-/vulvoorrang, ontbrekende cellen met rij-/kolomopmaak en
rijvoorrang, echte latere CF, bewerken/Undo/Redo en opslaan/heropenen. Scherm,
profiel en afdruk worden gecontroleerd; lezen/tekenen houdt bytes, versie en
Undo-toestand gelijk. XF0-varianten omvatten standaardvulling zonder type,
geen vulling, solid, patroon, RGB-fontkleur, lege kleur, het bestaande
underline-tokenpad en uitgeschakelde apply-vlaggen als `0`/`false`.

TypeScript (`tsc --noEmit`) en de expliciete Vite-productiebouw slagen op
Windows. Er is lokaal geen native installer gebouwd of geïnstalleerd.

## Echte productie-browserroute

`scripts/test-rekenblad-tabelstandaard.mjs` opent de twee zelfstandig gemaakte
XLSX-bestanden via de gewone bestandsinvoer van de gebouwde app in Chromium
151.0.7922.34 op Windows. Het inspecteert de werkelijke scherm-/profiel-/
afdrukprojecties, opent met Ctrl+P het normale afdrukvoorbeeld, controleert de
blauwe kop- en rijbandpixels, slaat met Ctrl+S op en heropent in een nieuw
browserprofiel. Beide gevallen slagen zonder paginafouten.

De koptekst is wit/vet op `#365f91`, de eerste rijband is `#dce6f1`.
`styles.xml`, `sheet1.xml` en `table1.xml` blijven bij de gewone opslag
bytegelijk. Het voorbereiden van de afdruk verandert ook de native opslagbytes,
versie en Undo-toestand niet. De gehele ZIP mag door de normale opslagroute
een andere checksum krijgen; die checksums staan afzonderlijk in het bewijs.

- [Machineleesbare browseruitvoer](tabelstandaard-2026-11-10/browser.json)
- [Schermopname van impliciete cellen](tabelstandaard-2026-11-10/screen.png)
- [Werkelijk afdrukvoorbeeld](tabelstandaard-2026-11-10/print.png)

Dit is een productie-browser- en afdrukvoorbeeldproef. Er wordt geen echte
printer, PDF-export, native permissiedialoog of geïnstalleerde desktopbediening
als geslaagd opgevoerd.

## Afstemming en platformcontroles

#324 is door de bestaande integratiechat aan deze chat gereserveerd. Met de
eigenaar van #322 zijn de twee wijzigingen aan `tabelweergave.ts` vooraf
afgestemd. Na het verplaatsen van één import voegt `a932c060` mechanisch schoon
samen met zijn `63761df06ad7ea125a3e03c50b21caa88dca9fb3`:
gecombineerde bronboom `8d2e9b74ed0f3914dbc82730d4b58bd6b8096057`.
De eigenaar van #322 heeft op diezelfde combinatie 41 gerichte tests in zes
bestanden, TypeScript en de productiebuild uitgevoerd: alles geslaagd. Zowel
zijn expliciete-stijl0-fixture als de oorspronkelijke impliciete openpyxl-
Medium2-fixture slaagt voor zes echte browserstappen: zichtbare headerpixels,
celinvoer, Ctrl+S-download, opgeslagen B2=6, heropenen en behouden tabel-/
stylesheet-XML. Er zijn geen JavaScript-fouten. Zijn lokale controlecommit is
`0425dc4b98a18efef615901161db9bd368b71a62`. Dit resultaat wordt hergebruikt;
de twee zelfstandige bronfixes blijven afzonderlijk. De combinatie is niet als
geïnstalleerde native bediening geteld.

De [PR-controles](https://github.com/OpenAEC-Foundation/open-office-studio/pull/333/checks)
lopen voor Windows, Linux en macOS op één en dezelfde gepubliceerde PR-head.
De bestaande gezamenlijke matrix op a932c060 is geslaagd. De nieuwe browserproef
is ook aan de bestaande rekenbladmatrix gekoppeld,
inclusief screenshots en JSON-artifacts. Bij het vastleggen van deze overdracht:

| Platform/route   | Functioneel bewijs                                                                             | Build/pakket                                                 | Native bediening                           |
| ---------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| Windows Chromium | 53 gerichte WASM-tests, productie-upload/afdrukvoorbeeld/opslag/heropenen geslaagd op a932c060 | TypeScript + expliciete Vite-bouw geslaagd; desktop-CI loopt | Niet uitgevoerd met deze fix               |
| Linux CI         | Gezamenlijke matrix loopt op de PR-head                                                        | Desktop-CI loopt                                             | Geen interactieve native testhost gebruikt |
| macOS CI         | Runner/resultaat nog af te wachten                                                             | Pakketcontrole nog open                                      | Niet uitgevoerd met deze fix               |

Een wachtende of lopende controle is geen geslaagde controle. De actuele
exacte head en latere CI-resultaten staan bij de PR en de centrale overdracht.
De functionele bron uit dit rapport verandert daarbij niet. `main` en de
bestaande geïnstalleerde/frozen applicatie zijn niet gewijzigd.

## Herhalen

```powershell
pnpm exec vitest run src/rekenblad/tabelstandaard.test.ts src/rekenblad/tabelweergave.test.ts src/rekenblad/tabellen.test.ts src/rekenblad/celstijlen.test.ts src/rekenblad/voorwaardelijke-weergave.test.ts src/rekenblad/voorwaardelijke-dxf.test.ts --maxWorkers=1
pnpm exec tsc --noEmit
pnpm exec vite build --outDir .local/dist-324
node scripts/test-rekenblad-tabelstandaard.mjs
```
