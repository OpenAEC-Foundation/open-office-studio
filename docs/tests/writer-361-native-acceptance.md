# Writer #361 native acceptance drivers

These helpers operate only the integration-selected, checksum-verified native
candidate on disposable Actions hosts. They do not modify application code,
enable a diagnostic SDK bridge, launch browser substitutes, or change workflows.
Do not execute them before integration supplies the final combined commit and
canonical artifact and releases execution.

## Exact candidate identity

Pass an identity JSON with these mandatory fields (full lowercase hashes):

```json
{
  "sourceCommit": "<40 hex>",
  "sourceTree": "<40 hex>",
  "artifactRun": 123,
  "artifactId": 456,
  "packagePath": "/absolute/path/to/canonical.deb",
  "packageSha256": "<64 hex>",
  "executionApproved": true
}
```

The checkout in the working directory must be clean at that exact commit/tree.
The harness itself may live in another pinned checkout; its SHA256 is recorded.
Integration must establish the artifact-to-source association from the canonical
build receipt. Hash verification alone cannot establish its build provenance.

## Linux: installed production DEB

Reuse the project's existing Linux dependencies: Node with locked `fflate`,
`tauri-driver` 2.1.0, WebKitGTK/WebKitWebDriver, DBus and Xvfb. No new framework,
application plugin, workflow or external service is required. Run only on an
isolated runner with no pre-existing `/usr/bin/open-office-studio` instance.

From the exact application checkout, with the harness checkout's locked Node
dependencies installed:

```sh
OOS_361_EXECUTE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 \
  dbus-run-session -- xvfb-run -a \
  node /absolute/harness/scripts/proef-writer-361-linux.mjs \
  /absolute/identity.json /absolute/new-proof-directory
```

The harness checks the DEB hash, installs that DEB, compares its packaged and
installed executable bytes, and isolates the profile. It uses native WebDriver
pointer and keyboard actions; DOM evaluation only reads control identity, focus
and accessible grid/cells. In particular, there is no body click, `focus()` call
or application API call between column insertion and immediate Undo.

It checks both ribbon-selected column directions, Undo/Redo, last-cell Tab row,
ordinary typing, Find input Undo, two document histories, a persistent added
column/marker, full app exit and fresh-process reopen. Only the final persistence
fixture is saved; intermediate states are not repeatedly written. Reports include
focus/grid evidence, screenshot hashes, exact package identity and cleanup state.
Failure preserves a screenshot/state and returns a nonzero status. A final green
JSON means this narrow installed-DEB/X11 route passed; it does not certify physical
hardware, AppImage, another platform, or all of Writer.

## macOS: bounded native action driver

The existing plain `tauri-driver` route has no macOS WKWebView driver. The project
already uses native Accessibility for packaged macOS UI. This helper extends that
route with bounded AX observation plus real CGEvent mouse/key input and does not
add an embedded WebDriver plugin to the application.

Add these mandatory identity fields for the extracted canonical `.app` executable
and retain the canonical downloaded `.dmg`/archive as `packagePath`:

```json
{
  "executablePath": "/absolute/OpenAEC Office.app/Contents/MacOS/open-office-studio",
  "executableSha256": "<64 hex>"
}
```

An owning runner orchestrator must first launch that exact app with the synthetic
3x3 fixture, select its known PID and document, and ultimately close only that
owned process. The helper never launches/quits an app or changes permissions.
Invoke from the clean exact-source checkout:

```sh
OOS_361_EXECUTE=1 python3 /absolute/harness/scripts/proef-writer-361-macos.py \
  /absolute/identity.json 12345 snapshot /absolute/proof/baseline.json
OOS_361_EXECUTE=1 python3 /absolute/harness/scripts/proef-writer-361-macos.py \
  /absolute/identity.json 12345 click-label /absolute/proof/tab-click.json \
  --target 'Table Design'
```

Actions are `snapshot`, `click-label` with an exact actual native label, and
`chord` with `cmd-z`, `cmd-shift-z`, `cmd-y` or `cmd-s`. Every call validates the
package/executable hash, exact PID executable and source identity. Swift compiles
on the macOS runner and fails/blocks if Accessibility is unavailable, the window
is ambiguous, a control is not uniquely located, or geometry is unavailable.
No TCC grants, settings changes or prompt bypasses are attempted.

An `input-sent` receipt is **not** an acceptance pass. The orchestrator must collect
a fresh snapshot after each action and prove the focused native control plus
actual 3→4→3 column states. AX table counts may be absent from WKWebView's canvas
accessibility representation; `rowEvidenceAvailable`/`columnEvidenceAvailable`
record this explicitly. Missing table evidence stays blocked and needs genuine
native visual/manual proof. These helpers do not assert text legibility or
macOS #359 glyph correctness; screenshots and independent inspection remain
required. Remaining Tab/Find/document/persistence acceptance uses the shared
ten-check plan and must be reported separately if not actually executed.

## Acceptance and cleanup

Windows is operated solely by the existing Windows tester, using the same exact
integration candidate. Linux/macOS helpers do not touch the local Windows GUI.
Never infer native success from builds, Chromium, or unit shortcut tests. On all
platforms retain actual results, failures and unexecuted checks separately.

Linux closes its own WebDriver session and process group and records whether its
owned app exited. This checks full process shutdown/restart through WebDriver
session deletion, not the application's menu Quit command. The macOS caller owns
app cleanup and any capture resources.
Close/discard transient test documents, quit only owned processes, preserve the
necessary persistence proof, and release any recording session. Do not terminate
shared/user processes. Do not restart capture solely to check a recording border.

## Preparation status (20 November 2026)

No candidate has been run by these helpers. Linux syntax and negative execution
gates, and Python syntax/CLI validation can be checked locally. Swift compilation,
native host permissions, actual pointer/keyboard behavior, native grid evidence
and all functional acceptance remain pending until executed on the real platform
against the final canonical artifact. No CI run was started for this preparation.

Primary references:

- [Tauri manual WebDriver setup](https://tauri.app/develop/tests/webdriver/manual-setup/)
- [Apple CGEvent](https://developer.apple.com/documentation/coregraphics/cgevent)
- [Apple Accessibility API](https://developer.apple.com/documentation/applicationservices/axuielement_h)
