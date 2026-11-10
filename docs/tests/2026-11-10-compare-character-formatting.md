# Direct character-format comparison in Writer

Focused implementation of [#297](https://github.com/OpenAEC-Foundation/open-office-studio/issues/297), under the existing [#57](https://github.com/OpenAEC-Foundation/open-office-studio/issues/57). The broader issue remains open: tables, moved paragraphs and combining reviewers are not implemented here.

## Representation and safeguards

The existing native comparison runs first. A fallback is considered only when its refusal contains character-formatting diagnostics and optional metadata information. Unchanged plain-text body paragraphs can then contain a deletion carrying the original formatting followed by an insertion of the same text carrying the revised formatting. These are ordinary text revisions, not native `rPrChange` revisions. The Compare Versions dialog explains this representation.

The fallback compares namespace-aware XML, aligns run boundaries without changing text, reserves unused revision IDs and retains run formatting and inherited namespaces. Only supported direct run properties are eligible. Paragraph properties, styles, other stories, objects and unrelated package parts must agree. The original package supplies all unmodified parts. Both source byte arrays stay unchanged.

Before returning success, separate native sessions accept and reject the proposed result. Independent native comparisons must find no changes against the revised and original inputs respectively. Only an empty final body `sectPr` is normalized in validation copies, because the native save route omits it; paragraph section boundaries and nonempty section settings remain intact. The returned comparison retains the source section XML.

Limits: 128 changed regions, 16 Mi UTF-16 code units in either main XML and in copied run content, 16 Mi code units in the resulting main XML, and 32 MiB in the resulting DOCX. Unsafe or ambiguous cases keep the original native refusal rather than returning partial success. No SDK, native kernel or dependency changes are included.

## Environment and independently reproduced controls

- Windows x64, Node v24.22.1, pinned `@betteroffice/docx` 0.5.1.
- Initial reproduction base `d978918d998bd00485bcafc4cef3072314c1b918`. The final follow-up combines integration `e9eabc3c1874414f3f79bfeeb5ca4b07d118fc0a` with review dependency #313 / `46527a0e09497e2aa9d626e290989bc9def26219`.
- Repository Writer WASM SHA-256: `9e2025adc926c8831c16894bb60ccd996d0dfdd9d04bddd3dc08e0ddd3ca5acc`.
- Synthetic, non-confidential DOCX documents generated from the repository blank template.

Before the change, `De kat.` becoming bold, or red becoming blue without a text change, returned `formatting-change` / `run formatting differs on unchanged text`. A text-only `kat` to `hond` control succeeded. Separate table-text and reordered-paragraph probes returned `table-change` and `paragraph-move`; those capabilities remain outside this fix. A raw native `rPrChange` probe was not discoverable as a reviewable revision, which is why this implementation uses explicit styled text replacements.

## Automated validation

| Check | Result |
| --- | --- |
| `vitest run --configLoader runner --maxWorkers 1 --testTimeout 20000 src/tekst/wijzigingen` | 5 files, 67 tests passed, including 18 native formatting tests and 14 review/worker regressions |
| `tsc --noEmit` | Passed |
| `node scripts/controleer-i18n.mjs` | Passed for all 9 active locales; existing inactive-locale-folder warnings remain |
| `vite build --configLoader runner` | Passed, 70 seconds while checks ran concurrently; existing bundle-size warnings remain |

The tests exercise bold, italic, underline, size and color; differently split runs; Unicode and spaces; separate changed regions; aliased run prefixes; author/date escaping; exact accepted/rejected character formatting after save/reopen; source hashes and unrelated-part preservation. They also verify explicit refusal of mixed text changes, changed table content, moves, paragraph formatting, style definitions, other parts, unknown run properties and non-formatting run metadata. The existing text comparison and revision-detection tests remain green. The formatting tests now include a real second native replica, worker save and echoed updates before Undo/Redo, rather than relying only on a single session.

## Production browser check, 10 November 2026

Served the final combined `dist` on an isolated local port and operated the actual interface in the in-app browser. Opened the blue revised document, selected Review → Compare and the red original, and entered author `Controle 297`. The dialog displayed the new explanation; the result opened in a separate document tab with one deletion and one insertion, both with that author and a date.

Two independent comparison results were reviewed:

1. Accept All Changes produced the single blue text `De kat.` and no remaining revisions. Saved as `compare297-fixed-accepted.docx`; Undo restored both revisions, the original red formatting and author/date, and Redo returned to blue with no revisions. Reopened the download through the UI and visually confirmed blue text and the `#0000ff` color control.
2. Reject All Changes produced the single red text `De kat.` and no remaining revisions. Saved as `compare297-fixed-rejected.docx`; Undo restored both revisions and Redo returned to red with no revisions. Reopened the download through the UI and visually confirmed red text and the `#ff0000` color control.

An independent ZIP/XML check of both actual browser downloads confirmed exact text, the expected direct color and zero `w:ins`/`w:del` elements. SHA-256 evidence:

| File | SHA-256 |
| --- | --- |
| Original fixture | `3434052f16f08dc155868cfc543870bd62b4925c1ff6956a10eacc8b678b9463` |
| Revised fixture | `737022c8ea2ca5e7c68ac6b7887b42dd97385a91dab6b134398cce54f00122fe` |
| Accepted browser download | `8db73364551f9365a6f74a9b611ec703693f0aa06e9fc072abe3c49820afdfca` |
| Rejected browser download | `adcb292d492b4beca8062947172bc34e40d55b5effac50c3e4e82f390ab4ec7f` |

## Resolved Undo dependency and integration boundary

The initial browser Undo anomaly was independently reproduced as an existing leading-text review/worker bug, including a plain text-only replacement. It is separately fixed in [#313 / PR #315](https://github.com/OpenAEC-Foundation/open-office-studio/pull/315), whose source commit is included as an explicit dependency. Its temporary-replica review route preserves both revisions across worker synchronization; the final actual browser comparison above confirms Save As → Undo/Redo in both directions. See [the review regression report](2026-11-10-review-undo-worker.md) for scoped callers, failure guards, earlier history and table-story coverage.

This branch targets the next integration batch and includes the published integration frontend with the same Writer kernels. It does not change the frozen candidate or authorize installation/release. Record Windows/Linux/macOS CI build/package and functional-test outcomes on the exact final source-delivery commit in the PR/issue update. Native application interaction on those platforms is still unverified; a successful package build must not be described as native UI acceptance. The actual supported browser route has been tested as described above. Full combined candidate validation remains with the integration chat.
