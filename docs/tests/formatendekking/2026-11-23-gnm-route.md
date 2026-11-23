# #30: explicit GNM/Gnumeric input route

Subsequent user-authorized native Windows follow-up is now separately complete:
[native Windows result](2026-11-23-gnm-native-windows.md). The tables below retain
the original bounded Linux converter/browser proof scope; native Linux/macOS
are assigned separately through integration and are not inferred from it.

The integration coordinator assigned this chat only the `.gnm` route, with the
same genuine Gnumeric input under `.gnumeric` as control. Existing #30 and open/
closed Gnumeric/GNM issue descriptions were searched before starting; no extra
umbrella/duplicate issue is created. Other format claims remain with integration.
The user's later explicit request for parallel work is coordinated centrally:
this chat keeps GNM; other existing chats received XLSB/#35, STC, STI and STW.
Those are five bounded assignments, not five completed fixes or fivefold speed.

## Exact point and scope

- P2 application: `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`.
- Tree: `5a644e397ecc6af5452a49b6404edf953687d1b2`; version `2026.48.1`.
- Canonical Desktop build: `45143305147`, initially still building.
- Branch: `codex/formats-30-gnm-2026-11-23`, isolated from the frozen P2 intake.
- No production source/catalog/version/shared workflow edit, new app build,
  local native app/GUI or Mac runner is started by this bounded part.
- Linux private-converter evidence started after its own canonical package
  identities were verified, without requiring another OS's build to finish.
  Windows/macOS operation is not silently inferred from Linux or older I3.

The separate Windows six-app QA preparation remains preserved at
`744d76b1eb0fb1f06008ef4224e3e12a88e19450`; its final packages are not yet
available. This chat will finish the GNM scope before resuming that execution.

## Genuine source and independent expected content

The old 32-source manifest entry `lo-gnumeric-1`, `täßt.gnumeric`, contains
**three empty sheets**. Its technical historical open/save/reopen result is
not evidence that text/numbers/formulas survived import; this is not a corrupt
file or an independently reproduced application defect.

The content proof instead pins another original upstream Gnumeric workbook:

- Repository/revision: LibreOffice/core,
  `92c170f11d44857d8e365f2e29fb449dfb567ff5`.
- Path: `sc/qa/unit/data/gnumeric/universal-content.gnumeric`.
- Original gzip/XML bytes: **2,062**; Git blob
  `440c2feb88d5fd5d262c7338047ecdc5f2a6998a`.
- SHA-256: `0ae783979ec180a4a6378d9b6c43ae5af05b47e5a5d18b26dea72e4fa1ed6be6`.
- The same genuine Gnumeric bytes are explicitly named `.gnm` and `.gnumeric`;
  no different producer or independently distinct format variant is claimed.

The source oracle reads original XML coordinates/types and independently
evaluates only its four elementary expressions. Expected sheets are `Sheet1`
and empty `Sheet2`. Sheet1 has A1=1, B1=`String1`, A2=2, B2=`String2`, and
C1=`2*3`→6, C2=`2+3`→5, C3=`2-3`→−1, C4=`C1+C2`→11. Converted, saved and
new-workbook-handle reopened XLSX must retain both sheet names, all eight typed cells,
all four formulas and numeric results. Editing adds `GNM30 EDIT` to Sheet2!A1;
the independent ZIP/XML oracle requires that exact second-sheet marker after
save/reopen. Active macros/embeddings/external relationships are rejected.

## Completed bounded proof

No application change was needed for this route. The existing `.gnm` catalog
choice actually works in the measured Linux private-converter and production
input/editor route. This fills missing positive evidence, not a new importer.
The TypeScript converter dependency seam calls the real private program; the
native Rust IPC, chooser and installed application are **not** executed by it.
The Rust `mag_openen`/filter code reads the same embedded catalog, but source
inspection is a separate evidence type from executing the native command.

| Platform / evidence | Result at exact P2 | Remaining acceptance |
| --- | --- | --- |
| Linux AppImage | Canonical package hash, real private converter, both filename choices, production workbook edit/save/new-handle reopen and independent XML: passed | Native app/IPC/chooser/visual GNM operation not run |
| Linux DEB | Same bounded proof: passed | Native app/IPC/chooser/visual GNM operation not run |
| Browser Chromium on Linux | Real `/` and `/office/`: both GNM and Gnumeric show desktop/XLSX/one-sheet CSV advice, preserve tabs/active document and exact saved document XML: passed | No Windows/macOS browser GUI inference |
| Windows | Not tested by this GNM proof | Canonical package, converter/engine and native GNM operation remain separate checks |
| macOS | Not tested; coordinator reserves critical native/build capacity | Same separate checks; no extra Mac build or runner started here |

### Canonical Linux inputs

Desktop run `45143305147`, Linux job `137586343061`, built and checked its
packages successfully. At the time of this proof the overall three-OS run
was still in progress; the unrelated Windows/macOS jobs were not called passed.

- Original `open-office-studio-Linux` artifact `14804062140`, exact ZIP SHA-256
  `4704f7fdfe85a711a1c3f8a1da6114461bf17edde090d18f1665397ad23abbc6`.
- `appimage/Open Office Studio_2026.48.1_amd64.AppImage`: 429,857,272 bytes,
  SHA-256 `5f4660c1deb0e29b80d75ae8356c72c29b84b50bd746a2932f28ae1af978e944`.
