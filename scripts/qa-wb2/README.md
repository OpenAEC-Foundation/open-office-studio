# WB2: bounded real-file QA under #30

Exclusive format scope agreed with the integration chat: **WB2 only**, frozen
P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
No product, catalog, release or shared application changes.

## Original source and independent expectations

`fixture.json` pins the original `testQuattro.wb2` from
openpreserve/format-corpus and a byte-identical Apache Tika regression fixture.
The original corpus description says it was created in Quattro Pro 6.0 and
records Johan van der Knijff's CC0 dedication. Both original downloads, the
license/provenance description, Gitblob, byte length and SHA256 are checked.
The corpus published the file in commit
`9ab17f1a842a20f28862b34bd841a538ab871d4c` (2017-09-18).

This is a flat native record stream with BOF version **0x1002**, not an ODS/XLSX
renamed to WB2, WB1 or WQ2. The pinned independent Gnumeric implementation
documents this signature and the relevant record/opcode/reference layouts.
It is read-only format evidence: no Gnumeric or shared upstream parser is run
to obtain expected cells. The oracle is a separate, narrow Python stdlib byte
reader, built before conversion. It inventories every record up to native EOF
and retains the 41-byte extended-storage trailer without accepting its fidelity.

The sole native page has ID 0 and no explicit page-name record. Its expected
name `A` is the native default, not a literal stored custom name. The source
contains labels X/Y/Z in A1:C1, 20 signed integer cells and ten formula cells.
Each formula has native RPN bytes `01 01 0b 03` (reference, reference, multiply,
end), plus relative references to the two cells on its left. Arithmetic from
the raw integer operands independently gives caches
`10,18,24,28,30,30,28,24,18,10`. No converter result defines the oracle.

The source checks fail closed on unexpected layouts. Negative guards reject
a WB1 header, multiplication changed to addition and a wrong original cache.

## Actual execution

`.github/workflows/qa-wb2-e0d7.yml` runs Linux CI only:

1. Fetch and authenticate the genuine source and derive the native oracle.
2. Load actual P2 production functions in Node and check the no-desktop
   capability/open policy rejects WB2 with an XLSX alternative. This is **not**
   an actual hosted browser UI test, and uses no Tauri bridge mock.
3. Verify the coordinator Git descriptor, complete official runtime ZIP digest,
   tar, verifier and manifest; consume only runtime-only artifact `14805600515`.
   The unchanged shared verifier checks the private payload. The parent
   DEB/source/version verification is inherited, not a new installation test.
4. Call actual `bereidOpenen` with an adapter invoking that verified private
   converter, P2's exact safe profile and production XLSX export filter in a
   private temporary directory; no system converter fallback.
5. Independently inspect converted XLSX package/XML: exact populated addresses,
   values/types, all ten original relative formula strings and numeric caches.
6. Open with actual P2-pinned `@betteroffice/xlsx` WASM; check all 33 cells and
   ten formulas. Edit A2 from 1 to 7, verify C2 recalculates 10 to 70, Undo to 10
   and Redo to 70, then edit A1 text. Save the recommended modern XLSX, open the
   bytes in a fresh workbook instance, and independently check both saved and
   freshly reopened/resaved OOXML. Recheck the unchanged WB2 source hash.

Runtime pins are in `runtime-input.json`. The full ZIP SHA256 is checked before
extraction; the coordinator's Git descriptor and artifact base descriptor have
distinct correctly checked SHA256 values. Tokens are removed from converter
child environment; each invocation uses an isolated profile and a timeout.

The actual first strict run `45166562262` stops at the sheet-name comparison:
the converter names the sheet `Sheet1`, while the native-default expectation
from the independent reader was `A`. The source stores no explicit name.
This remains a visible strict mismatch and is not asserted to be a confirmed
product naming bug. No expected name was changed to make the test pass.

The separate `qa-wb2-downstream-e0d7.yml` / `analysis/` workflow authenticates
the complete **33 KB prior result ZIP** and its exact converted XLSX bytes,
reparses the source independently, then executes steps 5 and 6 as downstream
cell/formula evidence. It does not rerun the converter, substitute a mocked
production callback, download Office again or replace the original failed run.
Both the strict naming mismatch and successful downstream checks are recorded
at every output stage. `strictSourceImportAcceptance` and
`fullFormatAcceptance` remain false in this diagnostic.

Run the workflow on its own QA branch. Static source-only verification is:

```sh
python scripts/qa-wb2/oracle.py source
```

Actual converter/engine execution is restricted to Linux CI. It needs the
authenticated GitHub artifact consumer and must not be redirected to a locally
installed Office suite.

## Acceptance boundary

Read the exact run, harness, artifact bindings and outcome in
`docs/tests/wb2-2026-11-23/result.json`. A bounded cell/formula-route pass cannot
be interpreted as full WB2 fidelity. Charts, layout, styles, custom sheet names,
macro execution/nonexecution, encryption, other Quattro variants and WB2 export
are not accepted by this fixture. The non-cell records are inventoried only.
No native Windows/macOS/Linux packaged UI, installer, actual Tauri IPC or hosted
browser UI acceptance is claimed. Existing proofs and intake remain unchanged.
