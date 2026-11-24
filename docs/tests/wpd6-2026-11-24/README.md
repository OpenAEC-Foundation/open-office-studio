# WPD6 bounded source-content proof under #30

Only the already catalogued `lo-wpd-1` / `WP6.wpd` is covered. The separate WordPerfect 2.1.3 sample is excluded. The integration coordinator assigned this format exclusively to this chat on 2026-11-24. Previous WRI evidence at `7ba542fa3164ee70044a9e62f630fc482a4a0432` is unchanged.

## Application and source

- Application: P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
- Source: [LibreOffice/core pinned original](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/writerperfect/qa/unit/data/writer/libwpd/pass/WP6.wpd), Git blob `dc8aceca527075916a4d527e0b3961cbd7e87d2d`, 3587 bytes, SHA256 `d5fde49f38d0dd73c65c0d19cb132defcc037dc09c8c405a2dfbaba457d65150`.
- Source bytes were reused from the existing catalog cache and checked against Git/size/SHA. The pinned upstream GPL/LGPL/MPL notices and README are retained with the evidence. No individual CC0 grant or known producer application/version is asserted. Upstream path history identifies the 2014 reorganization commit `b2719a71a268e824b8d1b9c1187a464c07018989`; this is not a claim of first creation/publication.
- Header: genuine native `FF 57 50 43`, WordPerfect product 1/document type 10/major 2/minor 1. This shared 6-family header does not uniquely identify the producing WordPerfect release.

## Oracle frozen before conversion

The independently written static reader follows the [Corel SDK format documentation mirror](https://github.com/OneWingedShark/WordPerfect/tree/f9c20527c218d327dafb520276ae8c7c0342b6c2/doc/SDK_Help/FileFormats). Exact specification page hashes are in `scripts/qa-wpd6/fixture.json`; copyrighted pages are referenced, not redistributed. No libwpd execution or converter output supplies the source expectation.

The reader checks file size/index bounds, all 13 prefix packets, document variable-length gates and matching size/trailer fields. It derives case-sensitive body text `Foo`, `foo`, a hard return (`D004`) followed by hard end of page (`D009`), and two Header A references (`D600`, prefix IDs 5/7). Their own mapped text streams yield `Header Type A` and `Header Type A but changed`, with odd/even occurrence bits set. `D45F` gates are spelling-check metadata, not hidden/deleted text.

Independent DOCX XML checks require the two body texts in distinct paragraphs, their explicit logical page boundary and the successive exact header texts. Empty paragraph carriers are inventoried; their exact count is not a visual pagination criterion. Engine operations use the two nonempty body text segments; headers and page structure remain independently checked after each save. The edit is the prefix `QA_WPD6_24NOV ` on the first body paragraph.

## Test level and limits

One targeted Linux CI job uses the existing runtime-only input `14805600515`, its full ZIP digest, coordinator Git descriptor, shared consumer, tar/source/tree/version/manifest/modes/symlinks/launcher/ELF verification and P2 safe profile. No app/suite build or full installer download. Queue guards prioritize queued P5 Linux jobs.

The production opening policy calls a verified private CLI adapter; the actual production-patched Word WASM engine performs edit/Undo/Redo/DOCX save, a fresh session reopen and a subsequent separate Node-process reopen/resave. This does not exercise Tauri IPC, native GUI, installer behavior, Windows/macOS runtime or a hosted browser UI. The browser check is the real negative production capability function in Linux Node without a desktop bridge.

Fonts/styles, margins/paper sizes, visual pagination/layout/rendering, opaque packet internals, macros, encrypted variants and other WPD versions are not accepted. `fullFormatAcceptance` remains false. This QA branch changes no product, catalog, shared index, version or release intake. No main/tag/release publication is authorized.

## Duplicate check

Open and closed WPD/WordPerfect matches were searched; descriptions of parent #30 and closed catalog issue #43 were read. No independent product fault has yet been established by the source qualification alone. A future independently confirmed fault requires its own bounded duplicate investigation and coordinator alignment.

## Results

**Bounded source-content and downstream engine proof PASS after an independently verified test-oracle correction. Full-format acceptance remains false. Original CI conclusion remains FAILURE.**

- [Linux run 45354297317](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45354297317), job `138308165799`, attempt 1, harness `79114519528e7b413eb2dfe5be3785df4df72611`, finished `2026-11-24T08:15:08Z`. No second CI/runtime execution was required.
- Runtime-only artifact `14805600515`, ZIP SHA256 `bac1a37b55deff80cabd4670c1bf65d76266285275c0552436dcc13fcdafa487`, tar `f3308bea282aedc444a10a039ec2c4e3904915d4c6c0b5607b088108407fb2e3`; full binding/consumer receipts are in the original result ZIP.
- Result artifact `14902045836`, 78901 bytes, full ZIP SHA256 `f50b853efad4397c86ee2968578c61b88d51cc09b3acf23506d64d6580c8e79d`, expires `2027-02-22T08:13:51Z`. The complete small ZIP and official artifact/run/job metadata are retained in Git, so expiry does not erase the evidence.
- The real converter and production opening helper succeeded. Real Word WASM text edit/Undo/Redo/save/session reopen/resave succeeded. A separate Node process (PID 2902, after PID 2817 exited) reopened the exact saved DOCX and resaved it. The source and saved-input hashes remained unchanged. Production edit/layout WASM and patched-JS identities matched across processes.
- The original XML oracle incorrectly appended an empty `first` header from section 2 to the two active default headers. Neither section has `titlePg`, and settings omit `evenAndOddHeaders`. The empty first-page header is therefore inactive: [Microsoft titlePg semantics](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.titlepage), [even/odd semantics](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.evenandoddheaders). This was a test defect, not reproduced product loss. Original false reports/CI status are preserved unchanged.
- Corrected **offline** XML analysis of the exact authenticated converter output, initial save, fresh-session save and new-process save passes 6 checks each (24 total): body case, separate paragraphs, successive active header text, odd/even coverage, corresponding body-section/header association and explicit page boundary. Both an inline page break and a next-page section boundary are inventoried; no rendered page-count claim follows.
- Five offline controls: changing inactive-first-header content remains accepted; enabling that header, swapping active header associations, changing case and removing the page boundary are rejected. This specifically verifies the normative correction without suppressing active content loss.
- No new product issue was established. No local GUI/capture/session was started. The new-process session and loader report successful cleanup; the original process writes its final receipt only after destroying sessions and closing its loaders.

### Reproduce the offline audit

From this branch, use a new, empty destination:

```sh
python -B scripts/qa-wpd6/analyse.py \
  --archive docs/tests/wpd6-2026-11-24/retained/result.zip \
  --metadata docs/tests/wpd6-2026-11-24/retained/artifact.json \
  --out .local/wpd6-independent-audit
```

This validates the original complete ZIP digest, source and runtime receipts, original failure attribution, four saved outputs and five semantic controls. It executes neither Office nor Word WASM. `offline-analysis.json` contains machine-readable outcomes. `corrected/` retains corrected reports; raw reports are inside the immutable original ZIP.
