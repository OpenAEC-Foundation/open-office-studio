# ET — source qualification remains open

Exclusive ET investigation under #30, on own branch
`codex/et-qa-2026-11-23-e0d7`. ETT/DPS/DPT are outside scope. Frozen P2 product
commit/tree/version are unchanged:
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b` /
`5a644e397ecc6af5452a49b6404edf953687d1b2` / `2026.48.1`.

**No ET acceptance claim.** The source investigation found a WPS-family
candidate, but did not establish independent native-ET producer provenance.
`sourceGatePassed`, `sourceImportAcceptance` and `fullFormatAcceptance` are false.
This does not mean the application's ET support was disproved: the qualified
input needed for that test is missing. No product bug is independently confirmed.

## Candidate and actual byte observations

[Sayi/poi-tl](https://github.com/Sayi/poi-tl/blob/81edcbd9227a619078c07052830a2cd6a4333bb7/poi-tl/src/test/resources/attachment/test.et)
publishes `test.et`, 19968 bytes, Gitblob
`484a4fea7dfd403d35b7a2c6c1481911e108c8cc`, SHA256
`e0a5ae8f885991b40c8f716a3ae041210426f506c53adb80e392ed577975d3e2`.
It was introduced in commit `c2f77d7fde2975e36f031d05676b125227e0da9c`
(2025-08-25), in generic Word-attachment tests. The repository distributes it
under its Apache-2.0 project license; no per-fixture override was found. This
project-distribution license is not an original ET-producer declaration.

The CFB container has WPS-family indicators: `ETExtData`, generic application
label `WPS 文字`, and build metadata `2052-7.5.1.8994`. These are byte observations,
not independently witnessed claims of which save procedure created the file.

The same commit adds an XLS control, also 19968 bytes, Gitblob
`3ce03dc67acb1ecc9ec2f2832f5955a6aadf228c`, SHA256
`e510c13c7991206c10a33be2b018631e52b5fb6ef3a0512b538c8730e12fc87b`.

| Stream | Bytes | ET versus same-publication XLS |
| --- | ---: | --- |
| Workbook | 15598 | Byte-identical, SHA256 `7da8ecb0206f0cb61a73f1ec5b64b1ded0447ef164aae2cab3161068cad86bf4` |
| ETExtData | 570 | Byte-identical, SHA256 `59a721bef100a0c143fa624fecc2aca08125eabe32a1a7bccee873eed2278c0a` |
| SummaryInformation | 216 | Property metadata differs |
| DocumentSummaryInformation | 412 | Property metadata differs |

Only 28 complete-file bytes differ, all in the two property streams. Therefore
the ET filename, WPS metadata and shared extensions do not independently settle
native-ET Save-As versus WPS-authored XLS/renaming for this publication.
**Matching payloads do not prove renaming or forgery.** No file was renamed or
exported by this probe to manufacture an ET source.

This boundary fits the primary developer documentation:
[SheetJS](https://docs.sheetjs.com/docs/miscellany/formats/#wps-office-spreadsheet-et)
describes ET as BIFF8 plus proprietary extensions; the
[WPS producer](https://www.wps.com/feature/et-file/) distinguishes native ET from
changing a suffix. A [historical Aspose component report](https://forum.aspose.com/t/wps-office-support/199681)
describes reading WPS-produced ET similarly to XLS. These general format
descriptions do not authenticate this particular candidate's production history.

## Independently derived candidate content

The own read-only CFB/BIFF8 reader derives Sheet1 and all six populated cells
directly from the candidate, using BOUNDSHEET, SST, LABELSST and RK records:

| Cell | Type | Source value |
| --- | --- | --- |
| A1 | text | 类型 |
| B1 | text | 地址 |
| C1 | text | 联系方式 |
| A2 | number | 1 |
| B2 | text | 武汉 |
| C2 | text | 00011000 |

There are zero original formulas. The leading-zero value remains typed text in
this source oracle. ETExtData is hashed but not semantically decoded or accepted
for fidelity. [Candidate oracle](candidate-content-oracle.json) and
[source comparison](source-gate-report.json) preserve exact record offsets,
stream hashes, changed offsets and the unresolved gate. These are candidate
diagnostics, not an accepted original ET formula/content-import test.

## Search evidence and false positives

[search-evidence.json](search-evidence.json) records 19 other public source/test
inventories at immutable refs, each with a complete non-truncated tree response
and no `.et` path. They include LibreOffice's sc subtree, Apache Tika/POI,
openpreserve, format-commons, Spire, Aspose, ONLYOFFICE and libxls. This is a
bounded targeted search, not a claim that no public ET file exists anywhere.
Unavailable/restricted leads are recorded separately, not counted as empty
inventories, and were not bypassed.

The independently inspected
[Extension-List false positive](https://github.com/Tom60chat/Extension-List/blob/74e784db06e7a76fc3b61189830e241c3b6d0105/List/WPS%20Spreadsheets%20Workbook.et)
is 448 bytes of plain Lorem ipsum text. It has no workbook container. It was
rejected, not converted and reported as a passing ET import. Search results also
included unrelated Estonian-language files and game entity templates.

Open and closed project issues were searched for Kingsoft, ET/WPS and WPS
Spreadsheets; no matching specific report was found. The unresolved fixture
research stays under existing #30. No new aggregate or speculative bug is made.

## Actual checks, CI and retained artifact

[CI45176643338](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45176643338),
job137699487658, tested harness `fbf6c8befc9d4d3e61806690c74fd803ef0a4629`,
passes the byte/source comparison and actual production no-desktop policy.
Its green result **does not make the source gate or ET import pass**.

Actual P2 production functions run in Linux Node with an empty window and no
Tauri bridge mock. They identify ET spreadsheet input, no ET export/template,
and return the concrete no-desktop ET limitation with an XLSX alternative.
See [browser-limit-report.json](browser-limit-report.json). This is not an actual
hosted browser UI test. The actual P2 WASM file is identity-hashed only, never
initialized or executed.

The complete official [retained result ZIP](retained/et-source-gate-and-policy-result.zip),
artifact14820146594, is **21219 bytes**, SHA256
`1c66008e9b47df19357bafb21c0ba9b8a79e158606df6e65b7f203db4a06a485`.
The downloaded complete ZIP matches the official artifact digest. It retains
the unqualified candidate, same-publication control, project license, rejected
placeholder, independent source oracle and actual policy report. No Office
runtime or installer is included. Full binding is in [result.json](result.json).

After verifying that digest, extract into a new `.local/et-qa` and replay the
source-only checks with:

```sh
python scripts/qa-et/intake.py
```

The source gate must remain false. One trailing EOF blank line was removed from
the own CFB reader after the tested harness; no behavioral code changed and no
new runtime run is claimed for that documentation/whitespace delivery.

## Remaining prerequisite and unperformed tests

Needed next: independently documented original native-ET production for these
exact bytes, or another genuine published ET source with usable license and
provenance. Establish a source-derived content/formula oracle before accepting
the canonical conversion/engine/edit/UndoRedo/XLSX-save/freshreopen route.

Shared runtime-only artifact14805600515 and its existing descriptor/verifier
pins remain recorded for that future qualified input. They were **not downloaded
or consumed again** here. No Office conversion, actual spreadsheet WASM,
edit/UndoRedo/save/freshreopen, installer, native Windows/Linux/macOS GUI or real
Tauri IPC acceptance was performed. No hosted-browser UI, visual/style/macro/
encryption, ETExtData fidelity or ET export acceptance. No product/catalog/P4
intake/main/tag/release-publication changes, app/suite/Mac builds or local GUI/
capture/profile changes. WQ2/#381 and all previous bounded outcomes remain intact.
