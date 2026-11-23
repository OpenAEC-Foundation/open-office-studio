# WQ2 — strict failure, original lookup indices not translated

Exclusive route under #30: WQ2 only, one genuine Quattro Pro DOS5 source.
Application P2 is unchanged: `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`,
tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
Branch `codex/wq2-qa-2026-11-23-e0d7`; tested harness
`369d138083c4e8c9d1cc84bb03754036ac7db6df`.

Tracked separately as [issue #381](https://github.com/OpenAEC-Foundation/open-office-studio/issues/381),
with `rekenblad`, `bug`, `formaten` labels and successful label validation
[45172151980](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45172151980).
No product fix or late release intake is included.

**Strict source/format acceptance is false.** The converter copies native
zero-based VLOOKUP arguments 1/2/3/4 to modern one-based arguments 1/2/3/4,
instead of preserving their meaning with 2/3/4/5. Wrong formula semantics are
already present in converted XML, before the P2 engine opens it. The engine
correctly executes those emitted formulas; that downstream result is not a
native-source preservation pass.

## Source and independent oracle

The original [TESTLU.WQ2](https://github.com/openpreserve/format-corpus/blob/366f068cec399d0cdfd61fa473de3ab6dc858098/office/spreadsheet/wq2/vlookup-compat-demo/TESTLU.WQ2)
has 4784 bytes, Gitblob `d0acc8556b121c64d85089c9b19edf5a0bb280f7`, SHA256
`5431c7f8ae2840b93864049531448cdd7c79d939d31465e23abfefd1817703ce`.
The initial publication was `a55fb95b5d2fe990ddd463e4a15eb11c00087f25`
(2025-05-22), with the same Gitblob. The creator states that this fixture was
made in Quattro Pro for DOS 5.0. The folder's pinned CC0 declaration names
Johan van der Knijff. Source/license/creator explanation hashes are in
[result.json](result.json).

The native BOF `000002002151` and EOF `01000000` match
[PRONOM x-fmt/122](https://pronom.nationalarchives.gov.uk/x-fmt/122), Quattro Pro
Spreadsheet for DOS5. This is not a renamed other format or a probe-generated
export. The independent byte reader checks 236 original records, 61 populated
cells, 85 styled blank records, and four native RPN programs. Formula references
are absolute A15 and A2:E11, with original integer arguments 1/2/3/4.

The [creator's original explanation](https://github.com/openpreserve/format-corpus/blob/366f068cec399d0cdfd61fa473de3ab6dc858098/office/spreadsheet/wq2/vlookup-compat-demo/readme.md)
documents zero-based column semantics and the four original formulas. Native
table data independently gives expected results, verified against the two
original numeric caches and two separate text-cache records. No upstream
parser/converter result defines these expectations. A historical libwps mirror
was read only for record layout; possible shared parser lineage is disclosed.

The [original creator screenshot](retained/original-author-qp5.png) separately
corroborates the source oracle: B15 has argument 1 and value 683.93, selecting
table column B. It is source-author evidence, **not our native GUI reproduction**.
It was inspected separately after the byte/creator-text oracle was established.
Its exact original Gitblob/hash/license/role are in
[author-reference.json](author-reference.json).

## Observed values and phase separation

| Phase | B15 | C15 | D15 | E15 |
| --- | ---: | ---: | --- | --- |
| Native source, A15=4005 | 683.93 | 3134.2 | text `c` | text `sal` |
| Converted XLSX caches, before engine | 683.93 | 3134.2 | **number 3134.2** | **text `c`** |
| Actual fresh P2 engine open | **4005** | **683.93** | **number 3134.2** | **text `c`** |
| Native expected after A15=4007 | 685.35 | 3134.58 | text `c` | text `l` |
| Actual engine edit / Redo / fresh saved-file reopen | **4007** | **685.35** | **number 3134.58** | **text `c`** |

B15/C15 initially retain correct original numeric caches despite wrong formula
indices. This can conceal the semantic error until recalculation. D15/E15
already have wrong values/types in converter output. This probe does not assert
a separate general text-cache decoder defect. The narrow confirmed fault is
the missing VLOOKUP index translation; HLOOKUP and other behaviors are not
bundled.

The actual engine preserves all 57 non-formula constants, performs A15 editing,
Undo/Redo and A13 text editing, and completes modern XLSX save/fresh workbook
reopen. Its results match an independent evaluation of the **emitted** formulas.
The independent native expectation remains different at every engine stage.
All 61 populated addresses, types, values and four formulas are checked in each
OOXML stage. The source hash stays unchanged.

## Exact runtime, run and retained evidence

[CI 45170944200](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45170944200)
executes the genuine source oracle (job137680005645, PASS), production browser
limitation check (job137680109507, PASS), and actual private runtime/helper/core
route (job137680277581, **FAIL at final strict source-semantic assertion**).
Every edit/Undo/Redo/save/reopen stage ran before that assertion. No test was
skipped or changed to make this failure pass.

Only shared runtime-only artifact `14805600515` was consumed: producer run
`45147346793`, commit `22a8577d215911976400adca4c541f2636212918`, coordinator
descriptor `e1f1b84b94fdfa9932f8f33804da9b00c5cf6594`, unchanged shared verifier
SHA256 `5e17b69dc328e9491692b5e3a497f16977618afea08d259bbaf46063864874ca`.
Full input ZIP SHA256
`bac1a37b55deff80cabd4670c1bf65d76266285275c0552436dcc13fcdafa487`;
tar SHA256
`f3308bea282aedc444a10a039ec2c4e3904915d4c6c0b5607b088108407fb2e3`.
ZIP, distinct descriptor/base descriptor, tar, 15082-entry manifest, modes,
symlinks, launcher/ELF and P2 source/version bindings were checked. Private
converter is LibreOffice `26.8.2.2`; exact P2 safe profile and isolated temporary
input/profile are used. Parent DEB verification is inherited, not a new install
test. Actual P2 WASM SHA256 is
`2b1b74a572ad97bfe0f5bf25798fd123a46505a85b80a477792a180a13deddad`.

The complete official [runtime result ZIP](retained/wq2-runtime-result.zip),
artifact `14817860054`, is retained: **55220 bytes**, SHA256
`4fc2da77b1e52eaa9ddc97ba8c8b4e3f119b9f9b9a16f9b3747fe98dd1a8711b`.
The downloaded full ZIP digest matches official GitHub artifact metadata. It
contains the original fixture, license/creator explanation, native oracle,
runtime bindings and receipts, converted/saved/reopened XLSX and actual engine
observations. It contains no Office installation/runtime payload.

| Stage | SHA256 |
| --- | --- |
| Converted XLSX, 6494 bytes | `9289c177eb429cbd8719159f4231e66c45ed5ea62c24070ed1960885419f2e98` |
| Saved XLSX | `0f49b132d4b99815f960d10ae0f477f8209c3cbc90f0c00095e4e3da603b6b11` |
| Freshly reopened/resaved XLSX | `0f49b132d4b99815f960d10ae0f477f8209c3cbc90f0c00095e4e3da603b6b11` |

See [native-source-oracle.json](native-source-oracle.json),
[converted-independent.json](converted-independent.json),
[saved-independent.json](saved-independent.json),
[reopened-independent.json](reopened-independent.json) and
[result.json](result.json) for full source/fixture/runtime/package binding,
exact differences and retained evidence hashes.

For offline **source/XML-only** replay, verify the retained ZIP SHA256 and
extract into a new `.local/wq2-qa` under the checkout. Then:

```sh
python scripts/qa-wq2/oracle.py source
python scripts/qa-wq2/oracle.py xlsx --xlsx .local/wq2-qa/converted.xlsx
```

The second command must fail on strict preservation. For a structured diagnostic
report without replacing the strict failure, add `--diagnostic`; for saved or
reopened files also add `--edited`. This is not a repeat of the actual Office
or engine run. Numeric value comparison uses absolute `1e-9` only for binary64
to decimal serialization.

## Remaining limits

Only exact matching keys4005/4007 are exercised, not general approximate-match
or missing-key behavior. No WQ2 export, chart/style/rendering, explicit/custom
sheet name, external links, macros or encryption acceptance. No name is inferred
from the prior WB2 implementation. Browser proof is production functions in
Linux Node with empty window/no bridge mock, not a hosted browser UI. Windows,
macOS, native packaged Linux UI, installer and actual Tauri IPC were not tested.
No product/catalog/release intake/main/tag/publication changes, extra app/Mac
builds or local GUI/capture/profile changes. Previous proofs remain preserved.
