# #375 importer patchset (uncompiled)

Integration authorized this separate source patchset against LibreOffice
`9dea406ab7695df6325b11b0e19fdca8db4b7276`. It is not installed, compiled or
included in any P2/P3 application/runtime package.

`375-solid-rgb-import.patch` changes only:

- `xmloff/source/draw/XMLShapeStyleContext.cxx`: before applying a shape style's
  imported properties, clear the supported inherited `FillComplexColor` only
  when this style explicitly provides a valid solid `FillStyle` and RGB
  `FillColor`, and no explicit `FillComplexColor`. Styles inheriting a fill,
  genuine theme-plus-fallback fills, non-solid fills and strokes are excluded.
- `xmloff/qa/unit/draw.cxx`: a genuine UOP import/PPTX-save/fresh-reopen
  regression and authored inheritance controls including explicit/inherited
  themes, RGB parent override, no-fill/gradient and unchanged stroke theme.

Two fixtures are copied separately to `xmloff/qa/unit/data` by the checked
applicator. The unchanged publisher UOP keeps SHA256 `7d204f66...`; its custom
testing permission is recorded in the issue and the original evidence branch.
It is not CC0. The small FODP is newly authored synthetic regression data, not
an authentic source-format fixture. No colors are reconstructed from a guessed
theme or matched by geometry in production code.

`manifest.json` pins the upstream commit, primary input file hashes, expected
patched file hashes, patch SHA256 and both fixture hashes. The applicator
defaults to **checking only**; it refuses a wrong commit, modified tracked
source, differing source bytes, fixture collisions or a mismatched patch.
`core.autocrlf=false` is passed only to this Git invocation to preserve pinned
bytes; no user/global Git setting is changed.

```sh
python apply.py /absolute/path/to/exact/libreoffice-checkout
python apply.py /absolute/path/to/exact/libreoffice-checkout --apply
```

Do not run `--apply` in another operator's checkout. This script does not fetch,
configure, compile, commit, install or publish anything.

Completed local checks: both source input SHA256 values; patch context check
against the exact partial source copies; applying the patch to separate own
copies and comparing both complete resulting SHA256 values; fixture XML parsing
and original UOP identity; Python syntax; diff whitespace. The Windows dry-run
first exposed automatic CRLF conversion, which was corrected in the invocation
before the resulting byte hashes passed. These are **structural checks**, not
Cppunit/compiler or product acceptance results.

An additional local full-schema attempt is inconclusive: libxml cannot compile
the pinned LibreOffice extended RelaxNG grammar (`Attributes conflicts in group,
line 4673`). Source/schema hashes and the validator boundary are recorded in
`docs/tests/presentation-375/fixture-schema-check.json`. This neither establishes
a faulty fixture nor counts as passing full schema validation. No replacement
validator or runtime component was installed; real loader/Cppunit checks remain.

The actual compiler/red-green Cppunit run and source-built converter/engine
regressions require the separately reviewed
[Linux build allocation](../../../docs/tests/presentation-375/linux-build-plan.md).
No passing C++ test or fixed product is claimed yet.
