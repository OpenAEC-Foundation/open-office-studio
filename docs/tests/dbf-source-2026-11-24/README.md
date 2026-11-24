# #30 — lo-dbf-1: native source qualification and historical content reuse

QA only, assigned exclusively by the integration chat. Application reference:
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1` (P2).
This work does not change a product/catalogue/index, claim a Database-owner scope,
or add anything to the current integration/release intake.

## Source and provenance

The existing catalogue entry is **lo-dbf-1**, `DBTest.dbf`, from
[LibreOffice/core at 92c170f11d44857d8e365f2e29fb449dfb567ff5](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/sc/qa/unit/data/dbf/pass/DBTest.dbf).
The original cached bytes are retained unchanged as `source.dbf`: 1575 bytes,
Git blob `03d737b281579700b104a1c572b693040d6b3023`, SHA256
`c5eddb601bd3ba98cd5ab3caf20c81eaa5a130ff497a39154745f884d76f55fb`.
No new fixture or download was needed. The upstream project notices are retained
byte-for-byte in `source-notices/`; no separate CC0 grant or original producer
identity/version is asserted. The full catalogue entry, notices, and canonical
P2 Git-byte bindings are pinned in `scripts/qa-dbf/fixture.json`.

The independently read native header has byte 0 = `03`, five records, a 385-byte
header, 238-byte records, eleven 32-byte descriptors, and terminator `0D`.
`385 + 5 * 238 = 1575`: there is no trailing EOF byte. This is an observation,
not an invalid-file ruling. Raw update bytes `[1,4,9]` do not establish a producer
or a proven update year. All five deletion flags are `20` (active); handling
deleted records is not exercised. Byte 29 / LDID is zero and every payload byte
is ASCII. This proves the bounded strings below, not a particular codepage.

The [Microsoft table-structure documentation](https://learn.microsoft.com/en-us/previous-versions/visualstudio/foxpro/st4a0s68(v=vs.80))
supports the shared header/descriptor/delete-flag concepts. FoxPro-only backlink
and flag interpretations are not imposed on this source. The
[dBASE datatype documentation](https://dbase.com/KnowledgeBase/int/db7_file_fmt.htm)
supports the common C/N/L/D and memo distinctions; its newer 48-byte descriptor
layout is **not** used for this 32-byte-descriptor fixture.

| Native field | Type | Bytes | Decimals |
| --- | --- | ---: | ---: |
| RowDsc | C | 50 | 0 |
| Field1 | C | 50 | 0 |
| Field2 | N | 11 | 0 |
| Field3 | N | 14 | 10 |
| RowNumber | N | 11 | 0 |
| BooleanFld | L | 1 | 0 |
| IntFld | N | 11 | 0 |
| DoubleFld | N | 17 | 5 |
| StringFld | C | 50 | 0 |
| TimeFld | N | 14 | 10 |
| DateFld | D | 8 | 0 |

Before inspecting the XLSX, `scripts/qa-dbf/native.py` derives all raw field
slices, values, and classifications directly from the source. `result.json`
retains the full oracle including raw hex, descriptors and padding. It contains
10 nonempty text values, 27 numeric values, three known booleans and five dates.
Ten additional slots are five blank character, three blank numeric and two
unknown logical slots. Their bounded expected projection is blank; this is not
a SQL NULL / empty / unset round-trip guarantee. Unknown logical does not mean
FALSE. Numeric lexemes use trailing **NUL padding**, unlike the canonical
space-padding described in the cited common datatype reference. Their visible
decimal prefixes are independently readable and compared exactly, but this
does not certify complete normative DBF conformance. `TimeFld` is native N,
not a native time/timestamp field. No source formula is present.

Only C/N/L/D descriptors occur: no memo reference or external `.dbt` is needed
for this fixture. Memo, binary/OLE fields and companion resolution remain
untested. No general dBASE producer/charset/format coverage is claimed.

## Existing evidence reused

P2's `docs/tests/formatendekking/resultaat-windows.json` contains a historical
`lo-dbf-1` technical pass (`opened-saved-reopened`). The report is retained
unchanged, SHA256
`ed3e887dfb50c177d11695a1d0f4b03f0fb330382abe1acbd56690c160de56b8`.
Its date is **2026-11-10T08:48:03.136Z**, converter
`LibreOffice 26.8.2.2 9dea406ab7695df6325b11b0e19fdca8db4b7276`, profile SHA256
`8f301a135c288b99cc984a895030eee27ba40d3d9722f81c1d691d5f66f3de6c`.
That differs from P2's safe-profile SHA256
`847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40`.
Being committed in P2 does not make the historical execution a P2 execution.

The retained `historical-result.xlsx` is 6335 bytes and exactly matches the
report's saved SHA256
`31ee3dd78b8719413fe4e8c68896200f1597017091e604f27f6335214ec37199`.
It was reused from the original local #43 cache, not regenerated. The cache
filename `omgezet.xlsx` alone does not establish which stage wrote it; the
verified saved-digest identity is the binding used here. No official CI run,
artifact, fresh-process execution or current engine identity is inferred from
the local cache. Historical Linux 7.3.7.2 refusal (`source file could not be
loaded`) remains separate from the Windows pass and from the current P2 runtime.
The catalogue matrix and closed #43 describe technical scope; #30 remains the
appropriate overview. No independently reproduced current bug was found that
would justify another issue.

## Checks actually executed

Run from the repository root (Python standard library only):

```console
python -B -X utf8 scripts/qa-dbf/analyse.py
```

- Canonical P2 source catalogue, complete source entry, source bytes/Git blob,
  notices, report and saved-cache digest verified.
- **58/58 independent historical content cases PASS**: ordered field names;
  all 55 source slots with types/blank bounds; no extra valued cells or formulas.
  Date serials are derived from native YYYYMMDD and the actual workbook epoch,
  with an actual date style required. Numbers use exact Decimal equality.
  Header annotations after commas are converter presentation, not native rows.
- **5/5 output negative controls PASS**: numeric converted to string, unknown
  logical coerced to FALSE, missing date style, changed record anchor, and a
  formula added with an unchanged cached value each cause a new strict failure.
- **3/3 native reader controls PASS**: inconsistent header length, truncated
  records and a non-NUL numeric tail are rejected. These are oracle controls,
  not imported replacement fixtures or product parser/security tests.

The original source remains unchanged. The result is deliberately
`QUALIFIED_BOUNDED_DBF_SOURCE_HISTORICAL_CONTENT_REUSE_ONLY`, with
`fullFormatAcceptance: false`.

## Remaining boundaries

Static P2 policy routes `.dbf` through the desktop converter to XLSX. DBF is
absent from XLSX output formats, so the modern default save stays XLSX. This
differs from exportable value-only formats such as DIF. The browser needs the
external desktop converter for this route; no browser UI or browser runtime
test was executed here.

The concrete unproved P2 sequence is the pinned private converter + production
open helper + real spreadsheet engine edit / Undo / Redo + modern XLSX save +
fresh-process reopen with this source-derived oracle. No allocation was given
for that sequence, and no new CI/runtime/build/download was started. The older
test script does not establish these edit or fresh-process criteria. Native
Windows, Linux, macOS and browser acceptance therefore remain OPEN for this
specific new P2 content sequence; this static addition is not a platform pass.

Rendering/fonts, complete DBF schema re-export, non-ASCII/codepage behavior,
memo and deleted records, general NULL semantics, and formula import have no
positive witness. Keep those boundaries explicit when reusing the 58 passing
historical content checks. No product fix or new format claim follows from
this report.
