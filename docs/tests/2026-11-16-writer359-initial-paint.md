# #359: unchanged G native Mac paint investigation

This is an evidence-only branch from integration
`46513b81621eecc4e340d66161c84807afca8f02`. The application remains G,
`9e0ad565402815082e8edf11a4c23943455fb6ce`; no product/SDK/renderer change is
included. It does not incorporate the separate #356 input implementation or
the later #358 navigation fix, and it does not certify those combinations.

## Fixed reproducer and source

The existing G DMG comes from runtime build
[43857127197](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43857127197):
373703908 bytes, SHA-256
`af83cdd95ff21fafa4c1757cc9cd2a0abb47afb794dd53c6e1014c9b15ee612b`.
The driver asserts the actual downloaded package hash before extracting it;
extraction verifies the original bundled helper signature and detaches its
own DMG mount. No installer rebuild is performed.

Input is the exact preserved `native/Ontwerpnotitie.odt` from
[43867748532](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43867748532),
SHA-256 `3040060e17a4290a253c33bb7525c52269a401f12daa7383f001102528565588`.
There is no new fixture generation or extension renaming. The document is a
converted editable copy in the app; the input file is never saved or edited.

## First controlled experiment

Driver `0b7a46a3b3b98d5f9228b926c0a312bcb65d8563`,
[43877574402](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43877574402).
Host macOS 26.7.2 / 25G332 ARM64, display 1024×768. Native app main window is
fitted normally to actual `12,31,1000,668`. The driver checks title and an
enabled native Save As button but does not press it, inject JS, read canvas
pixels, change theme, change document data, or grant capture/AX permissions.

| Phase | Owned PID | Native ready after launch | Original capture observation |
| --- | ---: | ---: | --- |
| Initial opening | 2316 | 21.016 s | No readable document glyphs at ready, after another 8 s, or after ordinary resize to 980×650 |
| Fresh process, same original input | 2918 | 15.555 s | Same missing glyphs at all three boundaries |

All six original full-display PNGs were viewed individually. UI chrome, the
109-word count, and sometimes the caret are visible. Font-substitution toasts
name Calibri→Carlito and Cambria→Caladea; that is an observed message, not proof
that font loading caused the missing pixels. The toast disappears without the
document glyphs appearing. Extra wait and ordinary resize are insufficient in
this reproducer; neither is presented as a corrective route.

The intended second acquisition route in this first experiment failed:
the isolated ScreenCaptureKit helper asserted `CGS_REQUIRE_INIT / did_initialize`
before producing a window image. The driver records that as blocked, separately
from the app and from the successful display captures. This run is explicitly
`collected-not-visual-pass`, despite a green collection workflow. It establishes
no independent capture agreement and no application crash conclusion.

Artifact [14229653638](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43877574402/artifacts/14229653638),
ZIP SHA-256 `7684e6b97b44b9f6590d67f2ea8bc482d58a31416992111d82543788bf8e83f6`.
Individual file hashes/timestamps are in its `result.json`. Selected originals:

| Image | SHA-256 |
| --- | --- |
| initial-ready-display.png | `d6b4065fcaafcf2bda7d905836971eaf2f691c42c4861868811dd8b78fbca854` |
| initial-wait8-display.png | `568471763417eb5081dfe2e2c64a654d4648a500196651dbcdabb0fc598422b9` |
| initial-resize-display.png | `93f9cfc9f965f2eac164c5ee0fd8cc96b094d07d8cc9118f590df1dd4b971335` |
| fresh-process-reopen-ready-display.png | `ca3048c48fb34cb55144d5947e2279bbc77b4cbbc0f26cda43ff56997376e22b` |
| fresh-process-reopen-wait8-display.png | `33e7a88810ff8410e1ff2e06838a77d9709ea287c9d48c9f4e40a974a51860b5` |
| fresh-process-reopen-resize-display.png | `5162033bb02ee4616cf90e10588f342bd6349b4383d20921e53ac98e221442b3` |

## Capture-client correction

The bounded follow-up initializes the helper's own AppKit/CGS client on its main
actor, with activation prohibited and no helper window. This changes only the
test helper; it does not alter the installed application or its rendering flags.
Driver `65127f0a7263aa9247a93e9584e440ab1d70f0fb` and run
[43878165715](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43878165715)
remain separate from the first experiment. Both acquisition routes completed
at all six boundaries; all twelve original PNGs were viewed individually.
Full-display `screencapture -x` and ScreenCaptureKit
`desktopIndependentWindow` / `SCScreenshotManager.captureImage` agree: no
readable document glyphs at ready, after the additional wait, or after resize,
in both processes. The separate window images exclude the desktop and menu
bar, retain app chrome and identify exactly the owned PID/window/title.

