# LWP96 bounded source-content proof under #30

This independent QA branch covers only existing catalog fixture `lo-lwp-1`, `paragraphProperties.lwp`. The integration coordinator assigned LWP exclusively to this chat on 2026-11-24. WPD6 `084fb5ac` and WRI `7ba542fa` remain unchanged.

## Source and application

- Application P2: `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
- [Pinned original LibreOffice fixture](https://github.com/LibreOffice/core/blob/92c170f11d44857d8e365f2e29fb449dfb567ff5/lotuswordpro/qa/cppunit/data/paragraphProperties.lwp): 23172 bytes, blob `dc4048cb92204c15784d78afa2a4b64f2b8c77a4`, SHA256 `812888b2b621c2fe397881052d4bf8d755037adee9427320d9ea704dbcc66f91`.
- Bytes were reused from the historical catalog cache and verified, rather than regenerated or renamed from a modern document. Upstream GPL/LGPL/MPL notices and README are retained with the result; no separate per-fixture CC0 grant is asserted.
- Native `WordPro` preamble and `LWP7` file header: file revision 17, app revision `0x0900`, app release 5278. The first native paragraph says it was created using Lotus Wordpro release 9.6 for Windows. This is source content, not independent authentication of the producer build; the header does not uniquely establish one producer version.

## Native oracle before runtime

The own static reader in `scripts/qa-lwp96/native.py` reads bounded object headers, zero/literal RLE, root/leaf indexes, compressed object identities, timetable identities and linked paragraph records. It verifies 369 objects, 367 indexed non-index object identities, 45 paragraph objects and a 28-paragraph story chain. It resolves paragraph text through native frib lengths/modifiers and validates paragraph property bounds. The designated story is `[1, null, 150]`, starting at paragraph `[1, null, 155]`.

The oracle accepts only the first sixteen ordinary ASCII story paragraphs, including two empty paragraphs and the trailing space in the 2cm sentence. All accepted fribs are text/EOP, and no revision modifier is accepted in the prefix. Center alignment on paragraph 11 is separately derived from `PAln` to `VO_ALIGNMENTPIECE` 196, with override/apply bit 1 and native alignment type 2. Exact text and property expectations were frozen before any converter ran.

The pinned primary LibreOffice layout sources and hashes are listed in `fixture.json`. This reader is independently expressed and operates on source bytes; neither converter output nor a lib/parser execution supplies its expected content. The runtime importer shares LibreOffice source lineage, so this is not independent vendor-spec conformance or a full-format claim.

The root ends at offset 18225; the remaining 4947 bytes stay opaque. The alignment piece has a three-byte opaque tail. Later tables, frames, bullets, page breaks, headers/footers, character/font formatting, border/shading, indent/line-spacing inheritance and rendered geometry are not accepted. Sentences that describe such formatting are checked as text only. `fullFormatAcceptance` remains false.

## Route and test level

One small Linux CI job consumes the previously approved private runtime-only artifact `14805600515`. Full ZIP/tar digests, coordinator descriptor Git bytes, shared verifier, source/tree/version, manifest/modes/symlinks/launcher/ELF and P2 safe-profile checks are required. No installer/suite download or app build. Queue checks give queued P5 Linux jobs priority.

The actual P2 production opening helper invokes a private converter CLI adapter. The real production-patched Word WASM engine performs insertion/Undo/Redo/DOCX save, a fresh session reopen/resave, and a separate subsequent Node process opens/resaves the exact original saved bytes. Independent OOXML inspects the first sixteen body paragraphs and resolves effective paragraph alignment through direct properties/style inheritance/defaults.

This is not native GUI, Tauri IPC, installer, Windows/macOS runtime or hosted-browser UI acceptance. The browser boundary uses the real negative production capability functions without a desktop bridge. No product, catalog/shared index, version, P5 intake, main/tag or publication changes are made.

## Duplicate check

Open and closed LWP/Lotus Word matches were searched, including descriptions. Only closed catalog issue #43 matched LWP; parent #30 and #43 descriptions were read. No new product fault is asserted by source qualification alone.

## Results

**PASS for this bounded source-content and engine route. Full-format acceptance remains false.**

- [Linux run 45356814684](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45356814684), job `138316556238`, attempt 1, harness `1b5bf94cc7968517f771d42c37f79eba58563c30`, SUCCESS, finished `2026-11-24T08:32:18Z`.
- Runtime-only artifact `14805600515`, ZIP SHA256 `bac1a37b55deff80cabd4670c1bf65d76266285275c0552436dcc13fcdafa487`, tar SHA256 `f3308bea282aedc444a10a039ec2c4e3904915d4c6c0b5607b088108407fb2e3`. The full runtime binding, source/tree/version, safe-profile and shared-verifier receipts are retained in the original result ZIP.
- Result artifact `14902786728`, 126989 bytes, full ZIP SHA256 `ada9d97455368c8cbc0cbf4fdf33f8f53e03e5fa675980718ea34a5996f7c04f`, expiry `2027-02-22T08:31:08Z`. Complete small ZIP and official artifact/run/job metadata are retained in Git.
- The real production converter/open helper and patched Word WASM passed. Editing the first paragraph with `QA_LWP96_24NOV `, Undo/Redo, DOCX save, fresh-session reopen/resave and a new Node-process reopen/resave all preserved the declared prefix. Node PID 2855 started after original PID 2776 exited; original saved-input hash remained unchanged. Source bytes and production JS/WASM identities were checked.
- Independent XML passed **18 cases at each of four stages = 72 checks**: converter output, edited save, fresh-session save, new-process save. The later static audit reproduced the original reports exactly without executing Office or Word again.
- Two deliberate offline defects were correctly rejected: changed source text and direct left alignment replacing the encoded center alignment. Original source/hash and active production code remain unchanged.
- The actual negative browser-capability function rejects LWP without a desktop runtime and suggests DOCX. This is a function check, not a hosted UI pass.
- No product issue was reproduced in the accepted scope. No extra CI retry, app/suite build, main/tag or release publication. No own local GUI/capture/helper resources were started. CI sessions/loaders were closed.

### Reproduce the offline audit

Use a fresh output directory:

```sh
python -B scripts/qa-lwp96/analyse.py \
  --archive docs/tests/lwp96-2026-11-24/retained/result.zip \
  --metadata docs/tests/lwp96-2026-11-24/retained/artifact.json \
  --run docs/tests/lwp96-2026-11-24/retained/run.json \
  --job docs/tests/lwp96-2026-11-24/retained/job.json \
  --out .local/lwp96-independent-audit
```

This verifies the complete result ZIP, official source/run binding, native source oracle, runtime/profile/engine receipts, all four saved outputs and two defect controls. It runs neither Office nor Word WASM. Machine-readable outcomes are in `result.json` and `offline-analysis.json`; the raw source/notices/DOCX/results remain inside the original immutable ZIP.
