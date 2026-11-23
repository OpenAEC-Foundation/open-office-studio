# Issue #375: UOP rectangle-fill diagnosis

Exclusive integration claim: only the two explicit rectangle fills reported in
[#375](https://github.com/OpenAEC-Foundation/open-office-studio/issues/375).
New branch starts at unchanged P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`.
This work is outside the closed P2/374 release intake. No changes to #78/#87.

## Reproduce the read-only boundary diagnosis

Python 3 and `lxml` are required. The recorded initial execution used Python
3.12.14, lxml 6.1.1 and libxslt 1.1.45. This does not install or run
Office, build an application or open a GUI. Existing exact converter/engine
results are reused, with their original failed source acceptance retained.

```sh
git fetch origin codex/uop-qa-2026-11-23-e0d7
python scripts/qa-presentation-375/diagnose.py
```

The script verifies the complete retained ZIP and original UOP hashes, verifies
four immutable upstream source files, executes the pinned UOF XSLT with external
resource access disabled, associates the third slide's original anchors with
their object definitions and ODF styles, and checks both explicit colors. It
also checks the three retained real PPTX outputs. Its successful exit means the
boundary discrepancy was reproduced, **not** that the import passed.

## Observed facts

- Original `gr4_0`/`ODP`: explicit `#14213d`; `gr5_0`/`UOP`: explicit `#046eff`.
- The pinned UOF XSLT emits `draw:rect` objects using their matching original
  style names. Those styles correctly contain `draw:fill="solid"` and the two
  different `draw:fill-color` values, without a complex-color child.
- The retained actual converter, edited save and fresh-reopened save all contain
  `a:solidFill/a:schemeClr val="accent1"` for both objects. The original issue's
  independent relationship/theme oracle resolves that accent to `#18a303`.
- The actual PPTX rectangles have empty `p:cNvPr/@name` values and IDs 23/24.
  Original UOF identifiers therefore cannot simply be used as output keys.

## Source-supported explanation requiring runtime confirmation

Source point: `LibreOffice/core` commit
`9dea406ab7695df6325b11b0e19fdca8db4b7276` (the previously pinned runtime source).
The script retains complete SHA256 identities for each inspected file.

1. `filter/source/xslt/import/uof/uof2odf_presentation.xsl:359–361` emits the
   explicit source RGB correctly. The standalone transformation confirms it.
2. `sd/source/core/drawdoc4.cxx:175–207` initializes the default fill as Accent1
   and stores its `ComplexColor` on the default `XFillColorItem`.
3. `svx/source/xoutdev/xattr.cxx:1864–1914` handles RGB assignment through
   `SetColorValue`; that function at lines 328–332 changes `m_aColor` and calls
   `Detach`, without clearing `maComplexColor`.
4. `oox/source/export/drawingml.cxx:539–545` prefers `FillComplexColor` over the
   current RGB. `WriteSchemeColor` checks the theme type and writes its theme
   reference; it does not compare the resolved theme RGB with `FillColor`.

Together these explain a plausible stale inherited-theme path. No live
`FillColor`/`FillComplexColor` properties were inspected in this new work yet;
do not call this a confirmed complete runtime causal trace or a product fix.

## Proposed next probe and implementation gate

Before changing shared converter/runtime files, ask the integration coordinator
to confirm the route. Preferred probe: use the exact verified private P2 Linux
runtime, an isolated safe profile and a loopback-only UNO connection to inspect
the two loaded rectangles' RGB and complex-color properties. Clear only their
complex colors in the probe, export modern PPTX and check the unchanged
source-derived RGB oracle, edit/save/fresh reopen and unaffected document data.
This is a diagnostic counterfactual, not a shipped fix or global theme policy.

A structural correction should clear an inherited complex color at the
appropriate import boundary when an explicit non-theme fill is imported, while
preserving genuinely explicit theme data. A broad change to all `PutValue` RGB
assignments could break legitimate theme operations and is not proposed.
Changing shipped runtime bytes requires separately coordinated building and
platform checks; the current P2 runtime is immutable.

An application postprocessor would need a verified bijection from source shapes
to output shapes, correct handling of duplicate text/geometry, and fail-closed
behavior for ambiguous documents. Empty output names make a simple ID patch
unsafe. No guessed theme RGB or order-only patch is proposed.

No stroke, canvas-size, broad theme, or other format correction belongs here.
Windows/macOS/native/browser/visual acceptance and a corrected runtime are still
outstanding; the browser has no local conversion runtime.
