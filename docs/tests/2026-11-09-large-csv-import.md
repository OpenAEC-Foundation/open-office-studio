# Large CSV import stability (#74)

Base: `f4a03889eff1306fe503a72d7acb21c754d5ac8d` (main).

## Confirmed failures

Both new regression tests fail against the original importer:

- A CSV containing 150,000 rows of `0123`, followed by 10,000 empty rows,
  throws `RangeError: Maximum call stack size exceeded` in `csvNaarXlsx`.
  The importer expands every row length into a separate `Math.max` argument.
  Removing empty trailing rows also copies the entire remaining table for
  every empty row.
- A CSV with 1,000 single-column rows followed by a row containing 16,385
  columns reports only one source column. The worksheet truncates at XFD,
  but `afgekapt` remains false because width detection examines only the
  first 1,000 rows.

## Change

Calculate maximum widths with a linear reduction over all parsed rows. Find
the last nonempty row before making a single bounded slice. Retain the
existing worksheet row/column limits, column type handling, and conversion
report route.

The regressions check the last retained cell, code preservation, removal of
empty trailing rows, the XFD boundary, exclusion of XFE, and truncation
reporting for a late wide row.

## Validation

- Targeted CSV tests: 11 passed, including the two previously failing cases.
- Full Vitest suite: 1,989 passed, 10 skipped, zero failures in 175 files.
  Command: `pnpm exec vitest run --configLoader runner --maxWorkers=2`.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm exec vite build --configLoader runner --logLevel error`: passed.
- Changed code passes Prettier and `git diff --check`.

The runner config loader avoids a sandbox directory-access error encountered
with Vite's default config bundler. This requires no product configuration
change.

## Repeatable size probe

Run `node scripts/test-csv-import-groot.mjs`. The script generates a fixed
100,000-row, 30-column CSV with `0123` in the first column and numeric values
elsewhere. It verifies the generated XLSX independently by unpacking its XML,
including the first/last code and final numeric cell AD100000. Failed
assertions produce a nonzero exit code. Measurements are saved under
`.local/csv-import-groot/rapport.json`.

Measured on Windows, Node v24.22.1, while other chats were running:

| Item | Result |
| --- | ---: |
| Input CSV | 6,300,000 bytes |
| Output XLSX | 7,699,162 bytes |
| CSV-to-XLSX conversion | 9,135 ms |
| Process peak RSS | 650,544 KiB |

The peak includes source loading and the independent decompression/XML
checks. These measurements describe this synthetic fixture on this machine;
they are not a performance threshold or a bound on arbitrary input.

## Scope limits

Keep #74 open. This repair covers the synchronous CSV/TSV conversion stage.
It does not establish a whole-application memory budget, background import,
progress UI, smooth scrolling, 50,000-formula recalculation, or a CI timing
threshold. Browser/native interaction was not revalidated in this round.
Existing small-file tests still load the generated XLSX with the actual
spreadsheet engine; the size probe checks the package XML rather than
opening three million cells in the editor.
