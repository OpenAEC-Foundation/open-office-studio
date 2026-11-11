# Formules en namen bij rij-/kolombewerkingen — #60

De bestaande echte rekenkern past de onderzochte verwijzingen correct aan.
Deze levering voegt uitsluitend ontbrekende gerichte regressiedekking toe;
er wordt geen productiebug of nieuwe rekenkernwijziging geclaimd.
Basis: `10611570`, SDK 0.5.1, Windows x64, Node 24.22.1.

`src/rekenblad/structuurverwijzingen.test.ts` bevat **38 proeven**:

- 16 grensgevallen voor rijen/kolommen invoegen vóór, binnen of na een bereik,
  eerste/middelste/laatste cellen verwijderen, verwijderen vóór een bereik en
  volledige verwijdering met `#REF!`.
- 18 varianten voor hoofdletters, geciteerde bladnamen met apostrof/Unicode,
  een formule over meerdere bladen, lokale/globale naamketens, hele rijen of
  kolommen, `OFFSET` met vaste grootte, `INDEX` met vaste positie en een
  berekende naam. Een extra waarde buiten het bedoelde bereik detecteert
  onterechte uitbreiding op het andere blad.
- Vier geïmporteerde namen met losse gebieden, met/zonder haakjes, voor beide
  assen. De naamdefinities verschuiven correct ondanks de begrenzing van de
  gewone naam-aanmaakroute.

Alle gevallen controleren opslaan/heropenen en één Undo/Redo. Voor de gewone
en berekende namen zijn de verwachte getallen onafhankelijk vooraf vastgelegd;
de proeven vergelijken ook de volledige formule-/naamtoestand. Bij losse
gebieden wordt uitsluitend de structurele naamdefinitie gecontroleerd; volledige
berekening/authoring van union-namen wordt hier niet als ondersteund geclaimd.

## Uitgevoerde controles

| Runtime | Gerichte controle | Uitkomst |
| --- | --- | --- |
| Gedeelde achtpatch-WASM `52b25be9…91cfa` | Nieuwe structuurmatrix | 38/38 geslaagd |
| Inkomende veertienpatch-WASM van PR #319, exact `91b9feea05bbf0610a745a5b29cb57b0ef68e59aa3243248ffe946e0bc8c5437` | Nieuwe structuurmatrix + bestaande naam-bindingtests | 54/54 geslaagd |
| TypeScript | `pnpm exec tsc --noEmit` | Geslaagd |

Beide runtimecontroles zijn lokaal met dezelfde nieuwe testbron op Windows
uitgevoerd via de echte JS/WASM-API. Er is geen wijziging aan de gedeelde vendor
of metadata gedaan; de expliciete omgevingsvariabele kiest alleen de tegenproef.
Dit is geen native GUI-/installercontrole op Windows, Linux of macOS. De normale
CI kan dezelfde tests op de overige platforms draaien. Er is geen productiebouw
of volledige combinatestsuite herhaald voor deze levering met uitsluitend tests;
de volgende integratie toetst de volledige combinatie op één vastgelegd codepunt.

```powershell
pnpm exec vitest run src/rekenblad/structuurverwijzingen.test.ts --configLoader runner --maxWorkers 1
pnpm exec tsc --noEmit
# Met een expliciet gekozen inkomende kernel:
$env:OOS_REKENBLAD_WASM = (Resolve-Path .local/startup14.wasm).Path
pnpm exec vitest run src/rekenblad/structuurverwijzingen.test.ts src/lint/rekenblad-namen.test.ts --configLoader runner --maxWorkers 1
Remove-Item Env:OOS_REKENBLAD_WASM
```

#60 blijft open. Deze afbakening bewijst geen celverschuifopdrachten,
splitsvensters, volledige 3D-/externe-verwijzingsmatrix, array-/spillgedrag of
alle tabel- en objectverwijzingen. Er is geen nieuwe foutmelding aangemaakt
voor gedrag dat in de onderzochte bestaande kern al correct werkt.
