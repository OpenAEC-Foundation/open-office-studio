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

## Latest freeze dependency and content-audit handoff

The coordinator subsequently confirmed that no new combination pin or new
Linux/Windows/macOS build has started. His independent Windows SDK run passes
all44 checks on exact product-only85ac155f; both actual built WASM blobs and
metadata were verified. That is kernel evidence, not native app acceptance.
Necessary storage deltas377/cbacb7d1 and378/82b047fb are reviewable. A bounded
Email compose-modal Ctrl+S storage investigation may require one necessary
correction before the same freeze. That work remains with its existing owners.
Old-P2 Mac STW is still NOT-RUN while job137610274868 builds.

QA commitce4409d2 adds `audit-docx.mjs INPUT.docx NEW_OUTPUT [EXACT_MARKER]`,
which calls the unchanged shared contract/oracle directly. It passes on original
Windows output4dcb51f9, retained browser fresh-reopen676608bc and unchanged
converted controlb29d6adc. The coordinator will use it for the actual new-native
exports. This adds no product delta, GUI operator, app build or new native pass.
The coordinator will supply the exact new pin after necessary intake closes;
new-package STW operation/paint checks cannot begin before those inputs exist.

## Passive capture follow-up (QA only)

The coordinator corrected an initial visual interpretation of the old
`unchanged-windows-source.png`: SHA256a1823a99efd76c42c7bb5bfee30922c83b519f3ffde94a61f98f976a186d4916
is identical in both copies, and its title-area pixels equal fresh-context-reopen.
The original image already shows all three expected text bands. No acquisition
or product failure was independently reproduced; all old evidence is unchanged.

QA helper commit37d51d3e42a3a41dd8d4ffead41dff67e7f45724 nevertheless adds a
passive stability guard: a complete current worker frame, two main animation
frames per sample, and three identical original PNGs over at least200ms with
unchanged complete paint before/after capture. It retains first/accepted PNGs
and timing/hashes. No input, model injection, canvas replacement or pixel edit.
Original PNG marker/layout review remains explicitly separate from automation.

The already-started bounded Linux browser run45167245091 passed all four paint
cases and three real save/source audits. SDK44, existing field tests/typecheck
and font metrics were valid and not repeated. This was one frontend route,
without a kernel, native app or suite build. Artifact14815386292/full ZIP SHA256
`741a52645ca350015391b38a44c782f09b28dec4cd591e506a8cab8729df5fc6`
was verified before extraction. Accepted captures were stable315–334ms; all four
original PNGs were inspected, showing complete expected title/marker text and
no overlap, with the unchanged control retaining its original title only.

Reports, original first/final PNGs, actual DOCX exports, original-PNG review and
entry hashes are retained in `evidence/capture-followup/`. Product85ac155f is
unchanged. This QA follow-up is not a new-pin or native platform pass; root will
use the same helpers at the upcoming combination pin.

## Combined staging binding, still awaiting final freeze

The coordinator provided staging commit
`aa6a72ebef6968be1710ac7351335313f3241a47`, tree
`334ba1b6edc58ef04a4951c0e7521ccdf7da1906`, on
`codex/release-481-p3-staging-20261123`. It contains374/377/378 and the bounded
ZIP-test budget correction. His reported checks pass:71 directed tests,
44 SDK checks,9 config checks,3 std-Rust checks and TypeScript. Independently,
read-only Git-byte comparison confirms all five field374 product files exactly
equal product85ac155f, including both built WASM hashes. The binding is retained
in `evidence/staging-binding-aa6a72eb.json`; it is not runtime/package evidence.

This staging point is explicitly not a final freeze and has no new OS packages
or new-kernel native STW exports. The remaining Email blocker is localized:
with actual credentials the Draft button performs APPEND/MIME and preserves the
body after full quit/reopen, but advertised Ctrl+S in the compose modal does not.
The existing owner is preparing a local handler fix, without changing the global
modal guard. Only the coordinator chooses the resulting final commit/tree.

The old-P2 Mac producer is now successful: artifact14815326028, ZIP SHA256
`42c00b371f3cfe9fa46dd6c4ac63c6ac34b026d8df8a3bdcea0b4326d3bc9052`
(coordinator-reported; no large archive downloaded here). The Mac owner is
running its app cases; no Mac STW actual is reported yet. Old-P2 Windows/Linux
STW approval remains bounded and does not transfer to the changed kernels.

## Historical P3 source pin and native handoff

