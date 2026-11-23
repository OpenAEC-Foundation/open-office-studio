# XLSB open/edit/XLSX-save/reopen — #35, P2

Application source: `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
This isolated QA branch changes no product source, catalog, version, or prior delivery.
It belongs to the existing #35 / #30 scope, outside the closed P2 release intake.
`p2-source-binding.json` records Git-blob byte hashes for the eleven relevant
source/profile/engine inputs and the read-only macro/browser route observations.
`p2-parent-package.json` pins the canonical P2 Linux run, parent artifact metadata,
and independently downloaded/digest-verified package-control receipt. Only that
small receipt was downloaded locally; parent ZIP/DEB verification is delegated
to the shared runtime producer and must be checked before runtime consumption.

## Actual source and independent expectation

`shared_formula.xlsb` is the unmodified LibreOffice/core test fixture pinned in
`source-oracle.json`: 7,651 bytes, Git blob `b304e0826c391c4977d55a0eddca74d39138a7ee`,
SHA256 `e06ae79ed345495eee0bf5e7fd7a32638af0b646c5819f7d83a4f6fb97a151a3`.
Its provenance is the linked upstream commit and test; the November 9 runtime
results are historical and are not reused as P2 acceptance.

`oracle.py` reads the source ZIP/BIFF12 records without opening an office runtime:
one binary workbook, Sheet1, 30 numeric formula records, each cached as 3.
A1 contains literal RPN `1+2`; A2:A30 reference the shared `1+2` formula.
The upstream test independently checks 30 formulas and value 3 after recalculation.
The original binary grouping is distinguished from the upstream engine's
normalization into a single 30-cell shared group.

The independent XLSX checker uses Python's standard ZIP/XML readers. Its expected
formulas and values come from the original source, never from converted output.
The one edit is A15 `=40+2`: expect 42 there and 3 in the other 29 formula cells.
Both formulas and cached results are checked for all 30 cells before/after save.

Primary format references: Microsoft [formula records](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xlsb/220abf5e-f561-4333-9fe0-7ac590ed4ad5),
[token IDs](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xlsb/5d7c0c3f-f75f-4306-804f-6f2ebc6bf811),
and [shared-formula references](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-xlsb/dc8d38db-f584-4ff6-b250-a854fe93b365).
The binary source fixture retains its LibreOffice core MPL-2.0 provenance.

## Runtime route and limits

The caller runs **only in isolated Linux CI**. Before runtime execution it requires
the integration coordinator's verified runtime-only artifact binding, checks the
runtime executable digest, pins the P2 tree, and refuses unrelated source changes.
It uses the existing `converteerProef` helper with the P2 production macro-disabled
profile, the actual private LibreOffice binary, production `bereidOpenen`, the
verified vendor WASM and actual workbook edit/save/open methods. A fresh workbook
is reopened from bytes reread from the saved XLSX on disk; reconversion is refused.

This is an actual converter + production TS/WASM content test. It is **not** Rust
IPC, installed native UI, browser interaction, Windows, or macOS acceptance.
No local GUI/capture, no local office runtime, no new full suite or application
build, and no per-format download of the full release ZIP is needed.

Read-only P2 route inspection: `src/formaten.ts` rejects conversion without
`__TAURI_INTERNALS__`; its browser runtime status is unavailable. XLSB is therefore
a desktop conversion input, not a browser-native XLSB route. `src/import/openen.ts`
converts it to XLSX and leaves `exportFormaat` unset, so the native XLSX format is
the save proposal. The test checks that proposal and direct XLSX reopening.

The fixture has no VBA project or external-link part; macros are never executed.
This does not replace the separately owned macro-guard control. No XLS/XLT,
date-system, chart or optional XLSB-export coverage is claimed.

## Status and reproduction

Source-only inspection passes: `python qa/xlsb35-p2/oracle.py`.
Runtime acceptance is pending the dedicated Linux CI result; source inspection
alone is not an XLSB-open pass. The coordinator released runtime artifact
`14805600515`, run `45147346793`, ZIP SHA256
`bac1a37b55deff80cabd4670c1bf65d76266285275c0552436dcc13fcdafa487`.
`runtime-delivery.json` is copied verbatim from `e1f1b84b94fdfa9932f8f33804da9b00c5cf6594`
and checked against SHA256 `1c0e508276b37fbd5b92e55bf113446d7e8522fc1d9e1817bb7722d5b5dd53c6`.
The shared verifier is copied unchanged from producer QA `22a8577d`; its identity
is recorded in `shared-verifier-source.json`. `runtime_input.py` verifies the
complete outer ZIP before using that verifier for the tar, 15,082-entry manifest,
file bytes/modes/symlinks and launcher/ELF. It checks the descriptor's parent
against our independently retrieved P2 package-control receipt. No DEB, recovery
artifact or full installer archive is downloaded by this format consumer.

The workflow runs only this one-source Linux content case. It has no application
build, full suite, Mac job, GUI/capture or release step. Its output artifact keeps
the converted/saved XLSX, independent content checks and exact runtime binding.

The Linux-only caller is `node qa/xlsb35-p2/engine.mjs PROGRAM BINDING_JSON OUTPUT`.
`OOS_XLSB_RUNTIME_EXECUTABLE_SHA256` must come from the verified descriptor.
The final report records the exact application/harness points, source, profile,
WASM and runtime bindings, independent 30-cell XML checks, saved file and limits.
No issue closure, intake change, main merge, release or publication is implied.
