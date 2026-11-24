# WRI 3.1 — bounded QA completed on 24 November 2026

**PASS for the agreed bounded scope. Full-format acceptance remains false.**
The user explicitly resumed this existing WRI task on 24 November, coordinated
through the integration chat. The original Linux result is successful, its
small result package is authenticated, and the remaining separate-process
reopen check also passes. No valid converter/engine test was broadly repeated.

Branch `codex/wri31-qa-2026-11-23-e0d7`, unchanged product P2
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
No product/catalog/shared index/P5-intake/main/tag/publication change.

## Actual tests and exact evidence

| Execution | Fixed harness / job | Actual outcome |
| --- | --- | --- |
| [Original Linux run 45198852740](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45198852740), attempt 1 | `d463a8c30a70e97ebbbf925b56489d6b1bf5cb66`, job 137776546305 | PASS: native oracle before conversion; P5 queue checks; complete approved runtime verification; real converter + production open helper; real Word edit/UndoRedo/DOCX save/fresh-session reopen/second save; independent XML |
| [New-process run 45352073903](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45352073903), attempt 1 | `2f51947993f4f39e2978c99df1d4c1ac8c7e3b7e`, job 138300730051 | PASS: exact prior saved DOCX in a new CI VM/Node/production Word process; resave and independent native-source XML checks; explicit session/loader cleanup |
| [Offline audit](offline-analysis.json) | [analyse.py](../../../scripts/qa-wri31/analyse.py), Windows static Python | PASS: complete ZIP digests, original pre-conversion WIP oracle equality, source/notices/runtime receipts and 25 bounded cases across all four output stages |

The original fresh reopen created another document session in the same Node
process. Today's one small additional Linux job closes that separate-process
gap using the original authenticated saved DOCX. It downloads only the
130453-byte result ZIP, not the 305MB private runtime or any full installer.
No new Office conversion/app build/Mac job occurs. No critical P5 Linux job was
queued before dispatch or at the new job's queue guard.

Each stage passes the same predeclared 25 ordinary text/font/justification
cases: converted DOCX, edited save, fresh-session resave and new-process resave.
All 100 case evaluations pass with zero mismatches. The real P2 edit/layout
WASM identities and patched JS bindings match in the separate process.
Original source and the input saved DOCX remain unchanged.

[Result and complete binding](result.json), [source oracle](source-oracle.json),
[original engine report](engine-report.json), [new-process report](fresh-process-report.json)
and [new-process XML](fresh-process-saved-xml-report.json) retain actual hashes,
methods, accepted scope and limits. Input source remains:

`LibreOffice/core@92c170f11d44857d8e365f2e29fb449dfb567ff5`:
`writerperfect/qa/unit/data/writer/libwps/pass/Write_3.1.wri`.
176896 bytes, blob `458482de0fe0da6411c2bc5f0f8880d52ec3aab5`, SHA256
`d13257b4df644eda291c1e3e7395ceeaf1706ad217106e8ccede595c9beb4364`.
Original publication commit `eeba0f6db6775a459d64fb6a2e45c3bbdd451f41`.
Project test-distribution COPYING/GPL, LGPL and MPL notices are pinned and
retained with the unchanged source; no separate CC0/per-file grant is asserted.

## Bounded original-source oracle and limits

The own binary reader checks the BE32/AB00 header, `fcMac=172819`, full contiguous
coverage of 45 character-format and 71 paragraph-format ranges, ten font names
and three marked opaque object ranges. FOD ranges are not assumed to equal the
total logical paragraph count. Header/footer ranges are separated before body
comparisons. The source oracle exists before any conversion and matches the
saved hard-stop WIP oracle byte-derived data exactly.

Acceptance is deliberately fixed before conversion to:

- the first 17 ordinary ASCII body paragraphs, including empties;
- their per-character font, size, bold/italic/underline and script-direction
  properties;
- five later ordinary-font anchors and three justification anchors, in order.

No converter/old DOCX output supplies expected source content. The Word edit
checks use the declared first 17 paragraphs; independent XML checks all 25 cases
again after every save. Symbol/Wingdings mappings, remaining glyph content,
OLE/pictures/sound/macros, footer/page-number fields, full indent/tab/page
geometry, rendering and other Write versions remain **outside acceptance**.
There is no flat-text full-format or complete visual-fidelity claim.

The safe P2 profile and the unchanged shared consumer verified the original
runtime-only artifact 14805600515, coordinator descriptor e1f1b84b, complete
ZIP/tar/manifest/modes/symlinks/source/tree/version/launcher/ELF/parent bindings.
[Runtime pins](../../../scripts/qa-wri31/runtime-input.json) and authenticated
receipts are retained. Those valid original results are reused; the private
Office payload was not downloaded/reexecuted today. An original nonfatal Vite
WebSocket warning is recorded without treating it as a product defect.

Native Windows/macOS/Linux GUI, Tauri IPC, installer, actual rendered fonts and
hosted-browser UI are not tested here. The browser boundary is the successful
negative production-function test in Linux Node/Vite with an empty window and
no Tauri bridge mock, giving the concrete WRI/DOCX alternative.

## Retained packages, replay and cleanup

| Official package | Artifact | Full ZIP bytes / SHA256 | Expiry recorded by GitHub |
| --- | --- | --- | --- |
| [Original result](retained/wri31-targeted-result.zip) | 14832170121 | 130453 / `208d117678dd6dd3b889a8aaa9431a2a926576e35d34726277a40f8043c8c374` | 2027-02-21T14:52:17Z |
| [New-process result](retained/wri31-new-process-result.zip) | 14901165890 | 66593 / `9998a5cdbaddcb703bc8f7cdeca403edb30467cd98692f75eed074bd03bfbb97` | 2027-02-22T07:57:58Z |

Complete downloaded ZIPs were checked against official artifact metadata, not
only a downloader warning. The permanent copies contain small original source,
notices, reports and outputs, without private Office binaries/installer.
Offline replay requires Python stdlib and no Office/Word execution:

```sh
python3 -B scripts/qa-wri31/analyse.py
```

The [23 November hard-stop receipt](hard-stop-WIP.json), native WIP oracle and
static preservation ZIP remain unchanged historical evidence. Its OPEN fields
were correct at 15:52:58 CET that day and are superseded for current QA status
by [result.json](result.json). No automatic work resumed during the stop.

No local Office/Word runtime, GUI, server, watcher, Computer Use or recording
session was started. Actual runtime work occurred only in CI; the new process
explicitly destroyed its document session and closed its production loader.
User documents/apps and other chats' processes were untouched. There is no
remaining test within this agreed scope and no new product bug/issue/fix or
additional format claim. The final evidence commit adds only documentation and
offline audit; tested product/runtime/oracle code remains unchanged.