Intake is now closed on P3 commit
`98b340429436cf597a569549d043bd75b486e2ab`, tree
`780c0789c8badedc6760a8402a6994154a3bf402`, version2026.48.1, immutable branch
`codex/release-candidate-2026-11-23-p3`. Email379 is integrated alongside the
agreed374/377/378 and bounded Windows ZIP-test budget correction. The coordinator
reports229 directed Vitest tests,44 SDK checks,9 config checks and non-incremental
TypeScript passing. Official release producer45170708933/attempt1 is bound to
that exact branch/commit. Publishing is disabled per coordinator; no main/tag or
publication action is authorized here.

Independent read-only Git checks confirm the exact tree/version and all five
field374 product blobs match product85ac155f. Official run metadata confirms
workflow_dispatch at that exact source; the binding is retained in
`evidence/p3-source-binding.json`. This is source/run evidence, not an OS package
or native STW pass. New native exports have not been supplied yet.

Native operation remains with Windows750b, Linux writer_362 and macOS6f92. Each
OS can begin after its own official job/attempt/artifact/signature/hash binding
is ready, without waiting for another OS. Independent export audits here retain
the one shared `audit-docx.mjs`/contract/oracle; package identity, actual operation,
full quit/new-PID reopen and visual approval remain separately required. No own
GUI or build is needed. Root supplies the new actual packages/exports centrally.

## Historical P4 source pin

P4 supersedes P3: `04fa6cd43b84e3f59fb9d5055bb2d00dde351a47`, tree
`94fa38c20b51a73e4912964f37f0e1a659b0fb1b`, version2026.48.1, immutable branch
`codex/release-candidate-2026-11-23-p4`. The only code change from P3 replaces
the node:test import with vitest in the same nine package checks; the other
changed paths are release evidence/hand-off documentation. Independent Git-byte
checks confirm all five field374 product files still equal product85ac155f.
Official producer45172070275/attempt1 is bound to that exact branch/commit;
`evidence/p4-source-binding.json` retains this source/run binding.

The coordinator reports the complete local standard run:3657 pass,0 fail,
10 skip (4 missing POI corpus,3 spelling assets,3 DB corpus). Skips are not
passes. Exact-P4 SDK44 also passes; valid checks are reused here without reruns.
P3 failed/cancelled receipts and its source binding remain historical and intact.

All three OS jobs were building at first official inspection, with zero
artifacts then available. No P4 native STW exports or native approval yet.
Existing Windows750b/Linux writer_362/macOS6f92 operators and independent
per-OS start requirements remain unchanged. Publishing remains disabled per
coordinator; no own GUI/build or main/tag/publication action is authorized here.

## P4 browser original-PNG review: Linux and Windows

Read-only independent review of all16 original final PNGs from run45172148763,
QA22b82fda992632976ca1b84a78f8335bad7ee14b, on exact P4: PASS for the bounded
issue374 title/marker layout check. Both Linux and Windows cover `/` and
`/office/`, each with unchanged Windows output, unmodified converter control,
actual edit and fresh-context reopen. All12 marker cases visibly contain the
complete three bands `REPORT TITLE --` / `STW30 EDIT` / `2026-11-23`, without
visible title/adjacent-glyph overlap or clipping. All4 unmodified controls retain
the original title without the added marker. The subtitle remains separated.

Each original full PNG was directly viewed and its bytes/SHA256 rechecked after
review. Per-case source path/hash/findings and supplied official artifact bindings
are in `evidence/p4-browser-original-png-review-linux-windows.json`. No original
PNG, first capture, report or DOCX was changed. No new browser/native GUI was run.
Integration separately audits ZIP/source/receipts/SDK44/paint/capture and actual
downloaded DOCX contracts; those results are not asserted by this image review.

The existing font-substitution notice is visible; no cross-OS pixel/font identity
or full-document fidelity is claimed. macOS browser images and all P4 native
STW acceptance remain pending. This review does not grant native approval.

## P4 Mac edit-position driver follow-up

Run45172148763/job137684110044 reached the real edit with the marker before
the original title. The original failure PNG was directly reviewed: marker and
original title are complete and separated, but the required suffix order is
wrong. The unchanged Windows-output/control stages passed; the after-edit oracle
correctly failed. This is a wrong driver edit position, not a proved product
navigation bug. Original failure/paint/report hashes and source findings are
retained in `evidence/p4-mac-caret-driver-diagnosis.json`.

Pinned docx-react0.5.1 YrsInput applies metaKey||ctrlKey as wholeDocument to
Home/End. APP also includes the #358 Command+Up/Down compatibility patch;
the raw SDK handler alone does not describe actual APP behavior. The old
Up→Right failure establishes the wrong final edit position, not which step
failed; Right as field-end was not established. The Mac-only QA branch uses
real Meta+Home then End and verifies
the focused body input plus DOM caret position against the observed original
title ink/baseline before typing. `mac-field-caret.mjs` retains its read-only
geometry preflight and original PNG; wrong placement fails before mutation.
No document model/selection setter or product patch is used.

