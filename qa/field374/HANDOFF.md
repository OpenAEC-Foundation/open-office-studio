# Issue374 bounded correction — integration handoff

Product-only branch `codex/writer-field374-product-2026-11-23`, commit
`85ac155f1e7dc2c7d2469fcebf647f6a7fe34823`, starts at exact P2
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`. Only five product files change:
`patches/tekstengine-nootnummering.patch`, its JSON metadata,
`scripts/bouw-tekstkern.py`, and both `vendor/tekstengine/*_bg.wasm` modules.
These five Git blobs equal the actually tested QA application commit
`d1fd2c8e8b072f0cb2ca4f05661752b7a7c7f334`; the product-only branch is a clean
delivery of that delta, not another independently tested application package.

The allCaps-field branch shapes a temporary uppercase display copy, retaining
the resolved field primary face, tracking and horizontal scale exactly once.
The original model/cache/instruction stays untouched and the field still spans
one document unit. The ordinary non-caps field path remains literally unchanged.
This does not claim a general correction of non-caps fields with tracking.

## Reproducible kernel binding

- Upstream SDK source: `openooxml/betteroffice` at
  `4e982c3aea0065578604c3fe7727938533888f66` (SDK0.5.1).
- Patch SHA256: `4ab76ce09642d6e4a5c77a025f41ce1844f41b680ab35322068507d3d3e4bf9a`.
- Successful Linux kernel run45160737859, source
  `31f49c175e956b356b46540d40ab1e1afd8a5061`.
- Artifact14810727151; full ZIP SHA256:
  `c119462959995c5f77ee866c6323a0aca243f6fbee7f19108ff1060913e5328b`.
- Edit WASM24560084bytes:
  `4364eb8065228c805d8fbefe7e58c29e392516b6e7cca419e191766881d324ce`.
- Layout WASM4373099bytes:
  `c5a59ce0d980cd7f85775aaf283bcac1c19fba976b47bbe08c0387e2ca7d2569`.
- All five Rust field regressions, existing required math/note/table/seed
  controls, and JS/WASM import/export contracts pass.

Build1 is historical and must not be adopted: the independent scaled control
found517.38544px instead of546.71875px in both modules. Final build2 reserves
546.71875px at150%; actual same-font painted ink ends545.49994px from its origin.

## Actual functional proof

Linux run45162716669 at exact application commit
`d1fd2c8e8b072f0cb2ca4f05661752b7a7c7f334`, tree
`4177d9a43a5c0bf04c7df2e8722933fe633504be`, is successful:

- Both actual default vendor kernels:44 SDK checks, actual edit/Undo/Redo/save
  and fresh-session reopen, ordinary P2 baseline, Unicode, primary font,
  adjacent text/wrapping and150% scale.
- Existing focused Writer field tests:8 tests in2 files; TypeScript check passes.
- Real Chromium151 `/` route: unchanged original Windows DOCX, unchanged
  converted control, actual keyboard edit, actual downloaded save, fresh browser
  context reopen and resave. Four paint observations plus three save audits pass.
- Actual worker paint reports no overlap: title inkRight556.54365px; first
  adjacent inkLeft571.698px, also after fresh reopen. Images were inspected.
- Full source-derived eight-block/style/heading/placeholder oracle passes.
  Original DOCVARIABLE and cached `Report Title` remain intact; the edit stays
  outside fldChar/end. All five downloaded SDK/browser DOCX exports also passed
  an independent stricter field-boundary re-audit using the final contract.
- No page errors/external requests. Browser contexts/browser/preview server and
  SDK sessions were closed; no local native GUI or capture was started.

Artifact14811746829, full ZIP SHA256
`ac402c5e42c092a25c5d36768aa67686e35037c0433a7d324c9d45b086f89b43`.
Verified artifact bytes/reports/images/DOCX and entry hashes are retained in
`evidence/final-linux/`. Before-fix P2 SDK and Canvas evidence and the failed
build1 scaled control remain under `evidence/`.

## Reuse and remaining acceptance

Use the exact commands and requirements in `README.md`: `sdk.mjs APP_COMMIT
OUTPUT` and `browser.mjs APP_COMMIT BUILD_PATH ROUTE OUTPUT`, called from the
actual application checkout. The browser helper uses the receipt-bound frontend
and real font assets; it never flattens fields or injects document state.
The final contract adds explicit field-result boundaries; it was rechecked
against the five unchanged downloaded exports rather than rerunning the browser.

Root alone chooses the next combination pin and packages. P2 and its historical
STW converter/runtime/browser-limit evidence stay unchanged. New-pin3OS×2routes
and native acceptance are still outstanding: Windows750b, Linux writer_362 and
macOS6f92. Their previous package passes do not transfer to changed kernels.
This Linux frontend proof is not native acceptance. Source has zero tables, so
there is no table-fidelity claim. No main/tag/release change or app/Mac build.

## Coordinator-confirmed native status, 2026-11-23

These are coordinator-reported results, not new native tests performed here:

- Windows750b, run45152204418: P2 native I/O/XML passes, with the original
  issue374 overlap. No visual approval of the replacement kernels.
- Linux writer_362, run45157371765 / proof5622eeb0: real OpenFile/SaveFile,
  Rust conversion, normal Alt+F4 exit, new-PID reopen and three XML audits pass.
  This is old-P2 evidence; long-marker images do not approve issue374.
- macOS6f92: NOT-RUN; its own Mac release producer is still building.

The coordinator is reviewing product85ac155f and the actual WASM/render proof.
The next single combination pin also awaits the independently owned necessary
Linux storage corrections377 and378. They have no source overlap with the five
field374 product files. No further field374 source change is requested without
a new review finding. The shared QA helpers will run at that new pin; all
new-kernel native and new-pin platform results remain explicitly outstanding.
