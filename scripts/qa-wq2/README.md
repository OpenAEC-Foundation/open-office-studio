# WQ2 original DOS VLOOKUP route under #30

Exclusive WQ2 scope confirmed by the integration chat. Application remains
frozen P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
Only own QA scripts/workflow and evidence are added. Prior WB2 and other proofs
remain unchanged. No product fix or release intake is part of this probe.

`fixture.json` pins one genuine, independently authored Quattro Pro DOS 5.0
file: `TESTLU.WQ2`, original publication in openpreserve/format-corpus. The
creator's CC0 declaration and explanation are separately hashed. Native BOF
`000002002151` and EOF `01000000` match official PRONOM `x-fmt/122`.
It is not a renamed WB1/WB2/WQ1/ODS/XLSX or an export made by this probe.

The independent stdlib byte oracle authenticates 236 native records, 61
populated cells, four VLOOKUP RPN programs, absolute A15/A2:E11 references,
and all original numeric/text caches. The creator documents zero-based Quattro
column arguments: 1/2/3/4 select B/C/D/E. Therefore modern XLSX VLOOKUP needs
2/3/4/5 for the same meaning. Expected results are selected independently from
native table cells and cross-checked against the original caches. Historical
libwps source is only read-only layout evidence, not an executed independent
parser oracle; shared parser lineage is disclosed.

The source job includes negative controls for WQ1, wrong function opcode and
incorrect numeric/text caches. No explicit native sheet name is stored, so a
name is not guessed from the prior WB2 implementation. Approximate-match edge
cases, HLOOKUP, macros, encryption, links, styles/charts and export to WQ2 are
outside acceptance.

The workflow first authenticates the source and checks actual production
capability/open functions without a desktop runtime. This negative Node check
is not an actual hosted browser UI test. It then authenticates the complete
coordinator runtime-only ZIP, descriptor/base descriptor, verifier, tar and
payload manifest; no Office build, full suite ZIP or system converter fallback
is used. `convert.py` invokes the private converter through actual P2
`bereidOpenen`, with the exact safe profile, isolated temporary directory,
stripped child token environment and timeout. The production helper proposes
editable modern XLSX, leaving the source untouched.

The actual pinned P2 WASM opens those conversion bytes, tests all 57 constants
and emitted formula preservation, changes A15 4005→4007, tests Undo/Redo and A13
text editing, saves XLSX and opens it in a fresh workbook instance. Independent
OOXML reports compare every populated address/value/type and all four formulas
at conversion, save and reopened/resaved stages. Numeric comparison uses an
absolute `1e-9` tolerance only for binary64/decimal serialization.

**Native semantic preservation and downstream execution are distinct.** Native
expectations are never overwritten by converter output. The engine separately
checks what the emitted modern formulas actually mean, independently evaluated
over the native table. All native mismatches stay in the report. The final
strict assertion fails after the edit/save/reopen observations are retained.
A completed downstream sequence does not make the format pass.

Actual outcome, exact harness/run/artifact/package bindings, retained source
reference and independent comparisons are in
`docs/tests/wq2-2026-11-23/README.md` and `result.json`. The original run is
intentionally red because index semantics were not preserved. This is not a
flaky test or an ignored test failure.

For source-only verification:

```sh
python scripts/qa-wq2/oracle.py source
```

Actual Office/engine execution is restricted to Linux CI on this own QA branch.
No native Windows/macOS/Linux packaged UI, installation, actual Tauri IPC or
hosted browser UI acceptance is claimed.
