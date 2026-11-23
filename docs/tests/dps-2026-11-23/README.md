# DPS: source qualification gap, not an import pass

Exclusive QA-only scope under #30, assigned by the integration chat on
2026-11-23. DPT and other formats are outside this route. Product P2 remains
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.

This investigation has **no qualified DPS fixture/content oracle**. Source,
import and full-format acceptance remain false. Green diagnostics would mean
only that the documented candidate distinctions and negative production policy
are reproduced. No source was renamed/exported to manufacture import evidence.

Actual [Linux CI45183381288](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45183381288),
job137722637243, completed successfully on QA harness
`dffae9611d101db35795fa258305a3456e223d7f`. It ran the source diagnostics and
actual negative production functions; this green result is not DPS import
acceptance. The final evidence commit adds only documentation/reports.

Retained [official result ZIP](retained/dps-source-and-policy-result.zip),
artifact14822961232, contains exactly `source-gate-report.json` and
`policy-report.json`: 7125 bytes, SHA256
`171d9a0939fadf89961ed8b41d01bf01799ca4555cd507adc80cf9b8fccb61b8`.
The entire downloaded ZIP was verified against official artifact metadata,
retained in [artifact.json](artifact.json). The source gate and every content/
format acceptance field are false; only diagnostic/policy checks are true.

## Three independently published candidates

Exact immutable Git paths, blobs, full-file hashes, sizes, introduction commits
and control/license/loader identities are in
[`sources.json`](../../../scripts/qa-dps/sources.json).

- **E-iceblue Spire.Presentation-for-Java** publishes `Sample_dps.dps` and
  explicitly loads it with `FileFormat.DPS`. Its CFB property18 names WPS
  Presentation (`WPS 演示`), with build `2052-11.1.0.14309`. This is specific
  publisher evidence, stronger than a filename alone. However, the complete
  pinned 544-entry tree contains no LICENSE/LICENCE/NOTICE path, and the license
  API at that ref returns404. Its README temporary SDK-license link does not
  establish a sample-file redistribution grant. The official sample portal
  links the repository but no applicable sample grant was found in the reviewed
  sources. This is a bounded evidence gap, not a claim about every possible
  license source. No SDK installed/executed, no DPT conversion executed, and no
  sample bytes redistributed in this proof.
- **Sayi/poi-tl**, Apache-2.0 project distribution, has a generic attachment
  `.dps` alongside `.ppt`. The `PowerPoint Document` and `Current User` streams
  are byte-identical; only property streams differ, with362 changed file bytes.
  That publication does not independently document a native DPS producer/save
  process. Equal streams do not prove renaming or fraud.
- **Tom60chat/Extension-List**, Unlicense project distribution, has a real
  125440-byte CFB `.dps`, not its unrelated ET text placeholder. All four
  streams differ from its same-publication PPT control. Its application property
  names Microsoft Office PowerPoint; build metadata is `1036-11.2.0.10307`.
  Generic corpus instructions and the introducing commit do not establish the
  original native DPS producer/save process. Neither identity nor renaming is
  asserted. Different bytes alone do not qualify native DPS fidelity.

The [WPS producer's command reference](https://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/jsapi/idmso-list/wpp-idmso-reference)
lists `FileSaveAsDps` separately from `FileSaveAsDpt` and `FileSaveAsPpt`.
That defines the requested route, not the origin of these individual files.
PPT controls are read-only provenance comparisons, not an extra active format.

The own stdlib CFB reader authenticates container streams and selected metadata
directly from original bytes. It **does not derive or claim an ordered live
slide/text/object/geometry/media oracle**. Historical/dead stream records and
converter output are not silently substituted for that missing oracle.

Thirteen complete pinned repository inventories are checked: the three
candidates plus ten focused source/test corpora. The Spire.Office-for-Java
copy has the same Git blob as the unlicensed Spire sample, not an independent
source. Empty results mean only no DPS-named path in these pinned trees.

## Reproduction and limits

Source-only static diagnostics (Python stdlib, public network):

```sh
python3 -B scripts/qa-dps/source_gate.py
```

The own GitHub workflow runs actual P2 functions in Linux Node/Vite SSR:

```sh
pnpm install --frozen-lockfile --ignore-scripts
node scripts/qa-dps/policy.mjs
```

It verifies unchanged P2 product bytes/tree, DPS presentation input, ordinary
document filename classification, no DPS export declaration, and the actual
negative no-desktop open policy giving a PPTX alternative. Its explicit empty
synthetic request is **not a source fixture/content test**. No positive converter
callback or Tauri bridge is mocked. The presentation WASM hash is checked only;
it is never initialized or executed. This is not a hosted-browser UI test.

All candidate/control/license/README/loader downloads stay in
`.local/dps-source-inputs`, outside the uploaded report directory. Only
`.local/dps-qa` JSON reports are retained. In particular the Spire sample and
its source code/README are not mirrored into this Git delivery/artifact.

[`unused-runtime-pin.json`](../../../scripts/qa-dps/unused-runtime-pin.json)
preserves the exact shared runtime descriptor/verifier/ZIP/tar/manifest/launcher/
ELF/parent binding for a later qualified route. It is **not consumed, downloaded
or reverified in this DPS probe**. No converter, production positive import,
PPTX edit/UndoRedo/save/fresh reopen or independent output XML acceptance ran.
No app/suite/SDK/Mac build, local GUI, Tauri IPC or native Windows/Linux/macOS
acceptance is claimed. No user profile or recording session was created.

Open/closed DPS and WPS issue searches and descriptions #30/#36/#43/#375/#382
were read. The only finding here is the source qualification gap; no independent
product bug was established and no duplicate/new aggregate issue is created.
Existing issues/proofs and closed integration intake are unchanged. A qualified
source with applicable permission/provenance and independent live-slide oracle
is required before the approved runtime→production helper→real engine→edit/
UndoRedo→PPTX save/fresh reopen→independent XML route can be accepted.
