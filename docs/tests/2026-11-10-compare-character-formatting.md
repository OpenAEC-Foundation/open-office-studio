# Direct character-format comparison in Writer

Focused implementation of [#297](https://github.com/OpenAEC-Foundation/open-office-studio/issues/297), under the existing [#57](https://github.com/OpenAEC-Foundation/open-office-studio/issues/57). The broader issue remains open: tables, moved paragraphs and combining reviewers are not implemented here.

## Representation and safeguards

The existing native comparison runs first. A fallback is considered only when its refusal contains character-formatting diagnostics and optional metadata information. Unchanged plain-text body paragraphs can then contain a deletion carrying the original formatting followed by an insertion of the same text carrying the revised formatting. These are ordinary text revisions, not native `rPrChange` revisions. The Compare Versions dialog explains this representation.

The fallback compares namespace-aware XML, aligns run boundaries without changing text, reserves unused revision IDs and retains run formatting and inherited namespaces. Only supported direct run properties are eligible. Paragraph properties, styles, other stories, objects and unrelated package parts must agree. The original package supplies all unmodified parts. Both source byte arrays stay unchanged.

Before returning success, separate native sessions accept and reject the proposed result. Independent native comparisons must find no changes against the revised and original inputs respectively. Only an empty final body `sectPr` is normalized in validation copies, because the native save route omits it; paragraph section boundaries and nonempty section settings remain intact. The returned comparison retains the source section XML.

Limits: 128 changed regions, 16 Mi UTF-16 code units in either main XML and in copied run content, 16 Mi code units in the resulting main XML, and 32 MiB in the resulting DOCX. Unsafe or ambiguous cases keep the original native refusal rather than returning partial success. No SDK, native kernel or dependency changes are included.

## Environment and independently reproduced controls

- Windows x64, Node v24.22.1, pinned `@betteroffice/docx` 0.5.1.
- Source base `d978918d998bd00485bcafc4cef3072314c1b918`.
- Repository Writer WASM SHA-256: `9e2025adc926c8831c16894bb60ccd996d0dfdd9d04bddd3dc08e0ddd3ca5acc`.
- Synthetic, non-confidential DOCX documents generated from the repository blank template.

Before the change, `De kat.` becoming bold, or red becoming blue without a text change, returned `formatting-change` / `run formatting differs on unchanged text`. A text-only `kat` to `hond` control succeeded. Separate table-text and reordered-paragraph probes returned `table-change` and `paragraph-move`; those capabilities remain outside this fix. A raw native `rPrChange` probe was not discoverable as a reviewable revision, which is why this implementation uses explicit styled text replacements.

## Automated validation

| Check | Result |
| --- | --- |
| `vitest run --configLoader runner --maxWorkers 1 --testTimeout 20000 src/tekst/wijzigingen` | 4 files, 53 tests passed, including 18 new native formatting tests |
| `tsc --noEmit` | Passed |
| `node scripts/controleer-i18n.mjs` | Passed for all 9 active locales; existing inactive-locale-folder warnings remain |
| `vite build --configLoader runner` | Passed, 32.03 seconds; existing bundle-size warnings remain |

The tests exercise bold, italic, underline, size and color; differently split runs; Unicode and spaces; separate changed regions; aliased run prefixes; author/date escaping; exact accepted/rejected character formatting after save/reopen; source hashes and unrelated-part preservation. They also verify explicit refusal of mixed text changes, changed table content, moves, paragraph formatting, style definitions, other parts, unknown run properties and non-formatting run metadata. The existing text comparison and revision-detection tests remain green. Direct native session Undo/Redo through the existing bulk-review facade restores both revisions in the targeted tests.

## Production browser check, 10 November 2026

Served the built `dist` on an isolated local port and operated the actual interface in the in-app browser. Opened the blue revised document, selected Review → Compare and the red original, and entered author `Review team 297`. The dialog displayed the new explanation; the result opened in a separate document tab with one deletion and one insertion, both with that author and a date.

Two independent comparison results were reviewed:

1. Accept All Changes produced the single blue text `De kat.` and no remaining revisions. Saved as `compare297-accepted.docx`, reopened through the UI, and visually confirmed blue text and the `#0000ff` color control.
2. Reject All Changes produced the single red text `De kat.` and no remaining revisions. Saved as `compare297-rejected.docx`, reopened through the UI, and visually confirmed red text and the `#ff0000` color control.

An independent ZIP/XML check of both actual browser downloads confirmed exact text, the expected direct color and zero `w:ins`/`w:del` elements. SHA-256 evidence:

| File | SHA-256 |
| --- | --- |
| Original fixture | `3434052f16f08dc155868cfc543870bd62b4925c1ff6956a10eacc8b678b9463` |
| Revised fixture | `737022c8ea2ca5e7c68ac6b7887b42dd97385a91dab6b134398cce54f00122fe` |
| Accepted browser download | `7ee65111f2c42260038f2aeb430075e55f1b3db3f2d0512ca4e72e5d76f7eeb9` |
| Rejected browser download | `14df67a77b9c3fba96cf45a82e61838cd9df1c8ad1b3851a65a5849e9cc8c100` |

## Remaining observation and integration boundary

An additional browser Undo check after accepting both changes showed only one insertion in the reviewing pane, whereas the direct native-session test restores both revisions. Redo returned to the accepted blue result. The cause and whether this also affects existing text-only comparison are unestablished; do not describe browser Undo as verified. Record this for focused follow-up against the integration candidate rather than expanding #297 into a shared editor/kernel change.

This branch targets the next integration batch. It does not change the frozen Windows candidate or authorize installation/release. Combined testing with the integration chat's newer kernel and the browser Undo observation remain integration review items. This report establishes production browser behavior on the stated source base, not native installer acceptance.
