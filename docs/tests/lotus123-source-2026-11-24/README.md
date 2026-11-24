# #30 — lo-123-1: bounded native content prefix and historical reuse

Exclusive scope: the existing **lo-123-1** source, static qualification/reuse on
P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
No product, shared catalogue/index, intake, main or release changes; no takeover
of Quattro/#381 or another source/variant.

## Exact original source

[LibreOffice/core@92c170f11d44857d8e365f2e29fb449dfb567ff5 — Lotus123_3.123](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/writerperfect/qa/unit/data/calc/libwps/pass/Lotus123_3.123),
30352 bytes, Git blob `fa2154967a032cef23439f7a44f6ffbbd1130c09`, SHA256
`407d798d58510ab88e667df275426c7ef58faca3180ec87fb43bba90e3f836fb`.
Original cached bytes are retained unchanged as `source.123`. The project
licence notices and complete canonical catalogue entry are retained/pinned in
`source-notices/` and `scripts/qa-lotus123/fixture.json`. No new fixture or
separate CC0/per-file licence grant is asserted.

The native BOF has type `0000`, length `001A`, revision word **`1003`**. This is
consistent with the Lotus123 family in the referenced implementation; neither
the filename's `_3` nor the parser's internal version counter attests the
original producing application's exact version/build. It is not a renamed XLSX
or proof of general Lotus/Works/Quattro variant coverage.

## Independent bounded source oracle

`scripts/qa-lotus123/native.py` derives native records/cells before inspecting
the historical XLSX. The accepted reader contract ends at **byte 3800** after
172 complete little-endian type/length records. The native prefix SHA256 is
`6b8a2929e3e98c0a400af30a616585bd394f4ee93b722487a8dcd59aaf039c21`.
The original **26552-byte remainder is opaque** to this reader, SHA256
`604c511c0cdfe23dd21196d83203247b92e132e32bffd5d0feddaf25db3ecc50`.
It is not parsed as a complete flat record sequence or validated as an object,
graphics, style or complete end-of-file structure. An unsupported traversal
is not an invalid-file/corruption finding. Whole-file bytes are nevertheless
pinned and preserved.

This is an independently implemented byte/RPN reader guided by primary source
implementation, not converter output or a normative Lotus specification:

