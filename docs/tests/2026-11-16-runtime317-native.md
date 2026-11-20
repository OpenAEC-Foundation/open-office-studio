# #30: resumed native acceptance

## Source provenance

- Agreed integration base: `93fcc6194904f70fa12d0a3546c23dac9c673ee5`.
- Original #30 head: `7e48cf5834a8c7a115f9eb9fcdc0ca8c50c4e0f7`, delta from
  `1e5afa399117fd84df628955ec82b0e597993c83`.
- The original delta was applied with `git apply --3way`, excluding
  `.github/workflows/desktop.yml`, which the integration chat owns. No conflicts
  were reported. The runtime-specific checks move to a dedicated workflow.
- Retained from the integration base: version `2026.46.2`, English release
  metadata, and the presentation media-volume/media-name postprocessing chain.
- Historical run `42814410322` tested merge point
  `c7118fce9d825ac95fbab46d714c04e8b541a896`. Those results remain historical;
  they do not certify this new candidate.

## Remaining gates

| Route                      | Historical result                | Required new proof                                                            |
| -------------------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| Windows NSIS / WebView2    | CDP endpoint unavailable         | Installed app opens ODT; enabled Save As shows bundled source                 |
| Linux DEB / WebKitGTK      | Save As not observed             | Installed app opens ODT; native pointer opens Save As with bundled source     |
| Linux AppImage / WebKitGTK | GUI not run                      | Actual AppImage entry point passes the same native controls                   |
| macOS DMG / WKWebView      | Unbounded AX traversal timed out | Bounded native AX interaction observes Save As with bundled source            |
| Browser production build   | Passed at historical point       | Offline edit/save/reopen and explicit conversion limitations at the new point |

Native `blocked` is never a pass. Builds and converter tests are recorded
separately from actual native operation. No local app, installer, printer or
security settings are touched; native probes run only on isolated hosted CI.

## Immutable application and repeatable drivers

The new application point is `c0fbbcb843f0fd44e0e7e9d54a7989d017e39812`.
The dedicated workflow checks out that exact point for all application builds,
unit checks, native converter checks and production browser tests. Only after
packaging does it overlay the native test drivers from the workflow head;
reports record that separate `harnessPoint`.

Installers and their source/SHA-256 manifest are uploaded before native UI gates.
`converter-proof.json` records successful converter/content/macro/legacy checks
before attempting the UI. A later driver-only run can reuse those exact packages
and the generated ODT by setting `artifactRun` in
`.github/runtime317-candidate.json`. It refuses different application points,
different package bytes or incomplete converter proofs. Reuse does not certify
any newer application source.

