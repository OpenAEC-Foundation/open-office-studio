# WB2 — limited original-file result under #30

P2 is unchanged: `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
Branch: `codex/wb2-qa-2026-11-23-e0d7`. Only this format was claimed with the
integration chat. Previous STC/UOS/UOT/UOP/SDD proofs remain separate.

**Strict import acceptance remains false.** The genuine source has one native
page (ID 0), without an explicit page-name record. The test expected the native
default `A` documented by the independent Gnumeric reader; the private
converter outputs `Sheet1`. This mismatch is recorded before engine opening
and remains visible in converted, saved and freshly reopened outputs. No
expected name was rewritten. Because no literal original name is serialized,
this is not asserted as a confirmed product naming bug and no issue was made.

**Downstream cell/formula checks pass.** A separate CI job used the exact
authenticated converter bytes, without rerunning Office. It checked all 33
native cells and ten original relative multiplication formulas with the actual
P2 WASM. A2 `1→7` recalculates C2 `10→70`, Undo restores `10`, Redo restores
`70`, and A1 text editing succeeds. Recommended modern XLSX save and fresh
engine reopen pass, with independent OOXML checks of every populated cell,
type, formula and numeric cache at all three output stages. The original WB2
hash stays unchanged. This is **not full WB2 acceptance**.

## Source and oracle

The [original corpus file](https://github.com/openpreserve/format-corpus/blob/366f068cec399d0cdfd61fa473de3ab6dc858098/office/spreadsheet/wb2/testQuattro.wb2)
is a real Quattro Pro 6.0 source, 4804 bytes, SHA256
`64273c74942b0b7456bc8f7da3828311d07f2acf08e9ab756e07dda549a9b569`,
Gitblob `9ed7aa4ad6891cd7fca809b7ee918933e4a1d460`.
Its pinned [provenance and CC0 declaration](https://github.com/openpreserve/format-corpus/blob/366f068cec399d0cdfd61fa473de3ab6dc858098/office/spreadsheet/wb2/readme.md)
identify Johan van der Knijff and creation in Quattro Pro 6.0. The same bytes
were published in 2017 commit `9ab17f1a842a20f28862b34bd841a538ab871d4c`
and are independently hosted by Apache Tika at the pinned path in fixture.json.

Native BOF is `00 00 02 00 02 10` (version `0x1002`, WB2). A narrow Python
stdlib reader derives cells directly from 195 original records and ten native
RPN programs `01 01 0b 03`, plus relative references two/one columns left.
Integer operands independently evaluate to caches
`10,18,24,28,30,30,28,24,18,10`. This is not an upstream parser-result oracle.
Negative guards reject a renamed WB1 header, altered formula opcode and wrong
original cache. Non-cell records and the 41-byte trailer are inventoried, not
accepted for fidelity. See [native-source-oracle.json](native-source-oracle.json).

## Exact execution and retained evidence

| Phase | Harness / run | Result |
| --- | --- | --- |
| Original native source, browser guard, verified private conversion and strict import | `5b3ee3448e322d07b94cc0c670174d484fdff606` / [45166562262](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45166562262) | Source/browser checks pass; strict import fails on name expectation |
| Actual engine continuation, edit, Undo/Redo, save/reopen and independent XML | `7c3d25d1acf083bdb4351f04749fa4b741791577` / [45167344661](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45167344661) | Downstream pass; strict/full acceptance remain false |

The original run consumes only verified runtime-only input `14805600515`,
producer `45147346793` at `22a8577d215911976400adca4c541f2636212918`,
coordinator descriptor `e1f1b84b94fdfa9932f8f33804da9b00c5cf6594`, shared verifier
SHA256 `5e17b69dc328e9491692b5e3a497f16977618afea08d259bbaf46063864874ca`.
Full input ZIP SHA256:
`bac1a37b55deff80cabd4670c1bf65d76266285275c0552436dcc13fcdafa487`;
tar SHA256:
`f3308bea282aedc444a10a039ec2c4e3904915d4c6c0b5607b088108407fb2e3`.
The full ZIP, tar/manifest/modes/symlinks/launcher/ELF and P2 source/version
binding were checked; exact safe isolated conversion profile is used. Parent
DEB verification is inherited, not a new installation test. All bindings and
output hashes are in [result.json](result.json).

| Retained official artifact ZIP | Bytes | SHA256 |
| --- | ---: | --- |
| [Strict conversion result](retained/wb2-strict-runtime-result.zip), artifact `14815275765` | 33013 | `030d6fd8aa221dd8598ebdf79a23178f5a6a9c7f68bf946fbeb6ceb09a9bb7d1` |
| [Downstream result](retained/wb2-downstream-result.zip), artifact `14815670554` | 48175 | `9c44a09ed38e95214097b5a7a409ebf4aa34c4330cf209d322ca025278adbc95` |

Both complete downloaded ZIP digests were checked against official GitHub
artifact metadata and retained here for review after artifact expiration. They
contain the genuine source, license/provenance text, native oracle, exact
converted bytes, runtime receipts and actual CI reports. The downstream ZIP
also contains saved/reopened XLSX and diagnostic reports. It contains no Office
runtime or installer.

For an offline, **source/XML-only** replay, verify the downstream ZIP digest,
extract it into a new `.local/wb2-qa` under this checkout, then run:

```sh
python scripts/qa-wb2/oracle.py source
python scripts/qa-wb2/analysis/cells.py .local/wb2-qa/converted.xlsx
python scripts/qa-wb2/analysis/cells.py .local/wb2-qa/saved.xlsx --edited
python scripts/qa-wb2/analysis/cells.py .local/wb2-qa/reopened.xlsx --edited
```

These diagnostics keep `strictDefaultNameMatch=false` in their reports. The
original strict command still fails at the preserved name comparison:

```sh
python scripts/qa-wb2/oracle.py xlsx --xlsx .local/wb2-qa/converted.xlsx
```

## Remaining limits

No chart/style/layout/trailer fidelity, explicit/custom sheet-name retention,
macro execution or nonexecution, encryption, other Quattro variants or WB2
export acceptance. The browser result is actual production capability/open
functions in Linux Node with an empty window and no bridge mock; it is not a
hosted browser UI test. No Windows/macOS runtime, native packaged Linux UI,
installer or actual Tauri IPC test. No product/catalog/release intake or main
changes, GUI/capture/profile changes, extra suite/Mac builds or new issue.
