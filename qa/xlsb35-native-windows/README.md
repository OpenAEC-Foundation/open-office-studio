# #35 / #30: native Windows XLSB

This single native Windows XLSB scope activates the integration coordinator's
existing Windows reservation after this chat completed native GNM. The user's
explicit follow-up was sent to integration before execution. Linux stays with
`d410`, macOS with `6f92`; no other chat's GUI or shared files are operated.
Windows six-app/STW preparation remains preserved and separately queued.

Application bytes are the ordinary canonical P2 Windows suite, not a new build:
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`, producer
`45143305147`, Windows job `137586342967`, attempt1. The downloader retains
the previously proven source/run/job/attempt, whole artifact ZIP, canonical
package-report, exact NSIS member and independent NSIS-payload/installed-exe
identity gates before any app operation. Authenticode is recorded; ordinary
unsigned P2 is not signed-release or standalone approval.

`fixture/` imports the original source and independent oracle unchanged from
`fb7e7b8ad95b9d13ed0ac1a33f70fd9906082588:qa/xlsb35-p2`. The actual
`shared_formula.xlsb` is 7651 bytes, SHA256
`e06ae79ed345495eee0bf5e7fd7a32638af0b646c5819f7d83a4f6fb97a151a3`.
The pinned source decoder reads the genuine ZIP/BIFF12 workbook, its one Sheet1
and all30 formula/cache records. A1 is literal1+2 and A2:A30 use a shared1+2
formula; all expected values are3. The edit is A15=40+2 with result42. Expected
data come from original binary records, not a converted golden workbook.
`source-binding.json` records source/oracle Git-blob byte provenance and the
already successful GNM driver's origin. GNM files are left unchanged.

The test runs only on a disposable hosted Windows VM. It checks the actual
installed app identity/version/process path, own fresh WebView/native profile
and safe bundled converter path. Native Ctrl+O and the real owned Open dialog
select the original XLSB; normal Rust IPC invokes its own private converter.
Read-only metadata/status calls do not create/edit/save a document. There is no
test bridge, backend mutation, hidden engine edit or browser demonstration.

The short preflight reads A1/A15/A30 through normal name-box/formula-bar UI,
confirms the real Save As default is XLSX without selecting a replacement,
uses native Save As, edits A15 via the actual formula input, and uses Ctrl+S.
All30 source formulas and cached results are independently checked from real
saved ZIP/XML before and after the edit. A byte-for-byte snapshot preserves the
original actual native save before its ordinary Ctrl+S overwrite.

Normal full exit and disappearance of the old owned WebViews are mandatory.
A different process reopens the edited XLSX using the native picker and reads
the sampled cells. Only after that focus/Ctrl/save/full-exit/reopen preflight
succeeds does the broader UI test read all30 actual formula inputs. A second
native Save As must still default to XLSX and pass the independent30-cell
formula/cache oracle. The original XLSB must remain byte-identical. Screenshots
capture source data and A15 before/after full restart, for later visual review.

The Windows Open/Edit1148/filename-label1090 and Save/Edit1001 guards preserve
the observed exact controls, owned process/dialog ancestry, real keys, exact path
readback and actual native buttons. Cleanup restores only own WebView policy and
removes only owned processes, install/profiles and guarded temporary directories.
No local GUI/capture or Computer Use session is started. Startup alone is not pass.

This case has no macro project and does not replace macro-guard acceptance. It
does not claim XLS/XLT, date systems, charts/styles, XLSB writing, Linux/macOS or
complete #35/#30 coverage. Existing Linux converter/engine evidence stays valid
at its own source; it is not relabeled native. No shared coverage/version/workflow
files, main, tags, release or publication are changed by this isolated QA path.

Portable source-only check:

```sh
python -B qa/xlsb35-native-windows/fixture/oracle.py
```

Native results and downloaded-byte audit will be recorded after execution.
