# HWP3 / Hangul97 bounded native-content proof under #30

The integration coordinator assigned this one format exclusively on 2026-11-24. Only existing `lo-hwp-1` / `hangul97-3.0.hwp` is covered. HWP5, HWPX and other HWP variants are excluded. Previous LWP `8ce4bfdd`, WPD6 `084fb5ac` and WRI `7ba542fa` proofs remain unchanged.

## Source and application

- Application P2: `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
- [Pinned original LibreOffice source](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/hwpfilter/qa/cppunit/data/pass/hangul97-3.0.hwp), 11537 bytes, Git blob `68ff2f51269f3ab619f6465073518cd84694300c`, SHA256 `2c98104a01860c809c9192109f74b2231374f5ab266014e976a120572909f9f7`.
- Original bytes were reused from the existing catalog cache and checked. Upstream GPL/LGPL/MPL notices and README are retained; no per-fixture CC0 grant is asserted.
- Genuine 30-byte native HWP3 signature, subrevision 1, compressed flag set, encryption flag zero. Filename/publication identifies the Hangul97 fixture; no exact producer-build authentication is claimed.

## Oracle frozen before conversion

The independently expressed `native.py` follows the [official Hancom HWP3 format specification](https://cdn.hancom.com/link/docs/%ED%95%9C%EA%B8%80%EB%AC%B8%EC%84%9C%ED%8C%8C%EC%9D%BC%ED%98%95%EC%8B%9D3.0_HWPML_revision1.2.pdf), revision1.2/2014-11-05, SHA256 `1b5ce665fe0b75967d85f965a4b32737487935974b8e29120537e71cacefca87`. The relevant data/document/paragraph tables were rendered and visually inspected. The reference PDF is not redistributed. Pinned primary LibreOffice source layouts corroborate the record boundaries; no parser or converter output supplies source expectations.

The reader checks native bounds, raw Deflate EOF/CRC32/size, seven font-name tables, twelve styles, paragraph shapes, line records, per-character shape inheritance and exact hchar records. The expanded stream is 31698 bytes, SHA256 `1c62d2ee7d463ec5d0c2068f6b8c8cdc07042a6c4c6e1fd901a274d1b2ae8a1c`, CRC32 `5eaaf662`. Shape/font/style data is inventoried, not accepted as rendered fidelity.

Exactly two source paragraphs are decoded:

1. `Hello OpenOffice.org!`
2. `안녕하세요 오픈오피스!`

Both end with native control 13 at their declared final hchar; there are no other text control codes in this fixture and the native control masks are zero. The terminal zero-character paragraph is the list terminator, not a third empty source paragraph. Unknown controls and nonmodern Hangul would fail the bounded reader; they are not silently skipped.

## Korean charset proof

The own modern-Johab composition formula agrees with the independent Python Johab codec. Before converter execution, all 11172 mappings in the pinned [Unicode Technical Note60 version2 data](https://www.unicode.org/notes/tn60/tn60-2.txt) were cross-checked against both methods. Data size 464316 bytes, SHA256 `463bf47532273b09ed5e9218f4b9dd570ffbba7fef7f9529b5968af98cf8408d`; authored by Ken Lunde/Jaemin Chung, with [Unicode terms](https://www.unicode.org/copyright.html). This is a technical-note cross-check, not vendor HWP conformance. The complete reference table is downloaded privately and not redistributed in the result.

The nine unique actual source syllables and their raw codes are separately recorded. Output is compared as exact precomposed Unicode codepoints, with no normalization applied to hide differences. Hanja, archaic/incomplete Jamo and the rest of the HNC charset remain unaccepted. The edit prefix is `QA_HWP3_24NOV 한글 `, adding Korean text to the first paragraph before Undo/Redo/save/reopen.

## Route and limits

One targeted Linux CI job uses existing verified runtime-only artifact `14805600515`, the pinned coordinator descriptor/shared consumer/full ZIP/tar/source/tree/version/manifest/modes/symlinks/launcher/ELF checks, and P2's safe conversion profile. P5 queued Linux jobs have priority. No new app/suite/Mac build or full installer download.

The actual P2 production opening helper invokes a private converter CLI adapter, followed by real production-patched Word WASM edit/Undo/Redo/DOCX save, fresh-session reopen/resave and a separate new Node-process reopen/resave. Independent XML checks exact paragraph count/order/text, Korean codepoints, NFC without output normalization and absence of replacement/square glyphs.

No native GUI, Tauri IPC, installer, Windows/macOS runtime or hosted-browser acceptance is claimed. The browser limit is a real negative production-function check in Node without a desktop bridge. Fonts/style/shape rendering, summary content, opaque tail/tag semantics, macros/embedding/encrypted variants and other HWP versions are outside acceptance. `fullFormatAcceptance` remains false. No product/catalog/shared index/version/P5 intake/main/tag/publication changes.

## Duplicate check

Open and closed HWP/Hangul matches were searched and descriptions read; only closed catalog issue #43 matched HWP. Parent #30/#43 remain the existing overview. No independent product fault follows from the initial source qualification.

## Results

**PASS for the bounded two-paragraph content/charset/CR route. Full-format acceptance remains false.**

- [Linux run 45358706914](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45358706914), job `138322961613`, attempt 1, harness `760638c4a09a2e2e48d17bed8648e12d7bbbd738`, SUCCESS.
- Runtime-only artifact `14805600515`, full ZIP SHA256 `bac1a37b55deff80cabd4670c1bf65d76266285275c0552436dcc13fcdafa487`, tar SHA256 `f3308bea282aedc444a10a039ec2c4e3904915d4c6c0b5607b088108407fb2e3`; exact runtime/descriptor/shared-verifier/P2-profile receipts retained inside the result ZIP.
- Result artifact `14903970945`, 85053 bytes, full ZIP SHA256 `34da29e3b42dbd17a4cb111c0804da6b66cd868f8e3a9455d4cbed5f9837fb87`, expiry `2027-02-22T08:44:06Z`. Complete small ZIP and official artifact/run/job metadata are retained in Git.
- Actual production open helper/private converter and real production-patched Word WASM passed. Inserting the Korean-containing prefix, Undo/Redo, DOCX save, fresh-session reopen/resave and separate new Node-process reopen/resave retained exact source codepoints and edits. New PID 2927 started after original PID 2847 exited. Source and saved-input hashes remained unchanged; production JS/edit/layout identities matched across processes.
- Independent OOXML: **6 checks at each of 4 stages = 24 PASS**. The local offline audit reproduced the original converter-output/save/session-reopen/process-reopen reports exactly, without rerunning Office or Word. The full 11172-row charset check is an authenticated pre-runtime CI receipt; the offline audit rechecks actual source syllables and receipts, and does not redownload/replay the complete reference table.
- Three deliberate offline defects were correctly rejected: a wrong Korean syllable, canonically equivalent decomposed NFD output and an introduced third empty paragraph. No output normalization or empty-paragraph filtering hides a mismatch.
- Negative browser production-function check passed, with a clear desktop-runtime limitation and DOCX alternative. Hosted browser UI/native GUI/platform acceptance remains open/outside this proof.
- No independently reproduced product fault/new issue, extra CI retry, app/suite build or product/catalog/intake/main/publication change. Own CI sessions/loaders closed; no local GUI/capture or Office/Word execution started.

### Reproduce the offline audit

Use a fresh destination:

```sh
python -X utf8 -B scripts/qa-hwp3/analyse.py \
  --archive docs/tests/hwp3-2026-11-24/retained/result.zip \
  --metadata docs/tests/hwp3-2026-11-24/retained/artifact.json \
  --run docs/tests/hwp3-2026-11-24/retained/run.json \
  --job docs/tests/hwp3-2026-11-24/retained/job.json \
  --out .local/hwp3-independent-audit
```

This authenticates the complete result ZIP and exact run/source/runtime binding, independently rereads native text and actual Korean codes, rechecks saved XML and verifies three defect controls. It executes neither Office nor Word WASM. Machine-readable results are in `result.json`, `offline-analysis.json` and `charset-report.json`; original source/notices/reports/DOCX files remain inside the immutable original ZIP.
