# PSW: one genuine Pocket Word binary route

Exclusive scope under #30 assigned by the existing integration chat on
2026-11-23. WRI was only a crossing proposal and received no claim, branch or
runtime execution. Earlier SDW/DPT/other proofs remain intact.
Branch `codex/psw-qa-2026-11-23-e0d7` starts at exact P2
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
No product/catalog/shared-index/intake/build/release changes.

## Actual result: strict source mismatch retained

[CI 45192485858](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45192485858)
tests harness `fe55bde7978f5f3b58bc90e6a823680b5e44ae87` on Ubuntu 22.04,
Node 22.23.5. Source diagnostics and the separate negative no-desktop function
job pass. The shared private runtime is fully verified, real conversion and
production helper execute, and actual production Word edit/Undo/Redo/DOCX save/
fresh session reopen/second save complete successfully.

All three output stages retain one paragraph, all 187 original printable
codepoints and Courier New/10 pt. The two original `0x0a` bytes are absent in the
converted DOCX and remain absent after editing/save/reopen. The source has 189
codepoints including those controls; their native semantics are not independently
proven. The original expectation is not trimmed or relaxed: the final strict
assertion fails and CI remains **failed**, with `strictSourceAcceptance=false`,
`downstreamEnginePassed=true`, `fullFormatAcceptance=false`.

This is not a confirmed newline/layout/data-loss bug and no new issue is made.
The engine phase's explicit baseline is the actual converted paragraph vector;
its success does not establish fidelity of conversion to the native source.
A nonfatal Vite WebSocket-port warning is captured; actual downstream operations
still complete, and no native or hosted-browser UI behavior is inferred.

[result.json](result.json) binds the complete source/runtime/package/test
identity; [source-oracle.json](source-oracle.json),
[engine-report.json](engine-report.json) and the three XML reports preserve
each stage. The [offline analysis](offline-analysis.json) independently replays
the original byte oracle and actual DOCX XML. Static replay without Office:

```sh
python3 -B scripts/qa-psw/analyse.py
```

Two complete official artifacts are retained, with whole downloaded ZIPs
verified against official metadata:

| Package | Artifact | Bytes | SHA256 |
| --- | --- | ---: | --- |
| [Runtime/source/engine result](retained/psw-runtime-result.zip) | 14826916824 | 39947 | `0aef29aabbff02f83ffa16bce7f465643953567348778379fe06d8e7b2d5d438` |
| [Negative browser functions](retained/psw-browser-limit.zip) | 14824958989 | 1598 | `c34700d8f16b3d98ae1729d60a48c59ea01c8047748b593c1a7a4b573dd1667c` |

Only the small CC0 source/notices, outputs and reports are retained; no private
runtime binary or installer. The final evidence commit adds docs/offline static
analysis only and does not change the tested product, oracle or engine code.

## Authentic source reuse and license

The cached original `lo-psw-1` bytes were reused and authenticated. The catalog
copy is `LibreOffice/core@92c170f11d44857d8e365f2e29fb449dfb567ff5`,
`writerperfect/qa/unit/data/writer/libwps/pass/PocketWord.psw`, introduced by
`9b9d668d45dce3f318d89d54725a4d6cfc750315` on 2020-09-27.

The independently published original is
`alexschiller/file-format-commons@0d508180dfeece7ac8b3e87bd2093755e3f356b1`,
`files/ffc.psw`, introduced by `5b36d9ea16a82bcc8963bf470dd0e62017b92804`
on 2015-06-01. Both copies have 752 bytes, Git blob
`75c0b60f397cfa1ceb96059abab2bf98fa890bea`, SHA256
`bef5eeabfc34d59d14f7f66796aca17a0b1231c1015ce3d0bc9d32e0c8cf1740`.
The original publisher labels it Pocket Word and supplies CC0-1.0. Exact source,
license and README URLs/hashes are pinned in
[fixture.json](../../../scripts/qa-psw/fixture.json); CI verifies both copies
and retains the license/README with the unchanged original.

