# Native macOS initial Writer body investigation, 20 November 2026

This is bounded follow-up evidence for #359 and the native #361 release blocker.
No application code was changed, no fixed installer was built, and no native
acceptance is claimed. Existing failed I3 and older G evidence remains valid.

## Fixed application and independent QA

- Application `7f126f4b8e5269a54388cf78c48c78d2acc0daa1`, tree
  `8bc608488760e48919d7fb4e72a42569175b52a4`, version 2026.46.2.
- Canonical desktop run 44715026752, artifact 14621620223, archive SHA256
  `90840910387ec1ffd6a2d93575d2ea0d89c86b6481b2fe8fc1123c7fcb107e54`.
- DMG SHA256 `80f10634da0af9199a8a7c561a59a231b76d9787a40d110d981e0d1b3db82df0`;
  executable SHA256 `46bf58304108a35d04b1e140a116a7158c38c3e4ddecd9f1e720cd14839cd967`.
- Frozen coordinator manifest bytes and all package identities are checked before
  each native launch. The QA checkout is separate from the frozen app checkout.
- Disposable GitHub macOS 26.7.2 / 25G332, image `macos-26-arm64`, version
  `20261117.0516.1`; physical Mac observation is unavailable.

## Activation comparison

[Run 44749544089](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44749544089)
(`a73c125df4cba398b298b32dd319035c892e0c58`) stopped during startup AX readiness.
PID 2573 was already active/frontmost. A following trusted AX request returned
only `CannotComplete` (-25204); no image or body input was produced. The failed
report and action receipts are preserved in
[the startup audit](2026-11-20-mac-native-body-diagnostic/44749544089-audit.json).

The only driver correction retries that exact temporary AX error for at most
15 seconds while the single exact owned PID remains alive. Untrusted responses,
other/mixed errors and missing/different owners still fail. Seven positive and
negative classification assertions and Python compilation passed. This mirrors
the existing #356 runtime driver readiness rule.

[Run 44750058759](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44750058759)
(`5fbbebc28146899533ffc42f0b1582f2ddaa5b01`) completed the diagnostic with
`nativePass: false`. All ten original PNGs were viewed separately:

| Fresh process / fixture | Before explicit activation | After native Maximize |
| --- | --- | --- |
| PID 2422 / original 3x3 table | Already active/frontmost; body blank | Body blank, caret visible |
| PID 3214 / saved #356 EPUB DOCX | Already active/frontmost; readable body and 2x2 table | Readable body and table |

The two repeated after-activation previews initially appeared black in the image
viewer. Read-only pixel verification corrected that preview observation: both
original PNGs have exactly the same decoded RGBA bytes as their respective
before-activation images. Activation changes neither result. The original table
remains blank and the control remains readable. The same helper/package/profile
can capture readable control content; this does not identify the responsible
rendering boundary. Original images were not modified.

The control is the unchanged saved DOCX from native EPUB run 44721714206,
SHA256 `c28b963a6094108cdf6cc412bca58302e731a7810ee81772831a0c621748e52d`.
Opening it is a content/route control, not re-execution of the EPUB importer.
Both documents remained byte-identical, both processes quit normally with
Command+Q, and the owned app container was removed. One temporary AX retry was
recorded. Capture processes are one-shot `screencapture` invocations and exited;
no local GUI, recording session or Computer Use runtime was opened.

Archive, every extracted file, exact Git source bytes and compiled Swift helper
were checked; see [the activation audit](2026-11-20-mac-native-body-diagnostic/44750058759-audit.json).

## Next bounded question and limits

Read-only OOXML inspection establishes that `nieuw.docx` inherits `minorHAnsi`
from **Cambria** (`majorFont` is Calibri). The saved EPUB control has explicit
Calibri defaults. A quick initial source reading incorrectly identified the
inherited family as Calibri; the exact XML parse corrected that assumption.
Inherited Cambria versus explicit Calibri changes both family and inheritance,
so that contrast alone cannot prove a theme-resolution defect.

