# #30 — lo-wb1-1: native WB1 source and bounded historical reuse

Exclusive scope: existing **lo-wb1-1**, static qualification/reuse on exact P2
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
No #381 product investigation, readFormula/VLOOKUP patch, runtime overlay,
catalogue/index/intake/main/release or current integration-candidate change.

## Exact original source

[LibreOffice/core@92c170f11d44857d8e365f2e29fb449dfb567ff5 — QuattroPro.wb1](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/writerperfect/qa/unit/data/calc/libwps/pass/QuattroPro.wb1):
174166 bytes, Git blob `95a6331c9c3dbb8ae387d0a9066d7a72032bc37b`, SHA256
`f03c66495f1672e8a363c398669ef544c824e3b3a4c5ba5e43aaf3288aec4be6`.
Original existing cached bytes are retained unchanged as `source.wb1`; upstream
project notices, full canonical catalogue entry and source/P2 bindings are
retained in `source-notices/` and `scripts/qa-wb1/fixture.json`. No new fixture,
per-file CC0 grant or original producer/application-build attestation is asserted.

The BOF is type 0 / length 2 / version **1001**, independently distinguishing
this native WB1 stream from WB2 1002 and the WQ2 source. All **379** native
little-endian type/length records fit exactly through the zero-length EOF at
byte 174166, without a trailer. Record framing is not semantic acceptance of
every native graph, font, link, macro or encryption structure.

