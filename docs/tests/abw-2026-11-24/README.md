# ABW bounded native-XML proof under #30

The integration coordinator assigned ABW exclusively to this chat on 2026-11-24. Only the existing `lo-abw-1` / `hello.abw` route is covered; ZABW is excluded. Earlier HWP3/LWP/WPD6/WRI proofs remain unchanged. Native Windows-WRI testing belongs to the other designated chat.

## Source and application

- P2 application `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
- [Original pinned LibreOffice fixture](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/writerperfect/qa/unit/data/writer/libabw/pass/hello.abw), 2615 bytes, blob `8103ce8236b73c1fd4acc2a4386f05131b0b7e8a`, SHA256 `ddcde2c8876a316a8e02501202c1316e9e7c52d8728c7d78e43ccd41ade45d50`.
- Original cache bytes were reused and verified, not self-exported or renamed from another format. The source is native uncompressed AbiWord AWML XML, `fileformat=1.0`, `version=0.99.2`, `template=false`, with AbiWord generator metadata. No exact producing binary is authenticated by these metadata alone.
- Upstream GPL/LGPL/MPL notices and README are retained; no per-fixture CC0 grant is asserted.

## Source-derived oracle before runtime

`native.py` parses the original AWML namespace, sections, paragraph/character elements and named style/property inheritance directly. It neither fetches the external DTD nor executes an importer as an oracle. Original XML supplies all expected text/properties. The [official AbiWord source mirror](https://github.com/AbiWord/abiword/tree/6940426ea7fd3810f1aa5477fa93c2d4278dea7d) provides pinned vocabulary/property corroboration; exact paths/digests are in `fixture.json`.

Declared source expectations are one ordinary document, one section, one paragraph/character span containing exactly `hello world`, Normal style with Times New Roman 12pt, left paragraph alignment and Letter portrait dimensions (12240 by 15840 twips). The edit is the prefix `QA_ABW_24NOV ` at offset zero. The same encoded font/size is expected for inserted text.

The independent OOXML reader checks ordinary-document main content type, section count, paragraph count, exact text, effective ASCII font-family and half-point size per text character, alignment and explicit page dimensions. It follows character/paragraph style inheritance, document defaults and theme font references; paragraph-mark run properties are not misapplied to body characters.

These checks concern encoded XML labels/properties. They prove neither an installed Times New Roman font nor its rendered glyphs, wrapping, pagination or visual fidelity. Metadata/history/RDF, remaining style properties and richer AWML content are outside acceptance. This simple fixture does not establish broad ABW support. `fullFormatAcceptance` remains false.

## Runtime and test level

Only the already approved private Linux runtime-only input `14805600515` is used. Full ZIP/tar identity, coordinator descriptor/shared consumer, exact source/tree/version, manifest/modes/symlinks/launcher/ELF and P2 safe-profile checks are required. Queue guards prioritize critical queued P5 Linux work. No app/suite/Mac build or full installer download.

Actual P2 production opening policy invokes a verified private CLI adapter, followed by real production-patched Word WASM edit/Undo/Redo/DOCX save, fresh-session reopen/resave and a subsequent separate Node-process reopen/resave. Independent XML inspects every stage. Browser coverage is only the actual negative production capability function in Node without a desktop bridge; no hosted UI/native GUI/Tauri IPC/installer/Windows/macOS acceptance follows.

No product, catalog/shared index, version, release intake, main/tag or publication changes.

## Duplicate check

Open and closed ABW/AbiWord issue searches returned no matches. Existing parent #30 and catalog #43 remain the overview; no extra umbrella issue is created. Only a newly independently established fault would justify a separate bounded issue after focused duplicate review.

## Results

**PASS for the declared content/structure/type and encoded properties. Full-format acceptance remains false.**

- [Linux run 45361104855](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45361104855), job `138331103369`, attempt 1, harness `174b2e73d100ccab82582f8a20fa23e007e508e0`, SUCCESS.
- Runtime-only artifact `14805600515`, ZIP SHA256 `bac1a37b55deff80cabd4670c1bf65d76266285275c0552436dcc13fcdafa487`, tar SHA256 `f3308bea282aedc444a10a039ec2c4e3904915d4c6c0b5607b088108407fb2e3`; exact descriptor/shared-verifier/runtime/source/profile binding retained inside the result ZIP.
- Result artifact `14904373156`, 69213 bytes, full ZIP SHA256 `0815a55a1c06948d748ff0bc770df98b24f54c4b959f1ff92f85a30258860e7a`, expiry `2027-02-22T09:00:33Z`. The complete small ZIP and official artifact/run/job metadata are retained in Git.
- Actual production opening helper/converter and patched Word WASM passed. Prefix insertion, Undo/Redo, DOCX save, fresh-session reopen/resave and separate new Node-process reopen/resave preserved the declared text/properties. PID 2766 started after original PID 2685 exited. Source/input-save hashes stayed unchanged and production JS/edit/layout identities matched across processes.
- Independent XML passed **8 checks at each of 4 stages = 32 PASS**. The local offline audit reproduced each original stage report exactly without rerunning Office/Word. Wrong source text, an explicit wrong direct-run font overriding the inherited face, and a template main content type were correctly rejected in three deliberate offline controls.
- Actual negative browser capability check passed and gives a concrete runtime limitation with DOCX alternative. This is not a hosted-browser UI pass.
- No reproduced independent product fault/new issue, extra runtime/CI retry or app build. Own CI sessions/loaders were closed. No local GUI/capture/Office/Word/helpers were started; ignored static source/reference/result scratch remains local.

### Reproduce the offline audit

Use a fresh destination:

```sh
python -B scripts/qa-abw/analyse.py \
  --archive docs/tests/abw-2026-11-24/retained/result.zip \
  --metadata docs/tests/abw-2026-11-24/retained/artifact.json \
  --run docs/tests/abw-2026-11-24/retained/run.json \
  --job docs/tests/abw-2026-11-24/retained/job.json \
  --out .local/abw-independent-audit
```

This authenticates the complete ZIP and exact source/run/runtime binding, independently rereads the AbiWord XML, rechecks four output stages and rejects three deliberate defects. It executes neither Office nor Word WASM. `result.json` and `offline-analysis.json` contain machine-readable outcomes. Original source/notices/reports/DOCX files remain in the immutable original result ZIP.
