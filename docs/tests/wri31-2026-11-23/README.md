# WRI 3.1 — hard-stop WIP, 23 November 2026

**OPEN: runtime/content acceptance is not reviewed.** New work/tests/dispatch
stopped on the explicit 16:00 CET hard-stop instruction. Resume only after a
new user instruction on/after 24 November. No automatic follow-up or next format.

Exclusive #30 scope: existing `lo-wri-1`, Microsoft Write 3.1 only. Branch
`codex/wri31-qa-2026-11-23-e0d7`; frozen product P2
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
Source harness `48754fa4ecfe2de71518e6f84ac9ed0ae2fad392`; dispatched harness
`d463a8c30a70e97ebbbf925b56489d6b1bf5cb66`. The final preservation commit
adds only this WIP/evidence documentation, with no product/test changes.

## Saved facts and acceptance limits

- PASS before stop: original cached source hash/Git blob, native header/FOD/
  font/bounds oracle, Node syntax and unchanged P2 product checks.
- PASS before dispatch: no queued critical P5 Linux job; captured runner-label
  inspection, with no run/job cancellation or mutation. One own targeted Linux
  job only; it checks P5 queue priority again before runtime consumption.
- OPEN: WRI private-runtime receipt, actual production helper/Word edit/
  UndoRedo/DOCX save/fresh reopen and independent output XML acceptance. No
  completed WRI output was reviewed at the stop snapshot.
- Full-format acceptance remains false. Symbol/Wingdings mapping, three
  object payloads, footer/page-number semantics, geometry, rendering and macros
  are outside the bounded oracle. No new product bug or fix is claimed.

Original source:
`LibreOffice/core@92c170f11d44857d8e365f2e29fb449dfb567ff5`,
`writerperfect/qa/unit/data/writer/libwps/pass/Write_3.1.wri`,
introduced by `eeba0f6db6775a459d64fb6a2e45c3bbdd451f41`.
176896 bytes, Git blob `458482de0fe0da6411c2bc5f0f8880d52ec3aab5`, SHA256
`d13257b4df644eda291c1e3e7395ceeaf1706ad217106e8ccede595c9beb4364`.
LibreOffice project test distribution/notices are retained; no separate CC0
or per-file signed grant is asserted. Exact source and notice identities are in
[`fixture.json`](../../../scripts/qa-wri31/fixture.json).

The own byte reader verifies BE32/AB00, `fcMac=172819`, 45 contiguous character
ranges, 71 paragraph ranges, ten font names and three explicit object bounds.
Predeclared bounded comparisons cover the first 17 ordinary ASCII body
paragraphs including empties, their native character/font properties, five
later ordinary-font anchors and three justification anchors. The original
CRLF PAP terminators are structurally distinguished from paragraph content.
No converter/old saved document is used as source oracle. Native source
references/inventories are retained in
[native-source-oracle-WIP.json](native-source-oracle-WIP.json).

The [static preservation ZIP](retained/static-source-WIP.zip) is an own local
WIP archive, **not a successful runtime/test artifact**. It contains the exact
original WRI, already-derived native oracle and pinned project notices:
44383 bytes, SHA256
`fc8315dc7da04309edfc4aff8d1ec9655a6b0c5148965cdfab643e4b46e14f59`.
No new test/Office/engine execution was performed to make this preservation.

## Already-started external job

[Run 45198852740](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45198852740),
attempt 1, [job 137776546305](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45198852740/job/137776546305),
`targeted_linux`, started at 15:52:19 CET before the hard stop.
Snapshot 15:52:58 CET: still `in_progress` at the headless dependency step.
No artifact had been published at that snapshot, so its result ID/digest/
expiry and later outcome are **OPEN**. The job may finish independently;
there is no watcher, automatic inspection, replay or follow-up dispatch.
It has not been unnecessarily cancelled.

Only the existing shared runtime-only artifact 14805600515 is authorized, with
its fixed descriptor/verifier/ZIP/tar/manifest/launcher/ELF/parent pins in
[`runtime-input.json`](../../../scripts/qa-wri31/runtime-input.json).
Its current expiry/new WRI consumer receipt were not re-read after stop and
are not claimed verified here. No full suite/parent ZIP/DEB or app/Mac build.
The preservation receipt [hard-stop-WIP.json](hard-stop-WIP.json) holds the
exact source/package/run/job/attempt and known/unknown artifact bindings.

## Local remainder and cleanup

All own local commands were one-shot static Python/Node/Git/metadata reads.
No local Office/Word engine, server, watcher, GUI/Computer Use or recording
session was started. No user document/app or another chat's process was touched;
no extra test/capture was started to prove cleanup.

Local scratch remains safely under this own worktree:

- `.local/wri31-qa/`: original source, native oracle, pinned notices;
- `.local/para-runs.json`, `.local/proto-native.py`, `.local/inspect-fonts.py`:
  source research WIP including explicitly unaccepted glyph bytes;
- `.local/MSWrite.cpp`, `.local/source-notices.json`: pinned public layout and
  licensing reference scratch;
- `.local/capacity-before-dispatch.json`, `.local/capacity-before-push.json`:
  read-only queue snapshots. The preserved latest pre-push snapshot is
  [capacity-before-dispatch.json](capacity-before-dispatch.json).

No main/tag/publication, product/catalog/shared index/P5-intake change. Earlier
PSW `b563359a` and SDW `f6cf1df2` proofs remain intact.
