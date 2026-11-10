# Writer review Undo across worker synchronization

Focused fix for [#313](https://github.com/OpenAEC-Foundation/open-office-studio/issues/313), discovered while validating [#297](https://github.com/OpenAEC-Foundation/open-office-studio/issues/297). Base: integration `e9eabc3c1874414f3f79bfeeb5ca4b07d118fc0a`. The Writer WASM remains `9e2025adc926c8831c16894bb60ccd996d0dfdd9d04bddd3dc08e0ddd3ca5acc`; the integration chat confirmed its newer eight-patch kernel concerns Spreadsheet, not Writer.

## Reproduction and change

A leading tracked deletion followed by an insertion could be accepted, saved, and undone into ordinary unformatted old text plus the tracked insertion. Direct single-session tests missed this: a second native replica's echoed update was needed to reproduce the lost revision attributes. It also reproduces for an existing text-only replacement at story offset zero. An unchanged prefix is a passing control. Different revision IDs and XML prefixes do not fix it.

The application's existing bulk-review route now prepares all selected decisions in a temporary native state replica. It then publishes one local update in the live session, so native formatting cleanup becomes part of that same Undo step before a worker can echo it. The replica needs no copied DOCX package, fonts or SDK changes. Existing author/id/selection scope and revision receipts remain in use. A failed preparation changes no live content or history. The session identity and version must still match before publication; intervening edits or a replaced editor produce a translated retry message. Temporary sessions are always destroyed.

Only application bulk review and individual Changes-pane items use this route. SDK-native review/navigation commands are outside this fix. No native kernel, shared editor code, dependencies, main or integration-candidate files are changed by this source delivery.

## Local validation

Environment: Windows x64, Node v24.22.1, pinned `@betteroffice/docx` 0.5.1, app 2026.45.4.

| Check | Result |
| --- | --- |
| Targeted `src/tekst/wijzigingen` suite | 49 tests passed in 4 files, including 14 new native regressions |
| `node scripts/test-opdrachten.mjs tekst --zonder-libreoffice wijzigingen` | 8 command/save/reopen checks passed |
| TypeScript `--noEmit` | Passed |
| Nine active locales | Passed; 23 existing inactive-folder warnings |
| Production Vite build | Passed, 33.58 seconds; existing chunk-size warnings |

The regressions use two real native replicas and exercise accept/reject, worker synchronization with and without worker save, Undo/Redo, exact restored revision metadata and colored story segments, saved/reopened revisions, and an earlier user edit. Additional cases cover ordinary text, paragraph-property revisions, author/id/selection filters, main text plus table-cell stories, no-op scope, stale/replaced sessions, and failure partway through preparation. The pre-fix replica probe fails with the same lost leading deletion observed in the browser. Initial Windows/Linux CI also exposed three synchronous calls in the older command harness; all now await review completion, and its eight scoped checks pass. That follow-up changes the harness and this report only; the validated application runtime remains unchanged.

## Actual production browser checks

Operated the built app in the Windows in-app browser with a synthetic `leading-revisions.docx`: a red deleted `De kat.`, a blue inserted `De kat.`, and a second paragraph `Einde`.

- Accept All produced blue text and no revisions. Save As → Undo restored both revisions with author Anna, date and original red/blue formatting. Saving that undone state did not break Redo, which returned to blue with no revisions.
- Reject All produced red text and no revisions. Save As → Undo restored both revisions; Redo again returned to red with no revisions.
- Reopened the actual saved Undo-result DOCX through the interface. The Changes pane still listed both revisions with the correct author/date; the document visibly retained red deleted and blue inserted text.
- An independent ZIP/XML check of the browser downloads confirmed exact text, colors and revision counts. Temporary dirty test documents were explicitly discarded after saving the proof files.

Evidence in the local output directory `oos-issue313-2026-11-10-8ca1` under the Codex outputs folder:

| Download | SHA-256 |
| --- | --- |
| Accepted | `a347ace03202801bf08fcc71a0098ad0814adf105d2e7e194526e64f8b97d904` |
| Rejected | `f77c5df02afb065edea31b87eb3f518aa53ace6efcbf4b0502951be6b28f1539` |
| Undone and reopened | `35b5aa0707c1d77f517d2f9d1de12cf214f8dc003f3b1d104bd058cc1ea891a0` |

## Platform scope

Windows, Linux and macOS CI builds/packages and functional unit tests must be recorded against the exact source-delivery commit in the PR/issue verification update. Those checks are pending at creation of this report. The browser interaction above verifies the real browser route on Windows; it is not native Tauri interaction. No native Windows/Linux/macOS app interaction on this new commit has been established, and no installation/release is authorized. A successful native package build must not be used as evidence of native UI behavior. The integration chat remains responsible for the full combined candidate.
