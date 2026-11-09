# Writer table sort values (#48)

Tested on Windows on 2026-11-09 against main `f4a03889` and the fixed
production Vite bundle in Chromium.

## Reproduction and change

`leesDatum` previously passed invalid calendar components to `Date.UTC`.
For example, `31-02-2026` became March 3 and `2026-13-01` became January 1
of the following year. These values were recognized as dates and sorted
among real dates. Four-digit years below 0100 were silently shifted to the
1900s. The numeric reader also accepted partial values: `31-02-2026` became
31, `12 dozen` became 12, and `1e` became 1.

Calendar components now round-trip through a UTC date without rollover or
the year-0–99 offset. Invalid dates return null. Numeric parsing requires a
complete match after the existing currency/percent/separator normalization,
preventing rejected dates from being guessed as numbers. The shared numeric
reader also makes simple table sums stop at nonnumeric labels instead of
adding their numeric prefixes. Valid supported numbers and date notations
retain their behavior.

## Validation

- 27 value/sorting tests: 17 failed against the old implementation; all pass
  after the fix. These cover invalid day/month combinations, leap centuries,
  supported date forms and early years, numeric prefixes, valid currency,
  decimal and exponent forms, stable sorting, header rows and type guessing.
- Two real-engine tests exercise the actual sort command in both directions.
  Cell text and formatting stay with each row, Undo/Redo restores the order,
  and saved/reopened DOCX retains both order and bold ID cells.
- Full suite: 177 files passed, 2,016 tests passed, 10 existing optional tests
  skipped (`pnpm exec vitest run --maxWorkers=2`).
- `pnpm exec tsc --noEmit` and production Vite build passed.
- Four production-browser checks passed: type inference and ascending sort;
  Undo/Redo; descending sort with invalid/empty values stably last; saving and
  reopening without changing the original date strings. No browser errors.

Run `scripts/test-tekst-sorteerwaarden-gui.mjs` with `OFFICE_TEST_DIST` pointing
to a production bundle and optionally `OOS_PLAYWRIGHT_MODULE` pointing to an
existing Playwright installation. Reports and the sorted DOCX are written to
`.local/proef-sorteerwaarden`. The focused browser test disables spelling and
autocorrection. The native installed application was not retested.

This addresses sort-value recognition within #48; the broader table feature
issue remains open.
