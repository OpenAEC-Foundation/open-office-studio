# TOC page-only updates match complete headings (#50)

Base: `f4a03889eff1306fe503a72d7acb21c754d5ac8d` (main).

## Reproduction

Create a Writer document with `Plan` at heading level 3 and `Plan aanpak` at
heading level 1. Insert a table of contents limited to two levels, without
hyperlinks. Then update only page numbers. The previous text fallback matched
`Plan aanpak` against `Plan`, even though that shorter heading was excluded from
the TOC. For example, the longer heading received page 19 instead of its page 27.

This happens with right-aligned page numbers and with inline page numbers. The
plain paragraph-text helper omits Word tab elements; splitting that text on a tab
does not recover the heading boundary. The fallback also accepted any heading
that was a prefix of the entire TOC row.

Five cases in the initial nine-case regression set failed before the change:
both page-number layouts, equal titles at excluded/included levels, and both
layouts with the original heading removed from the source list.

## Change

Read the actual final inline `w:tab` position to isolate the title. Without a tab,
strip a supported trailing page label separated by whitespace. Match the complete
normalized title against unused headings within the configured TOC levels. A
missing heading is left untouched by a page-only update; updating the whole TOC
remains the way to add or remove entries. Skip page-only updates entirely when
the TOC does not display page numbers, preserving titles such as `Plan 1`.

## Validation

- `node node_modules/vitest/vitest.mjs run --configLoader runner --maxWorkers 2`:
  1,999 passed, 10 existing skips, one 5-second timeout in the unchanged
  translation-catalog check. Running `src/i18n/i18n.test.ts` independently passed
  all 17 tests (553 ms test time), resolving that timeout without a code change.
- 13 new regression cases pass, including two real Yrs-engine edits followed by
  DOCX saving and reopening. Cached page labels survive both layouts, and a
  repeated page-only update is a no-op. The input bytes remain unchanged.
- The existing 24 page-function tests pass alongside the new tests.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `node node_modules/vite/bin/vite.js build --configLoader runner`: passed.
- `git diff --check`: passed.

The tests also cover repeated heading names, headings ending in digits or Roman
characters, Roman/alphabetical/unknown page labels, excluded levels, and TOCs
without page numbers. The production dialog and native installers were not
separately exercised. The real package update and document storage engine were
tested directly; a complete generated-asset build is not claimed.

Issue #50 remains open for its broader requirements, including ODT and lists of
figures/tables. No revision-comparison code (#57), header code, image code, or
shared XML/text helper changed.