Existing browser #361 probes click the canvas and navigate to document Home
before the first screenshot. Their functional pass does not establish an
initial-paint pass before input, or prove this initial omission is Mac-only.
The hidden AX accessibility table is not reliable visible cell geometry.
No coordinate click or editor input was used to prime the native result.

## Font/run and structure matrix

[Run 44750921161](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44750921161),
QA `4f1d272f07f3c044a841fd7f13e7e4adc15c64d5`, finished as
`diagnostic-observed`, `nativePass: false`. Ten primary original screenshots
were viewed separately (initial-ready and after-maximize for each fixture).

| Fresh PID | Fixture | Initial-ready and after Maximize |
| --- | --- | --- |
| 2160 | Original table; inherited Cambria | Blank body |
| 2772 | Same table; explicit Calibri in each run | Blank body |
| 3183 | Plain paragraph; inherited Cambria | Blank body |
| 3902 | Same paragraph; explicit Calibri in its run | Blank body |
| 4513 | Unchanged saved EPUB #356 DOCX | Readable body and table |

Thus neither a table-only structure nor the run font family alone explains the
contrast. The four synthetic variants still share the original template's
document defaults, styles and package context. This does not establish that
any one of those remaining differences is responsible. All five processes
quit normally, all fixture bytes remained unchanged and the owned container
was removed. The [matrix audit](2026-11-20-mac-native-body-diagnostic/44750921161-audit.json)
pins the source, ZIP, helper and every raw file.

Published evidence includes original screenshots, top-level receipts, fixtures
and provenance. Every raw AX/action file also remains in the verified original
GitHub artifact and the complete local ZIP/extraction identified by each audit;
large duplicate raw AX JSON is not repeated in Git.

Only external macOS QA changed. No application platform result was invalidated
or newly passed by this work. Windows/Linux/browser application fixes were not
made or tested here; this native driver intentionally runs only on disposable
macOS CI. No product patch is justified by the evidence so far.

## Matched document-default control and handoff

[Run 44752132493](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44752132493),
QA `27713ede8fc99102d1d3fe6c5c4d14c30567c316`, changes only the synthetic
fixture's `word/styles.xml` document-default `w:rFonts` from theme Cambria to
explicit Cambria. Independent ZIP-part comparison confirms that the font
family, original table `document.xml` and every other package part are unchanged.

PID 1810 was already active/frontmost, and the native AX table was 3x3. Both
primary original captures still have a blank body. Command+Q exited normally,
the fixture stayed byte-identical and the owned app container was removed.
This rules out that single document-default substitution as a correction; it
does not rule out all theme/style/font interactions. See
[the matched-default audit](2026-11-20-mac-native-body-diagnostic/44752132493-audit.json).

| Run | Artifact | Verified original ZIP SHA256 |
| --- | --- | --- |
| 44749544089 | 14634996185 | `891f7d80b07d1df5566681c2fd8a66421f7f3aec81c2f731e62d18a99ade6583` |
| 44750058759 | 14635920028 | `240b0b6bfa2ba3aaa77da070438d6fb2cc50fbb01d825eb1614a60a83721fa11` |
| 44750921161 | 14634978114 | `9298fecb0b7c71b6af32e440511f16b3e2f40570fbb0d51dc09b49f122c3045d` |
| 44752132493 | 14635053884 | `14f57b7dcc6925115a38a6787168843d4ff6b4cd0599b948444d6398fdff6b78` |

Final result: no product cause or correction established. #359 and native #361
initial-body/table acceptance remain open. No main/tag/release/publication action
was taken. The QA branch is `codex/mac-native-body-blocker-20261120`; it is not an
application fix to integrate. Further work needs a separately scoped investigation
of the remaining template/package/renderer boundary. No tests used editor input,
theme mutation, canvas readback, forced acceptance or a substituted fixed package.
