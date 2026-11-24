# #30 — lo-slk-2: bounded native SYLK oracle and historical reuse

Exclusive integration-coordinator assignment, QA only. P2 reference:
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
No product, shared catalogue/index, integration intake or release is changed.

## Qualified original source

The existing positive **lo-slk-2** source is
[LibreOffice/core@92c170f11d44857d8e365f2e29fb449dfb567ff5 — ooo80484-1.slk](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/sc/qa/unit/data/slk/pass/ooo80484-1.slk):
2581 bytes, Git blob `b86d5ba9781fc2c3a3e8c7401ad58537ba2dc13f`, SHA256
`bcfaae8f2ce55e393c100dcd95c37301129b9121af0429586de75b3ec99df420`.
`source.slk` is the original local cache copied byte-for-byte, preserving its
mixed CR/LF separators and high bytes. The complete canonical P2 catalogue
entry, upstream notices and all evidence bindings are in
`scripts/qa-sylk/fixture.json`. The project-distributed source and original
licence notices are reused; no per-file CC0 licence or original producer
identity/version is asserted. `PXL` is a header tag, not separate producer proof.

**lo-slk-1 is different:** the catalogue explicitly marks that 104-byte
numfmt regression fragment, without an ID header, as `expected=reject`.
It is neither the positive source nor a source of accepted content here.
No second fixture/import route or `.sylk` filename acceptance is claimed by
this new work. Open and closed issue searches for SYLK/SLK found no matching
standalone issue. #30 remains the existing scope reference, despite its current
closed state; no extra umbrella issue or new bug is created.

## Independent source oracle

`scripts/qa-sylk/native.py` reads the original bytes **before** XLSX inspection.
It is an independent bounded reader, not the converter/parser or a baseline
copied from converter output. It follows X/Y changes in F records, reads K
literals, resolves used P indices, and handles doubled semicolons in format
codes. Uninterpreted F/O/header details are retained in the raw record ledger;
they do not become accepted font, alignment, renderer or option semantics.
This is not a complete normative SYLK implementation/conformance validator.

There are **194 records**: ID 1, P 19, F 91, B 1, O 1, C 80, E 1.
The native bounds are X=10/Y=11. The 80 actual cell records comprise:

| Source witness | Count | Accepted boundary |
| --- | ---: | --- |
| Numeric K literals | 35 | Exact Decimal values, independent of display |
| ASCII quoted strings | 17 | Exact text and string type |
| Quoted high-byte strings | 28 | Original payload hex and output string type only |

Examples of directly decoded anchors are J1 `Overall`, A2 `Category`, A6 `Fuel`,
A8 `Total Auto`, A10 `Total Outflows`; J6/J8/J10 each contain numeric `1100.64`.
Twenty-seven numeric cells use source format `#,##0.00`; eight numeric serials
use `m/d/yy`. Both value and format code are checked separately. A calendar
epoch is not inferred from the date-format text, and no visual date/locale
rendering claim is made. The remaining P codes, including the literal escaped
semicolon in unused currency formats, are recorded without claiming conversion
coverage for those unused formats.

Every C record in this source contains K only, with **no E formula field**.
Thus the numeric K values are literal witnesses, not evidence of retained
formula text, formula caches, recalculation or formula import. No source sheet
name is established by this bounded source reader.

