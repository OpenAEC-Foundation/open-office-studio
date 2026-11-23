# UOT-only P2 real-file probe (#30)

Integrationchat assigned only `.uot` after the UOS completion. Branch `codex/uot-qa-2026-11-23-e0d7` starts at P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`. Prior STC/UOS evidence stays unchanged. New QA files only: no product/catalog/version/main/tag/release/late intake changes, no suite/app/Mac builds or local GUI/capture/profile changes.

## Source and independent expectations

`fixture.json` binds `alexschiller/file-format-commons@0d508180dfeece7ac8b3e87bd2093755e3f356b1:files/ffc_1.uot`, first published in 2015, generated in OpenOffice 4.0.1 in 2014, CC0. Actual UOF1 plain XML root/namespace/text MIME are asserted with source SHA/Git-blob/size checks. This is neither a renamed ODT/DOCX nor a self-exported import fixture. License and README are downloaded at the same immutable commit and separately hash-verified.

Python stdlib `oracle.py` derives source text, one body paragraph, Standard style, single line spacing and zero applied headings/tables. The original source encodes two embedded CR characters as `&#x0d;` references, not literal XML line endings. Retain decoded XML text separately and canonicalize CR/CRLF/LF to LF for logical-line comparisons on both sides; never trim or collapse whitespace, and require both breaks including the trailing one. An unused Heading style definition is not a heading paragraph. The source has no explicit font family/size on the used paragraph, so no font fidelity is claimed. Output style identifiers may legally be remapped; check effective ordinary paragraph/line spacing semantics through the style chain and defaults. Source text and expected edit never derive from converter or engine output. Insert `QA_UOT_23NOV ` at the start, Undo to source text, Redo, DOCX save/fresh engine reopen and second save. Independently inspect both saved OOXML packages for text/paragraphs, zero tables/headings and line spacing.

Initial source-only CI `45154155907` rejected the harness assumption that XML parsing would turn the CR character references into LF. Inspection of the unchanged hash-pinned source showed two literal `&#x0d;` references. The corrected oracle preserves the decoded source and explicitly compares logical line endings; that failed run executed no Office converter or Word engine and is not a product fault.

## Runtime and production engine

Reuse runtime-only artifact `14805600515`, no full installer archive or new build. `runtime-input.json` pins the full ZIP/tar digests, shared consumer, manifest (15082 entries), launcher/ELF, producer and parent P2 DEB/job/source identity. Verify the full downloaded ZIP, coordinator Git descriptor and separate base artifact descriptor, then use the unchanged shared consumer. Execute only the verified private CLI, exact P2 safe conversion profile/arguments in an isolated temporary profile, 45-second limit, no system fallback or GH credentials in the Office child.

Production `bereidOpenen` validates the conversion result and actual save proposal. The existing P2 `openProductieTekstkern` helper loads the real patched Word engine/SDK graph in isolation without changing node_modules. Both edit/layout WASM hashes and production JS patch bindings are recorded; no mock engine or manually manufactured DOCX output. All execution is Linux CI.

## Limits and coordination

This is one small UOF1 UOT route. No UOF2/UOT export, real heading/table import, visual fidelity, font rendering, macro or arbitrary-document guarantee. Converter/helper/engine proof does not establish packaged native UI, Tauri IPC, installer or standalone acceptance. Windows/macOS native runtime checks are not run in this Linux-only assignment. Browser check calls the real negative capability/open functions in Node with an empty window and no Tauri bridge mock; hosted browser UI is not tested. No local recording session is started.

Before choosing work, integrationchat claimed UOT exclusively. Issue #30 plus open/closed UOT, UOF and "Unified Office" descriptions/searches were checked; no specific duplicate was found. A new independent product problem requires a separate focused duplicate search and coordinator handoff before issue registration. No other format is claimed automatically.