Windows uses an executable-scoped HKLM WebView2 debugging override on the
disposable hosted runner, because elevated WebView2 ignores environment
overrides. The prior value is saved and restored in `finally`; no override is
added to production code or the user's computer. See [Microsoft's documented
override rules](https://learn.microsoft.com/microsoft-edge/webview2/concepts/security#for-an-elevated-host-app-use-appropriate-override-flags).

Linux waits for Writer to finish loading and enable Save As, then uses a native
pointer action. AppImage is launched through its original runtime/AppRun with
`APPIMAGE_EXTRACT_AND_RUN=1`; a successful DEB never substitutes for AppImage UI.

macOS uses AXPress on the enabled Save As button. Its native AX helper caps IPC
timeouts, traversal depth, children per node, total nodes and wall time, and
does not request the editor text area's value. It neither grants TCC permissions
nor adds an app test bridge. See [Apple's per-process AX timeout API](https://developer.apple.com/documentation/applicationservices/1459345-axuielementsetmessagingtimeout).

Local lightweight checks: 25 targeted tests passed (runtime packaging/config,
immutable package verification and Writer readiness); Node syntax, Python
compilation, PowerShell parsing and version consistency passed. Native platform
results remain pending until actual CI execution.

The subsequent complete-converter-proof guard adds one more passing targeted
test (26 unique targeted tests total). Its rerun uses an isolated `.local`
Vite cache and disables the result cache. Reused proofs must include successful
native, macro, independent-content and all 32 legacy checks, as well as the
exact application point and installer hash.

The real hosted browser build is also checked under `/office/` with no Tauri
bridge: Writer offline edit/download/reopen, Spreadsheet cell-style roundtrip,
Presentation rich-note roundtrip, and explicit unsupported-format messages
preserving an already open document. This is separate from the ordinary
production `dist` smoke check.

Initial application build/full-check run:
[`43833977445`](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43833977445)
(driver `9a9bfe392679103f3a9bde17db7e8d91168165f0`). Subsequent native-only
checks reuse this run's exact installer manifests and complete converter proofs.
The workflow concurrency group queues those reruns until the build run finishes.
The Linux driver also records the owning app PID and executable, verifies
`APPIMAGE` identifies the actual archive, and closes only that proven PID before
another package route starts. It refuses a launch intercepted by an existing app.

## First native results at the new application point

- Windows x64 NSIS **passed**: the actual installed app was reached through
  WebView2/CDP, opened the ODT and showed the bundled runtime/safe profile in
  Save As. The original was unchanged, no page errors occurred and cleanup
  completed. Converter/content/macro/32-legacy checks also passed. Installer
  SHA-256: `bad11543f52a190ddce3aa35ec423487d1e53f4eb8dd8105dc7472ee22ddd93d`.
  This same-point result is reused; subsequent Windows driver changes only
  avoid recreating an already existing policy key, without changing the app's
  CDP arguments or the tested interaction.
- macOS ARM64 DMG **passed**: native AXPress opened Save As and the AX status
  text showed the bundled runtime and safe macro profile. AX traversal visited
  23 nodes for the status check; it did not time out. The owned app closed and
  the original ODT hash stayed unchanged. Converter/content/macro/32-legacy
  checks, helper signature verification, associations and LaunchServices also
  passed. DMG SHA-256:
  `3269782d7c98b4b8952fcd4bb372c86acaa0d566b2f70d8096b4922bfc2f0a3f`.
  This valid same-point result is reused; no new native Mac behavior was changed
  by the subsequent Linux isolation fixes.
- Linux x64 AppImage **passed** native pointer/Save As/source/original-file
  checks. Archive SHA-256:
  `79eaf0a891e5704f31f2b06d6a864f8774640d5c2f6d3c8c70b4955aed9ab6d3`.
- Linux x64 DEB converter/content/macro/32-legacy checks **passed**, but its
  second WebDriver session timed out before a session was created. DEB SHA-256:
  `3c2f6fae2765b01e27b14f488883e0e6762f3da7e2514e61ed0d3a9e266d54c4`.
  Native DEB acceptance remains pending. The next driver isolates both the
  intermediary and native WebKit ports, the owned process group and XDG app
  state. These address inter-session interference; the initial timeout alone
  does not prove which component caused it.
- Linux project checks at this point passed: 325 JavaScript test files,
  58 Python tests, 117 Rust tests (7 intentionally ignored), engine/command
  checks, package build and production browser smoke checks.
- Screenshot observation only: the AppImage readiness capture showed a gray
  document canvas with a 109-word count and a font-substitution warning. Save As
  was visible and operable. This does not establish a separate rendering bug or
  prove document painting; it was shared with the integration chat's native
  Writer work. The report deliberately says `odtLoadedInWriter`.

Proof artifacts: `runtime317-proof-Linux` and `runtime317-proof-macOS` in the
initial run. macOS proof archive digest:
`74d3783cac5c117835ae85a7a1966ee77be35d5f342de19f2b83651896671fa0`;
Linux proof archive digest:
`bb74217c79b870c1ee6990fab569e6f2715665bacb0c8ff329416a3bf7eb8ee4`.
Windows proof archive digest:
`7acb77ecde4f625220f3a9d919b0095732d69b37eb20c35fde53372a9e99c623`.
Only Linux native operation is repeated after its driver-isolation changes;
valid Windows and macOS results remain bound to the same application point.

## First completed native control matrix (before visual review)

Application point for **every row**: `c0fbbcb843f0fd44e0e7e9d54a7989d017e39812`.
The driver point for this historical control matrix is
`fb6705e79bbb3b828a61c5a390d32a0a57d2d92f`. Subsequent visual review and
the corrective recheck are recorded below; this table does not establish that
every catalog input format works.

| Platform / route                 | Build / package / converter proof                                                                            | Actual operation                                                                                                                                                                                  | Evidence                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Windows x64 NSIS / WebView2      | Passed; 9 format cases, independent content, positive macro control and safe macro blocking, 32 legacy cases | Passed; installed app opens ODT, native pointer opens Save As, actual bundled source, original unchanged                                                                                          | [Windows job](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43833977445/job/133186020778), `runtime317-proof-Windows`          |
| Linux x64 DEB / WebKitGTK        | Passed at initial run; same installer SHA verified before reuse                                              | Passed; fresh driver/app session, `/usr/bin/open-office-studio`, Save As bundled source, original unchanged, owned app closed                                                                     | [Linux recheck](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43841367195/job/133210905489), `runtime317-native-recheck-Linux` |
| Linux x64 AppImage / WebKitGTK   | Passed at initial run; same archive SHA verified before reuse                                                | Passed; actual AppImage runtime and matching `APPIMAGE` archive, Save As bundled source, original unchanged, owned app closed                                                                     | Same Linux recheck and artifact                                                                                                                        |
| macOS ARM64 DMG / WKWebView      | Passed; helper signature, associations, LaunchServices, converter/content/macro/legacy checks                | Passed; enabled native AXPress, bundled source/safe profile, owned app closed, original unchanged                                                                                                 | [macOS job](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43833977445/job/133186020407), `runtime317-proof-macOS`              |
| Browser / real hosted `/office/` | Self-contained hosted build passed                                                                           | Passed; Writer offline edit/save/reopen, Spreadsheet style/formula roundtrip, Presentation rich-note editing/roundtrip, three format-limit messages preserving the open document; no Tauri bridge | [Hosted browser job](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43841367195/job/133210905549), `runtime317-hosted-browser`  |

The [final targeted run](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43841367195)
is green. Its package-build job is deliberately skipped: existing exact-byte
installer and complete converter evidence are verified and reused. The initial
run remains red because it records the original second-session Linux failure;
its independent successful Windows/macOS and converter results are not relabeled.

Final Linux proof archive digest:
`f402dce17c5723ddcec62220df1fdc7163603c656fc487049bfc0671493f3026`.
Hosted browser proof archive digest:
`cb03342caba102e4470b1e8e6ec707e2b6e59a94cfe9cf4b827e70202c823c95`.

The final Linux diagnostics directly show the AppImage process still needed
targeted SIGTERM after the WebDriver session ended. It then closed before the
DEB started with a different PID and executable. This confirms why explicit
owned-app cleanup matters; the combined port/profile/process isolation change
was tested, not an A/B experiment establishing one sole cause of the old timeout.

## Integration and remaining limits

- A read-only `git merge-tree --write-tree` check against integration point
  `e1f84f84f4d72e5ce8ab967e376a6f38344edf39` completed without conflicts
  (tree `ec1a93a965fe64ae913a1b4d04a5c6031c00e824`). The integration chat's
  reserved desktop workflow and Linux Writer helper were not edited.
- The integration combination still requires the integration chat's checks at
  its own exact combined point. This matrix certifies the application point above.
- The original gray-canvas observation and macOS screenshot obstruction are
  superseded by the isolated same-package recheck below. The older artifacts
  remain available and are not relabeled as visual passes.
- Native CI covered Windows/Linux x64 and macOS ARM64. Other architectures and
  all standalone signed/notarized release variants are not certified by this run.
- No main merge, release, local installer/app launch, local printer change or
  local security change was performed. Original head `7e48cf58` and its historical
  evidence remain intact. PR #317 must not be integrated in addition to this
  continuation.

## Visual review and same-package correction

Review of the initial macOS screenshot found a system **“soffice quit
unexpectedly”** alert over Save As. The AX interaction remained valid, but that
image was not unobstructed visual acceptance. No crash PID/report was captured
then, so neither a product crash nor the macro-control teardown is established
as its cause.

The integration chat's separate fixed-package Linux A/B investigation isolated
the gray document canvas to the WebKitGTK DMABUF rendering path under Xvfb and
software graphics. Both baseline repeats were gray; both repeats with
`WEBKIT_DISABLE_DMABUF_RENDERER=1` showed readable saved and reopened documents
in X11 and WebDriver captures. The central CI-only change is
`d73539b10d6a0a96956050766b0d850474b55910` (#355). This is not a global product
launcher change or a conclusion about ordinary hardware-accelerated desktops.

The #30 driver applies the same variable only to native Linux CI execution
steps. It leaves `WEBKIT_DISABLE_COMPOSITING_MODE` unset. macOS now takes its
native UI proof on a fresh host before any converter/legacy/macro probes and
fails on new soffice diagnostic reports, a soffice system alert, or unavailable
alert inspection. It does not dismiss alerts or change permissions.

Same application point **`c0fbbcb843f0fd44e0e7e9d54a7989d017e39812`**,
same installer SHA-256 values above; test driver
**`70841b98c9cda34b070e7b33f6d511a0bcac46d0`**:

| Route          | New targeted result                                                                                                                                                                                                                 | Evidence                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux DEB      | Passed native pointer/Save As/bundled source; original unchanged, owned app closed. Independently viewed X11 readiness image shows document heading and body text. Graphics environment records DMABUF flag `1`, compositing unset. | [Linux job](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43850798162/job/133242575162), `runtime317-native-recheck-Linux` |
| Linux AppImage | Same controls passed through the actual AppImage entry point. Independently viewed X11 image shows readable document heading and body.                                                                                              | Same Linux job and artifact                                                                                                                        |
| macOS DMG      | Native AXPress opens Save As with bundled source/safe profile; original unchanged and owned app closed. Screenshot is unobstructed. Zero new soffice diagnostic reports; system-alert inspection succeeded and found no windows.    | [macOS job](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43850798162/job/133242575073), `runtime317-native-recheck-macOS` |

Proof archive SHA-256 digests: Linux
`906d6b0a0c170a3c22e6aedf3dacdc69d0716aaf6d7a8a37473ac8473f1e8755`;
macOS `27946ba844976ed69a5c4de23b9dcd2e08baff8f922828b32689913fb2a07637`.
Windows and actual hosted-browser results remain the valid same-point results
from the earlier runs; they were not repeated for this test-only correction.

After the clean macOS UI proof, a separately extracted copy of the same DMG
ran the historical harmless positive macro control. Its marker executed;
the recorded cleanup killed owned PID 2993 (exit -9). Ten-second diagnostic
collection found no new soffice reports or system-alert windows; the following
desktop screenshot was unobstructed. This experiment **did not reproduce** the
old alert and does not identify its cause. Production macro blocking and the
safe profile were not weakened.

No local app or recording session was started by this chat. Downloaded CI
screenshots were inspected as files; CI scripts close their owned app processes.

## Literal #30 catalog criterion

The native controls above establish bundled-runtime discovery and operation.
They do not prove the issue's separate requirement that every input advertised
by `src/formaten.json` opens after a standard installation.

The #43 input matrix still marks 17 extensions without an input fixture:
`dps`, `dpt`, `epub`, `et`, `ett`, `gnm`, `sdd`, `stc`, `sti`, `stw`, `sylk`,
`uop`, `uos`, `uot`, `wb2`, `wq2`, `xlsb`. Registry metadata alone cannot close
these cases. In particular, the private runtime's EPUB filter is marked
`EXPORT ALIEN 3RDPARTYFILTER`, without `IMPORT`, although EPUB is in the app's
input catalog.

The actual immutable-package audit
[`43852869341`](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43852869341),
driver `5c92c51ec2d7c1cfe168e83152407893bbc9b542`, confirms one concrete failure:
the same pinned c0 DEB exports a 4,010-byte EPUB from the repository DOCX
fixture, independently verifies its mimetype/container/nonempty OPF spine, then
cannot import it to DOCX in another fresh safe profile. Export exits 0;
import exits 1 with `Error: source file could not be loaded`; no DOCX is
produced. The original fixture stays unchanged. EPUB SHA-256:
`a1dae7bb740c07bfffa6210e6b406456e26f7e9837d18e77c573793324adbed0`.
The artifact retains `valid-runtime-export.epub`, `report.json` and
`package.json`. This is a CLI reproduction; an app-UI failure and other
platforms' EPUB behavior have not been separately reproduced.

The independently scoped bug is
[#356](https://github.com/OpenAEC-Foundation/open-office-studio/issues/356),
created after a final open-and-closed EPUB title/body duplicate search and
coordinated with the integration chat. It links the existing #43 matrix and
blocks #30's catalog-input criterion. No general importer rewrite was started.
Earlier audit attempts `43852028451` and `43852334485` failed before the EPUB
probe on missing harness dependencies/Python version and are not import
reproductions. Those setup errors were corrected before the valid audit.

#30 remains open until its literal catalog criterion and the integration
combination are actually covered. No acceptance checkbox has been weakened.
