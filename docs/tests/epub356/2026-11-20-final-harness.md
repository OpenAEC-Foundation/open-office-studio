# #356 final combined-point acceptance preparation

This is a separate test-driver branch. It does not rebuild installers, modify
application/SDK files, close #356/#30, or investigate/fix #359. Preparation has
not executed any app, native UI, browser or CI workflow. The existing November
16 results remain historical evidence at app `2b100ada…`, not acceptance of a
new combined application point.

## Exact root handoff contract

The integration chat supplies `.github/epub356-final-candidate.json` only after
freezing one final application commit and a successful canonical desktop run.
The checked-in preparation deliberately has `frozen: false` and null values;
it must fail before artifact/app execution. Required schema:

```json
{
  "schemaVersion": 1,
  "frozen": true,
  "applicationCommit": "<exact 40-character Git SHA>",
  "desktopRun": 123456789,
  "artifacts": {
    "Windows": {
      "name": "open-office-studio-Windows",
      "archiveSha256": "<64 hex SHA-256 of artifact ZIP>",
      "packages": [{ "path": "nsis/<actual-name>-setup.exe", "kind": "nsis", "sha256": "<64 hex package SHA>" }]
    },
    "macOS": {
      "name": "open-office-studio-macOS",
      "archiveSha256": "<64 hex SHA-256 of artifact ZIP>",
      "packages": [{ "path": "dmg/<actual-name>.dmg", "kind": "dmg", "sha256": "<64 hex package SHA>" }]
    },
    "Linux": {
      "name": "open-office-studio-Linux",
      "archiveSha256": "<64 hex SHA-256 of artifact ZIP>",
      "packages": [
        { "path": "deb/<actual-name>.deb", "kind": "deb", "sha256": "<64 hex package SHA>" },
        { "path": "appimage/<actual-name>.AppImage", "kind": "appimage", "sha256": "<64 hex package SHA>" }
      ]
    }
  }
}
```

`packages[].path` is relative to the downloaded artifact ZIP root and must use
its actual path, not the example names above. There is no `relativePath` field,
separate `hostedCommit`, runtime317 package manifest or old converter proof.
`applicationCommit` is used directly for both native and shared browser source.
Native verification requires run `head_sha` equals it, run completed/success,
the unique non-expired artifact name/digest, streamed downloaded ZIP digest,
safe extraction, exact installer set and each installer SHA before execution.

The own workflow is native-artifact-only:
`.github/workflows/epub356-final-native.yml`. Preparation commits use `[skip ci]`.
After root releases the frozen manifest and artifacts, update that manifest on
the harness branch and push, or explicitly dispatch this workflow on its ref.
No other commit or dependency update should trigger an app test. The read-only
GitHub token is supplied only to the artifact-download step, never the app step.

Native CWD is a checkout of `applicationCommit`; harness is checked out
separately at `.local/harness`. Package/config/version-dependent extraction
reads final source `package.json`, configs and generic extraction scripts from
that CWD. Preparation overlays only new `epub356-final-*` test files, not the
frontend consumer, shared build verifier, application or SDK. Root's desktop
workflow/native Linux baseline/overview files remain untouched.

## Real native sequence and oracle

For each canonical NSIS, DMG, DEB and AppImage:

1. Verify source/package provenance, extract the real package, install/launch
   through the existing reviewed native backend, and open original
   `docs/tests/epub356/leesvolgorde.epub` (SHA-256 `8e48dc46…`).
2. Preserve the raw initial native image before edits/readback. Do not insert a
   marker: the imported book is already an unsaved DOCX working copy.
3. Open real custom Save As, preserve its runtime/source panel and activate its
   Save button with actual pointer/AX input. Then operate the real OS file chooser
   to write a new `initial/saved/leesvolgorde.docx` under the own report directory.
4. The independent stdlib oracle runs on that filesystem file, not an engine
   export API. It checks original source hash/preservation, both chapter markers
   and order, Unicode/content markers, Hout/42 in the same table row, exact PNG
   bytes referenced by a proper image relationship, and absence of macro/active
   elements/external relationships.
