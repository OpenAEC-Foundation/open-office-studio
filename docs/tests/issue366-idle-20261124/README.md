# Issue 366: two-minute idle after repeated paste

**NOT REPRODUCED. No product fix; issue remains open.**

One new browser case ran on application source
`794ac2fc803d5e537331e16e843cfca544e3c527`, tree
`779f342af0146a9a5e7c941ce3665878c20af802`, version 2026.48.1.
Only this independent QA/evidence scope changes. No application, runtime,
build, main, tag or release change is included.

The case reuses the earlier 37ec6d04 synthetic fixture generator and content
oracle, adding at least two minutes of passive observation after **each** of
three real Ctrl+A/C/End/V operations. There is no additional input during
those idle windows. The initial driver preflight proves actual canvas-click
focus and clipboard, Ctrl+S/Save as download, independent XML, and reopening
in a fresh browser context. No API focus/content/layout setters are used.

| Phase | Final layout / displayed total | Paragraphs | Observation ms | First final-count match ms |
|---|---:|---:|---:|---:|
| Initial | 3 / 3 | 20 | 5,108 | 863 |
| Preflight fresh reopen | 3 / 3 | 20 | 5,029 | 1,099 |
| Double 1 | 6 / 6 | 39 | 121,896 | 400 |
| Double 2 | 11 / 11 | 77 | 120,046 | 309 |
| Double 3 | 21 / 21 | 153 | 120,526 | 84 |
| Undo | 11 / 11 | 77 | 5,249 | 470 |
| Redo | 21 / 21 | 153 | 5,180 | 405 |
| Fresh-context reopen | 21 / 21 | 153 | 5,262 | 1,676 |

Times start at passive observation after the awaited keyboard call and include
sampling/readback overhead. They are not engine-completion benchmarks. The
first five seconds are sampled every 250 ms, then every 2 seconds. Initial
publication mismatches remain in the raw report and proof; none remained
after five seconds. This is not a claim that every initial sample matched.

The independent Python ZIP/ElementTree pass derives the three concatenation
rounds from the retained source DOCX. The final downloaded DOCX contains
exactly 153 expected paragraphs, 8,640 words and 56,640 characters; reopening
those same bytes in a fresh context preserves every paragraph. Its SHA256 is
`c367a950be24a9ae5fe21d867f86b718f567b4550131cc09ebc6386ac078813f`.
Undo/Redo also preserve the exact source-derived paragraph arrays. Three
original screenshots were viewed; double-3 visibly shows Page 21 of 21 and
the final reopen shows Page 1 of 21, both with the matching content counts.

## Source analysis

`source-analysis.json` records the exact relevant app/dependency file hashes
against P5 and the older QA source. `tekst: () => docx.current` reads the current
ref; `TekstStatus` already calls it every 500 ms. Changed current/total values
update React state, then the external status store and `useSyncExternalStore`
consumer publish the visible count. Content, selection and scroll events
provide additional updates. No missing polling mechanism was established.

The pinned engine documents provisional `getTotalPages()` results. Preserved
source snippets distinguish the full/partial layout and worker-geometry paths;
this analysis does not assume either caused the user's observation. The new
test does not call `whenLayoutComplete` or force a layout. There is no evidence
for adding another blind refresh timer and no causal product patch is made.

## Remaining limits

Only Windows-hosted headless Chromium on the actual Vite `/` route was tested.
Native Windows, Linux, macOS, hosted `/office/` and release packages were not
tested. The live layout page array is an internal oracle, not an independent
pagination engine. Saved XML and a fresh-context reopen prove content
persistence. Original bundled fonts are served and hashed; spelling dictionary
assets were unavailable and the UI explicitly reports that limitation.

The original user document, formatting, exact doubling sequence and independent
evidence of the expected 15 pages are still missing. This closes the synthetic
two-minute observation gap, not the user issue. The next useful step is that
shareable original fixture/local path and exact sequence, only after a new
explicit user instruction next week. Do not close #366 or infer a native fix.

## Evidence and safe stop

`proof.json` binds the executable helper, source, phase traces, independent
XML check, original PNG/DOCX bytes and lossless compressed raw report. The
case finished at 13:56:33.796 UTC (14:56:33.796 CET). Browser and Vite were
closed in `finally`; all six captured own process IDs were independently
absent at 13:56:49.6756437 UTC. No Computer Use or screen-recording runtime was
started. No shared process was terminated. There are no active CI jobs or
native hosts for this scope, and no further test was started.

Replay only after explicit authorization:

```sh
node qa/issue366-idle/probe.mjs .local/issue366-idle/replay
```

The completed evidence-retention/oracle script is
`qa/issue366-idle/retain.py`; it controls no app or browser.
