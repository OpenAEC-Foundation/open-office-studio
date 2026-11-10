# Imported conditional-format style projection (#67)

A before-change actual-core regression confirmed that an imported rule with a
themed/tinted font and fill, underline, strike, percentage format and double
bottom border did not render those extra facets. The first render assertion
failed because the expected formatted text was absent. The same core's existing
bounded, read-only TEXT query correctly returned `12.5%` without changing version
or history, providing the formatter for this repair.

The conditional-format metadata cache now attaches shared parsed DXF render
facets. Matching rules merge each facet and border side independently in priority
order, respecting StopIfTrue. Ordinary cell styles remain the fallback. Source
DXFs and unknown XML are retained, including when editing a rule's formula.

Theme/system/custom-indexed colours use the workbook's actual resources and HSL
tint. Four-sided borders carry their native weights/dash styles. Replacing a
border removes only its affected base segments, preserving neighbouring segments,
chart commands and frozen-pane dividers. Numeric formatting uses the existing
core's read-only formatter and retains native numeric overflow/General layout
metadata; narrow fixed-format numbers therefore paint hashes rather than clipped
digits. Query batches respect both the 8 KiB per-formula and 1 MiB aggregate
formula limits. Oversized formulas are not submitted. Rendering does not mutate
source values, history, styles or volatile-cell caches.

The ordered renderer and standalone DXF parser were deliberately published as
small shared dependencies in PRs #269 and #271. The table chat independently
adopted and tested both. Tables register at priority 0, conditional formats at 10;
screen, profiled and print paths use the same chain. The existing sheet-colour
helper re-exports the shared pure tint implementation.

## Validation

```text
pnpm exec vitest run --configLoader runner --maxWorkers 2
pnpm exec tsc --noEmit
pnpm exec vite build --configLoader runner --outDir .local/dxf-build
node scripts/proef-voorwaardelijke-dxf.mjs
python scripts/controleer-voorwaardelijke-dxf.py
```

The full suite passed all 277 files / 2,869 tests, with ten existing corpus skips.
Type checking and the ordinary minified production build passed. The build took
six minutes during concurrent memory pressure; it completed without reduced
minification or modified limits. No native source, WASM, SDK or vendor changes
are included.

Eight actual-core DXF regressions cover matching/nonmatching cells, theme/tint,
underline/strike, percentages, per-facet and per-side priority, StopIfTrue,
typing/Undo, profiled rendering, print, narrow-cell overflow, long query payloads,
frozen dividers, neighbouring borders and source preservation. Ordinary typing
does not call the full workbook saver after the metadata cache is established.
The four shared parser and two render-chain regressions remain green as well.

Five production-browser checks capture calls to the actual Canvas2D painter,
including the native numeric-overflow path. They verify the themed `12.5%`, red
date hashes in a narrow column, `20.0%` after typing, restoration through one Undo,
Save as and a fresh-profile reopen of that actual download. No page errors occur.
The screenshot was inspected. An initial browser attempt started before the slow
build finished and found no file input; the completed-build rerun passed.

The independent Python ZIP/XML checker confirms the original numeric inputs
`0.125` and `45000`, their unchanged ordinary number formats, both source rules,
DXF count/references, conditional-format group placement, theme/tint attributes,
underline/strike, border/number codes and an untouched unknown part. Reproducible
artifacts remain under `.local/proef-voorwaardelijke-dxf/`.

## Remaining scope

This repairs the listed imported XLSX facets, not the whole issue. Gradients,
pattern/diagonal fills or borders, alignment changes, advanced accounting padding
and number-format colour prefixes, complete x14 rule support, formula-valued
visual thresholds, every icon family and ODS interoperability remain outside this
batch. Source XML for unmodelled facets is preserved. Issue #67 stays open.
