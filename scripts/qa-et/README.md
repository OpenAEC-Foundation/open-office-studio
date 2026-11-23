# ET source qualification and read-only P2 policy under #30

ET only, exclusive scope confirmed with the integration chat. ETT/DPS/DPT are
outside this assignment. Exact P2 remains
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.

**No authentic ET source/import acceptance is established.** This is a bounded
source investigation, not an ET conversion or engine pass. A successful CI run
means the source comparison and negative production-policy diagnostics passed;
`sourceGatePassed`, `sourceImportAcceptance` and `fullFormatAcceptance` remain
false. Do not use an arbitrary renamed/exported XLS/XLSX as positive ET proof.

`fixture-gate.json` pins a real publicly distributed ET-named WPS-family
candidate from Sayi/poi-tl and the same publication's XLS as a read-only
provenance control. The original ET has WPS `ETExtData` and generic WPS metadata,
but both Workbook and ETExtData are byte-identical to the XLS. The 28 differing
bytes affect property metadata only. Upstream uses these files for generic Word
attachment tests; no original WPS native-ET Save-As procedure is documented.
This is **unresolved producer provenance**, not proof that the ET file is fake.
Equal payloads are not a general rule for rejecting ET: ET extends BIFF8, and
WPS-authored XLS may share WPS extensions.

`intake.py` independently checks exact file/Gitblob/SHA256 identity, the
version3 CFB streams and their hashes, and source BIFF8 BOUNDSHEET/SST/LABELSST/RK
records. Candidate content is one Sheet1, six populated cells, five strings and
one number, zero formulas. This content oracle does not establish ET authenticity.
A separate 448-byte Lorem ipsum file advertised with an ET extension is rejected
as a false positive. It is never fed to an Office converter as ET proof.

`browser-limit.mjs` checks actual P2 production capability/open functions in
Linux Node with an empty window and no Tauri bridge mock. The catalog maps ET to
spreadsheet input, does not declare ET export, and does not classify ET as a
template. The actual no-desktop open policy gives the concrete ET limitation
and XLSX alternative. The WASM file is identity-hashed only, never initialized.
This is not a real hosted-browser UI or content-import test.

The workflow runs only source diagnostics and that read-only policy check. It
does **not** download/execute the shared Office input, initialize the spreadsheet
WASM, convert/edit/save/reopen ET, build an app/suite/Mac package, or operate a
local GUI/profile. `unused-runtime-pin.json` records the previously agreed shared
input for a future qualified source; it is not a new runtime-consumption receipt.

Source-only replay:

```sh
python scripts/qa-et/intake.py
```

The full independent search inventory, source ambiguity, exact tested harness,
CI/artifact/digest binding and remaining work are retained under
`docs/tests/et-2026-11-23`. A suitable independent native-ET producer witness or
different genuine ET source with usable provenance/license is needed before the
conversion/engine/edit/UndoRedo/XLSX-save/freshreopen route can be accepted.
No new product bug issue, catalog claim, P4 intake or main/release change is made.
