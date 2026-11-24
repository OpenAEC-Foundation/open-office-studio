# ZABW original compressed-input route under #30

Only the original published `lo-zabw-1` / `hello.zabw` fixture is covered. The integration coordinator assigned ZABW exclusively on 2026-11-24. Earlier ABW `f30db273`, HWP3/LWP/WPD6/WRI proofs remain unchanged. The ABW runtime pass is not transferred to this distinct compressed-input route.

## Source and application

- Exact P2 application `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
- [Original LibreOffice compressed fixture](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/writerperfect/qa/unit/data/writer/libabw/pass/hello.zabw), 1128 bytes, blob `c83395b8600887d7b689961b9e081ec46888458d`, SHA256 `dd4d8ebd37434315c3194d4d1251f507be791e03e44ee3736e17a2fbb32f9206`.
- Existing original raw bytes and source notices are reused. No synthetic gzip export is accepted as positive input evidence. Upstream GPL/LGPL/MPL notices and README are retained; no individual CC0/producer-binary authentication is asserted.

## Container and actual XML oracle before runtime

Following [RFC1952](https://www.rfc-editor.org/rfc/rfc1952.txt), the own wrapper verifies the actual gzip member: Deflate method 8, FNAME flag 8, original filename `hello.abw`, 20-byte header, 1100 compressed bytes, 8-byte trailer, CRC32 `b2fc4ff0`, ISIZE 2615, EOF with no surplus or extra member. Expansion is bounded by the QA reader to 1000000 bytes; this is not a product size limit.

Actual decompressed XML is 2615 bytes, SHA256 `ddcde2c8876a316a8e02501202c1316e9e7c52d8728c7d78e43ccd41ade45d50`, byte-for-byte equal to the independently published original ABW fixture. This verified byte identity permits reuse of the exact XML reader at `f30db273:scripts/qa-abw/native.py`, Git blob `204fc6261042e6f75cc265c55ab123e9a890773f`, SHA256 `d1f05cfb24a4c5a3baafd3878a61ba35627805df22830a374dd213296fa630cb`. It does not prove the compressed importer route, which is exercised separately.

The XML independently declares one ordinary document, one section/paragraph containing `hello world`, Normal style with encoded Times New Roman 12pt, left alignment and Letter dimensions 12240 by 15840 twips. No external DTD is fetched. The separate edit is `QA_ZABW_24NOV ` at offset zero. Independent OOXML checks text, type, structure, effective encoded ASCII face/size, alignment and dimensions after each output stage.

Four synthetic container controls are clearly distinct from the genuine positive fixture: corrupt CRC and truncated trailer are invalid; concatenated valid members are outside this one-member fixture contract; excessive expansion is outside the QA reader bound. Their rejection tests the oracle only, not the application's handling of all gzip variants. Concatenation is valid gzip generally and is not reported as a product defect.

## Real route and test boundaries

The actual production opening helper receives the original compressed bytes with `from=zabw`, and the private CLI adapter writes `invoer.zabw`. The testdriver does not substitute the uncompressed ABW/XML for the converter input. Converter report/source hash/argv attest this boundary. One targeted Linux job uses the existing fully verified runtime-only artifact `14805600515`, coordinator descriptor/shared consumer/source/tree/version/manifest/modes/symlinks/launcher/ELF and safe P2 profile, with P5 Linux queue priority.

The actual patched Word engine performs edit/Undo/Redo/DOCX save, fresh-session reopen/resave and a new Node-process reopen/resave. The original ZABW remains unchanged. The browser check is only the real negative production capability function without a desktop bridge.

Encoded font labels/properties do not prove installed fonts, glyph rendering, wrapping or visual pagination. Metadata/history/RDF, other styles/richer AWML, ZABW export, other compression variants, native GUI/Tauri IPC/installer, Windows/macOS and hosted-browser UI are outside acceptance. `fullFormatAcceptance` remains false. No product/catalog/shared index/version/intake/main/tag/publication change, new app/suite/Mac build or full installer download.

## Duplicate check

Open and closed ZABW and compressed-AbiWord searches returned no matches. Existing #30/#43 remain the overviews. No extra aggregate issue or independently reproduced product bug is asserted from container qualification alone.

## Results

**PASS for the independently executed original ZABW compressed-input route and declared XML scope. Full-format acceptance remains false.**

- [Linux run 45362594875](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45362594875), job `138336125899`, attempt 1, harness `c8a783153a915577e25e1f7dd2ebc89e439719c4`, SUCCESS. This is a new ZABW run, not the earlier ABW run.
- Runtime-only artifact `14805600515`, ZIP SHA256 `bac1a37b55deff80cabd4670c1bf65d76266285275c0552436dcc13fcdafa487`, tar SHA256 `f3308bea282aedc444a10a039ec2c4e3904915d4c6c0b5607b088108407fb2e3`; exact descriptor/shared-verifier/source/tree/version/profile receipts retained inside the result.
- Result artifact `14904668447`, 70012 bytes, complete ZIP SHA256 `81d42e807ee043744174a4a0467fbd269aeda85859da285a48688aa6762413fe`, expiry `2027-02-22T09:10:03Z`. The original official artifact name is `abw-targeted-result`, a copied QA-label oversight; ID/run/head/source/argv binding independently identifies ZABW. Original metadata/ZIP are preserved unchanged. Only the future workflow label is corrected to `zabw-targeted-result`; no runtime retry was made for naming.
- The initial reader SHA described Windows CRLF worktree bytes (`97b0dc1290878ab03bb3b1ef9eae61ae781756b9481ab8d095753d69096681e7`). The final pin explicitly describes canonical Git blob bytes (`d1f05cfb24a4c5a3baafd3878a61ba35627805df22830a374dd213296fa630cb`). Executed harness and current reader both have Git blob `204fc6261042e6f75cc265c55ab123e9a890773f`; local worktree comparison normalizes CRLF only. This provenance clarification changes neither the executed reader nor source/runtime results.
- Actual original compressed-source hash reached the production helper/CLI as `invoer.zabw`, followed by real production-patched Word edit/Undo/Redo/DOCX save, fresh-session reopen/resave and separate new Node-process reopen/resave. New PID 3280 started after original PID 3200 exited. Original ZABW/input-save hashes remained unchanged, and JS/edit/layout identities matched across processes.
- Independent OOXML **8 checks at each of 4 output stages = 32 PASS**. Offline audit independently reread the compressed source/container/XML and reproduced original reports exactly without Office/Word execution. Four authenticated pre-runtime container qualification controls passed; the unchanged XML checker already had typed negative-control evidence in the earlier ABW proof, without transferring any ABW runtime acceptance.
- Real negative browser production-function boundary passed; native GUI/Windows/macOS/hosted-browser UI remain outside this proof. No reproduced product fault/new issue or product/catalog/intake/main/publication change. No extra app/suite/Mac build or full installer download. Own CI sessions/loaders closed; no local GUI/capture/Office/Word/helpers were started.

### Reproduce the offline audit

Use a fresh destination:

```sh
python -B scripts/qa-zabw/analyse.py \
  --archive docs/tests/zabw-2026-11-24/retained/result.zip \
  --metadata docs/tests/zabw-2026-11-24/retained/artifact.json \
  --run docs/tests/zabw-2026-11-24/retained/run.json \
  --job docs/tests/zabw-2026-11-24/retained/job.json \
  --out .local/zabw-independent-audit
```

This authenticates the complete archive and exact source/run/runtime binding, the executed XML-reader Git bytes, gzip source/CRC/bounds, original compressed converter input and four output stages. It does not execute Office/Word or reclassify gzip concatenation as invalid. `result.json`, `offline-analysis.json` and `container-controls.json` expose scope and provenance. Raw source/notices/reports/DOCX remain in the retained original ZIP.
