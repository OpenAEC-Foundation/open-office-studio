# #30: native Windows GNM/Gnumeric acceptance at P2

The user's native-GNM follow-up was coordinated with the single integration
chat before execution. Ownership is Windows: this chat; Linux: existing
`standalone_linux` agent; macOS: existing `6f92` chat, following the critical
#359 native preflight. Windows six-app/STW remains preserved and separately
queued. No other chat's files or local GUI were operated by this Windows scope.

## Result

[Native run 45151594168](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45151594168)
**passes** on a fresh hosted Windows VM, with test harness
`2d599cdb05560feb71008e63c3285ee7f8d930f3` and the unchanged canonical P2 suite:

- Application `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`;
  tree `5a644e397ecc6af5452a49b6404edf953687d1b2`; version `2026.48.1`.
- Producer Desktop `45143305147`, Windows job `137586342967`, attempt **1**,
  successful Windows build and actual installer-check steps.
- Official suite artifact `14804672476`, full ZIP SHA-256
  `ecce5a188abbb5b17e52c4097d7add95ddeaaa8c24a9a4e6c492049d16902733`.
- Exact NSIS member `nsis/Open Office Studio_2026.48.1_x64-setup.exe`,
  **384,512,913 bytes**, SHA-256
  `85d5155a0322ce296eb4f57485235cdb725f4f293c7642bc562971ff924357ce`.
- The canonical package-report ZIP `14804637474` is independently hash-bound
  and its version/member/size/hash agree before any installation.
- Independent extract-only NSIS payload `open-office-studio.exe`, x64,
  **88,199,680 bytes**, SHA-256
  `feab08d3bc09895745c75653b2f8c806e04efa7fc36101debff8b278da599a67`.
  The actually installed executable matches these bytes **before launch**.

The installer and application report `NotSigned`: this ordinary P2 suite proves
the bounded native function, not signed-release or standalone acceptance.
No application rebuild, source patch, catalog change or late product intake is
used. The existing Linux converter/engine and browser proof on the same P2 is
retained and is not unnecessarily rerun.

## Actual native operation

Both `.gnm` and `.gnumeric` explicitly use the same genuine upstream Gnumeric
workbook described in [the source proof](2026-11-23-gnm-route.md): original
2,062-byte gzip/XML SHA-256
`0ae783979ec180a4a6378d9b6c43ae5af05b47e5a5d18b26dea72e4fa1ed6be6`.
This is one original workbook under two filename choices, not two producers.

Before document operation, the native driver checks the actual process path,
Tauri identifier `org.openaec.office-studio`, exact version/name, newly created
owned WebView profile and safe converter **inside this installation**.
The bundled runtime reports LibreOffice `26.8.2.2`; its signed `soffice.com`
SHA-256 is `4f133aba4d8db66122ec34bc17eeaa8b274cfa5ded03feb384953f6ae357d4cf`.
No system converter or environment override supplies the conversion.

For each name, the real Ctrl+O native common dialog selects the original file;
normal production Rust IPC and the bundled runtime open its editable XLSX copy.
The real sheet menu must list `Sheet1`, `Sheet2`. Ordinary cell navigation and
the actual formula input read all eight original typed-cell contents/four
expressions. Native Save As writes an actual XLSX checked against source XML.
An ordinary edit adds `GNM30 EDIT` to Sheet2!A1; Ctrl+S must change the saved
filesystem bytes and pass the independent content/formula/marker oracle.

The application then exits normally and all owned WebViews are gone. A new
process, with a different PID, selects the saved XLSX through the native picker,
reads the source cells/formulas and second-sheet marker through the UI again,
and saves a new XLSX copy. The first complete sequence is the focus/Ctrl/save/
full-exit/reopen preflight; the control-extension sequence follows its success.
Identity/status calls are read-only; no bridge/engine mutation injects a document,
edit, saved output or passing test state.

The downloaded real files `gnm-native.xlsx`, `gnm-reopened.xlsx`,
`gnumeric-native.xlsx`, `gnumeric-reopened.xlsx` were independently reopened as
ZIP/XML from original Gnumeric XML. All retain both sheets, all eight typed
source cells, all four formulas and cached results, and the exact second-sheet
edit marker. All four are byte-identical, SHA-256
`ba1b42bf9c23bbdcc760346a17409c3b6d1cc79fe0a601ff7c61f2617a0b689a`.
Both original input files and the original fixture remain unchanged.

## Visual observations, failures and cleanup

All six original native WebView screenshots were reviewed serially. The two
opened images show the **originally empty Sheet2**; this is not evidence of a
grey/failed document renderer. Both edited and both reopened images show the
readable marker in the grid and formula bar, with the native sheet tabs intact.
Source Sheet1 contents were read through actual native UI inputs in the reports;
these Sheet2 screenshots do not picture the original source cells.

The images separately record the product's editable-copy/original-preserved
message, Sans→Liberation Sans font-substitution advice, and on reopening generic
protection/unknown-extension compatibility advice. These screenshot observations
are not promoted into new reproduced defects or a full font/style fidelity claim.

Failed native preflights remain archived separately:

1. `45150326812` stopped before opening because filename focus/identity was not
   established. Startup/identity success was not called a functional pass.
2. `45150915124` used the ordinary native filename mnemonic and identified the
   actual Open control as owned Edit1148 beside File-name Static1090, distinct
   from the earlier proven Save Edit1001. It still stopped before file opening.
3. `45151594168` retains exact per-mode control/label/process/ancestor checks,
   actual keyboard/path readback and native Open/Save actions and passes.

Those are driver findings, not product fixes. The successful run confirms four
normal full exits, two new-process reopens, no forced process-tree kill, no
remaining owned WebViews and cleanup of its WebView policy, installed suite,
native profiles and temporary resources. Failed-preflight cleanup is explicit
and does not turn either failure into a pass. No local native GUI, Computer Use
client or screen-recording session was started.

## Durable evidence and integration boundary

[`2026-11-23-gnm-native-windows-proof/`](2026-11-23-gnm-native-windows-proof/)
contains **174 byte-preserved evidence files**: all three original proof ZIPs,
official metadata and run records, failed native diagnostics, successful UI/
process/runtime/profile/cleanup receipts, original fixture, actual XLSX outputs,
six successful screenshots and independent audit. The successful artifact is
`14807236412`, whole ZIP SHA-256
`459f9a74dbafa3a4d8ea0809cbc2bc3f427347f1bdd0382a7ceb7677c1b9c7c7`.
The original large installer ZIP is hash-bound by the receipt, not committed.
The inventory and `-text` attributes preserve original evidence bytes.

Repeat the independent original-artifact/extracted-byte/source/receipt/native-
lifecycle/XLSX audit with:

```sh
python -B scripts/format30-gnm/native-windows/audit.py
```

Node, Python and PowerShell syntax checks and Git whitespace checks pass. The
existing 86-extension/32-fixture shared coverage check stays consistent. Shared
coverage files remain untouched; the isolated GNM coverage proposal adds this
Windows evidence for the integration coordinator to combine centrally.

Windows native GNM is complete for this source example. Native Linux/macOS
results come from their assigned owners and are **not inferred** from Windows
or earlier converter/browser checks. #30 remains open; no release/standalone,
all-variant/font/style/chart or other-platform approval follows from this proof.
