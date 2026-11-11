# Spreadsheet sheet and workbook protection (#72)

The Tools ribbon now manages worksheet protection, workbook structure protection
and the selected cells' locked/hidden flags. Protection can be enabled or removed,
with an optional password. Worksheet permissions cover selecting locked/unlocked
cells, cell/row/column formatting, inserting rows/columns, sorting and existing
filters. Password changes and removal first verify an existing verifier.

New passwords use a random 16-byte salt and SHA-512 with 100,000 iterations.
Existing legacy verifiers and SHA-1/256/384/512 ISO verifiers are checked; unknown
algorithms fail without removing protection. This prevents accidental editing;
it does not encrypt the workbook. Existing unrelated protection attributes and
package parts are retained.

The typed API already checks locked targets. The new guard also covers the
legacy keyboard/paste, raw operations, format, range move and profiled routes.
Rejected batches change nothing. Sorting moves unlocked cells with their formats
without granting general formatting permission; filter row changes are scoped
to the approved filter batch. Adding/removing a filter while protected is refused.
Formula-bar and clipboard input hide protected formulas while their calculation
and saved formula remain intact. Selection restrictions cover host navigation,
pointer selection and mixed ranges. The protection dialog remains available when
no cell is selectable.

Cell protection uses native history, including Undo/Redo and save/reopen. Native
format provenance retains the source style's unmodeled XML when deriving the new
protection style. Sheet/workbook settings use the existing package-reload route;
the dialog explains that earlier Undo steps will be cleared.

## Checks

- Twelve actual-core tests cover native cell-format Undo/Redo, opaque style data,
  atomic refusals, unlocked edits, hidden formulas, selection/action permissions,
  allowed sort/filter, source-part preservation, legacy and independent ISO hash
  verification, creating/removing a password and workbook structure preservation.
- The eight existing PR #186 structure regressions also pass. Its raw-operation
  type narrowing and profiled-operation guard are included.
- `scripts/test-rekenblad-beveiliging-gui.mjs` runs the production UI: unlock a
  range with keyboard Undo/Redo; hide a formula; set protection/password/actions;
  accept unlocked input and reject locked input; insert an allowed row; block a
  new sheet; save/reopen; refuse an incorrect password; unprotect; enforce cell
  selection restrictions; unprotect when all selection is disabled.
- `scripts/test-rekenblad-validatie-beveiliging-libre.py` uses LibreOffice's Python
  and UNO with hidden documents and its own short OS-temp profile. It independently
  checks the saved validation rules, cell values, worksheet protection, hidden and
  unlocked cells, formula/cache, wrong/right worksheet password, XLSX round trips,
  and the saved workbook verifier using Python's hashlib. The tested runtime is
  LibreOffice 26.8.2.2, extracted locally rather than installed system-wide.
  The browser scripts write inputs and reports below `.local/`; the Python
  script needs `OPENAEC_CONVERSIE_PROGRAMMA` pointing to that runtime.

## Converter limitation found by the independent control

LibreOffice 26.8.2.2 does not preserve workbook structure protection in this
conversion route: its own in-memory protected control exports without
`lockStructure`, and our protected input re-exports as empty `workbookProtection`.
These observations are recorded as a limitation, not counted as a passing
workbook conversion. Spreadsheet's own XLSX save retains the structure flag,
password fields and hash, and its guards remain effective after reopening.
The format-conversion owner has been informed for #32/#35. Microsoft Excel and
the installed native Open Office Studio application were not exercised here.
