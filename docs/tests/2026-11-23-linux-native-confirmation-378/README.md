# Linux native confirmations — #378

Product correction **82b047fbced83acf421597df903c5f4c6c20dea9** preserves
`rfd 0.15.4`, its portal/FileDialog backend and both Cargo manifests/locks.
It declares the existing Zenity requirement and distinguishes a missing
executable from a genuine user Cancel. This is a prepared correction with
passing targeted source tests, **not acceptance of a newly built installer**.

The branch `codex/linux-native-dialog-runtime-2026-11-23` starts at exact P2
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version 2026.48.1.
[receipt.json](receipt.json) records changed-file hashes, separate product/QA
pins, original failed native evidence, tests and remaining acceptance.

## Evidence and bounded choice

d410's original [run45161230008](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45161230008)
used the real P2 Office DEB. This owner reused its small artifact14810113428,
independently verified its official metadata and complete ZIP digest, and read
the original report/execve deltas. Ctrl+S and Save each attempted
`zenity --question`; every PATH candidate failed ENOENT. Actual DEB Depends was
`libwebkit2gtk-4.1-0, libgtk-3-0`. The [unchanged original ZIP](original-native-diagnosis-45161230008.zip)
has SHA256 `c66ea0db17f2cc23d0f4b3f68367a692ea466d9f86d6e1b8feff8c6f83c66376`.
Its report remains **failed** at a later dialog-detection assertion; the later
successful execve after a diagnostic installation does not relabel that report
as a positive/cancel or new-package pass. d410's separate completed differential
is linked by #377 and remains evidence for its own exact P2 source.

The exact locked rfd crate was checksum-verified against Cargo.lock. Its default
features are xdg-portal/async-std. FileDialog uses the portal, but MessageDialog
launches external Zenity and maps launch failure to Cancel. Switching its gtk3
feature would also replace the proven filepicker backend and GTK thread path.
This correction keeps the current backend and makes its real requirement
explicit. It does not touch the independently owned import-only XLSB policy,
`src/werkbestand.ts`, its tests or the format catalogue.

## Correction

- Suite Linux and separate Database configs add Zenity to DEB and RPM Depends.
  The five generated standalone overlays retain it. The package checker also
  requires it in every actual future DEB report. RPM is config coverage only.
- Seven existing native confirmation sites use the shared guard. On Linux it
  resolves a regular helper file through PATH and checks POSIX X_OK without
  running it. Missing/non-executable backend returns an actionable localized
  error before polling the lazy dialog future. Normal/custom/Cancel results
  remain unchanged; Windows/macOS use the transparent existing backend path.
- Storage/export commands propagate their error before the write continuation.
  Foreign-format and close confirmation return Result. OfficeStudio reports
  the error using its existing persistent error message and stops the action;
  it does not silently switch to SaveAs or pretend the user cancelled.
- The Rust close fallback retains the window on error, logs it and emits the
  error to a living webview. A dead frontend remains fail-closed; no visible
  toast is claimed in a dead frontend. The ordinary browser path is untouched.
- README documents the external AppImage requirement. DEBs must be installed
  through the package manager with their declared dependencies, rather than
  adding Zenity as an undisclosed native test tool.

## Targeted verification and remaining acceptance

Separate QA commit **89dc3877fd700ae1a655b3116f0e2fb490181772** ran
[45164983592](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45164983592):
**4 actual Linux std-only Rust tests and 9 Node config/coverage tests passed**.
The Rust tests include missing/non-executable helper handling, unchanged source
bytes and no close continuation on error, separate Cancel, and unchanged
positive/custom results. No Zenity or app was installed or launched. All
seven effective DEB/RPM configurations and confirmation guard sites are checked.
The job also parses the touched native Rust source, compiles the installer
checker and validates native desktop locale keys. Original small CI ZIPs,
official metadata and logs are archived alongside this file.

Local verification passed three common std-Rust tests on Windows, 31 existing
targeted studio/save-plan/message-store tests, nonincremental TypeScript and
nine offered desktop locales. The locale checker reports 23 existing warnings
for non-offered locale directories. These checks are distinct from app or GUI
acceptance; the actual Rust/Tauri caller type wiring still needs the coordinator
build on the next frozen source.

After root chooses that source and builds, verify actual DEB Depends for all
seven products; install through declared dependencies. Native negative coverage
must show the missing-helper error with unchanged source/target and retained
unsaved work. Positive coverage must prove genuine Yes/custom/Cancel, focus
return, a retained portal Open/SaveAs route, and save/normal full quit/new PID
reopen. Keep the same codepoint across relevant platform checks. No current
P2 result certifies those new bytes, and no RPM native pass is claimed.

Own unit processes completed and temporary files were removed. No installer
download, app build, native/local GUI, recording, main merge, tag or publication
was performed by this owner for this correction.
