# Six standalone Windows apps — bounded native QA

Owner: this Windows QA chat; the existing integration chat is the only
integrator. Isolated branch `codex/standalone-windows-qa-2026-11-23` starts at
`82e1b94f9edfcdde1913f7068a28d17156d117cd`. No product, shared version/build
workflow or `voorbereiden-kantoorruntime.mjs` is changed. No local native app,
GUI/capture session, release, tag or `main` change is authorized by this work.

## Proven host capability, not application acceptance

[Run 45138671226](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45138671226)
at harness `df4964ed` passed the native Windows fixture preflight on the
disposable interactive hosted Windows VM, session 2, OS 10.0.26100.0:

- Actual owned window/input focus and physical keyboard text readback.
- Ctrl+S opens the genuine OS Save dialog. Its owned filename HWND/class/
  control-ID/process/ancestor and full typed-path readback are checked.
- The standard Save default action receives actual Enter; a real filesystem
  text file matches exactly `STANDALONE23 CTRL SAVE REOPEN`.
- PID `8540` closes normally; fresh PID `4500` reopens the exact saved bytes.
  Both child processes exit normally and are recorded as closed.

Earlier attempts 45137251817, 45137508134, 45138278995 and 45138444310 are
retained as driver failures: hidden PowerShell fixture's process-level main
handle, unavailable filename ValuePattern, Windows hiding the `.txt` extension,
and unavailable native Save InvokePattern. Genuine OS handle attribution and
physical keys resolved these without altering the fixture content or save/
full-exit/reopen criteria. No Office product bug is inferred.

This proves a usable native host/chooser path. It does **not** yet prove
packaged WebView2/CDP attachment or any standalone application's function.
Every real app must pass its own short native preflight before wider actions.
The host result is reused, rather than rerun for each unrelated case edit.

## Canonical-package gate and host isolation

`.github/standalone-windows-qa.json` stays **unfrozen**, with no final source,
run or package identities filled in, until integration closes its intake.
No old E92, I3 or earlier installer can become final fixed-package proof.

`packages.py` requires final source/tree/version, successful canonical build,
exact archive SHA-256 and all six inner installer path/size/SHA-256 identities.
The prepare job downloads that ZIP **once**, verifies it and passes only each
unchanged app-specific NSIS plus its manifest to that app's fresh Windows VM.
No suite installer/profile/resources are transferred. Maximum parallel app
jobs is three. App jobs need only their own prepared package, never another OS.

Before installation, `inspect.ps1` audits prior suite/app processes, profiles
and suite paths. The standard silent NSIS installer is run in an owned temporary
directory; executable name, version, SHA-256 and Authenticode status are recorded.
If the canonical manifest requires `signature: valid`, both installer and app
must actually validate. Missing signing is recorded, not silently called valid.
Each app has its own expected `org.openaec.<app>-studio` identity. The real
installed executable runs from its own installed directory; the renderer must
be an actual native Tauri WebView2, never a browser/demo backend. Executable-
scoped disposable-host CDP/profile policies are restored after operation.

Writer, Spreadsheet, Presentation and Email query the actual native read-only
runtime status: it must be `meegeleverd`, safe profile, and beneath that single
app's installation. Notition excludes the runtime by design. Database uses its
own packaged parser/WASM resources; no Java/Access write promise is inferred.
Actual conversion operation remains separate from a runtime-status observation.

## Functional cases to run on the final bytes

| App | Native actions and independent acceptance |
| --- | --- |
| Writer | Committed synthetic empty DOCX; actual editor typing, Ctrl+Shift+S and native Save; independent document XML marker; full exit/new PID reopen and second actual save/XML check. |
| Spreadsheet | XLSX A1 text, B1=41, C1 formula `B1+1`; real name box/formula input; native save; independent ZIP/XML types/formula; full restart and UI readback/resave. |
| Presentation | PPTX text via actual editable input, add a slide, native save; independent slide count/text; full restart/resave. Input/focus limitations remain blockers, never an engine-edit substitute. |
| Email | Real native Tauri backend and a synthetic loopback-only IMAP/SMTP fixture. Read local message; create local draft through account/compose UI and Ctrl+S; independent received MIME subject/body; full app restart/draft readback. SMTP DATA is disabled; no real account, credential or email. |
| Notition | Create/rename own notebook, note title/body through UI; native JSON backup export and independent content check; full app restart on its same owned profile, UI readback and second export. |
| Database | Synthetic SQLite file through its **explicit supported file-input UI**, foreign-working-copy confirmation, table read and actual SQL query, full restart/reopen. Current `DatabaseStudio.tsx` explicitly accepts `.sqlite/.sqlite3/.db`; source file stays unchanged and Python sqlite3 independently verifies its rows. No direct backend import and no unsupported Access writing claim. |

The app cases and loopback fixture are executable preparation, **not yet tested
against final packages**. Selectors, real WebView2 availability, exact filenames,
resources and cleanup can still uncover driver or product problems. No startup,
build or package-only check is reported as native functional acceptance.

`native.mjs` retains native-ready/completed/failure images, output files, raw
receipts, exact source/harness/package identities and independent oracle reports.
Failure stops that scoped app case; no mock backend or editor-state injection
can force a pass. Cleanup attempts normal close, then only an owned process tree
if required; disposable policy/install/profile resources are restored/removed
only after ownership/containment and process exit checks. Forced closure cannot
be relabelled as a successful full-exit/reopen test.

Next: receive the coordinator's frozen final manifest, run each app as soon as
its Windows bytes/runner are ready, inspect original evidence, and deliver one
compact six-app result/limits handoff. Newly discovered product problems are
recorded and scope-coordinated; this QA chat does not implement product fixes.
