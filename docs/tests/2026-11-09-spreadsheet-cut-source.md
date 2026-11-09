# Spreadsheet cut source isolation (#20)

Base: `f4a03889eff1306fe503a72d7acb21c754d5ac8d` (main).

## Confirmed defects

The shared spreadsheet clipboard remembered only the source sheet index. Cutting
to a different sheet left the source populated. Cutting to another workbook with
the same active sheet index cleared the source coordinates **in the destination
workbook**, potentially deleting unrelated destination cells.

Both defects were reproduced by the first two real-engine regression tests before
the change. They failed respectively on the nonempty source and the erased
destination value.

## Change

The clipboard retains the source editor, sheet ID and workbook version. Source
deletion is validated before destination formatting or content changes. A changed
source workbook requires cutting again: engine sheet IDs are index based, so an
inserted/deleted/reordered sheet must not silently retarget a pending cut.

Within one workbook, destination content and source deletion use one edit request.
Only an overlapping destination on the same source sheet is excluded from source
deletion. With two writable workbook APIs, source deletion runs through the source
editor after the destination succeeds, guarded by the source version. Clipboard
consumption cannot discard a newer copy made while the operation is pending.
Pasting only formatting retains the cut clipboard.

## Validation

- `pnpm exec vitest run --configLoader runner --maxWorkers 4`: 176 test files,
  2,001 tests passed, 10 existing skips. Includes 14 new real-engine regressions.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm exec vite build --configLoader runner`: passed.
- `git diff --check`: passed.
- Production UI at `http://127.0.0.1:1436/`, using disposable unsaved workbooks:
  cut A1 on Blad 1 to C3 on Sheet2; C3 received the text, Sheet2 A1 retained its
  existing text, and Blad 1 A1 became empty. Undo restored the source; Redo emptied
  it again.
- Production UI with two document tabs: the inactive source editor is read-only.
  Pasting the cut into the second workbook was refused with `The editor is
  read-only`; source A1 retained `crossbook-source`, destination A1 retained
  `keep-workbook-two`, and destination C3 remained empty.

The default Vite config bundler cannot traverse the sandbox's parent directories;
`--configLoader runner` avoids that environment restriction. The full asset
prebuild stopped at the unrelated spelling-WASM step because Cargo/its wasm32
target is unavailable. Vite compilation and the spreadsheet UI were verified;
this is not a verified native installer or complete spelling asset build.

## Remaining scope

Issue #20 stays open. This change does not remove the existing read-only mode of
inactive document tabs, so cross-tab cuts are safely refused rather than enabling
the complete move workflow. Two writable workbook APIs have independent Undo
histories; a concurrent source edit after the destination commits keeps the new
source content, reports failure and leaves the already pasted destination intact.
Formula references in other cells are not rewritten as part of this scoped fix.
Other clipboard modules and cross-application clipboard identity are unchanged.
