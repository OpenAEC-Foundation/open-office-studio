# DPT: strict filename-template check and separate source gap

Integration exclusively assigned this one DPT route under #30 on 2026-11-23.
QA-only branch `codex/dpt-qa-2026-11-23-e0d7` starts at exact P2
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
No product/catalog/intake/build/release changes or other active format scope.

## Actual result

[CI 45185797593](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45185797593),
job `137730929094`, tested harness
`7543cf17a6e2b04b90eee5fac6ca12f33a24f9ce` on Ubuntu 22.04/Node 22.23.5.
Source diagnostics and negative no-desktop policy pass. The strict actual
template assertion **fails**: lowercase and uppercase DPT both return false,
expected true. POTX/OTP/STI controls return true; ordinary PPTX returns false.
The assertion is retained unchanged. This is the same shared filename-set
omission recorded for ETT in existing [#382](https://github.com/OpenAEC-Foundation/open-office-studio/issues/382),
to which this DPT-only reproduction was added as a variant. The title and
criteria now explicitly cover ETT/DPT filename recognition; prior ETT evidence,
status and labels are preserved, with the presentation component added. The
verified update receipt is [issue382-update.json](issue382-update.json).
No duplicate issue or product fix is included.

The [complete official artifact ZIP](retained/dpt-source-and-policy-result.zip)
is retained: artifact `14823851357`, 5648 bytes, SHA256
`90a744a2faef2af2033c68eb92f848363770beb989161052b836ffaa31dd9760`.
The whole downloaded ZIP was verified against official metadata in
[artifact.json](artifact.json). It contains exactly the source-gate and policy
JSON reports, with no source/publisher binaries or source code. Readable copies
are [source-gate-report.json](source-gate-report.json) and
[policy-report.json](policy-report.json); the aggregate is [result.json](result.json).
The evidence commit changes only docs/reports after the tested harness.

## Published source and qualification boundary

E-iceblue Spire.Presentation-for-Java at
`4360a64a106946538a1f4e245fa33862adfc3b1d` independently publishes
`Examples/data/Sample_dpt.dpt`: 71680 bytes, Git blob
`91bdf2170f976552adb76a932d70a8864a6685b7`, SHA256
`14a9dad00f8db4191c5e0ddfa31041e6c491d05a5a05fd0c31624c3d108f2571`.
It was introduced by `d1a74f200d0a311edb895e608900f491704de79c`
on 2025-06-20. The publisher's accompanying loader explicitly uses
`FileFormat.DPT` for that source. This QA does not execute that SDK or its DPS
export. Exact source/loader/README Git blobs, lengths and SHA256 are pinned in
[`sources.json`](../../../scripts/qa-dpt/sources.json).

Own independent stdlib CFB inspection establishes version3, four named streams,
application property18 `WPS 演示`, and build `2052-11.1.0.14309`. The
`PowerPoint Document` stream is 38355 bytes, SHA256
`5ca9c51c47b96fc01c467c0a46c04fbe6dd9fe77b5aabac2a2d12efa58a9146e`.
That is a byte-level publisher/family observation, not a decoded native-template
flag or live-slide/text/object/geometry/media oracle. No slide count or visual
fidelity is inferred from dead/historical stream records or converter output.

The pinned complete 544-entry publisher tree has no LICENSE/LICENCE/NOTICE path;
the license endpoint at that ref returns 404. The README's temporary SDK-license
link does not establish a sample-file grant. No applicable sample permission
was established in these reviewed sources. The Spire.Office-for-Java sample
copy has the identical Git blob and no license/notice path in its pinned tree;
it is not independent evidence. This is a bounded license/provenance gap, not
a legal conclusion or claim about every possible source of permission.

Fourteen complete pinned inventories were examined: thirteen repository trees
plus the presentation `sd` subtree at LibreOffice/core
`d9b2d316ec4d546f831415aa75514fa237f1fda4` (tree
`9f8aa260dab374769931a57f470bb12185bb712d`). The only DPT paths found in these
inventories are that Spire source and its byte-identical copy. No worldwide
absence is asserted. The original source stays untouched. No renamed POT/PPTX,
self-export or synthetic source is used to manufacture positive import proof.

**Source qualification/import/full-format acceptance remain false; source
oracle is null.** There is no converter/real PPTX WASM/edit/UndoRedo/PPTX save/
fresh reopen/independent XML content acceptance. All downloaded source, loader
and README bytes stay outside the report/artifact directory and are not
redistributed in this delivery.

## Independent filename classification check

The [original WPS producer](https://www.wps.com/academy/how-to-save-and-quickly-use-the-local-templates-in-wps-presentation/1862173/)
describes DPT as the presentation-template file type. That establishes filename
meaning independently of this unqualified example's content or license.

The focused Linux CI probe loads the actual P2 `isSjabloon`, `bestandssoort`,
`bereidOpenen` and capability functions using Node/Vite SSR. It asserts that
both `policy-only.dpt` and `policy-only.DPT` are templates, preserving strict
expected behavior rather than accepting the observed false result. Existing
POTX/OTP/STI template and ordinary PPTX filename controls are function controls,
not separate format routes. The P2 catalog already lists DPT as PPTX input.

The separate negative no-desktop check uses an explicitly synthetic zero-byte
request, not a DPT fixture. With an empty window/no Tauri mock, it requires the
actual production error to name DPT and give the PPTX alternative. No positive
conversion output is fabricated. The installed presentation WASM identity is
checked only; it is never initialized. This is not a hosted-browser UI test.

The `bereidOpenen` template wrapper is guarded by `isSjabloon(filename)`.
Skipping that wrapper after successful DPT import follows by code inspection
if the predicate is false. It is an explicit inference, not a reproduced DPT
import/save/source-overwrite or data-loss result.

## Reproduction, issue handling and runtime limits

```sh
python3 -B scripts/qa-dpt/source_gate.py
pnpm install --frozen-lockfile --ignore-scripts
node scripts/qa-dpt/policy.mjs
```

Source diagnostics use Python stdlib and public pinned Git data. Production
functions run only in Linux CI. Only `.local/dpt-qa` JSON reports are uploaded;
source downloads stay in separate `.local/dpt-source-inputs`.

Open and closed DPT/WPS/Kingsoft/template-recognition and presentation-template
issue searches were checked; descriptions #30/#27/#36/#43/#109/#375/#382 were
read. #382 is the existing same `SJABLONEN` set-omission bug, originally ETT.
Integration explicitly directed adding a confirmed DPT filename-only variant
there if its cause/criteria match, with no duplicate/new aggregate issue.
The prior ETT and DPS outcomes remain preserved separately.

[`unused-runtime-pin.json`](../../../scripts/qa-dpt/unused-runtime-pin.json)
preserves the approved private runtime descriptor/verifier/ZIP/tar/manifest/
launcher/ELF/parent pins. It is not downloaded, consumed or reverified here.
No native Windows/Linux/macOS app, installer, Tauri IPC, hosted-browser UI or
producer/SDK/suite/Mac build is executed. No local GUI/capture/profile session
is created. A qualified original DPT with source permission/provenance/native
variant and independent live-slide oracle is still required before the genuine
conversion→production helper→real engine→edit/UndoRedo→PPTX save/fresh reopen→
independent output route can be accepted.
