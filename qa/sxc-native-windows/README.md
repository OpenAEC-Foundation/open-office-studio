# #30: one native Windows SXC cell/drawing case

Integration assigned only this free case after completed Windows GNM/XLSB/UOS/
STC. STW750b and SDD e0d7 stay separate; Windows6-app preparation is preserved.
The45–90 minute estimate covers this bounded case; drawing/oracle gaps can extend
it. No product/catalog/version/shared-index edit, app build, Mac job, local GUI,
main/tag/release/publication is authorized or performed by this QA scope.

Exact ordinary P2 suite: `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`,2026.48.1, Desktop45143305147,
Windowsjob137586342967/attempt1. Existing canonical Windows artifact/ZIP,
package-report, NSIS, independent x64 payload==installed-exe and actual native
app-id/version/process/profile/own safe-runtime gates are retained. This ordinary
unsigned suite is not final signing/release/standalone acceptance.

## Source frozen before import

`fixture.json` reuses existing `lo-sxc-1` from the shared source manifest:
LibreOffice/core@92c170f11d44857d8e365f2e29fb449dfb567ff5,
`sc/qa/unoapi/testdocuments/calcshapes.sxc`,13030 bytes, Git blob
`7f98b1a501e004eafe85e4947dbbe88a292e9c19`, SHA256
`9a367d8e849001453b7d5684401f769abd63a621165ea3878da9d64b6fe2de2d`.
Original StarOffice6.1 Beta1 Sun XML0.0/office-version1.0 and Calc MIME remain
unchanged. Pinned upstream README/COPYING/GPL3/LGPL3/MPL2 texts and hashes are
retained as repository license context, without inventing a special fixture
license or rewriting source metadata.

The source-first independent stdlib/Pillow read-only oracle runs before Office
import. It distinguishes actual direct cell paragraphs from annotation text:
Sheet1!C13 is the ordinary string `Note attached`; separate annotation on C13
is `Just a note`. Sheet2/Sheet3 are empty; there are no original formulas.
The initial rough inventory had conflated these two text layers; integration was
explicitly corrected before import and the actual oracle freezes them separately.

Nine top-level objects are present: rectangle, cut ellipse, full ellipse,
embedded100x75 GIF, group(rectangle+line) and four form controls (button/radio/
checkbox/text). The full original anchors, sizes, end limits, angles, background
flags, style IDs, group hierarchy, control labels and image bytes are inventoried.
The old November10 converter/engine open/save/reopen pass is historical evidence
with no content/visual guarantee; it is not native P2 or shape preservation.

The before-import contract tests selected explicit preservation invariants:
annotation cell/text, vector preset counts/sizes (0.001cm tolerance), group child
count, ungrouped start-cell anchors, embedded image decoded RGBA pixels and form
control kinds/labels. Other angle/background/paint/control-behavior/appearance
details remain recorded limits. No controls or external form actions are activated.
Raw GIF→PNG transcoding alone is not called image loss. Structural differences
are not automatically diagnosed as product bugs; unsupported canonical mapping
or format conversion can require a separate comparison. Full visual fidelity
cannot be approved merely because scalar cells pass.

## Native operation and strict outcome

Only a disposable hosted Windows VM operates the actual unchanged installed
app. Native Ctrl+O/filepicker and ordinary Rust IPC use the own bundled safe
converter. Real source-cell/native SaveAs/defaultXLSX/full normal exit/newPID/
reopen preflight precedes broader editing. Original upper/lower canvas captures
record visible source objects. Ordinary UI adds H1=`QA_SXC_23NOV`, I1=`=40+2`;
actual grid focus and Ctrl+Z/Ctrl+Y undo/redo the text while formula result42
persists. This added formula is not source-formula import evidence.

Native Ctrl+S, normal full quit, third-process picker reopening and fresh SaveAs
must retain the three sheets and original cell plus added input/formula/cache.
Independent original-source/XML checks inspect actual original, edited and
reopened native output, with explicit drawing/control/comment observations.
Upper/lower source-versus-reopened screenshots support the structural audit.

The driver deliberately collects the full native operation/cleanup result even
when preservation differs. It then returns `failed-strict-preservation`; a native
cell/UndoRedo/persistence pass does not turn a failed object audit into full SXC
acceptance. Every strict difference and actual output remains available for
integration to classify, compare and scope separately. No product fix/intake is
silently added. All own processes/policy/install/native-WebView profiles and
guarded temporary resources are cleaned, with no local Computer Use/recording.

Result and independent downloaded-byte audit follow actual execution.
