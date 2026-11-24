# FB2 minimal upstream regression route under #30

Only the assigned original `lo-fb2-1` / `FictionBook2.fb2` is covered. The integration coordinator assigned this exclusively on 2026-11-24. ZABW `94f3c419` and all prior proofs remain unchanged. No other FB2 variant is acquired or claimed.

## Source and application

- Exact P2 application `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
- [Original pinned LibreOffice regression fixture](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/writerperfect/qa/unit/data/writer/libe-book/pass/FictionBook2.fb2), 685 bytes, blob `4348cb75beff4be16c37288bc483b7d5504130c8`, SHA256 `1b758fb8128a660dafd4d2a0c001c9e37001f9a2a52c23d1451290713b709448`.
- Original source bytes and pinned LibreOffice project GPL/LGPL/MPL notices/README are reused; no individual CC0 grant or exact generating application is asserted.
- Native FictionBook XML namespace `http://www.gribuser.ru/xml/fictionbook/2.0`. The metadata version `1.0` is a document revision, not evidence of FictionBook format version1.0.

## Source qualification failure remains explicit

This is an authentic published **minimal regression fixture**, but it is not a complete schema-valid FictionBook witness. The creator-maintained [reference schema](https://github.com/gribuser/fb2/blob/4d3740e319039911c30d291abb0c8b26ec99703b/FictionBook.xsd), SHA256 `db2c0a239f4654db808d580b4d835fda9b41df09c169556116c4092ca47865b3`, declares both `title-info/genre` and `document-info/id` required. Both are absent in the assigned source.

The required declarations and source absence are checked directly before runtime, with their exact reference bytes retained under the original BSD-style copyright/license in `scripts/qa-fb2/reference/`. This is not a complete XSD-validator run; the two proven missing required fields suffice to reject a full schema-conformance claim. `sourceSchemaConformance=false` and `fullFormatAcceptance=false` remain separate from the bounded body-route result. The source is not repaired or replaced silently.

## Direct XML body oracle before conversion

The own namespace-aware reader distinguishes `description` metadata from the visible body. It derives exactly one body, one untitled logical section and one plain paragraph: `Hello world.`. The title `Hello world`, author, language, date and document revision are inventoried separately and are not treated as body text or accepted metadata-preservation requirements.

The edit prefix is `QA_FB2_24NOV `. Independent DOCX XML checks the ordinary recommended document type, one direct body paragraph, its exact case/punctuation/text and no invented body tables/images/opaque objects. A logical FB2 section is not equated with a physical Word section. No source font, styling or page geometry is invented where the FB2 source specifies none.

Metadata preservation, nested sections/headings/notes/poetry/tables/images/styles/font rendering, XML validation of arbitrary FB2, native GUI and full-format fidelity remain unaccepted. This proves only how the existing importer handles this minimal upstream sample, not generic FB2 compliance.

## Runtime and test level

One small Linux job consumes only existing verified private runtime-only artifact `14805600515`, with the shared descriptor/consumer/full ZIP/tar/source/tree/version/manifest/modes/symlinks/launcher/ELF and P2 safe-profile checks. Fresh guards give critical queued P5 Linux jobs priority. No app/suite/Mac build or full installer download.

Actual production open policy invokes a verified private CLI adapter and real P2-patched Word WASM edit/Undo/Redo/DOCX save, fresh-session reopen/resave and subsequent separate Node-process reopen/resave. All four output stages receive an independent source-derived XML body check. The browser check uses the real negative capability functions without a desktop bridge; it is not hosted-browser UI, Tauri IPC, native GUI, installer, Windows or macOS acceptance.

No product/catalog/shared index/version/P5 intake/main/tag/publication changes.

## Duplicate review

Open and closed FB2/FictionBook issue searches returned no matches. Existing #30/#43 remain the overviews. The upstream sample's missing metadata is a fixture qualification limit, not an independently reproduced product defect or a reason to create another aggregate issue.

## Results

**LIMITED BODY ROUTE PASS / SOURCE SCHEMA QUALIFICATION FAIL / COMPLETE FB2 ACCEPTANCE OPEN.**

- [Linux run 45365158601](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45365158601), job `138344859697`, attempt 1, harness `1f383f40edfdbe4b0bb43c3eb61e1b8340268216`, SUCCESS for the declared minimal body-route checks. It does not override the recorded source schema failure.
- Runtime-only artifact `14805600515`, full ZIP SHA256 `bac1a37b55deff80cabd4670c1bf65d76266285275c0552436dcc13fcdafa487`, tar SHA256 `f3308bea282aedc444a10a039ec2c4e3904915d4c6c0b5607b088108407fb2e3`; exact source/tree/version/profile/descriptor/shared-verifier receipts retained in the original result ZIP.
- Result artifact `14905653810`, 68057 bytes, complete ZIP SHA256 `845fd68be6efa8535f8ed24068cc56cec99d61c5ed7e7bd85d943fae6c9c6e47`, expiry `2027-02-22T09:26:08Z`. Complete small ZIP and official artifact/run/job metadata are retained in Git.
- The real private converter receives exact original `invoer.fb2` bytes. Production open policy, actual patched Word engine edit/Undo/Redo/DOCX save, fresh-session reopen/resave and new Node-process reopen/resave passed for `Hello world.` and the declared edit. Input/source hashes remained unchanged; production JS/edit/layout identities matched across processes.
- Independent XML: **4 bounded body/type/object checks at each of 4 stages = 16 PASS**. Offline audit independently reread source/schema and reproduced the original reports exactly without executing Office/Word again. Three deliberate oracle controls correctly rejected dropped punctuation, metadata flattened into body paragraphs and an invented table.
- Both original engine reports and all XML reports preserve `sourceSchemaConformance=false`. Missing genre/id remains an input qualification failure. No complete schema-valid source proof, general FB2 support, metadata-preservation or richer-book/layout/native acceptance is inferred from this minimal sample's lenient import.
- Real negative browser production-function boundary passed; hosted UI/native platform acceptance is not claimed. No independently reproduced product bug/new issue, extra CI retry, product/catalog/intake/main/publication change or new app build. Own CI sessions/loaders closed; no local GUI/capture/Office/Word/helpers started.

### Reproduce the offline audit

Use a fresh destination:

```sh
python -B scripts/qa-fb2/analyse.py \
  --archive docs/tests/fb2-2026-11-24/retained/result.zip \
  --metadata docs/tests/fb2-2026-11-24/retained/artifact.json \
  --run docs/tests/fb2-2026-11-24/retained/run.json \
  --job docs/tests/fb2-2026-11-24/retained/job.json \
  --out .local/fb2-independent-audit
```

This authenticates archive/source/run/runtime binding, independently rereads original XML and required-field declarations, checks four saved outputs and rejects three deliberate non-source changes. It preserves schema failure and runs neither Office nor Word WASM. `result.json` and `offline-analysis.json` keep bounded body acceptance separate from source qualification; raw bytes/notices/reports/DOCX remain in the immutable result ZIP.