The 28 high-byte strings contain repeated `D1`. A character-set mapping cannot
be established from an extension, this header alone or converter output. The
reader preserves their payload bytes and checks only that output cells remain
strings; **no Unicode text or visual preservation pass is assigned** to them.
The [Microsoft format-limit documentation](https://support.microsoft.com/en-us/excel/excel-formatting-and-features-that-are-not-transferred-to-other-file-formats)
describes SYLK as active-sheet values/formulas with limited formatting. It is
used for that general boundary, not as a complete grammar or charset authority.

## Historical evidence reused, without new runtime work

The committed historical Windows report is retained unchanged, SHA256
`ed3e887dfb50c177d11695a1d0f4b03f0fb330382abe1acbd56690c160de56b8`.
Its targeted lo-slk-2 probe is **2026-11-10T08:55:46.514Z**, distinct from the
report's initial `date`. Converter: LibreOffice 26.8.2.2
`9dea406ab7695df6325b11b0e19fdca8db4b7276`; actual historical profile SHA256
`8f301a135c288b99cc984a895030eee27ba40d3d9722f81c1d691d5f66f3de6c`.
The 6161-byte local `historical-result.xlsx` exactly matches the report's saved
SHA256 `241e18ce9a6488ea81a11bd23f0b5705b836f670c0132b31b6375a7798632fd6`.
The local name `omgezet.xlsx` alone does not establish a stage; the verified
saved-digest identity is the binding used. No official CI/package/new-process
identity is inferred from that older local cache.

There is already a dedicated, broader historical filename-route proof:
[run 44728178415](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44728178415),
harness `81f4dbeb426a75c4aaa845650d2209886f34b8c6`, archived at QA commit
`720f7429e1be043cdbbb3e8a3a9d9ed3b2ca1679`. It used application **I3**
`7f126f4b8e5269a54388cf78c48c78d2acc0daa1`, tree
`8bc608488760e48919d7fb4e72a42569175b52a4`, desktop producer `44715026752`.
Canonical route/provenance, the prior independent audit, artifact download
receipt and three platform reports are retained with their exact Git blob and
SHA256 bindings. Their four package paths (Windows NSIS, Linux AppImage/DEB,
macOS DMG) report 12 source-cell checks, edit/save/new-engine reopen and cleanup.
The old scope also includes both filename extensions and separate Windows
Chromium normal/hosted rejection evidence. These remain historical I3 claims;
this work does not re-execute them or take ownership of a new alias/UI scope.
Old failed harness attempts remain documented in the retained provenance/route.

The six relevant canonical Git components were compared directly between I3
and P2: `src/import/openen.ts`, `src/formaten.ts`, `src/formaten.json`, the safe
profile source, `vendor/rekenbladengine/xlsx_wasm_bg.wasm` and its `bouw.json`
are **byte-identical**. Those recorded comparisons support reuse rather than
duplicating the old twelve-cell checks. The replay revalidates the P2 bytes;
the I3 hashes were obtained from the original local historical Git objects,
not inferred from the XLSX. Component identity does not by itself bind the P2
desktop package/private runtime. Historical new-engine reopening does not prove
a separate-process reopen, and the old sequence does not establish Undo/Redo.

## Checks actually performed now

From the repository root (Python standard library only):

```console
python -B -X utf8 scripts/qa-sylk/analyse.py
```

- Source bytes/blob, full UTF-8 catalogue entry, notices, P2 tree/component
  bindings, retained historical Git bytes and saved-cache identity verified.
- **117/117 historical XLSX cases PASS:** 52 exact ASCII/numeric values,
  28 high-byte string-type checks, 35 used numeric format-code checks,
  no extra valued cells and no output formulas. These are bounded checks,
  not 117 full-format or platform passes.
- **6/6 output negative controls PASS:** changed numeric type, changed ASCII
  anchor, removed date format, changed decimal format, formula added with the
  same cache, and lost high-byte string type each cause a new strict failure.
- **3/3 native-reader controls PASS:** missing ID, missing final E and an added
  unsupported formula field are rejected. These test the bounded oracle, not
  the product importer/security behavior or another positive fixture.
- Four old I3 package receipts are reused with their own original codepoint,
  source, private-runtime/profile and output hashes. No historical runtime
  proof is relabelled as a newly executed P2 proof.

Original source remains unchanged. The result status is
`QUALIFIED_BOUNDED_SYLK_SOURCE_HISTORICAL_REUSE_ONLY`; full-format acceptance
remains **false**.

## Concrete remaining gap

P2's static production helper converts SLK to XLSX. Since SLK is also in the
runtime output catalogue, its default export proposal is **SLK**. The
recommended modern XLSX save must be explicitly selected in a future complete
route; do not infer it from the converter's intermediate XLSX or direct engine
save. Actual browser input needs the external desktop converter; only the
source-level guard and old I3 browser evidence were reviewed here.

Still unexecuted for the exact P2 package: pinned private converter binding,
production helper / real engine with this expanded oracle, suitable edit,
Undo/Redo, explicit modern XLSX save and a fresh-process reopen. Missing actual
native Windows/Linux/macOS and current browser UI checks are **OPEN**, not
passed. No general formula, style/font/rendering, chart/object, non-ASCII,
SYLK export or arbitrary variant acceptance follows from this fixture.

No runtime allocation was requested or consumed: no new CI, app/suite build,
binary download, local converter, GUI, recording or browser session was started.
No product failure was independently established, so no new issue is filed.
This report is separate from the current integration candidate and gives no
automatic next-format claim.
