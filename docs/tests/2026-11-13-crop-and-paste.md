# Writer crop boundaries and Spreadsheet clipboard comments

Two bounded fixes within #49 and #20. Both parent issues retain their remaining
feature and platform acceptance work.

## Reproduced failures

- Writer: with 15% cropped left and 20% right, dragging the left handle past the
  right boundary changed the untouched right edge to 16.52%. The intended result
  is 75% left, 20% right, leaving the existing minimum of 5% visible. The fix
  clamps only the dragged edge. Corner handles clamp each axis independently.
- Spreadsheet: HTML comments containing `<tr><td x:num="99">…` were pasted as
  extra cells, and their hidden numbers reached the numeric callback. A comment
  containing closing table tags also split visible cell text into extra rows.
  The existing tag tokenizer now removes comments inside the selected table
  before row parsing, while preserving actual tags and their quoted attributes.

The new regressions fail on unmodified main `0826862c`: seven crop cases and two
clipboard cases. After the fix, all 37 focused tests pass across image geometry,
image replacement, cropping, clipboard dimensions and table boundaries.
TypeScript and `git diff --check` pass.

The crop integration test uses the actual Yrs engine: crop, Undo, Redo, DOCX
save and reopen. It independently checks saved crop XML and allows only the
half-EMU rounding inherent in DOCX dimensions (1 EMU = 1/9525 pixel).
Pointer and keyboard crop input both call the tested `sleepGreep` helper.
This is not a claim of new native mouse/keyboard platform acceptance.

## Production browser and CI follow-up

The ordinary production build at `9b8624f9` also passes Chromium interaction:
open a DOCX with a 320×160 px image cropped 20% above and 30% below, select it,
open Crop, and move the top handle twelve times with Shift+Down. The top stops
at 65% and the bottom stays at 30%. Up moves back to 64%; dragging the top
handle 200 px down stops at 65% again. Saving through Ctrl+S produces crop XML
`t="65000" b="30000"` and dimensions `cx="3048000" cy="152400"`, with no page errors.

The first CI matrix run failed in the existing hyperlink GUI helper before a
mouse click: its asynchronous `waitForFunction` predicate was accepted as a
truthy Promise even when it resolved to `false`. A standalone Playwright probe
reproduced this, and the installed polling implementation confirms it checks
the predicate result without awaiting it. The helper now uses a synchronous
predicate with state across animation-frame polls, requires two stable
intervals and validates finite coordinates before clicking. It keeps the
existing timeout, real mouse input and every product assertion.

Repeat the focused tests with:

```sh
pnpm exec vitest run src/tekst/afbeelding src/rekenblad/klembord-tabelgrens.test.ts src/rekenblad/klembord-maten.test.ts
pnpm exec tsc --noEmit
```

All 20 object/hyperlink GUI scenarios pass with both the current engine and the
pinned query-capable engine after this helper correction (40 scenarios total).
The two product fixes are unchanged by the CI follow-up.
