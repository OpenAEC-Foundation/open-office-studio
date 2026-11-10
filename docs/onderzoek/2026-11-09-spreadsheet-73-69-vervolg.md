# Spreadsheet handoff — stop at 15:30 on 9 November 2026

The user requested a stop at 15:30 Europe/Amsterdam, leaving further work for
tomorrow. Do not continue implementation or change the integration checkpoint
after this stop. No automation was created.

## Ready for integration

PR236, branch `codex/spreadsheet-68-73-2026-11-09`, is frozen at
`86a5be49691b975f0f13d18c040833d305499647`. It contains #68 validation, #72
protection and #71 notes/discussions/printing. The prerequisites from PR186 and
PR198 are already included. Do not apply those twice.

Verification: 2,051 tests passed, ten existing skips, 182 files; TypeScript,
production build and nine-language checks passed. Production browser checks,
independent LibreOffice checks and independent PDF reading/rendering are
documented in docs/tests/2026-11-09-rekenblad-{validatie,beveiliging,opmerkingen}.md.
The publisher confirmed the exact remote head. Central integration is owned by
chat 01a1bf9c-9635-7733-aa46-eb3bd68262aa / PR248; never edit its checkout/branch.

## Experimental work — do not merge into this integration batch

The separate branch `codex/spreadsheet-tables-73-d410` is frozen at
`8cd0b6d372b8c5325fcf60bc8e7a4401fc15e8c5`, pushed for CI only. Its parent
`f1241cea` copies only the verified five-patch CF kernel prerequisites from
`10b9ac1c7634da666498d21de3258dd3573ad397` (PR251). The product WASM is still
the verified CF binary, SHA256
`ad3d40536ad80eaebfa4a06dc2099885a485d850160e65e23f6306ba99abbe1e`.
No table WASM has been accepted or installed.

The sixth patch `patches/rekenbladengine-tabellen.patch` is an unverified
candidate: invertible SetTables geometry, adjacent input growth, row/column
remapping, authority/history integration, and lossless existing table-part
range/column writing. Creation, deletion and table presentation are planned
through standard package metadata. Five native integration tests were added.

- Candidate v1 / run42632079378 failed to compile: geometry match needed SetTables.
- Candidate v2 / run42633084797 compiled, then failed an old test that required
  refusing row insertion when a formula reads a table (223 other workbook tests
  passed, one existing skip). That obsolete refusal was replaced by a stronger
  actual range/formula/value/save/reopen/Undo/Redo preservation test.
- Candidate v3 / run42634311906 corresponds to the exact frozen branch head.
  Its result and any artifact must still be checked. Do not claim it passed.
  https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/42634311906
  If green, obtain artifact `rekenbladkern-kandidaat`, verify its `bouw.json`,
  and test it explicitly before pinning a vendor hash. If red, fix the exact
  failure and update the source patch checksum. Preserve all first five patches.
- Local cargo compilation is blocked by Windows Application Control when a
  generated proc-macro2 build script executes (os error4551). Do not change or
  bypass that policy. The existing pinned GitHub CI toolchain is the test route.
- Reproducible source working copy: `.local/tabelkern-bron`, a git baseline of
  the pinned archive plus five patches. The tracked sixth patch is sufficient
  to reconstruct it. `.local/update-table-patch.py` exports its current diff and
  updates only the sixth checksum. Never run the initial install scripts twice.

This WIP branch checkpoints the unhooked cell-style prototype in
`celstijlen.ts`, `celStijlenXml.ts` and `celstijlen.test.ts`. Six actual-WASM
tests pass, including 100,000-cell assignment, built-in IDs, create/modify,
direct-format overrides, protection flags and source-part preservation.
TypeScript passed before the final small preservation cleanup. These modules
have no ribbon/dialog hooks yet and are not a completed #73 feature.

Resume by reviewing style facet masks: Good/Bad/Neutral/Heading/Total should
respect which facets a style includes; current application forces font/fill/
border/number-format/alignment on. Preserve existing number formats for styles
that omit that facet. Then build the style UI, table creation/configuration,
totals/header/banding, table header filters, native growth/Undo and structured
references, and complete browser/interoperability tests. Review unknown XML,
inherited row/column formats and all protection paths. Metadata reloads must
retain stale-version/read-only checks and explain cleared prior Undo history.

#69 pivot tables has not been implemented. Exact issue bodies for #69/#71/#73
are cached under `.local/issue-N.json`. #69 requires actual pivot/cache parts,
field dragging, aggregates/percentages, date/numeric grouping, refresh,
sort/filter and existing XLSX/ODS preservation. The isolated LibreOffice/UNO
helper can author independent pivot fixtures; do not substitute static summaries.

## Coordination for tomorrow

- CF/native owner e0d7: 01a1bf84-e0d7-71f2-b6f4-7658c0cb40da. Use PR251's
  five-patch chain and coordinate any new WASM. He was holding further native
  changes while the table candidate was being prepared.
- Performance owner: 01a1bf84-6f92-7452-93a5-c0aed5bd5173. PR253 tip5559252f
  has a separately native-tested selection-format patch, SHA256
  c8334412c2fe239576bf3d838f495976c8f13a90f67247a2a259f36c95549167.
  Five libtests and 222 workbook tests/one skip passed on its separate baseline.
  It has NOT been applied to the complete CF/table chain. Combine only after
  checking the complete native suite and unchanged JS/WASM interface.
- Format/object owner a1ac: 01a1a1ac-fc49-77e2-b8ab-bd00b9f9164f. He does
  not modify vendor/patch metadata. Keep object, validation and note anchor
  prefixes and save wrapper chains intact. PR246 reports measured modern
  workbook-protection loss in LibreOffice conversion, while native XLSX save
  remains permitted. Do not weaken the correct workbook password format.
- Publisher 01a1a1bc-8737-7ea3-b0e3-e92291d7016e stopped at the user's 15:25
  boundary. Do not wake it to do more work today. Our gh authentication is still
  unavailable; do not change credentials. The three candidate pushes above were
  made using the publisher's working context, without sharing credentials.

Keep PR236 and the unfinished table/style branches separate. Give the
integrator exact tested SHAs only; do not ask them to include dirty or unverified
work. No issue has been closed or merged by this chat.
