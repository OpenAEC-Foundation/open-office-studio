# Native Windows GNM case

Prepared for the user's explicit native-GNM follow-up. Execution is gated by
`.github/format30-gnm-native-windows.json`. The integration coordinator confirmed
this chat's exclusive Windows ownership and exact package point before enabling
it. Linux is with `standalone_linux`; macOS is with chat `6f92`, following its
critical #359 preflight. Windows six-app/STW execution remains separately queued.
No local native application, screen capture, or extra application build is used.

The package downloader accepts only P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`,
tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`, canonical
Desktop run `45143305147`, Windows artifact `14804672476` and official ZIP digest
`ecce5a188abbb5b17e52c4097d7add95ddeaaa8c24a9a4e6c492049d16902733`.
It gates source/tree/run/job/attempt and the hash-verified canonical package
report, then hashes the complete ZIP before extracting only the direct NSIS
installer. An independent extract-only 7-Zip read derives the x64 executable
payload hash; the installed executable must equal those bytes before launch.
This is suite functional acceptance, not the later signed standalone intake.

The native driver installs those unchanged bytes on a fresh hosted Windows VM.
It checks actual process path, version/app identifier, own WebView profile,
Authenticode status and own installed safe converter path. CDP attaches only to
the owned native WebView2. Product read-only identity/status calls are recorded;
document opening, editing and saving use ordinary UI and native common dialogs.
It never invokes a document/backend mutation to produce passing outputs.

For the pinned upstream Gnumeric source (see `../oracle.py`), each `.gnm` and
`.gnumeric` name is opened through Ctrl+O and the native picker. The actual
formula bar must expose all eight source cells/four expressions and the sheet
menu both original sheet names. Save As produces a real XLSX verified against
original source XML. On Sheet2!A1 an actual edit adds `GNM30 EDIT`; Ctrl+S must
change real saved bytes and pass the marker/content/formula oracle. Normal
full exit and old-WebView exit are mandatory before a different process opens
the saved XLSX through the native picker, verifies UI content and saves a new
independently checked copy. Startup alone never passes. Screenshots and failure
reports are retained; visual review follows actual execution.

The first complete initial/reopen sequence is the short focus/Ctrl/save/reopen
preflight. The control filename route starts only after that succeeds. A driver
failure is reported separately from a reproduced product defect.

The PowerShell helpers derive from this chat's preserved standalone harness
`744d76b1eb0fb1f06008ef4224e3e12a88e19450`. Changes are limited to the Office
suite identity allowlist and adding the native Open dialog alongside the already
proven native Save handling. Open fallback keyboard entry requires the owned
dialog's real focused Edit HWND/control ID1148, its observed File name label1090,
and the exact owned-dialog ancestry before reading back the typed path. The
Save fallback retains its independently proven Edit1001 identity. These distinct
native controls were established by the retained failed preflight diagnostics.
Temporary/profile removal keeps the proven resolved-path containment guards.
Owned processes, WebView policy, installation and profiles are cleaned; other
chats' processes or the user's computer are never touched.

Linux and macOS ownership is coordinated centrally. Existing Linux converter/
engine proof and actual Chromium browser proof are reused at their exact P2
point; neither replaces native GNM operation. No pass is recorded by this
preparation alone. Shared coverage indexes, version files and workflows remain
outside this isolated QA path.