- [Lotus.cpp](https://github.com/deepin-community/libwps/blob/a5ad3a399e52ff174e188edfca170a7689232d0b/src/lib/Lotus.cpp):
  BOF family, maximum sheet ID and native record dispatch.
- [LotusSpreadsheet.cpp](https://github.com/deepin-community/libwps/blob/a5ad3a399e52ff174e188edfca170a7689232d0b/src/lib/LotusSpreadsheet.cpp):
  cell positions/types, alignment prefix, sheet name and reference token layout.
- [libwps_internal.cpp](https://github.com/deepin-community/libwps/blob/a5ad3a399e52ff174e188edfca170a7689232d0b/src/lib/libwps_internal.cpp):
  compact four-byte decimal representation.

These files are read from a pinned distribution mirror, with exact Git blob,
bytes and SHA256 in the metadata. They are not claimed as P2's exact linked
library revision or a wholly independent normative semantic implementation.

The native BOF records last sheet ID 2 (three sheets). One explicit name record
gives ID 1 **`graphic`**; names for IDs 0/2 are not independently established.
The prefix contains **48 cell records**:

| Native source witness | Count | Scope |
| --- | ---: | --- |
| ASCII text, type 0016 | 21 | Exact strings after a known alignment prefix |
| Compact numeric, type 0025 | 26 | Raw decimal values 3, 23 and 24 × 1.3 |
| Double cache + formula, type 0028 | 1 | ID0 A1 references same-sheet B1, cache 3 |

Compact values are derived from integer mantissa/sign and decimal exponent;
`51030000` decodes independently to **1.3**. Formula bytes
`01070000000103` contain a single B1 reference and return; the source B1 numeric
value independently calculates to 3, agreeing with A1's cache. The raw reference
flags are retained; only the same-sheet row/column behavior is qualified.
There is no actual engine recalculation or general formula/function acceptance.

Examples include C1 `italic`, D1 `underline`, A2 `red`, A5 `protected`, B5
`not protected`, C5 `hide content`, A6 `align across column` and C9 `style 1` on
sheet ID0. These words are **ordinary text witnesses**, not a tested claim about
fonts, colors, protection, hidden content, alignment or style preservation.
The prefix also has one B9 comment record with a leading control/metadata byte;
its raw bytes are preserved, with no accepted comment-projection/rendering
oracle. Empty prefix cells on the `graphic` sheet do not prove an empty sheet
or preserved graphics. Undecoded metadata and the opaque remainder may matter
to final native semantics.

## Historical saved bytes and strict comparison

The unchanged Windows report committed in P2 is retained, SHA256
`ed3e887dfb50c177d11695a1d0f4b03f0fb330382abe1acbd56690c160de56b8`.
It reports `opened-saved-reopened`, conversion time 11410 ms, report date
2026-11-10T08:48:03.136Z, LibreOffice 26.8.2.2
`9dea406ab7695df6325b11b0e19fdca8db4b7276`. Its actual historical profile hash
`8f301a135c288b99cc984a895030eee27ba40d3d9722f81c1d691d5f66f3de6c`
differs from P2's canonical safe-profile hash
`847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40`.
The report being in P2 is not evidence of a P2 package execution.

`retained/historical-result.xlsx`, 17456 bytes, exactly matches its saved SHA256
`b0c94fed8d1414a8225df8549de49f107dd25a71ae30db5471f3b0d2460c14c4`.
The verified saved digest, not the original cache filename `omgezet.xlsx`, is
the file identity binding. The original local conversion receipt is also
retained. No CI artifact, current package/private runtime or fresh-process
identity is inferred from these old local files.

The static source-prefix comparison has **45 PASS / 7 FAIL** out of 52 cases.
All 21 text values, the direct reference formula/cache, three-sheet count and
the one explicit sheet name agree. Seven raw numeric comparisons on source
sheet ID2 differ:

| Cells | Native compact value | Historical raw XLSX value | Observed output format |
| --- | ---: | ---: | --- |
| B6, A7 | 1.3 | 2 | `m/d/yy` |
| A8, B8, A9, B9, A10 | 1.3 | 0 | `h:mm:ss\ AM/PM` |

The output format is recorded as an **observation**, never imported back into
the native source oracle. Native per-cell format binding, calendar epoch and
date/time projection are not qualified by the prefix reader. Raw numeric equality
is therefore a strict comparison with an unresolved semantic precondition,
not established loss of a native literal or a confirmed product defect. The
seven comparisons remain failed; they are neither silently skipped nor adjusted
to follow the converted result. No new issue is filed from this incomplete
native semantic contract. Open/closed `Lotus123` issue search found no matching
standalone issue; the integration chat received the exact bounded observation.
Earlier WKS findings and #381 remain separate and unchanged.

## Replay and controls actually executed

From the repository root, Python standard library only:

```console
python -B -X utf8 scripts/qa-lotus123/analyse.py
```

The audit writes `result.json` and intentionally **exits 2** for the seven
retained comparisons. An exception/traceback is not accepted as that outcome.
The status is `BOUNDED_PREFIX_RAW_NUMBER_DIFFERENCES_NATIVE_SEMANTICS_OPEN`,
`strictBoundedContentPassed=false`, `fullFormatAcceptance=false`.

Canonical source/P2 tree/Git-byte/notice/report/cache identity checks pass.
**Six output controls PASS:** changed ASCII text, number type, a compact-number
value, dropped formula, changed reference and changed known sheet name cause
new failures beyond the seven baseline differences. **Six native controls
PASS:** wrong family word, prefix record overflow, missing text NUL, missing
formula return and truncated content prefix are rejected; changing referenced
B1 exposes a source-cache mismatch through independent calculation. Altered
bytes/models are oracle controls, not new imports, product security tests or
additional positive fixtures. Original source remains unchanged.

## Exact remaining gap and resource boundary

First, independently qualify native cell formats/units/epoch/projection for the
seven numeric differences. The bounded prefix/raw-number oracle cannot decide
that alone. Next, if allocated, use the exact P2 private runtime and production
helper/real engine for a suitable edit, forced recalculation, Undo/Redo, modern
XLSX save and fresh-process reopen, with the qualified native oracle and
independent OOXML checks. Old technical cache acceptance does not prove this.

The static P2 policy routes `.123` through the external desktop converter to
XLSX; `.123` has no output entry, so modern default save is XLSX. Actual current
native Windows/Linux/macOS and supported browser behavior remain OPEN; browser
desktop-only capability is source-inspected, not UI-tested here.

No runtime/CI/build/release-artifact download, local converter, native GUI,
browser or recording was started. Only small pinned implementation source
files were read. Own ignored `.local/upstream`/metadata/pre-output oracle
remain as read-only caches; no running helper remains. This report changes
only own QA paths and gives no automatic next-format claim.
