# #30 part 1: explicit SYLK filename route

Scope: prove the existing `.sylk` catalog entry using genuine SYLK bytes,
not implement or claim a different format. The control `.slk` and tested
`.sylk` names use the same immutable source already known as `lo-slk-2`:
LibreOffice/core revision `92c170f11d44857d8e365f2e29fb449dfb567ff5`,
`sc/qa/unit/data/slk/pass/ooo80484-1.slk`, 2,581 bytes, SHA-256
`bcfaae8f2ce55e393c100dcd95c37301129b9121af0429586de75b3ec99df420`.
No arbitrary unrelated extension is renamed and called SYLK.

The integration chat confirmed no overlapping SYLK or catalog-edit claim.
Work is isolated on `codex/formats-30-sylk-coverage-2026-11-20`, separately
from its frozen four-fix intake. No production source or catalog entries are
changed, no application/runtime is built, and no local app/converter is run.
The user's safe stop is 15:20 Europe/Amsterdam on 20 November 2026.

## Exact application and package point

- Application I3: `7f126f4b8e5269a54388cf78c48c78d2acc0daa1`.
- Tree: `8bc608488760e48919d7fb4e72a42569175b52a4`.
- Canonical desktop: `44715026752`, completed/success all three OSes.
- `.github/format30-sylk-candidate.json` pins its three archive/four package
  hashes; no older I2 values are used.
- Existing verified artifact downloader/installer-root classifier is reused
  read-only at test reference `5f940820e8f74cd42fe0cee454340481064b6cd3`.
  Whole archives, exact inner package sets and hashes are checked before use.

## Bounded proof sequence

`Format 30 bounded SYLK alias proof` runs Windows NSIS, macOS DMG and Linux
AppImage+DEB from those actual canonical packages. It extracts each package
without installing or launching the app. The private runtime executable and
receipt come only from that package. No system-office fallback or environment
override selects the runtime. No source, SDK or shared dependency is changed.

For both filename extensions, the actual production TypeScript input route
calls the real private converter through its test dependency seam, with the
unchanged production safe profile and process timeout. Converted XLSX opens
in the production WASM engine; twelve source-derived typed cells are checked,
an L1 edit marker is saved, and a newly created engine reopens and resaves it.
An independent Python ZIP/XML oracle checks converted/saved/reopened files,
same row/column content and edit marker, source preservation, and no active
macro/external relationships. Temporary extraction/profile and loader cleanup
must finish before a passed report is emitted.

The Rust converter's `mag_openen` and module filter validation both read this
same embedded catalog; `xlsx.invoer` contains `slk` and `sylk`. That is a source
inspection, not execution of the native Rust command/IPC. The test dependency
seam bypasses that IPC while exercising actual production TypeScript dispatch.

This is a functional input/converter/engine proof, **not native GUI, file
dialogue, Rust IPC or pixel acceptance**. Those are separate evidence types. The twelve
ASCII/numeric checks do not claim preservation of every source style, the
non-ASCII separator strings, charts, formulas or all possible SYLK variants.

The browser remains explicitly unsupported for this runtime-only format.
Each CI job exercises the actual production no-Tauri converter guard with a
minimal Node browser environment. A separate actual Chromium UI test covers
both `/` and the supported `/office/` route on Windows, using existing I3
builds under a coordinated read lease. Every build asset and its receipt were
verified before and after; no rebuild, dependency change or root/index edit.
Both uploads display the desktop/XLSX/one-sheet CSV advice. The existing tab
and active document survive, and genuine before/after downloaded DOCX files
have identical `word/document.xml`, including `SYLK30 BROWSER BEHOUD`.
Independent stdlib ZIP/XML checks confirm these archived bytes. Both original
PNGs were visually reviewed: the document and marker are readable; the transient
SYLK toast is absent from these images. Visible locator/text assertions and
reports establish the message separately. This part does not include an actual
Linux/macOS browser GUI run.

## Completed results

Corrected dedicated [run 44728178415](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/44728178415)
at harness `81f4dbeb426a75c4aaa845650d2209886f34b8c6` completed successfully.
The immutable application stays I3; test/documentation commits are separate.

| Platform/package | Verified canonical package | Both SLK/SYLK input, 12 cells, edit/save/fresh-engine reopen | Native SYLK UI |
| --- | --- | --- | --- |
| Windows NSIS | Passed | Passed | Not run |
| Linux AppImage | Passed | Passed | Not run |
| Linux DEB | Passed | Passed | Not run |
| macOS DMG | Passed | Passed | Not run |

All four extracted private runtimes identify LibreOffice 26.8.2.2. Their
original safe-profile hashes differ only by checkout line endings: Windows
`8f301a135c288b99cc984a895030eee27ba40d3d9722f81c1d691d5f66f3de6c`;
Linux/macOS `847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40`.
No claim of byte-identical cross-platform profile files is made.

The downloaded artifact ZIP hashes were checked against GitHub metadata;
all reports and **24 actual XLSX outputs** were independently rechecked after
download. Exact bytes, source, package/conversion receipts, oracles, browser
DOCX/PNGs and a hash inventory are committed in
[`2026-11-20-sylk-proof/`](2026-11-20-sylk-proof/). The independent CI audit SHA-256
is `757d56abaaa4cf347d95aa1bdec8d42bb8ae00ac7a7bc9212e24e579f4150ac7`.
The archive uses `-text` attributes to preserve bytes through Git.

The pinned input hash/size/header/end and twelve source cells were verified
before conversion. Eight independent-oracle failure contracts pass, including
wrong text/number/type, missing edit marker, changed source, external link and
macro part. Node/Python syntax checks pass. Recheck the archived CI files with:

```sh
python -B scripts/format30-sylk-audit.py
node scripts/controleer-formatendekking.mjs
```

First CI attempt `44727809824` failed in harness startup (`URL` name shadow),
before conversion. Browser attempts 1–4 exposed harness import/readiness,
selector and save-action mistakes. Those failures are retained in `history/`;
final browser attempt 5 passes. No application defect is inferred from them.

Cleanup is part of the successful reports: temporary package/profile resources,
WASM workbooks and Vite loaders are closed, and both local browser contexts,
browsers and preview servers are closed. No local native app/converter or
Computer Use/capture session was started. No CI run remains active for this part.

The `.sylk` row now records this bounded genuine-file alias proof, with its own
evidence rather than rewriting the historical 32-source result reports. No new
independent producer/format variant is claimed by using the same SYLK bytes.
**15** other `no-fixture` entries remain: `dps`, `dpt`, `et`, `ett`, `gnm`,
`sdd`, `stc`, `sti`, `stw`, `uop`, `uos`, `uot`, `wb2`, `wq2`, `xlsb`.
These are missing positive coverage, not fifteen independently reproduced bugs.
Their exact-source conversion/content/native checks and remaining #30 acceptance
work belong to later bounded parts; the existing #35 covers XLS/XLSB.
Issue #30 remains open. No new umbrella issue, `main` merge or release is authorized.
