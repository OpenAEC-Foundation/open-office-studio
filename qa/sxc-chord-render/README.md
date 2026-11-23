# Spreadsheet chord rendering — #380

An existing DrawingML `chord` was retained as XML but displayed as an unknown
object. This change reads its literal angular adjustments and draws the actual
closed ellipse segment in the worksheet SVG and existing print canvas. It is
an enhancement to an unsupported preset, not an engine Save data-loss fix.

Integration exclusively assigned this scope on23November2026, starting from
P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b` /
`5a644e397ecc6af5452a49b6404edf953687d1b2`,2026.48.1. It is outside the
current critical release intake. No native app/Mac build, runtime/Cargo,
catalog/format expansion, main/tag or publication is included. The preserved
Windows six-app harness remains reserved for its separate final-package intake.

## Real source and independent expectations

`fixtures/calcshapes.sxc` is the genuine pinned LibreOffice/core fixture:
revision `92c170f11d44857d8e365f2e29fb449dfb567ff5`,
`sc/qa/unoapi/testdocuments/calcshapes.sxc`,13030bytes, Git blob
`7f98b1a501e004eafe85e4947dbbe88a292e9c19`, SHA256
`9a367d8e849001453b7d5684401f769abd63a621165ea3878da9d64b6fe2de2d`.
Original repository README/COPYING texts are retained without inventing a
special fixture license.

`fixtures/calcshapes-converted.xlsx` is **actual unchanged output** from the
approved P2 Windows bundled converter control45166523239. SHA256
`7b3410fa3b5cb0897bf6a4caf61390e65199aa5e9f5c1f95f3025c49932c1196`.
It is not a fabricated or renamed source. Complete earlier native and converter
provenance is retained at QA commit
`d74ff7a8fa29a1109b2a0f6b8290615a0899a3f2` on
`codex/sxc-native-windows-2026-11-23`, `qa/sxc-native-windows`.

The converted source's object3/C3 is `chord`, extent958320×736560EMU, with
`adj1=7798761`, `adj2=347606`. The cell C13 is `Note attached`, with separate
annotation `Just a note`; three sheets and no source formulas. Source/source
conversion differences are retained, not silently replaced by new RGB or shape
data. The original source and reference bytes are independently hash checked.

`ray-oracle-before-fix.json` was calculated before the implementation using
ray/ellipse intersections from the conic equation. This independent expectation
includes the genuine converted angles, a wide default ellipse, a minor quarter,
wrap across zero and equal-angle/full-turn cases. It differs from the
implementation's polar-to-parametric-angle calculation.

The pinned primary preset definition is LibreOffice/core's
[presetShapeDefinitions.xml](https://raw.githubusercontent.com/LibreOffice/core/92c170f11d44857d8e365f2e29fb449dfb567ff5/oox/source/drawingml/customshapes/presetShapeDefinitions.xml),
538972bytes, SHA256
`ee9865534af6979063a565b6c784b26f7a799957fc5fa9bfe6adcaae62c3893e`.
Defaults, pin limits and the closing arc are read from its `chord` definition.
See also Microsoft's primary documentation for
[DrawingML shape-guide formulas](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.shapeguide?view=openxml-3.0.1).

## Implementation boundaries

- `tekenobjecten.ts` reads supported literal adj1/adj2, keeping their original
  XML. Valid other guide formulas and ambiguous adjustments remain explicit
  preserved unknown objects instead of being drawn with invented geometry.
- `chordGeometrie.ts` supplies the same bounded preset geometry to SVG and
  canvas. Equal start/end angles use two SVG half-arcs for a full turn. The
  canvas uses its existing ellipse/path recording, keeping PDF vector support.
- The existing object/group positioning, rotation, flips and styling remain
  authoritative. Original preset, adjustments, anchors, styles, media,
  relationships, grouping and unknown OOXML are not rewritten by this feature.
- The shape creation menu and basic creation presets are unchanged. This does
  not add another generic shape engine, legacy importer or control model.

## Tests and meaning of results

The25 focused tests cover source identity, independent conic endpoints,
major/minor/wrapped/full-turn arcs, invalid/ambiguous adjustments, existing
object/group/anchor regressions and genuine engine save/fresh reopen retaining
rotation/flips/style/anchors and every original object-related ZIP part.
`tsc --noEmit` checks the complete TypeScript source.

`browser.mjs` runs only on a disposable Linux CI host. It uses actual app
components through the existing Vite browser-development route, first `/`, then
`/office/`. It verifies the actual SVG path/endpoints/fill, original C13,
normal focus/Control/SaveAs/download/closed-context/fresh-reopen preflight,
H1=`QA_CHORD_380`, I1=`=40+2`/42, real grid Undo/Redo and fresh reopened saves.
It never inserts a native bridge or substitutes a placeholder for a shape pass.
`audit_outputs.py` independently checks the saved ZIP/XML, added cells/formula/
cache, three sheet names and original byte-identical object parts.

Separately labeled component cases call the **production** print renderer with
the genuine parsed object and synthetic minor/rotation/flip/full-turn copies.
They draw to real canvases and compare pixels against independent inverse
transform/conic/chord half-plane expectations. Boundaries are excluded for
antialiasing; all remaining sampled pixels must agree, with minimum interior
coverage. These are not a native print-dialog or complete PDF workflow claim.

The first CI run45170291767 stopped before browser execution: direct asset
preparation required an unrelated spelling-WASM target. The supported `predev`
lifecycle is now used for this development-route test, with spelling disabled
in the ordinary app settings. No spelling/runtime/Cargo source is changed.
The second run45170644993 completed the root-route source/edit/save/fresh
reopen and found zero canvas pixel mismatches in all four computed cases, but
failed its minimum interior coverage: the minor segment had only60 points on
the coarse4px grid. The grid was made **denser at2px**; minimum interior
coverage and zero-mismatch criteria were not reduced. These original failures
and their metadata/logs remain in `evidence`; neither is reported as a pass.

## Platform and remaining scope

Actual corrected native Windows/Linux/macOS package checks must use the next
integration candidate; no new native/Mac build is authorized here. Existing P2
Windows native evidence establishes the old limitation, not fixed acceptance.
The browser case opens the actual converted XLSX through the supported XLSX
route; it does not add or claim direct browser SXC conversion. The development
browser test is not an optimized hosted-build/signing/standalone acceptance.

Original SXC radio/TextBox conversion limitations and small converted shape
width deltas remain independent deferred findings without active product
owners in this assignment. Existing unsupported-control warnings remain. A
chord pass, unchanged GIF bytes or isolated shape-canvas checks do not certify
every source object's appearance, image preview, controls or full document.
Integration decides separate claims and future product intake. Do not close
the format umbrella or claim all SXC preservation from this bounded fix.

## Completed scoped proof

Fixed/tested source `42d161a3d494fb56fa159501a510a34ac95f6fd0`, tree
`436d8f94c68b8fb5d9b6b23c6dd8485502f1bfd6`. The code change itself is in
`cbaebf81c7e5926d545fd77ca8f4b83703304854`; subsequent CI corrections affect
only this case's harness/setup. Later documentation/evidence commits retain
identical product files, which `audit_bundle.py` checks against the tested pin.

Successful CI run
[45171202941](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45171202941),
job137680896372, attempt1. Proof artifact14817341148,724274bytes, full ZIP
SHA256 `8598a2e4bf252395f86c8d6e6a4317a4a65161dc0805fc0e3998ca051137af55`.
The official digest was verified before extraction; original ZIP/metadata/job
records and all17 payload files remain in `evidence/passed`.

| Platform/check on the fixed source | Result |
| --- | --- |
| Windows `tsc --noEmit`,25 focused unit tests | Passed; no local GUI/native claim |
| Linux CI25 focused unit tests | Passed |
| Actual Chromium `/` source/edit/UndoRedo/save/fresh-context reopen | Passed |
| Actual Chromium `/office/` same case | Passed |
| Independent XML on six actual saved XLSX | Passed; original object parts unchanged |
| Production print-canvas, source major |39128 samples,3191 interior,0 mismatches |
| Production print-canvas, minor/flipped/rotated |39137 samples,245 interior,0 mismatches |
| Production print-canvas, major/rotated/flipped |39089 samples,2342 interior,0 mismatches |
| Production print-canvas, full turn |39526 samples,3687 interior,0 mismatches |
| New native Windows/Linux/macOS packages | Pending next integration candidate |

The ten actual PNGs were inspected; see `visual-review.json`. They show the
curved source object and straight closing edge, including after source/edited
fresh reopen. The isolated canvas variants show real colored segments, not
placeholder text. The screenshots also contain a broken/alt GIF-preview state
whose load timing/baseline cause was **not** established in this scope. It is
recorded separately; no general image appearance pass or new product issue is
invented from that observation. GIF/drawing bytes remain unchanged.

`independent-audit.json` binds official ZIP/run/job/source identities to the
separate saved-file XML audit. Recheck without Office or GUI:

```sh
python -B qa/sxc-chord-render/audit_bundle.py
```

All own CI contexts, browser and server are confirmed closed. No local app,
browser, screen-capture or Computer Use session was started. The bounded code
and browser/print-canvas proof are ready for integration review; #380 remains
open for integration and the still-missing native candidate checks.
