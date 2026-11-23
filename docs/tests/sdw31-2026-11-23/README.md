# SDW: bounded StarWriter 3.1 native content route

Exclusive QA-only scope under #30, assigned by the existing integration chat on
2026-11-23. Branch `codex/sdw31-qa-2026-11-23-e0d7` starts at exact P2
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
Product, catalog, shared indexes and closed release intake stay unchanged.

## Actual outcome: strict source comparison remains false

The approved private converter and production open helper execute in
[initial CI 45188793344](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45188793344),
harness `7c9692437797ed2cc213dcc97a1597cd39b30e81`. Source diagnostics and the
negative no-desktop function job pass. The first XML checker mistakenly counts
paragraph-property tab-stop definitions as visible text tabs. That driver error
is corrected to inspect run content only; it is not a product tab-insertion bug.

[Replay CI 45189566903](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45189566903),
harness `9e5a85c1d8ae82defdaec1a793a93ead31171af0`, reuses the exact authenticated
small converter-result ZIP from the same unchanged P2 source. It does not
download or execute Office a second time. The actual production Word engine
opens that converted document, edits, Undo/Redoes, saves, reopens in a fresh
session and saves again. These downstream engine checks complete successfully.

Independent corrected XML replay establishes at **all three stages**:

- every original native paragraph/empty paragraph and exact spaces survive;
- all eleven explicit source list levels survive, with valid numbering/
  abstract-numbering references;
- there are 28 physical DOCX paragraphs versus27 native text nodes;
- paragraph27 is an additional empty paragraph containing only `pPr/sectPr`.

The first27 source nodes are not trimmed or normalized. The extra carrier is
not normalized away for strict source acceptance either: the final assertion
and replay CI remain **failed**, `strictSourceAcceptance=false`,
`downstreamEnginePassed=true`, `fullFormatAcceptance=false`.
Its normative/layout significance (including whether any extra page exists)
is unresolved. No new product bug or native/visual reproduction is invented.
The Word phase uses the actual converted paragraph vector as its explicit
downstream baseline; that does not turn conversion differences into a source pass.

[result.json](result.json) binds source, complete private runtime verification,
actual converter, production Word WASM/JS identities, all outputs, runs and
limits. The readable [offline analysis](offline-analysis.json) and
[engine report](engine-report.json) preserve these distinctions. A nonfatal
Vite WebSocket port warning occurs in the helper; it does not prevent the
observed real edit/save/reopen and is not a product/native result.

Three complete official artifacts are retained and their whole downloaded
ZIP digests checked against official metadata:

| Package | Artifact | Bytes | SHA256 |
| --- | --- | ---: | --- |
| [Initial runtime result](retained/initial-runtime-result.zip) | 14824513431 | 45586 | `11d5ca07b327e446e987e92b0e04f8af2977fa0048999fea66a4e01f5e96a6be` |
| [Engine replay result](retained/engine-replay-result.zip) | 14823984298 | 69186 | `1b733fc98968fa27d899964c770f22d496d0d78b12d1387857e2d12a20c804dc` |
| [Browser-limit functions](retained/browser-limit.zip) | 14823759655 | 1726 | `0eeb8c0c9efe0b3adc9ce4be996603281d644744302f0ce5a18779e6c9e2ae5f` |

These contain the small licensed source/notices and reports/outputs, no private
Office binary or full installer. Offline source/XML replay without Office:

```sh
python3 -B scripts/qa-sdw31/analyse.py
```

It verifies whole ZIPs, native bytes and actual DOCX XML independently. It
confirms observations, not successful strict source acceptance. Final evidence
changes add docs/offline analysis only; tested product/oracle/engine bytes stay
unchanged. Open and closed SDW/StarWriter/StarOffice Writer searches and relevant
overview descriptions were read; no new issue is created for an unresolved
carrier/layout observation. The prior DPT/#382/other proofs remain intact.

## Source reuse, provenance and license

The existing `lo-sdw-1` catalog source is reused, with its original cached
bytes authenticated before static inspection. Source:
`LibreOffice/core@92c170f11d44857d8e365f2e29fb449dfb567ff5`,
`writerperfect/qa/unit/data/writer/libstaroffice/pass/Writer_3.1.sdw`.
Introduced by `f471c55378290fb8dc3571c74cc6abe90d81c46c` on 2016-08-10.
Length 10752 bytes, Git blob `0884942a4c861019bcaea5841742b3726be4ef31`,
SHA256 `dafed6b2d84c531f6c1230ba024e5fe3083597b8a8905486c607ebe363785e69`.

