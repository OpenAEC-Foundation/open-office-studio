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

Repeat the focused tests with:

```sh
pnpm exec vitest run src/tekst/afbeelding src/rekenblad/klembord-tabelgrens.test.ts src/rekenblad/klembord-maten.test.ts
pnpm exec tsc --noEmit
```
