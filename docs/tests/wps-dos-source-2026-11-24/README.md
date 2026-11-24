# #30 — lo-wps-2: Works DOS native source qualification

Exclusive assignment: only the existing **lo-wps-2** source. Application reference
P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
This is QA-only source qualification/reuse, separate from Works6/lo-wps-1 and
the current integration candidate. No product/catalogue/index/intake changes.

## Original bytes and provenance

The existing catalogue names this fixture Microsoft Works 2.00A DOS:
[LibreOffice/core@92c170f11d44857d8e365f2e29fb449dfb567ff5 — Works_2.00A_DOS.wps](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/writerperfect/qa/unit/data/writer/libwps/pass/Works_2.00A_DOS.wps).
The original existing cache is retained unchanged as `source.wps`, **660 bytes**,
Git blob `4bccbbd18ce685055e475105b750e78c47e25f0e`, SHA256
`65866a3e9c9716c05555277e8860e8a63be3126c3d8ed3e191f3b1252af2e611`.
It is native flat binary data, not Works6 CFB/CHNKWKS and not a renamed DOCX.
The full catalogue entry, original upstream project notices and canonical P2
Git-byte bindings are recorded in `scripts/qa-wps-dos/fixture.json`. No new
fixture or separate CC0/per-file licence grant is asserted.

The catalogue's `expectEmptyWarning=true` is recorded as historical metadata,
**not used as the source oracle**. Exact filename searches across open/closed
issues and the relevant closed #43 description were reviewed. #30/#43 already
provide the format scope; the source limits below do not establish a standalone
product defect, so no new issue or umbrella is created.

## Native evidence, independently read before conversion output

The four leading bytes are `01 FE 01 00`: version byte 1, marker FE, creator
word 1. The source implementation's `findZones` maps this combination to
**DOS2**. That supports the native family/variant, not a producer attestation
for the exact 2.00A patch. This independent byte reader uses layout information
from the pinned libwps source in a distribution mirror:

