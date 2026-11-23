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

The initial static report deliberately records this as an inference. The live
UNO counterfactual below subsequently confirms the relevant two property values
and export behavior. It remains a diagnosis, not a shipped product fix.

## Proposed next probe and implementation gate

Integration authorized the isolated UNO diagnosis and its own manual Linux
workflow. The actual client uses an unpredictable **local named pipe**, with no
network listener. It connects only to the explicitly launched private process;
it never calls `Bootstrap.bootstrap()` or finds a system Office. Each load
disables macros and link updates, aborts interactions, uses the exact P2 safe
profile and keeps the source read-only. A separate in-memory document copy is
checked against the complete control snapshot before only its two proven
complex colors are cleared. Export destinations are new owned PPTX files.

The required later product engine edit/save/fresh reopen is still outstanding;
the completed counterfactual only observes the private UNO import/export path.

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

## Recorded Linux results

- [45164461311](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45164461311),
  QA `6dd66bbaca1b81220d9cba36bf9d28565300c0e6`: component preflight succeeds.
  The private runtime contains `libreoffice.jar` and `libjpipe.so`; the runner
  already provides Temurin Java/javac 11.0.33. Nothing extra is installed.
- [45165225390](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45165225390),
  QA `eddcde2a`: actual UNO counterfactual succeeds, but the final exact-tree
  assertion fails. That first assertion did not retain a detailed tree diff;
  the original failed result and exact artifact remain historical.
- [45165518973](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45165518973),
  QA `4d8d7d5a`: records the same live result and the detailed strict tree failure.
  Both loaded rectangles have correct source RGB plus complex type 4/theme 4.
  Clearing only the complex member yields type 0/theme -1 and correct RGB
  output. All other eight-shape live fields and independently observed document
  content match the control. Existing source canvas/stroke failures remain.
  All original 15,082 runtime entries retain content/modes/links, but Python
  bytecode caches and two fontconfig `.uuid` files are newly added. **Overall
  run remains FAIL.** No caches were deleted or strict test relabelled.

The own process group is empty and its isolated profile removed in the detailed
report. No local GUI/capture session was started. Complete official artifact
ZIP hashes, QA/run/job bindings and limitations are recorded in
[`qa-results.json`](../../docs/tests/presentation-375/qa-results.json).
The small retained diagnostic pair comes only from the independently hashed
second-run artifact and contains no runtime binaries or font caches.

The own branch-only bootstrap push trigger was removed after registration;
the actual UNO phase requires explicit `workflow_dispatch` with `phase=uno`.
The separately authorized clean-tree follow-up
[45167757305](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45167757305)
on QA `07eb12af` succeeds: same real counterfactual, all 15,082 runtime entries
identical and no extra paths, with `PYTHONDONTWRITEBYTECODE=1` and an own verified
read-only payload mount in a private Linux user/mount namespace. Namespace,
read-only flag, unchanged parent namespace, own unmount/profile/process cleanup
are retained. The two original FAIL runs remain unchanged. Product/strict source
acceptance is still false.

The [separate import patchset](runtime-patch/README.md) is prepared and structurally
checked, but not compiled. Integration must now allocate the concrete
[Linux source-build/test plan](../../docs/tests/presentation-375/linux-build-plan.md)
before a large checkout/build or a changed runtime binding is started.
