# #375: import-boundary correction proposal for a later product round

This is a review proposal, not a compiled patch or product fix. Do not include
it in the frozen P2/P3/374 candidate. The current private runtime remains pinned
to its original bytes. Application output postprocessing is not proposed.

## Confirmed bounded cause

The immutable genuine UOF1 source defines two rectangles on slide 3:
`gr4_0`/`ODP` with `#14213d`, `gr5_0`/`UOP` with `#046eff`. The pinned UOF XSLT
produces those exact solid RGB styles. In real private-P2 UNO execution, both
loaded rectangles retain their correct `FillColor`, but also have
`FillComplexColor` with type `4` (Theme) and theme type `4` (Accent1).

Two separately loaded in-memory documents have the same complete eight-shape
property snapshots. Clearing **only** `FillComplexColor` on the two source-bound
rectangles in the diagnostic copy produces type `0`/theme `-1`, retains their
RGB/geometry/text, and exports the expected two explicit RGB fills. The control
export retains Accent1. This is a diagnostic counterfactual, not a product
postprocessor or a generally safe object-matching strategy.

The existing source-derived oracle confirms three slides, eight objects,
original text/paragraphs, list levels, notes, geometry, media/formula counts and
line width/arrow metrics. Other observed document data matches the control
export. Strict complete-source acceptance remains false: the independently
reported pre-existing canvas/stroke gaps remain outside #375.

Source-supported mechanism on LibreOffice commit
`9dea406ab7695df6325b11b0e19fdca8db4b7276`:

- `sd/source/core/drawdoc4.cxx:175–207` supplies a default Accent1 complex fill.
- `svx/source/xoutdev/xattr.cxx:328–332,1864–1914` assigns RGB without clearing
  that complex-color member.
- `oox/source/export/drawingml.cxx:539–545,561–623` prefers the surviving complex
  theme reference over the current RGB at export.

## Proposed upstream file claim, subject to integration review

1. `xmloff/source/draw/XMLShapeStyleContext.cxx`: clear a stale inherited
   `FillComplexColor` at shape-style import only when this style explicitly
   supplies both a solid `FillStyle` and a `FillColor`, supplies no explicit
   `FillComplexColor`, and the destination supports that property. Clear it
   before the existing property mapper applies the explicit source properties.
   This targets the actual ODF-style import boundary used by UOF's XSLT route.
2. `xmloff/qa/unit/draw.cxx` and small fixture(s) in that test's existing data
   directory: focused RGB/theme inheritance controls on the import boundary.
   The precise existing test fixture naming needs confirmation in the runtime
   source checkout before an implementation claim is expanded.
3. The independently licensed genuine UOP fixture and scoped import/export
   regression remain under the already claimed application QA paths, preserving
   their original hashes and original failed evidence.

Do not change global `XFillColorItem::PutValue` behavior, default themes, line
colors, canvas geometry, DrawingML's handling of genuine themes, application
Cargo/converter files or source-format support claims. No source/output matching
belongs in product code.

Conceptual precondition and operation (not a compiled implementation):

```text
explicit solid FillStyle AND explicit RGB FillColor
AND no explicit FillComplexColor in the imported shape style
AND destination supports FillComplexColor
    -> set FillComplexColor to an empty typed XComplexColor reference
apply the existing imported property set
```

The shared importer also handles ODF shapes. Its inheritance behavior must be
reviewed: a local explicit RGB/solid override should not accidentally retain a
parent theme, while a style that only inherits a fill must retain that theme.
If the source review cannot establish these semantics, stop and revisit the
boundary rather than silently extending a format-specific workaround.

## Required regression and build gates

- Genuine original UOP: both source RGBs preserved in a real converter output;
  original source unchanged; three slides/eight objects/content oracle intact.
- Positive theme control: explicit theme + fallback RGB retains the actual
  theme relationship and transforms.
- Inherited theme without a local RGB fill retains its theme.
- Explicit local RGB/solid override of an inherited theme becomes non-theme.
- Non-solid fills, no-fill, strokes and unrelated properties remain unchanged.
- Original engine title edit, Undo/Redo, modern PPTX save and fresh reopen retain
  both RGBs and the independent source content. This has not been run on a
  corrected runtime; the new probe is only an in-memory counterfactual.
- A newly built private runtime needs a new exact source/patch/compiler/package
  descriptor and byte hashes. The existing P2 descriptor must not be reused for
  changed binaries. Coordinate an available Linux source-build/cache before
  building. No app/suite/Mac build is authorized here.
- Later product intake must check the same corrected code point on Windows,
  Linux, macOS and the supported browser boundary, explicitly distinguishing
  build/package, converter, engine, native interaction and visual acceptance.

## Runtime-tree diagnostic caveat

The first two UNO runs retain their failed overall outcomes. All original
15,082 private runtime entries retain bytes, modes and symlinks, but Office
initialization added Python bytecode caches and two fontconfig `.uuid` files.
No source/runtime file content was replaced. The strict exact-tree assertion
correctly failed; it must not be relabelled as passed. A subsequent clean-tree
probe requires an independently justified cache or read-only-namespace strategy
before execution. No caches were deleted to manufacture a pass.
