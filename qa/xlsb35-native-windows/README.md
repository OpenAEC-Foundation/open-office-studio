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

## Completed native result

[Windows run45154252404](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45154252404),
job `137623055307`, passes on its first attempt at harness
`98f73b96e8df0639a23907fae2b8848b46d9f104`. Application bytes remain exact
P2. Integration explicitly reconfirmed the existing exclusive Windows claim,
unchanged package pin and absence of a signed-six-app runner conflict.

The canonical Windows artifact is `14804672476`, whole ZIP SHA256
`ecce5a188abbb5b17e52c4097d7add95ddeaaa8c24a9a4e6c492049d16902733`.
The exact NSIS `Open Office Studio_2026.48.1_x64-setup.exe` is384512913 bytes,
SHA256 `85d5155a0322ce296eb4f57485235cdb725f4f293c7642bc562971ff924357ce`.
The hash-verified canonical package report agrees. An independent extract-only
NSIS x64 payload and the actually installed executable both have SHA256
`feab08d3bc09895745c75653b2f8c806e04efa7fc36101debff8b278da599a67` before
launch. Source/run/job/attempt and actual own bundled safe-runtime status are
preserved in the evidence, rather than inferred from successful startup.

Native Ctrl+O/filepicker, original XLSB import, actual default-XLSX Save As,
formula-input edit A15=`=40+2`, ordinary Ctrl+S, normal full exit, disappearance
of owned WebViews and different-process native-picker reopening all pass.
The short preflight succeeds before broad UI reads. All30 formula inputs are
then read through the actual native interface after reopening. A second normal
native Save As also suggests XLSX without driver format replacement. Both
processes exit normally, with no forced kill. No document/backend mutation
or Node conversion bridge substitutes for the native operation.

Independent checks reopen the original artifact ZIP/extracted files, original
BIFF12 source, canonical package receipts, actual native lifecycle and all30
saved formula/cache cells. The original 7651-byte XLSB remains unchanged.
Actual native saves retained are:

| Output | Independently checked content | SHA256 |
| --- | --- | --- |
| `xlsb35-before-edit.xlsx` | Byte-for-byte snapshot of the first real native Save As; all30 formulas1+2/cached3 | `c7863e703deed7f02c5266e6709fd33fa486792620bee9515b73bfc5b4daf18a` |
| `xlsb35-edited.xlsx` | Actual Ctrl+S output; A15=40+2/cached42, other29 formulas1+2/cached3 | `0210992079c9cca456734ef02c5c7c31df82333ebb6939f68317aed32638d692` |
| `xlsb35-reopened.xlsx` | Actual new-process Save As; same30 expected formulas/results | `0210992079c9cca456734ef02c5c7c31df82333ebb6939f68317aed32638d692` |

All three original screenshots were reviewed serially. The original image shows
visible3 values and A1=`=1+2`. Edited and reopened images show the visible A15
value42 and formula `=40+2`, with neighboring values3 and Sheet1 intact. The
product's editable-copy/original-preserved message and later generic protection/
unknown-extension advice are recorded as separate screenshot observations; they
do not establish a new reproduced defect or a full style/chart fidelity claim.

Proof artifact `14807757665` has whole ZIP SHA256
`4dc73ee03e4d4557c0a8ac43b8bfe10accc20d413dfbae2c10dfef28e91f67d4`.
[`evidence/`](evidence/) retains90 byte-preserved files including that original
ZIP, official metadata, exact run/source/package records, original input, three
real XLSX outputs, UI/native-window/process/profile/runtime/cleanup records,
three screenshots, independent audit and SHA inventory. Large canonical
installer bytes are bound by the verified receipt and are not committed.
Own registry policy, installation, native/WebView profiles and guarded temporary
directories are confirmed cleaned, with no residual owned WebViews. No local
GUI, capture or Computer Use session was started.

Repeat the complete downloaded-byte audit with:

```sh
python -B qa/xlsb35-native-windows/audit.py
```

Node/Python/PowerShell syntax and Git whitespace checks pass. The90 evidence
files are checked against the SHA inventory and staged Git bytes; the imported
source/oracle files are checked against their exact original Git blobs.
Shared coverage/catalog/version/workflows and existing GNM/Windows-six-app
deliveries are unchanged. Native Linux/macOS stay with their assigned owners;
this result does not close #35/#30 or approve a signed/standalone release.
