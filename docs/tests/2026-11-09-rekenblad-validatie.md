# Spreadsheet data validation (#68)

The Data ribbon opens a validation rule editor for whole numbers, decimals,
lists, dates, times, text length and custom formulas. Lists accept a quoted
comma-separated source, a cell range or a defined name (with local names taking
precedence). The selected cell shows the input message and an accessible list.
Invalid existing values can be circled without changing the workbook.

Validation runs against a temporary copy of the actual workbook before the
legacy editor input, paste, raw cell operations and typed edit batches commit.
A stop alert rejects the batch; warning and information alerts ask before
committing. A rejected edit leaves the document version, values and history
unchanged. Formula constraints use the installed calculation engine and report
an error if calculation fails. There is no JavaScript expression evaluation.

Rules use standard SpreadsheetML `dataValidations`, rather than a private-only
format. Hidden local defined names track rule ranges and formula references
through structural operations and native Undo/Redo. Save updates the associated
rule XML; unrelated package parts remain present. The names manager hides these
internal names. Extended source validation is preserved and displayed read-only.

## Verification

- 17 actual-core tests cover all seven rule types, fixed/range/named lists,
  local name precedence, atomic refusals, warnings/information, blanks, disabled
  alerts, structural shifts, formula strings, rename, Undo/Redo, save/reopen,
  unknown-part preservation, stale/invalid typed requests and idempotent setup.
- `scripts/test-rekenblad-validatie-gui.mjs` exercises the production browser
  build: existing dropdown/input message; invalid keyboard input; circling and
  clearing an invalid source value; editing a rule; creating a number rule;
  warning cancellation/acceptance; serialization and opening the saved XLSX.
  It saves an XLSX, screenshot and JSON report under `.local/proef-validatie/`.
- Full suite: 2,023 passed and ten existing skips in 179 files. TypeScript and
  the spreadsheet translation check pass. Dutch and English
  strings are supplied; other locales currently use the English additions.

## Practical limits

Changing rule definitions uses the existing package-reload mechanism and clears
earlier Undo steps; the editor says this before saving. Ordinary validated
cell edits keep native Undo/Redo. A dropdown source is bounded at 10,000 cells;
the explicit invalid-data scan is bounded at 100,000 cells per sheet, with an
error rather than silently incomplete results. Formula rules have the same
function support as the installed calculation engine. The temporary formula
evaluation needs an unused cell near the bottom right of the cloned sheet;
calculation errors are refused. This does not modify the user's sheet.

This is browser and actual-WASM verification. An installed native application
and Microsoft Excel were not exercised for this change. The branch also
contains the existing PR #186 and #198 changes needed by the assigned protection
and comments work; those issues remain broader than those prerequisite fixes.