| Phase | PID / window ID | Native ready | Display / window capture |
| --- | --- | ---: | --- |
| Initial | 1782 / 32 | 14.734 s | Both missing glyphs at all three boundaries |
| Fresh process | 2244 / 47 | 7.437 s | Both missing glyphs at all three boundaries |

Ready means title and enabled Save As only: in this fresh-process ready image,
the word count has not appeared yet; after the extra wait it says 109 and the
glyphs are still absent. This is another reason not to equate control readiness
with completed visual painting. No font/layout timing inside WKWebView is
available in this external-only probe.

Artifact [14230099797](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43878165715/artifacts/14230099797),
ZIP SHA-256 `5f6cea5d5d9b687eacd631ecd4453ab1d196c5fb826bc4bf1051f35cbffe10b7`.
Raw JSON receipts for both experiments are retained in
[`writer359`](writer359), with all image hashes/timings and native readiness
snapshots; the linked artifacts preserve every original PNG. Selected second
experiment images:

| Image | SHA-256 |
| --- | --- |
| initial-ready-window.png | `4364aeff8221f0151aa6115a78d31872d7d20394ac9237e07473fd1ce89aeeec` |
| initial-ready-display.png | `37bd19953c504418d8caa2626e5b08d56866d4d4da5117cce1a8f63a98a96c27` |
| fresh-process-reopen-ready-window.png | `136a5e0619d15edae6139480cb1ca5a6df6719b63b0f31c154f0a2f1db5716ad` |
| fresh-process-reopen-ready-display.png | `7fb68fad6e506a5e882fd460ad62942a37026b6e9cad4e467dbb655d960c8788` |

The test-helper initialization correction is verified by successful native
window captures; it is not a fix for the missing application glyphs. Both owned
application PIDs are closed and the source hash is unchanged. The collection
workflow is green, while its receipt deliberately remains
`collected-not-visual-pass`.

## Separately supplied later-source evidence

The #358 owner supplied an already completed dataset, without starting an
overlapping investigation: app `7632c090651515ab3e0aad44dfe293aa340badcf`,
macOS 15.8.2 ARM64, native run
[43875473969](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43875473969),
receipt `fe3e04659ab735a2978361b244c915889be3e81b` on
`codex/writer-358-native-harness-2026-11-16`,
`docs/tests/2026-11-16-writer-358-macos-navigation.{md,json}`.
That owner reports missing initial/reopened A glyphs, readable A after the
Q/save/Undo/save sequence, and readable untouched C only after the earlier A
save phase and process restart. It is useful comparative evidence, not a
same-G rerun, independent first-at-launch C control, or a result independently
reproduced by this branch. Its original capture route was display-only and did
not measure font readiness. The integration chat already has this receipt.

## Acceptance and handoff boundary

No application cause or product fix is established by these experiments.
The independent window acquisition is now available; font/layout/bitmap timing
inside WKWebView and physical Mac observation remain unresolved.
ScreenCaptureKit and full-display capture agree here; agreement alone cannot distinguish
app painting from a shared compositor problem or prove a physical user's view.
Previous post-edit/save readable images stay in #359's original evidence; this
experiment deliberately does not mutate the document to make an image pass.

There is no product correction for the 14:45 integration intake cutoff. #359,
native initial/reopened visual acceptance and the dependent #30 completion stay
open. Do not merge the research branch as a renderer fix or start another broad
SDK/product change. A next authorized investigation should obtain a bounded
font/frame/first-paint timeline or independent native observation without
changing stored document content. Such instrumentation and new application
builds were not started in this timebox.

Python syntax passed locally; both Swift helpers compiled and executed on the
remote native Mac. The first capture helper's initialization failure is retained
separately, not relabeled as success. Compilation and native execution are
remote-only. No product change invalidates the existing fixed-G Windows/Linux/
browser results linked in the central G report, and no new passes on those
platforms are claimed. Both owned app PIDs closed, original ODT SHA remained
unchanged, extracted temporary app resources were disposed, and the extraction
mount was detached. No local GUI, test app, server, screen recording or Computer
Use runtime was started. Each screenshot helper is a bounded one-shot process;
no persistent capture stream is created. No main merge or release is authorized.