Windows/Linux retain their exact Control+Home then End path. Shared source,
marker/cache/boundary, paint/capture and four final-image/save/fresh-reopen
criteria remain unchanged. Both changed JS modules pass syntax checking;
functional Mac validation awaits the one authorized root-coordinated Mac-only
rerun at the same P4 source/build. No local/native GUI or own build is started.

Applicability of retained Win/Linux results was checked explicitly: all four
actual P4 success reports match prior browser/contract/capture source bytes
(Linux Git-LF; Windows exact CRLF checkout of the same bytes). Projecting only
the Windows/Linux OS branch makes old and new browser source literally equal;
contract/capture Git blobs are unchanged. Details are in
`evidence/p4-mac-followup-win-linux-applicability.json`. This supports retaining
those exact P4 results without another broad run; it is not a Mac runtime pass.

## Atomic-field projection proof and current P5 QA candidate

The first Mac red run45172148763 and the second red run45175445760 are both
retained. The second correctly stopped before typing, but its new QA predicate
wrongly equated the semantic field boundary with the visible ink edge.
Its focused body caret is557.125px; inkRight is888.25054px. No tolerance was
increased and no product patch or new product bug claim follows.

Read-only queries using the exact P4/P5 layout WASM c5a59ce0 and the unchanged
Mac SDK display-list bytes b21b0299 reproduce the projection: field range1..2,
x225.76/width364.479, forward2..3 empty, backward1..2 width30.37325, caret edge
256.13325. Canvasleft301 predicts557.13325px, within1/64 CSS pixel of the observed
caret. Pinned hit.rs clamps cached grapheme stops to docEnd2 and breaks ties
toward the smallest x; input mapping and End paragraph length1 select that
model end. Original input data, source hashes and actual query results are in
`evidence/p4-mac-caret-projection/`. `probe-field-caret.mjs` reproduces the query
through the same shared `field-caret-projection.mjs`, without a document/session
or selection setter.

The reviewed replacement keeps real Meta+Home then End and requires the DOM
caret to match that exact current-WASM model-end projection (0.25 CSS px), on
the original title baseline with focused body input. It binds the immutable SDK
display hash, current kernel, original font bytes, live Canvas font and identity
transform, and1:1 CSS/backing-canvas mapping. The full-ink-edge mismatch stays
explicitly recorded as a visible caret-projection observation for later.
Suffix/cache/boundary/paint/capture/save/fresh-reopen criteria are unchanged.
Local JS syntax checks and the read-only current-WASM query pass; this is not
yet a Mac browser or native pass. No third standalone P4 run is authorized or
started; root will validate once in the P5 three-OS/two-route matrix.

Current immutable candidate: P5 b696ab86bd1c128729a079b68c0082e6df3d36a5,
tree e30879fd772871e690847c061ef66e6b81808a05, version2026.48.1;
producer45177730188/attempt1, publishing disabled per coordinator. Independent
Git checks confirm all five field374 product blobs equal P4, including the
exact locally queried WASM. `evidence/p5-source-binding.json` records this;
P4 browser results remain historical on their own source. P5 browser/native
acceptance remains pending. No own GUI, extra CI, suite build or publication.

## P5 Mac capture-sampling follow-up

Real P5 matrix45179944903 / QA7be704895534c3095f697292af07dc10d2e5860b
has a Mac failure before the new caret preflight (field cases0). Its51 captures
share one unchanged complete worker frame, but at most2 consecutive equal PNGs.
The two dominant original PNG states (48/51 samples) differ only in106 pixels
at the2×53px custom caret; first versus last differs only in the status bar.
Original first/last/failure images were directly inspected: full marker/title
visible without overlap. This is a capture-driver diagnosis, not a Mac pass.

Pinned SelectionOverlay.tsx defaults to530ms blinking; sampling median276ms
included an extra100ms sleep. The minimal Mac-only change removes that extra
sleep after completed screenshots. Two rAFs, complete unchanged paint,
three consecutive identical full original PNGs,minimum200ms and15s failclosed
deadline remain unchanged. Windows/Linux retain100ms. No pixels, CSS, model or
product code changes; original trace still fails the same acceptance predicate.
Source/pixel/timing evidence and official ZIP binding are in
`evidence/p5-mac-capture-sampling-diagnosis.json`. Syntax/static checks pass;
new actual Mac validation still requires root coordination. No extra CI started.
