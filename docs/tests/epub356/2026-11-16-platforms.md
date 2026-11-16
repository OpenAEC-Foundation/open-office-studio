# #356 EPUB input: fixed-source platform receipt

Application: `2b100ada38e39d58dab42369bf4c0d3659f70834` (2026.46.2).
Product PR: [357](https://github.com/OpenAEC-Foundation/open-office-studio/pull/357),
branch `codex/formats-356-epub-input`, delivery head
`cf64b9c0d9183f68a0963a42b5c19f65d42956f3`.
Later acceptance commits change drivers/documentation only. These results do
not certify a subsequent combined integration tree.

## Actual input and oracle

Own deterministic `leesvolgorde.epub`, SHA-256
`8e48dc46db4058f4539cece9564f090e2385ebb006454b51bcb261b6dcf73bae`.
Its ZIP and manifest order deliberately differ from OPF spine order. Expected:
both chapter headings in spine order, Unicode text, emphasis/list, embedded PNG,
and a table containing 42. Expected PNG SHA-256:
`f132d26c2c3b6ccd9beb0583a4fbf360ae0461c0a4c0b9f3a973fe3dd247ce33`.
The original c0 runtime-exported EPUB is separately retained and covered by
regression tests. This fixes the application input route, not LibreOffice's
missing EPUB import filter.

## Browser

[43860520929](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43860520929)
passed, driver `a58093b6320d3b1bbcc247ff5c2575c5e8aab9c0`.
Actual production `/office/`, no native bridge: import, offline keyboard edit,
DOCX download, independent ZIP content/order/image checks, DOCX reopen, and
malformed EPUB rejection preserving the loaded document/tabs. Original hash
unchanged; no page errors or external requests. Original reopened image was
independently viewed and shows the edit, both headings, image and table.
Artifact archive SHA-256:
`2bddbaf75c30e0436ceec1a97463d8df203991efc563e2c03694b916c656122c`.

## Native packages

Each platform built fresh from the same application commit, installed/unpacked
the actual package and used its app in a fresh CI runner. Converter/macro and
independent content proofs and the 32 existing legacy cases also passed (31
positive editor save/reopen cases, one expected invalid rejection). Full
project checks in these package jobs passed, including frozen dependency
installation. No external user converter installation was used.

Native scope is real packaged-app EPUB opening, readable original document
capture, native pointer/Accessibility activation of Save As, and inspection of
the bundled safe-runtime source panel. This does not claim an OS save-dialog
file write/reopen on every native host. Actual editor save/reopen is covered by
the EPUB engine regression and the end-to-end browser test. Source hash stayed
unchanged and owned app processes were closed on every native platform.

| Platform | Passed run | Driver |
| --- | --- | --- |
| Linux DEB + AppImage | [43861149912](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43861149912) | `cf64b9c0d9183f68a0963a42b5c19f65d42956f3` |
| Windows installed NSIS / WebView2 | [43865702789](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43865702789) | `2fd81cb8f7f87b4c2dff29a00e45f18bfd0214d9` |
| macOS ARM DMG / native AX | [43870192245](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43870192245) | `7b036bffeba8bcda204b8412c7a2c359a70f48de` |

| Package | Bytes | SHA-256 |
| --- | ---: | --- |
| Linux AppImage | 429853176 | `89dd478625de17d9e5a9abc1d407047ac94c843c4e2e30a8962861f1de9ff04e` |
| Linux DEB | 383821898 | `3376316e84f9a728b51d4be858312c08db57e91daf280734f10ba7de3d3ef186` |
| Windows NSIS | 384546721 | `89d6359ab905acd4ec886b1bdf8802918c5a7b7ad3f732edf5e83cc9e7eaf035` |
| macOS DMG | 373749487 | `d8e3772d9c67434b4c9972b567d295bfcbc45cd5e725b2ff24957568f0710814` |

| Platform | Native artifact archive SHA-256 | Converter proof archive SHA-256 |
| --- | --- | --- |
| Linux | `15f98f3544750a0b1c1466657feeda01d364fbce3c30d90e8267567869c8cdde` | `4a698e88dfa5d306357cd091e4654b1d29a91fb2473a4126e5da6ba48103f838` |
| Windows | `771c4cc511da5fb43d0ee6f493150ec98c43edb30075ecdef38f6a17bab58ce5` | `f6e1c2bc71b11df10a61c22940030b8e1752fbda662a52bd85c8e2d851870c07` |
| macOS | `057a9e54a850ca2331781bca0ffd00211ba585f1b3f9be5f5a9393ba14d75202` | `1945083e449395d5717227bb7e23b96591a16746b8840c117c576d515eb7f674` |

All original native document images were independently viewed: both headings,
body/list, PNG and table are visible. Linux uses the already agreed CI-only
`WEBKIT_DISABLE_DMABUF_RENDERER=1`, without a production environment change.
Mac uses the bounded ordinary window fit to 1000×668 on the 1024×768 display,
waits for enabled Save As, captures the ready document, then performs actual
AXPress. `readyBeforeSaveAs`, `epubNativeWindow`, `saveAsShowsBundledRuntime`,
`ownedAppClosed` and `originalUnchanged` are true; transient AX retries are zero;
no new crash reports or system alert windows were found.

## Limits and integration

17 EPUB tests, 16 existing text-import tests, the coverage guard, TypeScript
and active-language key/interpolation checks passed locally with read-only
shared dependencies and an isolated test cache. Prepared-language warnings
remain explicitly recorded in the fixture README. EPUB imports an editable
DOCX copy and reports omitted book CSS/fonts/fixed layout/navigation/scripts,
audio/video and SVG; DRM or unsupported spine media fail explicitly.

The central integration chat owns intake, combined-tree checks and issue
closure. #30 remains open: this resolves the concrete EPUB dependency and
leaves 16 other advertised extensions without positive input coverage. The
separate Mac first-paint investigation #359 concerns another application point
and input; this readable EPUB capture establishes no cause or fix for #359.
No main merge, release, signing/notarization certification or extra native
architecture certification is claimed. No local app, printer, security setting
or capture session was started; CI closed its own app processes.

The older product branch's regular desktop Linux job
[43861156830](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43861156830)
is red: its workflow references `scripts/proef-native-linux-basis.mjs`, which is
absent from that older branch (`MODULE_NOT_FOUND`). The central integration
tree already owns that script/workflow. This does not invalidate the separate
fresh-package EPUB proofs above, but it is not an all-green regular PR check
claim; the integrator must use the complete combined tree and its checks.
