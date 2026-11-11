# AltGr vrijhouden voor tekstinvoer (#19)

Basis: `f4a03889` (`main`), 9 november 2026.

De generieke sneltoetsmatcher gebruikte alleen Ctrl/Alt en de fysieke
toetscode. Een gebeurtenis voor bijvoorbeeld `µ` op KeyM met AltGraph en
Ctrl+Alt actief matchte daardoor de opdracht `Ctrl+Alt+M`. Ook het register
reserveerde die invoer ten onrechte als Writer-opdracht.

`past` weigert nu gebeurtenissen waarvoor
`getModifierState("AltGraph")` waar teruggeeft. Echte Ctrl+Alt- en Cmd+Alt-
opdrachten blijven werken. Eenvoudige toetsobjecten zonder deze optionele
methode blijven ondersteund. De methode wordt met de gebeurtenis als `this`
aangeroepen, zoals vereist voor echte browserobjecten.

## Controle

- 43 gerichte Vitest-proeven geslaagd: matcher, sneltoetsregister en
  Writer-profielen, inclusief 7 nieuwe AltGr-proeven. Op de oude code falen
  6 van de 7 nieuwe proeven.
- Chromium met een productiegebouwde React-proef die de echte
  `useSneltoetsen`-hook gebruikt: alle 11 gevallen slagen. Vier AltGraph-
  gebeurtenissen bereiken de invoer zonder `preventDefault` of opdracht;
  zeven controles voor gewone invoer en echte sneltoetsen blijven werken.
  Dezelfde proef geeft vier fouten op de oorspronkelijke matcher.
- De browserproef gebruikt geconstrueerde `KeyboardEvent`-objecten met de
  standaardoptie `modifierAltGraph`; dit is geen proef met een fysiek
  toetsenbord of de native Windows-/macOS-app. Zie de
  [W3C UI Events-specificatie](https://www.w3.org/TR/uievents/#dom-eventmodifierinit-modifieraltgraph).
- TypeScript en de Vite-productiebouw slagen. De sandbox gebruikte
  `--configLoader runner`; de repositoryconfiguratie is niet gewijzigd.

Gerichte proeven herhalen:

```powershell
pnpm exec vitest run src/lint/altgraph.test.ts src/lint/sneltoetsen.test.ts src/lint/sneltoetsenlijst.test.ts src/tekst/bewerken/profiel.test.ts
pnpm exec tsc --noEmit
pnpm build
```

Dit is een deelfix voor #19. De eerdere modale werkruimtesneltoetsfix in
PR #187 staat apart; `useTabSneltoetsen.ts` en de engine zijn niet gewijzigd.
De overige checklistpunten van #19 blijven open.
