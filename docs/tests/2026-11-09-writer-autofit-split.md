# Writer: rendered widths when splitting AutoFit cells (#130)

The original attachment is no longer available (confirmed by the reporter on 9 November 2026). This change is based on independently reproduced variants, not a claim to have retested that attachment.

## Reproduction

A three-row table has a merged first row and two visible cells in each lower row. The source grid is either two equal columns, three equal grid strips, four equal grid strips, or two unequal columns (3000/6360 twips). Cell width preferences are absent, explicit dxa, or explicit percentage; table layout is fixed or AutoFit.

On the pinned 0.5.1 engine, eight of these 24 source combinations move the lower cell boundaries after splitting the first cell. Existing fixed-layout regression cases do not expose this AutoFit redistribution.

## Change

The existing split command lazily reads the current painted table grid, records those widths as fixed layout, and performs the native split in one undo step. Untouched cells keep their existing width preferences and contents. Already fixed tables and row-only splits keep their native path. The dialog explains that the current widths are preserved and AutoFit can be applied afterwards.

The meter is registered after the editor is ready, scoped to the document's exact version, and refuses missing, stale or ambiguous measurements. Its cleanup removes only its own registration. Windows virtual imports use normalized paths, so the command and overlay share the same module. Invalid row spans are rejected before source mutation. Measuring occurs only on the split command.

## Validation

- 24 source combinations: lower-cell x/width differences below 0.1 px, unchanged original width preferences, save/reopen twice, Undo and Redo.
- Missing and ambiguous meter registration, input/display facade handles, invalid row span, exact SDK bindings and normalized Windows module resolution.
- Existing table-split and geometric regression files: 50 tests pass across the three files in this checkout.
- TypeScript check passes; production build passes.
- Production browser test: actual ribbon command changes the first row from one to two cells; the lower boundary stays at the same visible position. Undo returns to one cell; Redo restores two. No console errors on the corrected build. The dialog shows the width-preservation explanation.

This changes AutoFit to fixed widths for a horizontal cell split. That is necessary to preserve the current visible boundaries; the user may explicitly reapply AutoFit later. It does not change historical installers.