Primary independent implementation references are
[GNOME/gnumeric qpro-read.c](https://github.com/GNOME/gnumeric/blob/e15f7f3bfb93361601d54664aaddddd0c643892d/plugins/qpro/qpro-read.c)
and [qpro.h](https://github.com/GNOME/gnumeric/blob/e15f7f3bfb93361601d54664aaddddd0c643892d/plugins/qpro/qpro.h)
at `e15f7f3bfb93361601d54664aaddddd0c643892d`, pinned with original size/blob/SHA256.
The existing WB2 QA at `0ddb6106bd991873cbcab6338755497a570c1d65` already
documented these layout references. Only that knowledge is reused: its source,
CC0 licence, default-sheet semantics, runtime, package and acceptance results
are not evidence for this WB1. No Gnumeric/parser result is the expected-value
baseline and no parser library is executed.

## Native oracle derived before XLSX inspection

`scripts/qa-wb1/native.py` independently reads original byte framing, page blocks,
cell headers and bounded RPN programs. The three pages have IDs 0/1/2. Explicit
source names are ID0 **page1** and ID2 **bizarre**; ID1 has no independently
established explicit name, so its output name is not asserted.

| Native cell witness | Count | Qualification |
| --- | ---: | --- |
| ASCII labels | 37 | Text before first NUL, alignment byte separated |
| Signed 16-bit integers | 26 | Direct native values |
| IEEE floats | 6 | Direct finite values; no native unit/format guarantee |
| Style/blank records | 16 | Blank projection only |
| Formula records | 4 | Programs/caches separated below |

Label records sometimes contain zero or nonzero bytes **after the first NUL**.
Those bytes are retained as `afterTerminatorHex`, not silently promoted to text
or declared corruption/deleted content. Leading spaces in source strings are
preserved. Words such as `green`, `protect=no`, `hidden` and `14pt` are ordinary
cell-text witnesses here, not demonstrated color/protection/visibility/font
properties. Style words and all non-cell payload hashes are retained without
accepting their rendering or feature semantics.

The four native programs are:

| Page / cell | Program witness | Independent bounded result |
| --- | --- | --- |
| ID0 A1 | `01 03`, one relative reference to B1 | 2, matches source cache |
| ID0 C7 | integer 12, integer 3, divide, integer 1967, divide, return | Exact fraction **4/1967**, agrees with source IEEE cache |
| ID0 C9 | `01 03`, relative reference resolves to B1 | 2, matches source cache |
| ID1 B6 | `01 08 03`, reference then negation | Explicitly unqualified nonfinite/error/reference-note case |

C7's exact AST is `(12/3)/1967`, not `12/(3/1967)`. The reader evaluates the
integer/division tree using rational arithmetic before historical output is
read. Relative references for the two accepted reference programs use the
source coordinates and integer B1 operand, not converter formula text.

At ID1 B6 the native cache bytes are `000000000000f0ff` (nonfinite), with a
nonzero reference note 2. Its possible external/cross-page/error semantics
are not independently qualified; a candidate coordinate is retained only as
inventory. It is **not counted as a numeric formula pass**, nor is a particular
modern error code asserted. The observed historical formula/error is archived
separately in `explicitlyUnqualifiedSourceCases`.

## #381 ownership boundary

The #381 description was read; its exclusive product scope is the zero-based
WQ2 VLOOKUP argument translation. These four native token streams use only
reference, integer, divide, negation and return instructions: **no VLOOKUP
opcode 85 occurs**. The concrete shared fault boundary is therefore not reached
by this fixture. The narrow reader stops with `SharedLookupBoundary` if that
opcode is encountered; it does not translate lookup indices or implement that
function. No #381 source patch, libwps product readFormula implementation,
overlay or runtime probe is inspected or changed. The integration coordinator
received the source observation. Open/closed WB1 search found no separate issue;
no new issue is created from the unresolved observations below.

## Historical binding and strict results

The original Windows report committed in P2 is retained unchanged, SHA256
`ed3e887dfb50c177d11695a1d0f4b03f0fb330382abe1acbd56690c160de56b8`.
It records technical `opened-saved-reopened`, conversion time 10758 ms, report
date 2026-11-10T08:48:03.136Z, LibreOffice 26.8.2.2
`9dea406ab7695df6325b11b0e19fdca8db4b7276`. The historical profile SHA256
`8f301a135c288b99cc984a895030eee27ba40d3d9722f81c1d691d5f66f3de6c`
differs from P2's canonical safe profile
`847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40`.
Being committed in P2 does not prove execution on the P2 package.

The original `historical-result.xlsx`, 14601 bytes, exactly matches the report's
saved SHA256 `8fcc8f098f19c90b16b2b2b38bdf54eaaf7d4e5ec8ccc5c10f53e035ebb62a37`.
This digest identity, not its old cache name `omgezet.xlsx`, binds the bytes.
The local conversion receipt is retained too. No current CI artifact/package,
private-runtime or new-process identity is inferred from the historical cache.

**92/95 bounded historical checks PASS; 3 FAIL.** The independently compared
source name/labels, blank projections and accepted formula expressions agree.
The three strict numeric/cache observations remain visible:

| Source page / cell | Source numeric/cache | Historical XLSX numeric/cache | Observed output format |
| --- | --- | --- | --- |
| ID0 C7 | 4/1967 ≈ 0.0020335536349771225 | 0.0020335536, same formula `12/3/1967` | General |
| ID1 B5 | 0.1 | 1 | `\:d` |
| ID1 D3 | 12.1 | 0 | `hh:mm:ss` |

C7 is a static cache-precision difference against the independent rational
calculation, about 3.5×10⁻¹¹ absolute. Actual recalculation/current engine behavior
was not executed; this does not establish a current P2 defect, invalid file or
converter/engine cause. Files may retain rounded/stale caches. B5/D3 also require
independent native format/unit/epoch/projection qualification; output formats
are observations, never the native oracle. They are not yet demonstrated value
loss. The three failed comparisons are not skipped or adjusted to appear green.

Numeric equality uses an explicit **15-significant-decimal-digit projection**
of source/observed numeric values. It is not exact IEEE-bit or decimal-lexeme
preservation. C7 still fails this criterion; no tolerance is enlarged to accept
its observed rounding. Native format/unit semantics remain an additional bound.
ID1 B6 remains a fourth, explicitly **unqualified** source case outside the 95
numeric/structural assertions, rather than a hidden green result.

## Replay and controls performed

```console
python -B -X utf8 scripts/qa-wb1/analyse.py
```

Run from the repository root, Python standard library only. It writes
`result.json` and intentionally exits **2** for the three retained comparisons;
traceback/assertion errors are not accepted as this outcome. Status:
`BOUNDED_WB1_HISTORICAL_DIFFERENCES_SEMANTICS_OPEN`, full acceptance **false**.
Canonical P2/source/notices/report/cache identity checks pass.

**Six output-oracle controls PASS:** changed text/type, dropped reference formula,
changed division association, changed explicit page name and changed reference
cache each cause a new failure beyond the three baseline differences.
**Seven native controls PASS:** wrong WB family, overrun, truncation, missing
label NUL and unknown token are rejected; changed B1 exposes a source-cache
mismatch; changing a byte after the first label NUL leaves the label unchanged.
These are reader/oracle controls, not new imported fixtures or product parser,
lookup, security or rendering tests. Original source remains unchanged.

## Remaining work and resource boundary

Resolve the native error/reference-note contract at ID1 B6 and format/unit
projection at B5/D3 before semantic acceptance. If later allocated, bind the
exact P2 private converter/package → production helper → real engine, force
recalculation of the three accepted formulas, edit a referenced value and test
Undo/Redo → modern XLSX save → fresh-process reopen, with independent output
checks including C7 precision. Current native Windows/Linux/macOS and supported
browser UI remain OPEN. General Quattro/Works/Lotus, style/graph/link/macro and
encryption acceptance remain outside this proof.

Static P2 policy converts WB1 to XLSX, has no WB1 output entry and therefore
proposes modern XLSX by default. The external converter is desktop-only;
no actual current browser test is run. No new runtime/CI/build/artifact download,
local converter, GUI/browser/capture session or product change was started.
Only small pinned primary source files were read. Own ignored `.local/upstream`,
metadata and pre-output oracle remain as read-only caches; no helper is running.
Only own QA paths change, previous proofs remain frozen and no next format is
automatically claimed.
