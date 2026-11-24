# #30 — lo-wks-1: native oracle and strict historical formula finding

Exclusive scope: only the existing **lo-wks-1** source, static qualification
and reuse on P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
No Quattro/#381, other format, product, catalogue/index, integration intake,
main or release work is included.

## Exact original source

[LibreOffice/core@92c170f11d44857d8e365f2e29fb449dfb567ff5 — gnome647171-1.wks](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/sc/qa/unit/data/wks/pass/gnome647171-1.wks),
783 bytes, Git blob `b2130f54439c51d95b1ee3d3f64de83b3a0874cd`, SHA256
`d69c904b82746546fab024f13c5732ac0d1decaed604259bce3213a936989314`.
Original cached bytes are retained unchanged as `source.wks`, with upstream
project licence notices in `source-notices/`. No new fixture/per-file CC0 grant
or producer/version attestation is asserted. The canonical full catalogue
entry, notices, P2 Git bytes and retained evidence are pinned in
`scripts/qa-wks/fixture.json`.

The source is a complete sequence of **20 little-endian type/length records**,
ending with type 1 / length 0 exactly at byte 783. BOF is type 0 / length 2 /
payload `0404`. Bounds are `[0,0,2,4]`. That signature and the `.wks` name are
compatible with historical WKS readers but do not independently establish a
specific Works/Lotus producer or native version. No general variant acceptance
or source sheet-name preservation is inferred.

## Independent source-derived oracle

`scripts/qa-wks/native.py` reads record lengths, cell addresses, IEEE payloads,
RPN token lengths/stack/references and the separate string-result record from
original bytes **before inspecting XLSX**. It does not invoke a converter or
use converted formulas/values as the source baseline. Unhandled metadata is
retained in the raw record ledger; style/font/rendering semantics are not
accepted. The reader supports only the immutable fixture's token subset and
small relative coordinates, not all WKS formula/address dialects.

The seven cells and four formula results are:

| Cell | Native witness | Source cache / independent calculation |
| --- | --- | --- |
| A1 | Number record | 10 |
| B1 | Number record | 11.5 |
| A2 | opcode 50, range A1:B1, SUM | 21.5 |
| B2 | opcode 52, range A1:B1, COUNT family | 2 |
| C2 | opcode 58, A1/B1, STD family | 0.75 under population interpretation |
| A4 | Number record | 8 |
| A5 | IF(MOD(A4,2)=1,"Odd","Even") | `Even` |

The A5 numeric-slot bytes `fffffffffffff07f` are not accepted as an ordinary
finite result. A separate type `0033` record with the same coordinates supplies
the NUL-terminated ASCII cache `Even`; it is not an eighth standalone cell.
Four source formula caches match the independently calculated values under
the explicitly bounded interpretations below.

Layout/token references are primary implementation source, all pinned with
size/Git blob/SHA256 metadata:

