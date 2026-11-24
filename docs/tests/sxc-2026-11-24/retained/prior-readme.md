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
Original StarOffice6.1 Beta1 Sun XML/office-version1.0 and Calc MIME remain
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

## Actual native result

Run [45164747391](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45164747391),
job137658680548, harness `f94a88bb43fc8249e8e1e9ad93babe6c7f214af7`,
completed with **failure**, deliberately retaining the strict negative result.
Artifact14814677764, ZIP SHA256
`9960b654d45739a8ca1e2bf18c28101d328a0494e60ef5b864834e28b117f270`.
The complete downloaded ZIP was checked against its official digest before
safe extraction. `audit.py` independently rechecks the archive, exact producer,
canonical package report, installed executable, frozen source oracle, all saved
XLSX, native operation records and cleanup. Its `verified-actual-native-outcome`
status verifies the recorded outcome; it does not turn the failing run green.

| Check | Actual result |
| --- | --- |
| Native chooser, source C13 and three sheet names | Passed |
| Short focus/Windows Control/native SaveAs/full-quit/new-process preflight | Passed |
| H1 marker, I1=`=40+2`/42, actual grid Undo/Redo | Passed |
| Ctrl+S, three normal full exits, two distinct-process reopens | Passed |
| Independent original/edited/reopened XLSX cells/formula/cache | Passed |
| Original annotation text/cell, decoded bitmap pixels | Passed |
| Five vector preset counts, two-child group, selected start-cell anchors | Passed |
| Three vector sizes within the frozen0.001cm tolerance | **Failed** |
| Four source controls as typed controls with labels | **Failed** |
| Complete selected preservation | **Failed; not full SXC acceptance** |
| Own app, WebViews, profiles, policy, install and temporary directory cleanup | Passed |

The first native SaveAs already has the same strict differences as edited and
reopened saves. Rectangle/chord/ellipse widths are each0.009cm larger than their
Sun XML source dimensions; rectangle/ellipse heights are0.001cm smaller and
chord height is unchanged. These are recorded geometric differences, not a
claim of severe visible corruption. The grouped rectangle and line satisfy the
selected size check. The original bitmap is still an embedded GIF with identical
decoded pixels; the source text and note remain separate and unchanged.

The output contains two real VML controls and two linked `ctrlProps` parts:
button and checkbox. Radio retains a hidden AlternateContent shape name/label,
but no typed control relationship; the original text-field control is absent.
Thus `form-control-label` means absent from the **typed control inventory**;
it does not claim the radio label string vanished from every XML part. Raw
AlternateContent and all parts are retained for further classification.

Eight actual native PNGs were inspected; `visual-review.json` records their
limits. The app displays text, annotation, bitmap and some shapes, an explicit
placeholder for the chord object and a warning about unsupported form/ActiveX
and extension elements. It does not display all four source controls. The
screenshots do not certify full appearance or attribute the conversion layer.

The negative native result was reported to integration before any product
claim or fix. Open and closed issue descriptions were checked: closed#43 is
historical technical format coverage; open#75 covers worksheet objects broadly.
No new issue, status change or product fix is made by this bounded QA scope.

`evidence/native` retains the original proof ZIP, metadata and extracted bytes.
Run `python -B qa/sxc-native-windows/audit.py` to repeat the independent audit.
It requires the same Pillow13.0.0 used for the read-only pixel comparison.
Supplementary converter-only attribution is recorded separately and cannot
replace the native operation proof or approve full SXC preservation.

## Converter attribution completed

Supplementary control run
[45166523239](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45166523239),
job137664775095, harness `92f86fc5abcf9c4f2a588480d0707bc4ab4809c4`,
completed successfully **as a control experiment recording differences**, not as
a preservation pass. Artifact14815275891, full ZIP SHA256
`186e3dee50af270ed7e546828e9169f70ef1b52a7c575c6aba6abcbc05663f42`.

It installs the unchanged NSIS on another disposable Windows host, independently
checks payload==installed app and the exact bundled `soffice.com` identity,
and converts the unchanged original without launching the Office app. It uses
the pinned P2 source-profile XML and catalog filter, fresh private profile,
production headless flags and printer-isolation environment. The source-profile
Git object is verified, not an assertion about extracting literal bytes from the
compiled app. The resulting XLSX SHA256 is
`7b3410fa3b5cb0897bf6a4caf61390e65199aa5e9f5c1f95f3025c49932c1196`.

`control-audit.py` independently repeats the output/source comparison and binds
run/job/harness, package provenance, profile XML and cleanup. It reproduces
exactly the selected geometric/control differences without using the app editor.
Every object-related ZIP part under `xl/drawings/`, `xl/ctrlProps/`,
`xl/media/` and `xl/comments*` is byte-identical to each of the four retained
native XLSX outputs. Selected parsed structure also agrees. Thus these selected
conversion differences do not require additional engine Save loss to explain
them. This does not certify rendering fidelity: the chord placeholder and
unsupported-control warning are separate actual app observations.

An earlier control attempt, run45165934483, stopped before conversion because
the driver compared Git bytes with a CRLF-normalized Windows checkout. Its
cleanup also raced concurrent NSIS deletion. The failed artifact, official
digest, metadata and failed log remain in `evidence/control-driver-failed`;
neither conversion nor completed cleanup is claimed for that disposable host.
The corrected control compares pinned Git objects, ignores only already-absent
NSIS descendants and records any remaining cleanup error. Its final cleanup
confirms no own converter processes and removal of its own install/profile.
The independent successful native run is not repeated or relabeled.

Run `python -B qa/sxc-native-windows/control-audit.py` to recheck the completed
control against `evidence/native`. `converter-comparison.json` records all
four raw-part/selected-structure comparisons and the retained negative result.
The first before-import contract remains unchanged. Root decides any separate
product issue, owner and future intake; this branch contains QA only.
