# Writer conversion waits and round trips (#2, #31, #34)

## Reproduced failure and focused correction

On Windows, the same synthetic D1 DOCX and macro-disabled strict-ODF profile
behave differently when LibreOffice queries the current user's system printer:

| Child environment | Result | Time |
| --- | --- | ---: |
| Printer discovery disabled | Exported ODT | 13,812 ms |
| Original environment | 45-second timeout | 45,500 ms including termination |
| Printer discovery disabled, repeated | Exported ODT | 10,281 ms |

The tested converter is LibreOffice 26.8.2.2, build
`9dea406ab7695df6325b11b0e19fdca8db4b7276`. The profile and input were identical
in all three trials. A separate four-case OpenCL control also timed out,
including two profiles where UseOpenCL=false was read back successfully and
no OpenCL cache was generated. Disabling OpenCL alone did not fix this failure.

Set `SAL_DISABLE_DEFAULTPRINTER=1` and `SAL_DISABLE_PRINTERLIST=1` only on the
conversion child. The operating-system default printer, parent environment,
45-second deadline, macro restrictions and external-link policy are unchanged.
LibreOffice's [upstream printer implementation](https://github.com/LibreOffice/core/blob/bd7011e96264ddfe5506839319dd610975328a59/vcl/source/gdi/print.cxx)
uses these switches to skip the default printer and printer enumeration.

The Rust regression starts a real child test process, verifies the two values
inside that child and checks the parent's environment remains unchanged.
[Desktop run 42613174167](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42613174167)
passed the native Cargo tests on Windows and Linux on exact commit
`b957143e0551337926ff76473b3cdd994020e604`. The local Windows native build was
blocked by Application Control error 4551; that local failure is not reported
as a successful build. The GitHub macOS job was still queued at reporting time.

## Repeatable Writer matrix

`scripts/test-writer-formaten.ts` opens the real DOCX adapter, copies the
production module graph with the existing source corrections and loads the
pinned production edit/layout WASM. It creates each source format with the
real converter, opens it through `bereidOpenen`, and verifies the default save
format. Legacy DOC/DOT suggest DOCX; ODT/OTT/FODT retain their source format.

For every case it saves both without an edit and after the prescribed D1–D3
edit, exports back to the source format, converts back to DOCX and opens that
exact result in a new Yrs session. The independent Python standard-library
reader checks normalized paragraph text and feature counts for tables,
images, notes, comments, revisions and headers/footers. It compares ODF output
directly with the original ODF source rather than only comparing two DOCX
imports. Source hashes are checked; converter logs and all outputs are kept.

Windows measurements on the integrated PR228 and PR238 fixes passed all six
ODT/DOC cases, 36 real conversions in total. Three further D3 cases pass in
OTT, FODT and DOT, another 18 conversions. The initial Windows attempt for
these extra formats silently produced no output under deep test profiles;
short profiles in the operating-system temporary directory succeed. The
test now matches the native app's temporary-directory approach, retains its
files under the report directory, and removes only the verified temporary
directory it created. The original failed test JSON remains in `.local`.

[Writer run 42613174076](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42613174076)
passed all 15 cases (D1–D3 × ODT, OTT, FODT, DOC, DOT), with 90 real
conversions on Ubuntu 22.04, exact commit
`b957143e0551337926ff76473b3cdd994020e604`. Its downloaded artifact contains
all 15 passing comparison reports, the actual saved packages, converter logs,
isolated profiles and production-engine hashes. This CI run tests paragraph
and feature preservation; strict ODF 1.3 validation is covered separately by
PR238. The Windows integrated outputs were independently revalidated without
launching LibreOffice: 9 ODT and 3 OTT packages plus 3 FODT documents passed
all 75 package/schema checks.

The portable measurements and hashes are in `2026-11-09-writer-printers.json`.
A real chart-containing DOCX also exports to a readable one-page PDF in
12,610 ms with these same child settings. The independent pypdf reader confirms
page count and nonempty text; this is a crash/output check, not visual QA.
Repeat with `OPENAEC_CONVERSIE_PROGRAMMA` pointing at a real converter, then
run `pnpm exec vitest run --config scripts/writer-formaten.config.ts --configLoader runner`.
On Windows, set `OOS_WRITER_PYTHON` if Python is not on PATH. All real
conversions retain the production 45-second limit; the larger Vitest test
deadline covers the six sequential conversions within one case.

## Limits

These checks establish the tested paragraph text, package syntax and feature
counts. They do not establish visual equivalence, arbitrary ODF/Word semantic
preservation or all historical producers. Generic printer-independent metrics
can affect layout, so no pixel- or pagination-equality claim is made. No new
installed desktop app was built locally. A separate seven-file legacy corpus
found a problematic image-file import and a PPTX object flattened during DOC
export; those deviations remain recorded in the legacy-DOC follow-up. The
original Y-app's complete Ctrl+S and live storage contract still need a test
environment; the user requested local verification only. Keep
#2, #31 and #34 open for their remaining acceptance criteria.