- [libwps WKS4.cpp](https://github.com/deepin-community/libwps/blob/a5ad3a399e52ff174e188edfca170a7689232d0b/src/lib/WKS4.cpp)
  and [WKS4Spreadsheet.cpp](https://github.com/deepin-community/libwps/blob/a5ad3a399e52ff174e188edfca170a7689232d0b/src/lib/WKS4Spreadsheet.cpp)
  at distribution-mirror commit `a5ad3a399e52ff174e188edfca170a7689232d0b`.
- [LibreOffice lotform.cxx](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/sc/source/filter/lotus/lotform.cxx)
  at the source fixture's pinned revision.

These sources guide an independently implemented byte reader, not a complete
independent normative specification or proof of P2's linked library version.
Native opcode 52 maps to different COUNT/COUNTA family names in the references;
the two referenced inputs here are numeric, so both count 2. Text/blank/boolean
count semantics are untested. Opcode 58 maps to `ocStDevPA` in the Lotus table,
while libwps names it `StDev`. Population deviation of 10/11.5 is 0.75, agreeing
with the source cache; sample deviation is approximately 1.0606601717798212.
The population source interpretation remains **conditional** because a cache
and shared signature do not prove the original producer's normative semantics.

## Reused historical saved bytes and finding

The retained historical Windows report is exactly the one committed in P2,
SHA256 `ed3e887dfb50c177d11695a1d0f4b03f0fb330382abe1acbd56690c160de56b8`.
It reports `opened-saved-reopened`, conversion time 10696 ms, on report date
2026-11-10T08:48:03.136Z, with LibreOffice 26.8.2.2
`9dea406ab7695df6325b11b0e19fdca8db4b7276`. Its actual historical profile hash
`8f301a135c288b99cc984a895030eee27ba40d3d9722f81c1d691d5f66f3de6c`
differs from P2's canonical safe profile
`847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40`.
The report being present in P2 does not make it a P2 package execution.

`retained/historical-result.xlsx` is the original 5373-byte local cache and
**exactly matches the reported saved SHA256**
`ee617d9bd0821cba6157b1a0fceed726c946286e15816561f451b8fa10481f33`.
The saved-digest identity, not the cache filename `omgezet.xlsx`, binds these
bytes. No current CI run/artifact or P2 private-runtime equivalence is inferred.

All seven values/caches, SUM, numeric-only COUNT and IF/MOD expressions agree
with the source oracle. However, **C2 is stored as `STDEV(A1,B1)` with cache
`0.75`**, while A1=10 and B1=11.5. This produces two strict failed checks around
one observation:

1. It is not population-compatible under the conditional native interpretation.
2. Independently of that native producer question, its cached value is not the
   mathematical value of its actual output expression: sample STDEV is about
   1.0606601717798212, not 0.75.

[Microsoft's STDEV documentation](https://support.microsoft.com/en-us/excel/functions/stdev-function?nochrome=true)
specifies the sample / n−1 calculation; its
[STDEVP documentation](https://support.microsoft.com/en-us/excel/functions/stdevp-function)
specifies population / n. This establishes a **static historical formula/cache
inconsistency**. It does not show actual recalculation, a current P2 regression,
a native UI failure, a proven importer cause or a format-invalid file; spreadsheet
files can hold stale caches. The old technical catalogue pass remains historical.

Open/closed WKS and STDEV searches found no specific issue; the existing #59
description was read. No new product issue is filed from an old artifact and
an unresolved native producer contract. The integration chat received the
precise observation and current-runtime gap; #381 remains separate.

## Checks actually performed

From the repository root, Python standard library only:

```console
python -B -X utf8 scripts/qa-wks/analyse.py
```

**Exit status 2 is intentional:** it preserves the strict historical finding.
Assertion/traceback failures are not accepted as this result. The replay writes
`result.json` with **12 historical cases PASS / 2 FAIL**, `strictPassed=false`,
and `fullFormatAcceptance=false`; it does not turn the failed checks green.

The canonical P2/source/notices/report/cache identity checks pass.
**Six output-oracle controls PASS**: five mutations cause genuinely new failures
outside the two existing C2 failures. A separate in-memory observer-only change
to a population expression makes both C2 checks pass, proving they can resolve;
this is not a generated file, product fix or accepted producer specification.
**Six native controls PASS**: wrong BOF, record overflow, truncated EOF, unsupported
RPN token and orphan string cache are rejected; changed numeric input is detected
by independent source-cache calculation disagreement. No altered source bytes
are imported as fixtures. Original source remains unchanged.

## Exact remaining gap

No new runtime/CI/build/release-artifact download, local app/converter, native
GUI, browser or recording session was started. Only small primary implementation
sources were read; their pinned metadata is committed, and a read-only cache is
left under ignored `.local/upstream` together with the initial pre-output oracle.
No running helper remains. The new work is limited to own QA paths.

The concrete runtime gap is **current P2** pinned converter → production helper
→ real engine → explicitly forced recalculation of C2 / suitable referenced-cell
edit and Undo/Redo → modern XLSX save → fresh-process reopen, with independent
formula/cache checks. Recalculation has not occurred in this static audit, and
cache preservation is not recalculation acceptance. A normative native semantic
witness is also needed before asserting a producer-specific import bug.

P2's static policy routes WKS through the external desktop converter to XLSX;
WKS is absent from output formats, so modern default save is XLSX. Current
native Windows/Linux/macOS and actual supported browser controls remain OPEN.
There is no general WKS/Works/Lotus formula, style, font, rendering, macro or
encryption acceptance. No additional format is automatically claimed.
