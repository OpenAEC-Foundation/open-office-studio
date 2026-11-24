# #30 — lo-pages-1: container qualification only

Exclusive short static assignment. Exact P2 application:
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
No semantic document oracle, converter, engine, GUI or platform acceptance is
included. No product/catalogue/index/intake/main/release changes.

The original source is
[LO core@92c170f11d44857d8e365f2e29fb449dfb567ff5: Pages_4.pages](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/writerperfect/qa/unit/data/writer/libetonyek/pass/Pages_4.pages),
42277 bytes, Git blob `43c9213922bd26f9242ae93ed6a5aabcc85df11f`, SHA256
`eddc5d4f339143ccd45994bc18da067c98bbf0aae8f9852da1ccf052cd8b6253`.
Existing raw cache and upstream project notices are retained byte-for-byte.
Complete catalogue/notices/P2/report/cache bindings are in
`scripts/qa-pages-xml-source/fixture.json`. No new fixture, per-file CC0 grant or
producer attestation is asserted. The catalogue label Pages4(XML) is not an
independent proof of the original application/version.

The original ZIP has four members, each successfully read with CRC validation:

| Member | Uncompressed bytes |
| --- | ---: |
| QuickLook/Thumbnail.jpg | 8156 |
| QuickLook/Preview.pdf | 11017 |
| buildVersionHistory.plist | 355 |
| index.xml | 356234 |

Names are unique and relative without traversal/backslashes. No encrypted
member flag is set. No member was extracted to disk. This container is an XML
route, not a substitute IWA fixture; no Pages5/IWA claim is made. The index has
root QName **`{http://developer.apple.com/namespaces/sl}document`**, contains no
DTD/entity declarations and is parsed within an 8-MiB bound without external
resolution. Member sizes/CRCs/SHA256 and XML SHA256 are in `result.json`.
Previews, plist version history, text, styles and layout are not semantically
interpreted. These bounded checks are not general malicious-package, macro,
encryption or rendering acceptance.

The unchanged historical Windows report committed in P2 records a technical
`opened-saved-reopened` pass, conversion 10150 ms, saved 5303 bytes/SHA256
`0fd9bbc738cf98731c9fc14442a212ee34fc283e6a1f11777bf12d321c9b1340`.
Report date: 2026-11-10T08:48:03.136Z. Converter: LibreOffice26.8.2.2
`9dea406ab7695df6325b11b0e19fdca8db4b7276`; historical profile SHA256
`8f301a135c288b99cc984a895030eee27ba40d3d9722f81c1d691d5f66f3de6c`,
distinct from P2's canonical safe-profile SHA256
`847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40`.
Its presence in P2 does not bind historical execution to the P2 package.

Only one existing lo-pages-1 cache directory was inspected. Its retained
conversion-stage DOCX is **5412 bytes**, SHA256
`cefd2e57337bad81689c2a78c9ebb1d802ad67263bef58202aafe9248153b4dd`.
It does **not** match the report's saved result. The conversion receipt is
retained, but neither filename nor duration establishes saved-byte identity.
No DOCX semantic or runtime checks were repeated. The historical technical
pass remains separate from this container-only qualification.

Replay from the repository root (Python standard library):

```console
python -B -X utf8 scripts/qa-pages-xml-source/qualify.py
```

Actual source/tree/catalogue/notice/report/cache bindings, four member CRCs,
bounded XML parsing and root-namespace checks PASS. The concrete gaps are an
independent source-content/layout oracle and exact saved-result raw binding;
then, if separately allocated, the real P2 converter/helper/Word engine,
edit/UndoRedo/DOCX save/fresh-process route. Current native Windows/Linux/macOS
and browser acceptance remain OPEN. `fullFormatAcceptance=false`.

No issue is filed from these qualification gaps. No broad oracle, new binary
download, runtime/CI/build, local app/GUI/browser/capture or next-format claim
was started. Original bytes remain unchanged, all CLI calls terminate, and no
helper resources were created. This short scope is closed for the hard stop;
resumption requires a new user instruction and central ownership allocation.
