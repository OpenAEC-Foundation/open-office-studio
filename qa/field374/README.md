# Field374 — one shared SDK/browser regression

The fixtures and original STW oracle are copied byte-for-byte from the verified
STW QA branch; hashes are enforced by `contract.mjs`. `source.stw` is the genuine
LibreOffice/core 2003 `qadevOOo/testdocs/report.stw` at
`ded596096a767fa470eea8dfccd51c1af5c3dd54`. `converted.docx` is the actual P2 private
conversion; `windows-resaved.docx` is the unchanged output of native run 45152204418,
SHA256 `4dcb51f93bd88f3d4bd3a9956f53cff23613235fe222632734b8090f9ea18310`.
No diagnostic flattened file is used as an accepted input or workaround here.

Run from the **application checkout**, using the exact application commit:

```
node PATH_TO_QA/qa/field374/sdk.mjs APP_COMMIT OUTPUT
node scripts/writer-proefbuild.mjs build BUILD_PATH ROUTE
node PATH_TO_QA/qa/field374/browser.mjs APP_COMMIT BUILD_PATH ROUTE OUTPUT
node PATH_TO_QA/qa/field374/audit-docx.mjs RETAINED.docx NEW_OUTPUT [EXACT_MARKER]
```

`APP_COMMIT` is a full 40-character commit matching the current application's HEAD;
`ROUTE` is `/` or `/office/`; build/output paths should be new private `.local/`
paths. The SDK helper and browser receipt checks resolve actual production code
from the application's CWD, even if this QA lives in a separate nested checkout.
Fixtures/contracts resolve from the QA checkout. Dependencies are the frozen
application pnpm install, Node 22+, Python 3 (or `OOS_FIELD_PYTHON`) and Playwright
Chromium plus its ordinary OS dependencies. The builder needs its normal assets
and spelling-WASM toolchain. The SDK uses the pinned @betteroffice/fonts 0.4.0
LiberationSans-Regular.ttf bytes, SHA256
`76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8`;
this is the same font blob as the upstream Rust tests. Browser font assets come
from the actual receipt-bound frontend; the test does not replace its fonts.

`audit-docx.mjs` applies the exact shared contract to an actual retained native
or browser DOCX, without opening an app. The marker defaults to the existing
` -- STW30 EDIT 2026-11-23`; pass the exact marker explicitly for another edit,
or an empty string for an unchanged control. Create the parent output directory
first; the last directory must be new. It checks the original cache inside the
field and the marker outside it, plus the source-derived oracle. It copies the
input into its proof directory and verifies that the original input stays
unchanged. This is content evidence only: package identity, real native actions,
normal exit/new-PID reopen and visual paint remain separate owner evidence.

The SDK checks both resident edit and standalone layout kernels, actual title
geometry before/after edit/Undo/Redo/save/fresh-session reopen, adjacent-run start
and wrapping, ordinary non-caps P2 baseline widths, Unicode expansion, tracking,
150% horizontal scale, primary-font policy and one-unit field spans. Source XML
and the original unknown DOCVARIABLE instruction/cache stay intact.

The browser helper opens the unmodified Windows DOCX, then edits the unmodified
converter control through focused keyboard input, downloads actual saved DOCX,
and opens that output in a fresh browser context. It observes real Canvas title
and suffix paint in the page/worker by forwarding every original draw call
unchanged. It checks actual glyph bounds, captures images and treats missing
observations as driver failures. It never sets the editor model or field values.
Platform shortcuts use Meta on macOS and Control elsewhere. The Mac edit
preflight uses the pinned input handler's actual `Meta+Home` then `End` route.
Before typing it reads DOM caret geometry and compares it with the pinned current
WASM's projection of the original atomic model end. The immutable retained Mac
SDK display list, WASM hash, measurement-font bytes, live Canvas font/identity
transform and1:1 CSS canvas mapping are checked. It retains a preflight report
and original PNG. Wrong placement fails before mutation. No editor selection or
model is set. Windows/Linux keep their existing Control+Home then End.

For this atomic cached field, model end projects after the first cached grapheme;
the full visible ink edge is not a semantic cursor locator. This visible caret
projection limit is retained as an observation for later, not repaired or hidden
here. `probe-field-caret.mjs RETAINED_DISPLAY.json OUTPUT.json` uses the same
read-only projection module to reproduce the geometry without opening a document
or changing a session. No new product or native acceptance follows from it.

After a complete current worker frame, `capture.mjs` passively waits two main
animation frames per sample and requires three identical original full-page PNGs
over at least200ms, with unchanged complete paint observations before/after each
sample. It retains the first PNG, accepted PNG and capture hashes/timing. Failure
to acquire stability is a driver failure. Pixel stability is not text recognition:
the accepted original PNG must still be reviewed for the complete expected marker
and layout; the report explicitly preserves that separate visual-review step.
Mac sampling omits the additional100ms pause after a screenshot: the two animation
frames and actual screenshot already await presentation. This avoids the observed
276ms sampling cadence straddling the SDK's530ms custom-caret blink. Windows/Linux
retain the pause. All stability predicates and original-image criteria are unchanged.

Both helpers share the independent original 8-block/style/heading/placeholder
oracle and additionally require Title 32pt/caps/80-twip tracking and the original
DOCVARIABLE with its cached `Report Title`. Reports, actual downloaded DOCX,
source audits, paint observations, images, kernel/source/build hashes and cleanup
results are written below OUTPUT. Native app acceptance remains a separate owner
check on the actual newly frozen package. Ordinary non-caps fields with tracking
are controls; this correction does not claim a general repair of that older path.
