# ETT — source gap and separate template-predicate failure

One exclusive scope under #30: WPS spreadsheet templates (`.ett`). ET/DPS/DPT
remain outside scope. Own branch `codex/ett-qa-2026-11-23-e0d7`, frozen product
P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`, unchanged.

Filename recognition is tracked separately as [issue #382](https://github.com/OpenAEC-Foundation/open-office-studio/issues/382),
labels `rekenblad`, `bug`, `formaten`; label validation
[45180038178](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45180038178) passes.
No product fix or P5 intake is included.

**No ETT import/engine/save acceptance.** A qualified original producer fixture
is missing. There is separately an independently reproduced production
filename-classification failure, without a real ETT input or GUI claim.

## Actual production predicate

The [original software producer](https://www.wps.com/blog/how-to-open-convert-and-create-ett-file/)
defines ETT as a WPS spreadsheet template/master. Its general documentation is
not a downloadable original template, license grant or source-content oracle.

The actual P2 functions, executed in Linux Node through Vite, return:

| Input | Production result |
| --- | --- |
| Spreadsheet `bestandssoort('ett')` | `xlsx` |
| Catalog accepts `ett` input | true |
| `isSjabloon('policy-only.ett')` | **false** |
| `isSjabloon('policy-only.ETT')` | **false** |
| Existing STC/XLT/OTS filename predicate controls | true / true / true |

The ETT entry is absent from P2's `SJABLONEN` set. The generic post-import
new-document wrapper in `bereidOpenen` is guarded by `isSjabloon(filename)`.
Therefore skipping that wrapper for ETT follows from read-only code inspection.
**That wrapper consequence is an inference**, not an independently executed
ETT import/new-document/save/overwrite test. Source overwrite/data loss, native
GUI behavior and full template preservation are not asserted.

The actual no-desktop policy check uses a deliberately empty synthetic request,
zero bytes, filename `policy-only.ett`. No fake ETT file is created. With an
empty window and no Tauri bridge mock, the production capability reports no
runtime and the open function gives a concrete ETT limitation plus XLSX
alternative. This is a negative function-level guard test, not a hosted browser
UI or content import test. The strict template-recognition assertion then fails;
it was not weakened to accept the observed false result.

## Independent source search

[source-search-report.json](source-search-report.json) records 21 complete
official GitHub recursive trees at immutable refs. Each has `truncated=false`,
the response tree hash and entry count; `.ett` matching is case-insensitive.
No ETT path was found in these pinned inventories. These include LibreOffice's
sc subtree, Apache Tika/POI, libxls, openpreserve, format-commons, Spire, Aspose,
ONLYOFFICE, Sayi and other candidate repositories. New uninspected candidates
would stop the diagnostic instead of silently being dropped.

A separate public search result,
[openETCS Scade template](https://github.com/openETCS/modeling/blob/b1b6dc6603792c97c0f63891c60a33ca39beee2f/model/Scade/ScadeTemplates/openETCS_Scade_Template.ett),
is authenticated as 10872 bytes, Gitblob
`c6b5879a5e21bd5bfb9f9e64b4c4257550096980`, SHA256
`c79d42c6652d2411711e2b429ffa183740bbc29aea21f66a1317c8c8124e2e93`.
It is XML with root Project and `@STUDIO:PRODUCT=SC`, a different program's
template. It is not a WPS source, is not converted/imported and is not retained
as workbook evidence. This is a false search lead, not a claim of a forged file.

The search does not prove that no public ETT exists. No ET/XLS/XLT is renamed,
and no self-export or prior ET candidate is promoted to ETT proof. Qualified
producer/license/native-template identity and an independent cell/formula/
structure oracle remain open prerequisites under #30.

Open and closed ETT/template/sjabloon and WPS/Kingsoft-related issue searches
were checked. Relevant descriptions include the broad template overview #27 and
host-contract issue #109; all matching template-result descriptions were read.
No specific ETT filename-predicate duplicate was found. A narrow predicate report
is separate from the source gap and does not create a new aggregate overview.

## Exact test and retained evidence

[CI45179206300](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45179206300),
job137708305962, tested harness `f7a5ad286909b2700cf344a66acd4a1f0a06e3e5`:

- Public inventory/hash/foreign-format-lead diagnostics pass.
- Actual production no-desktop ETT limitation/XLSX alternative passes.
- Actual strict production template predicate **fails**, false versus true.
- Source gate, source import and full format acceptance remain **false**.

[policy-report.json](policy-report.json) retains the actual predicate outputs,
synthetic request's explicit role, policy error and separate code inference.
[result.json](result.json) records the whole scope and acceptance boundary.

The complete official [retained result ZIP](retained/ett-source-and-policy-result.zip),
artifact14820188677, is **4346 bytes**, SHA256
`382272cef3974da2e5392ce241e33cca0f38ee983c4253fd2e6c04ea684d6e74`.
The complete downloaded ZIP matches official metadata and its recorded workflow
head. It contains only reports, no original ETT file, synthetic positive fixture,
foreign-template bytes, Office runtime or installer.

The existing runtime-only artifact14805600515 and descriptor/verifier pins are
recorded in `scripts/qa-ett/unused-runtime-pin.json` but not downloaded or consumed
here. Actual P2 WASM SHA256
`2b1b74a572ad97bfe0f5bf25798fd123a46505a85b80a477792a180a13deddad`
is checked as identity only; the engine is never initialized.

## Remaining work and platform limits

An independently published genuine WPS spreadsheet template with producer,
license and native-template identity is needed before deriving its original
content/formula oracle and executing the agreed private-converter/engine/edit/
UndoRedo/XLSX-save/freshreopen route. No ET/XLS/XLT rename is sufficient.

No Office content conversion, actual WASM editing, save/reopen, full template
copy behavior, visual/style/macro/encryption or ETT-export acceptance. No native
Windows/Linux/macOS GUI, installer, real Tauri IPC or hosted browser UI was tested.
No product/catalog/current P5 intake/main/tag/release-publication change,
app/suite/Mac build or local GUI/capture/profile change. ET f51228f4, WQ2/#381
and all earlier proofs remain intact.
