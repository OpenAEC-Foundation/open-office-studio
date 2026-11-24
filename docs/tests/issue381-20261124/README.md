# Issue 381: WQ2 VLOOKUP source correction proposal

**Source patch reviewable; extracted parser unit passes. Actual patched runtime
acceptance is still open.** This delivery does not change the bundled runtime,
P5 application, version, catalog or release. It does not close #381.

Integration assigned the product fix exclusively to chat 9d3b. The original
fixture/oracle remains owned by e0d7. Open and closed Quattro/VLOOKUP reports
were searched; #381 and the relevant #30/#35/#59/#322 descriptions were read.
There is no new issue or duplicate implementation.

## Exact baseline and source

Application base is P5 `b696ab86bd1c128729a079b68c0082e6df3d36a5`, tree
`e30879fd772871e690847c061ef66e6b81808a05`, version 2026.48.1. The original
failure was demonstrated by e0d7 on P2; those results retain their P2 identity.
Its original result archive, not another runtime download, supplies the genuine
TESTLU.WQ2, creator explanation, independent oracle and converted workbook.

- Source: 4,784 bytes, SHA256
  `5431c7f8ae2840b93864049531448cdd7c79d939d31465e23abfefd1817703ce`;
  [original creator's source](https://github.com/openpreserve/format-corpus/tree/366f068cec399d0cdfd61fa473de3ab6dc858098/office/spreadsheet/wq2/vlookup-compat-demo), CC0.
- Original result ZIP: artifact 14817860054, 55,220 bytes, SHA256
  `4fc2da77b1e52eaa9ddc97ba8c8b4e3f119b9f9b9a16f9b3747fe98dd1a8711b`.
  Official metadata was rechecked; the retained Git copy has that full digest.
- Shared runtime-only baseline: artifact 14805600515, original full-ZIP SHA
  `bac1a37b55deff80cabd4670c1bf65d76266285275c0552436dcc13fcdafa487`;
  canonical 15,082-entry manifest SHA
  `79204b36527a7fed0f073b5290df26a86c6a610ba4f78ddf36883507b28da029`.
  The already-shared small manifest was verified, not the runtime downloaded.
- Manifest's original `program/libwps-0.4-lo.so.4`: 2,483,104 bytes, SHA
  `c6f5c5dc6bcabf01e83591a9365983171a538fcf41f77294523bc0a77f82ecc4`.

The baseline receipt identifies LibreOffice 26.8.2.2. Its official release tag
resolves to core `9dea406ab7695df6325b11b0e19fdca8db4b7276`, whose
[download recipe](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/download.lst)
pins libwps **0.4.14**, source tar SHA
`365b968e270e85a8469c6b160aa6af5619a4e6c995dbb04c1ecc1b4dd13e80de`.
Only this 719,016-byte source tar was fetched and verified. It is retained with
its upstream MPL 2.0 / LGPL 2.1+ license files inside. The release recipe is a
source pin, not a claim that this review reproduced the official ELF build.

The release's `MSWorksCalcImportFilter.cxx` routes Quattro spreadsheets through
libwps. Its original patch list and patches are retained; they do not add this
index translation. Runtime/recipe/compiler and artifact bindings remain
separate in `proof.json`.

## Cause and minimal proposed change

`QuattroDosParser::checkHeader` maps BOF value `0x5121` to version 2 (WQ2).
`QuattroDosSpreadsheet::readFormula` decodes the function opcode as
`VLookUp`, arity three, and currently concatenates its three operand token
vectors unchanged. Thus native zero-based column arguments 1/2/3/4 remain
1/2/3/4 in the modern formulas instead of equivalent 2/3/4/5.

Product proposal **b9233f3c61322cd1f2d27aca49138829c8b7bc9c** contains only
`patches/libwps-wq2-vlookup.patch` and its hash metadata. The patch adds 24
lines to that single upstream parser function. Only version 2, VLOOKUP and
arity three enter it. An integer token increments directly; another operand
expression becomes `(expression)+1` so its existing grouping is retained.
The lookup value, range, relative/absolute reference flags, original files and
cached values are not rewritten. No cell address or fixture signature is
hardcoded in the production correction. WQ1, HLOOKUP and the other Quattro
parsers are untouched. Patch application and exact resulting source bytes
were checked independently of the unit build.

## Actual local regressions

| Check | Unchanged source | Proposed source |
| --- | --- | --- |
| Genuine WQ2 native/source oracle and four negative guards | PASS | Original unchanged |
| Original converted XLSX strict native-semantic oracle | FAIL, preserved | No newly converted XLSX exists yet |
| Four genuine source formula programs in compiled parser functions | Four wrong column arguments | Equivalent 2/3/4/5, original absolute references retained |
| Four HLOOKUP token differentials | Unchanged | Unchanged |
| Synthetic WQ1 literal operand control | Unchanged | Unchanged |
| Synthetic WQ2 literal and expression operand controls | Missing translation | Correct added one/grouping |
| Extracted parser unit total | **5 PASS / 6 FAIL** | **11 PASS / 0 FAIL** |

The C++ regression compiles the **actual** `readCell`, `readFormula`, function
table and `FormulaInstruction` definition from the hash-pinned source. A small
explicit adapter supplies a memory stream, integer vectors, diagnostic sink
and the used string interface. It reads four real formula records directly
from the original WQ2 bytes. The five other controls use synthetic opcode
streams; they are not invented source files or WQ1/HLOOKUP format acceptance.
The expected lookup/range/column results come from the source oracle, not the
converter's previous output.

This is deliberately **not** a complete libwps build, ABI or linker test, a
new Office conversion, engine acceptance or native application test. The
adapter's scope is the covered formulas; it rejects external references.
MSVC file version 19.44.35229.0 compiled and ran both variants locally on
Windows x64. Compiler, generated source and executable hashes plus original
stdout/stderr are retained. The independent Python source/XML-only replay
also kept the original strict failure instead of substituting new baselines.

## Offline replay

The small source/result archives are retained, so these commands download
nothing. Use Python 3 and MSVC C++ tools on Windows, or a C++17 compiler on
Linux/macOS. No Office installation or appbuild is needed for this source unit.

```sh
python qa/issue381/source-regression.py
python qa/issue381/original-oracle/oracle.py source --source .local/issue381/inputs/source.wq2 --out .local/issue381/inputs
python qa/issue381/original-oracle/oracle.py xlsx --xlsx .local/issue381/inputs/converted.xlsx --out .local/issue381/inputs
```

The final command must still exit 1 on the retained original converter output.
The two `original-oracle` files are byte-identical copies from e0d7's
`10b52564213a0838c2cb0462f3f033e70c009e51`; ownership and expectations are
unchanged. New replay output is isolated from the archived original evidence.

## Required next gate

The integration coordinator has been asked to allocate a targeted Linux
libwps build and private runtime differential. Nothing has been dispatched.
That gate must preserve the original LibreOffice external patches and verify
compiler configuration, SONAME/ABI, dependencies, exact private library/runtime
hashes and source binding. Then use the unchanged genuine WQ2 and strict
61-cell typed oracle, actual P5 engine A15 editing, Undo/Redo, modern XLSX save
and fresh workbook reopen. Expected original values are
`683.93, 3134.2, "c", "sal"`; at A15=4007 they are
`685.35, 3134.58, "c", "l"`. All 57 non-formula source cells must survive.

None of those patched-runtime results is claimed here. The current application
still uses its original converter and therefore is not declared fixed.
Windows, Linux, macOS and actual browser/native applicability must be recorded
at the next appropriate candidate; build success alone is insufficient.
No HLOOKUP, general cache decoder, other Quattro versions, catalog, main, tag,
publication or current-release intake is included. No GUI/capture was started;
the short compiler/oracle processes have exited.