The independent original regression publication
`fosnola/libstaroffice@94647518b5060456ace4ea724cd157582c059501`,
`regression/Text3.1/testText1.sdw`, has the identical Git blob and bytes.
CI checks both URLs and the pinned MPL 2.0/LGPL project notices/README. These
notices accompany the retained unchanged fixture; this is repository-distributed
regression data, not a separate CC0 or individually signed per-file grant.
Exact URLs/identities/notices and historical producer-layout references are
pinned in [fixture.json](../../../scripts/qa-sdw31/fixture.json).

The old Windows format-catalog outcome is historical reuse evidence only.
Its Word edit/layout hashes (`9e2025ad…`/`918f1677…`) match P2, but its conversion
profile hash `8f301a13…` differs from P2 `847721a3…`, and it does not establish
this exact frozen product source point or independent content oracle. It is
not relabeled as a new P2 native/platform result. Only the missing bounded route
is tested; no broad catalog/platform suite is rerun.

## Original native oracle before conversion

Own Python stdlib CFB/SW3 decoder follows length-bounded records rather than
scanning strings. `CompObj` identifies StarWriter 3.1. The document stream has
`SW3HDR`, document version `0x000b`, and its exact stream hash is checked.
The native password header flag is absent in this one fixture; that is not
general encrypted-document support or a macro-safety acceptance result.

The decoder verifies the native string pool, all top-level record boundaries,
content-node counts and nested `N`/`I`/`T` records. It derives:

- 27 ordered text nodes, including original empty paragraphs and exact spaces;
- two named native sections (`section1`, `section2`) and their record paths;
- paragraph style-pool associations and eleven explicit list-level bytes,
  including levels 0, 1, 3;
- zero native table/graphic/OLE content nodes in the accepted content tree.

Historical producer `Sw3IoImp::InTxtNode/InContents/InSection` source layouts
are pinned as primary format references. Upstream libstaroffice reader code
was also consulted for interpretation, but no such parser/producer is executed
to supply expected output. The own independent byte reader authenticates source
offsets, text, counts and levels directly. An upstream parser result, converter
result, or old saved DOCX is never substituted for the source oracle.

The DOCX XML checker independently compares every paragraph/empty paragraph,
zero tables and the eleven explicit source list levels. The engine inserts
`QA_SDW31_23NOV ` at the start of the first paragraph, checks Undo/Redo, saves
DOCX, reopens in a fresh real Word session, saves again, and repeats XML checks.
Original source bytes must remain unchanged.

**Full-format acceptance remains false.** Native section names are inventoried,
not silently equated with Word section names. Column/page geometry, all style
properties, list labels/start/restart rules, sentinel 200 semantics, opaque
attribute/mark/drawing/printer records, OLE/macro fidelity, rendering and other
SDW versions remain outside acceptance. This is not a flat-text full-format pass.

## Runtime, helper and browser boundary

The focused Linux workflow consumes only the already approved shared private
runtime-only artifact `14805600515`, with the existing exact coordinator
descriptor/Git bytes, complete official ZIP digest, tar, unchanged shared
consumer, manifest, mode/symlink/source/tree/version, launcher/ELF and parent
package checks. It does not download the full suite ZIP/DEB or build a runtime.
The source oracle completes first; browser-limit and runtime jobs then proceed
independently. P2's exact safe profile is copied to an isolated temporary
conversion profile; tokens/system runtime overrides are removed from the
converter child. The original shared input and prior proofs remain untouched.

Actual production `bereidOpenen` calls the narrow CLI adapter with real source
bytes; the approved converter produces the DOCX. This adapter is not native
Tauri IPC or standalone-app acceptance. The real production-patched Word
session checks the unchanged P2 edit/layout WASM identities and JS bindings;
no alternate kernel, positive mock or substitute document is used.

The negative browser boundary uses actual P2 functions in Linux Node/Vite SSR,
an empty window/no Tauri bridge mock, and the actual source bytes. It must
explain SDW's runtime limitation and recommend DOCX. This is not a hosted-browser
UI test. No new Windows/macOS/native Linux GUI, installer, visual or font-rendering
acceptance is claimed. No local GUI/capture/profile session is created.

Replay the source oracle without Office execution:

```sh
python3 -B scripts/qa-sdw31/oracle.py source
```

Runtime/engine execution is restricted to the own Linux CI workflow. Package
bindings and small reports/outputs are retained after the actual run. Any
independent confirmed defect requires open/closed duplicate-description checks
and scoped coordination; no product fix or integration-intake expansion occurs.
