# #373 — source attribution and precision decision

Application: unchanged P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`.
Runtime: the already verified shared artifact `14805600515`; upstream commit
`9dea406ab7695df6325b11b0e19fdca8db4b7276` is the actual `--version` build ID.
This investigation reuses completed Linux run `45149020419` and its hash-checked
artifact. No further converter, engine, suite, GUI or capture run is needed for
the source/arithmetic comparison.

## Where the measured change arises

The exact matching LibreOffice source has the following export path:

1. [`pptx-epptbase.cxx:106–119`](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/sd/source/filter/eppt/pptx-epptbase.cxx#L106)
   configures the source map as hundredths of a millimetre and the destination
   as integer master units of 1/576 inch.
2. [Page-property acquisition at lines 182–189](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/sd/source/filter/eppt/pptx-epptbase.cxx#L182)
   passes width/height through `MapSize`; [lines 656–664](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/sd/source/filter/eppt/pptx-epptbase.cxx#L656)
   call `OutputDevice::LogicToLogic`, returning integer dimensions.
3. [`map.cxx:1245–1253`](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/vcl/source/outdev/map.cxx#L1245)
   rounds the scaled value; the [size conversion at lines 1380–1402](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/vcl/source/outdev/map.cxx#L1380)
   applies it to each dimension in the non-simple map route.
4. [`pptx-epptooxml.cxx:549–553`](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/sd/source/filter/eppt/pptx-epptooxml.cxx#L549)
   writes `p:sldSz` using `PPTtoEMU` on those integer master dimensions.
5. [`utils.hxx:69–72`](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/include/oox/export/utils.hxx#L69)
   and [`unit_conversion.hxx`](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/include/o3tl/unit_conversion.hxx#L71)
   convert integer master units to integer EMU. A master unit is 1,587.5 EMU;
   this is **not a twip conversion**, even though both observed errors happen
   to be smaller than one twip.

The exact rational calculation, starting only with the original STI page size,
is `round(round(mm100 × 576 / 2540) × 914400 / 576)` for positive dimensions.

| Axis | Original STI | Before master rounding | Integer master units | Predicted EMU | Observed EMU |
| --- | --- | ---: | ---: | ---: | ---: |
| Width | 28 cm / 28,000 mm100 | 806400/127 | 6,350 | 10,080,625 | 10,080,625 |
| Height | 21 cm / 21,000 mm100 | 604800/127 | 4,762 | 7,559,675 | 7,559,675 |

The prediction exactly matches the converter output, edited save and fresh
engine-handle reopen save. It is not fitted to their observed dimensions.
The exact STI source remains 10,080,000 × 7,560,000 EMU; its original oracle and
all historical strict failures remain unchanged. The matching arithmetic and
source path attribute the observed change to the upstream PPTX export step;
this is not an instrumented measurement of UNO properties during STI import.

`analyse_precision.py` re-reads the actual unchanged source ZIP and resolves
the master used by all seven pages. It verifies five upstream source hashes,
calculates with exact fractions and checks all three existing PPTX files.
The reproducible result is [`results/precision-source-analysis.json`](results/precision-source-analysis.json).
The original Linux oracle reports already establish seven slides / 24 original
paragraphs through edit/save/reopen and no added size drift by the engine.

## Decision and limits

Pending the existing integration coordinator's decision, requested explicitly
under the user's #373 instruction. Recommendation: document the deterministic
master-unit export precision for this concrete STI fixture/runtime rather than
introduce a product patch solely to change `p:sldSz`. A product correction would
need its own authorized scope and geometry/visual acceptance; this research
does not establish that such a patch preserves all layout behavior.

Any accepted precision contract must retain the strict-source mismatch as an
explicit observation and require the source-derived prediction exactly, plus
unchanged dimensions during engine edit/save/reopen. Do not replace this with
a general one-twip/one-pixel tolerance or a converted-file content baseline.
No conclusion is drawn for other STI templates, page sizes, other formats,
active media, visual fidelity or untested platforms. The production catalog,
safe profile, application version and closed P2 intake remain unchanged.

Local analysis reads source/XML and existing CI bytes only. No local app or
recording session was started; no capture cleanup is outstanding.
