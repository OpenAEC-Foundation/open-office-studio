# SDD-only native-source presentation probe (#30)

Integrationchat exclusively assigned historical StarOffice Impress `.sdd`. Own branch starts at P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`. Earlier STC/UOS/UOT/UOP evidence stays intact. Only own QA files change; no product/catalog/intake/version/main/release/app build/Mac build/local GUI/capture/profile work.

## Genuine primary source

`fosnola/libstaroffice@94647518b5060456ace4ea724cd157582c059501:regression/Pres5/go-oox-5.sdd`, 48640 bytes, Git blob `62193842f97ada53a27077c6460ae490b6b04271`, SHA256 `6c1558356cea834a4fb42c13847c5ac2e8f6037965c3cf0a1797ed434417c72b`. This is an actual original CFB container: CompObj identifies Presentation / StarImpress 5.0, native `StarDrawDocument3` starts with DrMd version17. No renamed ODP/PPTX, no self-exported source. The upstream presentation regression list registers this as `P:go-oox-5.sdd`.

The primary project distributes MPL2/LGPLv2+ notices; pinned `COPYING.MPL`, `COPYING.LGPL` and README are retained. No separate fixture-specific override was found and no CC0 or independent per-file license grant is invented. Source, historical reference and notices are fetched from immutable Git bytes and fully hashed.

## Independent native oracle and limits

`cfb_source.py` is a small stdlib CFB reader for this exact fixture, not a product import library or general SDD converter. It verifies FAT/miniFAT/directory/stream chains, CompObj, model version/unit and validated native page/object record bounds. Five native DrPg pages reference master IDs 0,1,2,1,2; the two presentation pages use odd master ID1, independently of the tested runtime. Source page size is 28002×20999 units of 0.01mm: 10080720×7559640 EMU. Each visible page has seven root objects and respectively ten/nine leaf objects, with original binary bounding boxes.

The hash-pinned upstream `.raw` regression reference identifies four text objects per visible slide, twelve paragraphs total. It may share the libstaroffice algorithm with the bundled converter; it is a historical reference, not independent algorithmic proof. Every referenced paragraph is additionally bound uniquely to the original visible-page leaf record by its exact original CP1252 bytes and native uint16 length prefix. Page count/master association, dimensions, text identities/positions and object bounds are read directly from original binary source before conversion. No converter output supplies expectations.

Initial source-only run `45162187707` caught a harness reference-reader omission: the outline uses `openListElement/closeListElement` rather than ordinary paragraph calls. The corrected reader handles both and requires each reference object to yield actual text before binding all twelve paragraphs to original binary strings. That run executed no converter/engine and does not establish a product defect.

The geometry budget is fixed before testing at 995 EMU: one native 0.01mm unit (360 EMU) plus one intermediate twip (635 EMU). The independent OOXML reader flattens groups to absolute positions, checks native page/leaf/text bounds and exact paragraphs, then repeats after the planned title-prefix edit and fresh reopen.

Four native type23 OLE objects are opaque to this small reader. Some style bitmap/pattern resources and three handout/notes page records are not completely interpreted. StarBASIC/BasicManager storage is present. Do not claim chart/OLE, actual bitmap pixels, formula, note semantics, macro absence/execution, source font/style rendering or full SDD fidelity acceptance. Retain those boundaries even when bounded page/text/geometry checks pass.

## Actual assigned route

Only Linux CI executes the already approved runtime-input artifact `14805600515`; verify complete ZIP, tar, unchanged shared verifier, all15082 entry records, coordinator/base descriptor distinction, launcher/ELF and parent P2 package. Private CLI only, exact P2 safe profile, isolated temporary profile, 45-second timeout and stripped GH credentials. No new runtime/app/suite build or system Office fallback.

Production `bereidOpenen` performs opening policy and package checks. Real P2 `@betteroffice/pptx`0.5.1 is pinned by lockfile integrity and previously independently verified WASM SHA256 `3a4be9329de1bca77437137ce6417c7910e35c1c7c0e78571bb81f9fe16e5563`. Edit the original first title, Undo/Redo, save PPTX, open a fresh engine instance from disk and save again. Independent source expectations remain separate from any engine baseline used only to test edit/Undo/Redo. All strict failures are retained, even when later editor operations succeed.

Browser coverage is a real negative capability/open-helper check in Node with an empty window and no Tauri bridge mock; no hosted UI acceptance. No Windows/macOS/native GUI/IPC/installer/standalone/rendering test is claimed. No recording session is started locally. #30 and open/closed SDD/StarOffice/StarImpress searches were read before work; new independently confirmed problems require focused duplicates/descriptions and integration coordination. No next format is claimed automatically.
