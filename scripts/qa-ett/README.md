# ETT-only source investigation and production filename policy

Exclusive WPS spreadsheet-template scope under #30, confirmed by the integration
chat. Exact application P2 remains
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
No ET/DPS/DPT route, shared product/catalog files or current P5 intake changes.

Two outcomes must remain separate:

1. **No qualified native ETT fixture.** Twenty-one complete immutable public
   source/test inventories contain no `.ett` file. A hashed `.ett` lead is an
   unrelated Scade Project/SC XML template, not a WPS workbook. This is a bounded
   search, not a claim that no public ETT exists. No ET/XLS/XLT is renamed and no
   self-export is used as an independent import fixture. Qualified source,
   producer, license, template variant and content/formula oracle remain absent.
2. **Actual production predicate failure.** The actual P2 catalog includes ETT
   spreadsheet input, but `isSjabloon('policy-only.ett')` and `.ETT` both return
   false. Existing STC/XLT/OTS filename controls return true. The original WPS
   producer defines ETT as its spreadsheet template. The strict assertion for
   template recognition fails. This is a function-level result, not a native
   ETT import/save/overwrite reproduction.

`inventory.mjs` queries official GitHub tree APIs at pinned refs, requires
`truncated=false`, and records tree hashes, counts and all ETT matches. New
uninspected candidates fail the source-search step instead of silently being
classified as absent. The unrelated source is authenticated by Gitblob/length/
SHA256 and its Project/SC XML properties; its bytes are not retained or imported.

`policy.mjs` loads real P2 modules through Vite in Linux Node. It verifies exact
product tree and unchanged product files, executes the actual filename predicate,
and tests the no-desktop open policy with an explicitly synthetic **zero-byte
request**. This is never stored or called a fixture. The error gives the ETT
limitation and XLSX alternative; no conversion output is fabricated. The source
wrapper consequence is labeled a code inference, with actual new-document/save
and overwrite behavior explicitly untested. WASM bytes are identity-hashed only.

The workflow uploads reports even after the strict predicate failure. No Office
runtime artifact is consumed/downloaded, no spreadsheet WASM is initialized,
and no conversion/edit/UndoRedo/save/freshreopen or native/hosted-browser UI
acceptance is claimed. `unused-runtime-pin.json` records the existing coordinator
input solely for a future qualified ETT source.

```sh
GH_TOKEN=... node scripts/qa-ett/inventory.mjs
node scripts/qa-ett/policy.mjs
```

The production-function check is Linux-CI-only. Do not replace the absent source
with renamed or generated workbook bytes. The first command may reproduce the
source inventory; it does not make the source gate pass. The second command
intentionally fails on the missing ETT recognition in unchanged P2.

Exact run/harness/artifact bindings, source gap and predicate evidence are in
`docs/tests/ett-2026-11-23`. No product fix or release intake is included.