This is genuine length-delimited binary Pocket Word data with the shared
`{\pwi` family signature and version 6, not RTF, DOCX, WPS or Microsoft Works.
Here 6 is an internal header value, not an inferred application release number.
It was not renamed or self-exported by this QA. The evidence covers this
original published `.psw` and internal variant, not a separate PWI/ink route or
every Pocket Word version.

The old Windows catalog test only established open/save/reopen. It does not
establish this frozen P2 source/safe-profile/content oracle. The original raw
bytes/provenance are reused; the missing qualified P2 route is tested without
a broad format/platform suite rerun.

## Source-derived oracle before converter execution

Own Python stdlib reader verifies the binary header, all nine record lengths,
unique IDs, the paragraph-list reference to text record 35, and its full payload
boundaries. The source has one paragraph record, a two-entry UTF16 font table
(Tahoma/Courier New), E5 font selections, E6 size commands and C4 end marker.
All 189 original text codepoints have active Courier New/10 pt. The stored line
geometry count 8 is not confused with paragraph count or accepted as rendered
line layout. Two literal `0x0a` bytes remain at source offsets 485 and 638.

The own reader separately verifies the binary-digit text line by decoding it
back to `file format commons`. It does not copy converter output as expected
content. A pinned primary-parser distribution mirror was consulted for the
byte grammar; no libwps/parser/producer was executed to supply the oracle.
The actual source field values and offsets are checked directly, not inferred
from a shared parser result alone.

Strict text comparison retains both original `0x0a` codepoints. Their exact
native control semantics are **not independently proven**; a mismatch must
stay visible without inventing a confirmed whitespace/layout bug. No trimming,
collapsing or deleting separators to obtain a passing import result.

Independent DOCX XML checks inspect visible run content (never paragraph-property
tab-stop definitions), paragraph/table structure, and effective font family/size
through run/paragraph/style/default inheritance. Actual Word engine checks use
the converted XML paragraph vector as an explicitly separate downstream
baseline: edit `QA_PSW_23NOV ` at the start, Undo/Redo, DOCX save, fresh session
reopen, second save and independent XML. Downstream success cannot turn strict
source discrepancies into an import pass. Original source bytes stay unchanged.

**Full-format acceptance remains false.** No original headings/tables/lists
are present, so their support is not accepted. Page/line geometry, other styles,
opaque records, object/ink/sound/macro behavior, rendered fonts, other encodings
and PSW variants remain outside acceptance.

## P2 runtime and platform boundaries

The existing approved runtime-only artifact `14805600515` is the sole Office
input. Complete official ZIP digest, pinned coordinator descriptor/Git bytes,
tar/shared verifier/manifest/modes/symlinks/source/tree/version/launcher/ELF and
parent package bindings are checked using the same established consumer.
P2's exact safe profile is copied to an isolated temporary profile; token and
system runtime overrides are removed from the converter child. No full release
ZIP/DEB, alternate runtime, app/suite/Mac build or local producer/SDK is used.

The production open helper calls the actual private converter CLI adapter.
The actual production-patched Word SDK verifies its P2 edit/layout WASM and
JS identities. This is neither a Tauri IPC nor native installer/app test.
The browser boundary is a separate negative P2-function test in Linux Node/
Vite SSR with an empty window, no Tauri mock: it must explain the PSW runtime
limit and recommend DOCX. No hosted-browser UI or native Windows/Linux/macOS
acceptance, visual rendering or macro support is claimed. No local GUI/capture/
profile session is created.

Static source replay without Office:

```sh
python3 -B scripts/qa-psw/oracle.py source
```

Runtime/engine execution occurs only in the own Linux CI. Actual package,
source and test bindings and the small original/results will be retained after
the run. Open and closed PSW/Pocket Word issue searches returned no matching
scoped report; #30/#43 descriptions were read. Only independently confirmed
defects with qualified semantics may be registered after coordination, with
no duplicate issue or product/intake expansion.