5. Existing backend cleanup completes app/driver/installer handling; a new
   process opens the saved DOCX and its PID must differ from the initial PID.
   Windows uses a distinct WebView2 user-data directory (native app preferences
   may remain in the same CI user's app-data directory). Linux uses distinct
   XDG_DATA_HOME/CONFIG_HOME/CACHE_HOME directories. Mac keeps the same normal
   app-data profile on this own disposable CI host. In all cases the owned
   executable and PID identify the launch, with no running app allowed to
   intercept either opening. Preserve its raw initial
   reopened image before Save As/readback. Check saved and original file hashes
   unchanged, then close the second owned app and dispose temporary package data.

The protocol records `passed-data-native-save-reopen` only after actual native
save, independent oracle and fresh-process reopening. Its separate
`visualAcceptance` remains pending independent original-image review. A blank
initial/reopened page remains a visual acceptance gap even when AX/model/file
checks pass; #359 is not silently declared solved. On a failed run, the backend
still attempts owned-process cleanup, retains raw diagnostics, and keeps temporary
files for audit instead of claiming that unproven cleanup/disposal succeeded.

Windows chooser ownership is an exact app PID and unique native `#32770`
dialog/filename/Save controls. Mac ignores AXWebArea/TextArea and requires native
filename + Save controls in the owned app's native AX tree. Its separate native
helper is precompiled before app launch; it uses normal native Go-to-Folder and
Save actions. No permissions, renderer flags or save IPC are substituted.

Linux uses a private D-Bus/X11 session. Its initial helper deliberately accepts
only a chooser tied to the owned app PID. A real portal chooser under a different
process can therefore be **blocked**. It preserves raw window inventory,
PID/class/transient metadata and a screenshot; title-only unrelated windows are
never accepted as owned. Any later transient-chain/private-session portal
attribution enhancement needs review against actual final-point evidence.
The agreed Linux CI-only DMABUF workaround remains isolated to the test runner.

Native malformed-EPUB preservation is **not implemented** by this narrow native
sequence. The exact-source browser test and targeted import tests cover that
separately. The saved-file oracle is not native malformed-input proof or proof
of native script execution safety by itself.

## Browser consumption: root shared build only

There is no standalone browser build/job in this own workflow. The separately
released frontend commits are `3a459845`, `498dc84c` (Node test rename), and
`74463e27`. Root shared browser workflow consumes the final source script with:

```text
OFFICE_TEST_DIR=<root's already-built shared output>
OFFICE_TEST_BASE=/office/     # or / for the normal browser route
OFFICE_TEST_BUILD_RECEIPT=<matching writer-proefbuild receipt>
EPUB356_OUT=<new unique directory for this case/OS/route>
```

The consumer verifies the complete shared build receipt before preview/browser
startup; the actual URL pathname must equal the requested route. It retains
storage-preparation acknowledgement observation, real EPUB input, offline edit,
DOCX download/content/image/order checks, reopen and invalid-input/source/tab
preservation. Startup and all cleanup failures fail the gate, all resources are
still attempted, and no passed report is written until cleanup succeeds.

## Local checks and remaining validation

Preparation checks only (no native or browser app run):

```text
node --test scripts/epub356-final-artifacts.node-test.mjs scripts/epub356-final-prepare.node-test.mjs
python scripts/epub356-final-oracle_test.py -v
node --test scripts/proef-epub356-hosted-startup.node-test.mjs
```

Six native/source artifact Node contracts, nine independent-oracle Python tests,
and seven headless frontend failure gates passed. Own Node contracts use
`.node-test.mjs` to avoid Vitest collecting them as empty Vitest suites. Locally,
`OOS_RUNTIME_PYTHON` can identify the installed Python executable, and the
frontend headless test may use `EPUB356_TEST_SHARED_HELPER` to read the COMPLETE
shared verifier from its owning checkout. Neither test copies a partial helper
or modifies shared dependencies. Python AST, Node source/generated-driver syntax
and PowerShell parse checks passed. Swift compilation, native OS dialog shape,
actual platform operations and shared-route UI acceptance await root freeze and
the exact canonical installer artifacts. No new native pass is claimed here.
