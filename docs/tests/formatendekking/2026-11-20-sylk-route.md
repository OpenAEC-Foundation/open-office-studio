# #30 part 1: explicit SYLK filename route

Scope: prove the existing `.sylk` catalog entry using genuine SYLK bytes,
not implement or claim a different format. The control `.slk` and tested
`.sylk` names use the same immutable source already known as `lo-slk-2`:
LibreOffice/core revision `92c170f11d44857d8e365f2e29fb449dfb567ff5`,
`sc/qa/unit/data/slk/pass/ooo80484-1.slk`, 2,581 bytes, SHA-256
`bcfaae8f2ce55e393c100dcd95c37301129b9121af0429586de75b3ec99df420`.
No arbitrary unrelated extension is renamed and called SYLK.

The integration chat confirmed no overlapping SYLK or catalog-edit claim.
Work is isolated on `codex/formats-30-sylk-coverage-2026-11-20`, separately
from its frozen four-fix intake. No production source or catalog entries are
changed, no application/runtime is built, and no local app/converter is run.
The user's safe stop is 15:20 Europe/Amsterdam on 20 November 2026.

## Exact application and package point

- Application I3: `7f126f4b8e5269a54388cf78c48c78d2acc0daa1`.
- Tree: `8bc608488760e48919d7fb4e72a42569175b52a4`.
- Canonical desktop: `44715026752`, completed/success all three OSes.
- `.github/format30-sylk-candidate.json` pins its three archive/four package
  hashes; no older I2 values are used.
- Existing verified artifact downloader/installer-root classifier is reused
  read-only at test reference `5f940820e8f74cd42fe0cee454340481064b6cd3`.
  Whole archives, exact inner package sets and hashes are checked before use.

## Bounded proof sequence

`Format 30 bounded SYLK alias proof` runs Windows NSIS, macOS DMG and Linux
AppImage+DEB from those actual canonical packages. It extracts each package
without installing or launching the app. The private runtime executable and
receipt come only from that package. No system-office fallback or environment
override selects the runtime. No source, SDK or shared dependency is changed.

For both filename extensions, the actual production TypeScript input route
calls the real private converter through its test dependency seam, with the
unchanged production safe profile and process timeout. Converted XLSX opens
in the production WASM engine; twelve source-derived typed cells are checked,
an L1 edit marker is saved, and a newly created engine reopens and resaves it.
An independent Python ZIP/XML oracle checks converted/saved/reopened files,
same row/column content and edit marker, source preservation, and no active
macro/external relationships. Temporary extraction/profile and loader cleanup
must finish before a passed report is emitted.

This is a functional input/converter/engine proof, **not native GUI, file
dialogue or pixel acceptance**. Those are separate evidence types. The twelve
ASCII/numeric checks do not claim preservation of every source style, the
non-ASCII separator strings, charts, formulas or all possible SYLK variants.

The browser remains explicitly unsupported for this runtime-only format.
The job exercises the actual production no-Tauri converter guard with a
minimal Node browser environment and checks its desktop/XLSX alternative.
That source-level guard check is not an actual hosted-browser GUI run.

## Preparation and pending results

The pinned input hash/size/header/end and twelve source cells were verified
without a converter. Eight independent-oracle failure contracts pass, including
wrong text/number/type, missing edit marker, changed source, external link and
macro part. Node/Python syntax checks pass. No platform conversion result is
claimed before the dedicated run completes.

The sixteen former `no-fixture` entries are unproven positive coverage, not
sixteen independently reproduced bugs. Remaining formats stay out of this
bounded task. No new umbrella issue, `main` merge or release is authorized.
