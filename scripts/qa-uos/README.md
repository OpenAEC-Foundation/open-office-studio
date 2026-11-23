# UOS-only independent P2 probe (#30)

Integrationchat assigned only `.uos`. `.uot`, `.uop`, XLSB and the completed STC branch are outside this scope. Application P2 is frozen at `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`. Only new QA files change; no product/catalog/version/release/main edits.

## Independent fixture and oracle

`fixture.json` binds immutable bytes, Git blob, publication, metadata and CC0 license of `alexschiller/file-format-commons`' original `files/ffc_1.uos`. Published in 2015, generated with OpenOffice 4.0.1 in 2014. Actual UOF1 plain XML namespace, root and spreadsheet MIME are asserted. It is neither a renamed ODS/XLSX nor a file exported by this probe. Preserve original header `pxl`; this text does not determine the format. Source README and license bytes are separately hash-verified and retained in evidence. No upstream bytes are committed or changed.

`oracle.py` uses only Python stdlib, original UOF XML and planned edits. It derives three sheet names/order and all 156 populated cells (4 text, 152 numeric). Original formula count is explicitly **zero**: pre-existing UOS formula import is untested. No claim for UOF2 or arbitrary UOS files. An added `=SUM(A2:D2)` must yield 2 from source values, 9 after A2=7, 2 on Undo and 9 on Redo. Sheet2!A1 gets test text. Independent XLSX XML verification checks exact populated address sets, values, types, formula and cached result.

## Runtime and application binding

Reuse coordinator runtime-only artifact `14805600515` (no new suite build or full 4 GB archive). `runtime-input.json` pins the producer/run, complete ZIP SHA, tar SHA, unchanged shared consumer SHA, 15082-entry manifest, launcher/ELF and inherited parent DEB identity. `runtime_input.py` independently verifies the Git coordinator descriptor and its separate base-artifact descriptor pin, full downloaded ZIP and shared consumer checks before execution. Private executable only, P2 safe conversion profile, isolated temporary user profile, production CLI arguments, 45-second timeout; no system Office fallback. Office child does not inherit GH credentials.

Production `bereidOpenen` performs real opening policy and package validation through an explicit private CLI adapter. Actual pinned XLSX WASM opens, checks all source values, edits, recalculates, performs Undo/Redo, saves XLSX and opens a fresh workbook. No mocked workbook engine or XML-manufactured conversion output.

## Honest acceptance boundaries

All runtime execution is Linux CI. This is converter/helper/engine proof, not packaged UI, Tauri IPC, installer, standalone/native Office acceptance. Windows/macOS UI are not run. Browser boundary is checked through real production capability/open functions in Linux Node with an empty `window` and no Tauri mock; no hosted browser UI is claimed. No visual/formatting/chart/macro acceptance or UOS export claim. No local GUI/capture/profile changes.

Before starting, issue #30 and open/closed UOS, UOF and "Unified Office" issue descriptions/search results were checked: no matching specific issue. No new issue is warranted without an independent reproduced problem.

Workflow is restricted to this QA branch and own script paths, with no PR/suite build. Source, browser boundary and approved runtime jobs retain independent receipts/artifacts. Run locally only static inspection/syntax checks; actual runtime runs in Linux CI.