- `deb/Open Office Studio_2026.48.1_amd64.deb`: 383,815,340 bytes,
  SHA-256 `23258ac32f9368a6512b04ffcfda9a3f2be50dafeee6d8c7ca36a3a525a5f5d1`.

The GitHub run/source/tree, own successful package steps and official immutable
ZIP digest are checked before deriving the inner hashes. The execution manifest
then freezes those bytes locally. Only the two direct installer-root packages
enter extraction/execution. The broad desktop upload glob also captured **28
nested Windows pip/setuptools launchers** within the package staging directories;
they are recorded as whole-ZIP hash-bound ancillary data and never extracted or
executed. This uses the same distinction as the earlier reviewed canonical
installer classifier, not arbitrary executable discovery.

Both extracted runtimes identify LibreOffice 26.8.2.2. The unchanged production
safe-profile SHA-256 is
`847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40`.
There is no system-office fallback or converter/profile environment override.

### Real conversion, edit/save/reopen and independent file checks

[Run 45147245169](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45147245169)
at test harness `c55b4559e7088fab26540e5e20cecbfb79e93da8` passes both Linux
package variants. Each runs the same valid source through the actual
`bereidOpenen` dispatch under `.gnumeric` and `.gnm`, then opens the converted
XLSX in the production WASM library, edits Sheet2!A1, saves, disposes that
workbook and opens the saved bytes in a new workbook handle. All **12 actual
XLSX outputs** (converted/saved/reopened × two names × two packages) were
independently rechecked after download from the genuine gzip/XML source.
All eight typed cells, four expressions and numeric results, both sheet names
and all saved/reopened second-sheet markers pass. Original source bytes stay
unchanged; no all-variant/style/chart/non-ASCII guarantee is inferred.

### Real supported browser routes

[Run 45145748260](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45145748260)
at harness `83792e30de8c2a0530888505079c64da9cc40ebe` built normal and hosted
P2 frontends with full before/after source/lock/builder/asset receipts, 727
files each. Four actual input cases pass in Chromium. The four original toast
images are readable and show the proper per-extension advice. Both original
retained-document images show `GNM30 BROWSER PRESERVE` intact. All six images
were serially reviewed by this chat. The four genuine before/after downloaded
DOCX files were independently opened as ZIP/XML; both routes retain exact
`word/document.xml` SHA-256
`284a0abe0c1f693b596393f9adf6af55c5eb825922fa77e63c0c5d0013e67a0b`.

The successful browser stage is retained even though that run then correctly
stopped before conversion: its canonical Linux package was not ready yet.
The converter retry reuses this valid browser evidence on the **same P2 source
and exact browser-script hash**; no frontend build or successful route check is
repeated merely because another platform package arrives.

### Evidence, focused contracts and cleanup

[`2026-11-23-gnm-proof/`](2026-11-23-gnm-proof/) preserves original artifact
ZIPs and official digest metadata, source/run/job/package receipts, fixture,
oracles, real outputs and six images, failed attempts and independent audit
summaries. `-text` attributes and a hash inventory preserve original bytes.
The browser proof ZIP SHA-256 is
`e784a634318a01edcf527cb3c7a711b006758724db6a5131e098619120c4c1e9`;
converter proof ZIP SHA-256 is
`763d47d12bf8c2c41c5c7936ff1a2cd9e3492c310cf4f77d38017856e2d0c54a`.

Sixteen independent-oracle contracts cover wrong source/data/types/formulas/
cached values, missing or renamed sheets, wrong-sheet/missing markers, macros,
external links and unsafe expression syntax. Nine package gates cover exact
source/tree, successful own-platform build/checks and valid artifact metadata,
without waiting for unrelated OS/native gates. These 25 focused contracts pass.
Node/Python syntax and Git whitespace checks pass. Repeat actual-byte checks:

```sh
python -B scripts/format30-gnm/audit_browser.py
python -B scripts/format30-gnm/audit_converter.py
python -B scripts/format30-gnm/oracle_test.py
python -B scripts/format30-gnm/packages_test.py
```

History remains separate: attempt 1 lacked the browser spelling-WASM target;
attempt 2 passed browser and waited for an unready canonical package; attempt 3
used an over-strict ZIP-content classifier. Attempt 4 passes after restricting
executable inputs to actual direct installer-root packages. These are harness/
dependency findings, not independently reproduced product bugs.

All owned CI runs are completed. Workbooks, private converter/profile/extraction
resources and Vite loader are disposed; both actual browser contexts, browser
processes and preview servers are confirmed closed in the reports. No local
native app, Computer Use client or screen-recording session was started.

## Central integration and remaining work

The shared `dekking.json`, generated matrix, source/catalog and historical
32-fixture result files are left unchanged by this parallel owner. The isolated
[`2026-11-23-gnm-coverage-proposal.json`](2026-11-23-gnm-coverage-proposal.json)
contains one explicit, limited GNM row for the central integration chat to
combine with other owners' evidence, avoiding concurrent shared-index edits.
No duplicate/umbrella issue or PR/build-triggering late intake is created.
The source-preserving proof is delivered separately from frozen P2 product code.

This bounded Linux input/engine and browser part is complete. Windows/macOS
converter/native operation and native Linux GNM IPC/dialogue/visual acceptance
are still open; no complete-all-formats or release approval follows. #30 stays
open. Five independently assigned format tracks can progress in parallel, but
the earlier 5–10 workday effort estimate is not a reliable calendar promise
while upstream fixtures, actual import defects and platform/native gates remain.