- [WPS4.cpp at a5ad3a399e52ff174e188edfca170a7689232d0b](https://github.com/deepin-community/libwps/blob/a5ad3a399e52ff174e188edfca170a7689232d0b/src/lib/WPS4.cpp):
  `checkHeader`, `findZones`, and `parseEntry`; SHA256
  `44feef6bc60696848d3963a167054d754d56548ec517a23a495c0a57800477b3`.
- [WPS4Text.cpp at the same commit](https://github.com/deepin-community/libwps/blob/a5ad3a399e52ff174e188edfca170a7689232d0b/src/lib/WPS4Text.cpp):
  `readEntries` and `readText`; SHA256
  `e0f8c2805709f6898a8d8afaa1b631a9df1a78522e08a52b5cf255c8b8f8dcf3`.

These are implementation references, not a normative Microsoft specification
or evidence that P2's packaged runtime embeds that exact library commit.
The layout references share the upstream parser family; the independently
implemented byte inventory is not claimed as an independent normative semantic
implementation of all Works stories, fields or styles. Direct SourceForge /
Debian / freedesktop source URLs were unavailable through the web reader; the
pinned source mirror was read instead. No converter output establishes the
native offsets below.

| Native header observation | Raw interpretation |
| --- | --- |
| Four signed LE limits at `1A` | `[-1, -1, 256, 258]` |
| Referenced primary text | `[0x100, 0x102)` |
| Primary bytes | **`0D 0A` only** |
| File-end word at `2A` | 660, equal to actual file size |
| Nine six-byte directory entries at `2E` | offset/size ranges checked |
| BTEC | offset 640, length 10 |
| BTEP | offset 650, length 10 |
| SHdr/SFtr/DLINK/FTNp/FTNd/BKMK/FONT | zero lengths |
| OEM word at `10` | `1B54`, code bits 437; no positive charset witness |

The header/footer sentinel limits are absent. The referenced primary text has
one CR and one LF, **zero other bytes**. The independent bounded reader therefore
finds no nonempty primary-text witness; it does not infer a logical paragraph
count or declare the entire format/document semantically empty.

Importantly, readable byte runs do exist **outside** that primary interval:
`mbered footnote` at 258; a letter-footnote sentence at 277; a bookmark sentence
at 305; and a page-format sentence at 330. They occupy an unclassified region
before the nonempty directory payloads. They are preserved in the raw source
and result ledger. A printable-string scan must not promote them to active
body text. Conversely, their actual origin/editing history is not proven, so
this report does not certify them as deleted/stale data or file corruption.
It makes no footnote/bookmark-loss or whole-document-emptiness claim.

The BTEC/BTEP payloads are retained as bytes; complete formatting/page/control
semantics are not accepted. No positive body text, non-ASCII encoding, footnote,
bookmark, font, visual layout, embedded-object or macro fidelity follows from
this source. No Works6 result is borrowed for this native DOS route.

## Historical evidence, with stage and profile boundaries

The unchanged P2-committed historical Windows report is retained, SHA256
`ed3e887dfb50c177d11695a1d0f4b03f0fb330382abe1acbd56690c160de56b8`.
It records a technical `opened-saved-reopened` pass and empty-conversion warning
for lo-wps-2, conversion time 23506 ms, saved size 5296 and saved SHA256
`27120ec04304347f750d350c64b3eb24b644da247c9832ef0cca48b0313886cc`.
Its report date is 2026-11-10T08:48:03.136Z; converter LibreOffice 26.8.2.2
`9dea406ab7695df6325b11b0e19fdca8db4b7276`. The actual historical profile SHA256
`8f301a135c288b99cc984a895030eee27ba40d3d9722f81c1d691d5f66f3de6c`
differs from P2's canonical safe-profile SHA256
`847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40`.
The report being committed in P2 does not prove execution on the P2 package.

The existing cache retains three separate receipts, all preserved here:
an earlier 47005-ms timeout, a 23506-ms successful conversion and a later
14125-ms successful conversion. The latter two each retain a **5407-byte
conversion-stage DOCX**, with different hashes:

- 23506-ms cache: `6068a22086b79b3c7798d6b134a3dcadcdfb78f42498d9ba36332d48432b76cb`.
- 14125-ms cache: `29485b6d4e42ce530e75f3263ac6137a9ca140f965420e8dcc764d48e46c873f`.

Neither matches the reported 5296-byte saved DOCX. No matching saved bytes were
found in the three inspected existing lo-wps-2 cache directories. A matching
duration/filename is not a saved-result identity proof. Both conversion files
contain one observed top-level body paragraph and no `w:t` story text; this is
an independent XML **observation**, not a positive-content or exact paragraph
preservation pass. The earlier timeout is retained, not hidden by the success.
No current CI run/artifact/package, private runtime or separate-process binding
is inferred from these local historical files.

## Checks performed and outcome

From the repository root, Python standard library only:

```console
python -B -X utf8 scripts/qa-wps-dos/analyse.py
```

The replay verifies the exact P2 tree/Git bytes, full UTF-8 source catalogue
entry, native source blob/digest, upstream notices, historical report, receipts
and conversion snapshots. It derives native text/directory bounds before
inspecting the old output.

**Six reader controls PASS:** wrong header, text end outside file, truncation
and directory overflow are rejected; changing an outside printable byte leaves
the primary story unchanged; changing an in-range CR to `Q` yields a detected
nonempty candidate. These are oracle controls, never replacement import
fixtures, a product parser/security test or a new Works fidelity pass.

The strict outcome is **`SOURCE_GAP_NO_POSITIVE_PRIMARY_TEXT_WITNESS`**;
`fullFormatAcceptance=false`. Technical old open/save/reopen remains historical
and bounded. There is no positive source-content acceptance to carry forward.

P2's static open policy converts WPS to DOCX and does not offer WPS output, so
the modern default remains DOCX. The external converter requires desktop;
actual current browser/native Windows/Linux/macOS behavior is untested here.
Those platform/pinned-runtime/edit/UndoRedo/new-process criteria remain OPEN,
not green based on old files or source inspection.

**Do not repeat an empty import to manufacture a general WPS pass.** The active
scope's useful result is this independently established source qualification
gap, with raw outside-text and historical stage limits preserved. No new fixture
search, CI/runtime/build/release-artifact download, local converter, native GUI,
browser/capture session or product fix was started. Only small pinned source
implementation files were read for the static layout review; their metadata is
committed and a read-only reference cache remains under ignored `.local/`.
No running test helper remains, and no automatic next format is claimed.
