# Writer next-paragraph formatting (#199)

Tested on Windows on 2026-11-09, against main `f4a03889` and the fixed
production Vite bundle in Chromium.

## Reproduction and change

In the original bundle, click the document canvas, press Enter, type `a`,
apply Heading 1 with Ctrl+1, press Enter, and type `a` in the new paragraph.
The paragraph has style `Normal`, but its newly typed text has `Calibri` and
color `365F91`. Its empty `defaultTextFormatting` already contains those
heading values even though the selection context initially reports no color.

The automatic `w:next` transition now replaces the new paragraph's default
text formatting with the resolved destination style, including document
defaults. Missing destination fields remove inherited values. The operation
stays inside the existing input queue and undo capture.

## Validation

- `pnpm exec vitest run --maxWorkers=2`: 176 files passed; 1,992 tests passed,
  10 existing optional tests skipped. Five new engine tests cover Heading 1
  and Heading 2, undo/redo, save/reopen, customized destination styles, absent
  destination formatting, and rejection of an incompatible engine source.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm exec vite build --outDir .local/dist --logLevel error`: passed.
- `scripts/test-tekst-vervolgstijl-gui.mjs`: six browser scenarios passed,
  with no page or console errors. These cover the empty paragraph and first
  real keypress, independent saved-DOCX XML inspection and reopening, immediate
  typing after Heading 1 and Heading 2, splitting inside a heading, and
  preserving deliberate font/color formatting across ordinary paragraph breaks.

The browser script reads `OFFICE_TEST_DIST` and optionally
`OOS_PLAYWRIGHT_MODULE` (a module path for an existing Playwright installation).
It writes the report and saved DOCX to `.local/proef-tekst-vervolgstijl`.
Spelling and autocorrection are disabled in this focused browser test.

The installed native desktop application was not retested. The compatibility
adapter checks each source anchor and fails the build when the pinned engine's
input route changes.
