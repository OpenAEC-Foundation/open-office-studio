# P2 QA — one authentic STI route, 23 November 2026

Exclusive scope: legacy Impress template STI under #30. Application P2 is
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
Only this QA directory and its own Linux workflow may differ from P2.
No product/catalog/claim/version change, old issue resumption, suite build,
Mac runner, local GUI, capture session, release/tag/main or publication.

## Original source and fixed oracle

The primary source is the [Debian archive's OpenOffice.org 1.1.3 English
language package](https://archive.debian.org/debian/pool/main/o/openoffice.org/openoffice.org-l10n-en_1.1.3-9sarge8_all.deb),
3,527,534 bytes, SHA-256
`37dfb7683269d8a80f89b730fad4b831d8f5cad8801f21bdcd111db1da594adb`.
The exact original member is
`./usr/lib/openoffice/share/template/english/presnt/prs-strategy.sti`:
10,141 bytes, SHA-256
`9b29e5fcec3f947a8a626cb2a448488508cb596087b018fa5d34a7ee02cd5340`.
The package's own member MD5 is verified too. The package copyright is retained
beside the fetched fixture. No historical executable is installed or run.

This is an unchanged factory template, with OpenOffice 2000 XML namespaces,
office version 1.0 and StarOffice 6.1 Beta 1 (Win32) metadata. Its **original**
internal and manifest MIME is `application/vnd.sun.xml.impress`, not the
template MIME described by later MIME tables. That historical qualification is
recorded rather than rewriting MIME or renaming modern OTP/PPTX bytes.

`fixture.py` independently derives seven ordered slides, 24 paragraphs, their
shape roles/geometry and 28 × 21 cm page size directly from the source ZIP.
`source-oracle.json` is frozen before conversion; SHA-256:
`d71dd3db4ffa28cdd9b94e3705ed9357226caf61119d6f8697b3426784d1522a`.
The one 351-byte PNG is only an unused fill declaration: no active bitmap,
slide image or AV exists, so this case makes no active-media preservation claim.

## Stages and present limits

1. Fetch/hash-check the primary package and unchanged factory member; compare
   the freshly derived oracle against the frozen independent oracle.
2. Read-only production-policy/engine/browser-boundary checks in Linux CI.
   The browser's missing Tauri bridge is modelled in Node; no GUI browser is
   started. Raw legacy bytes must not be treated as native PPTX engine input.
3. Using the coordinator's verified small **P2** private-runtime descriptor:
   actual Linux CLI conversion requested by the production open route, real
   engine open, source-oracle comparison, a first-title text edit, recommended
   PPTX save and reopen. `check_pptx.py` independently checks OOXML contents.

The first preparation run skipped native conversion until the shared P2
runtime-only artifact was bound. A skipped native test is not a pass.
Old I3/E92 and old system-LibreOffice results are not substituted. No 4 GB
release ZIP is fetched, no new Office build starts, and no local runtime runs.
This branch is outside the closed P2 intake. No claim of complete STI fidelity,
native GUI acceptance, Windows/macOS acceptance or general template coverage.

```text
python qa/sti-p2-2026-11-23-0c73/fixture.py
pnpm exec vitest run --config qa/sti-p2-2026-11-23-0c73/vitest.config.ts --configLoader runner
```

Native testing is guarded by Linux + GitHub Actions and a verified runtime
binding; that binding includes the parent package/artifact chain and
runtime file identities. Each stage reports application P2 and harness commit
separately. Generated evidence stays in `.local/qa-sti-p2-0c73/` for CI artifacts.

## Bound runtime and first completed stage

Read-only run `45147264855` at QA commit
`7e60c301b62ad913c8c35f7c8759fa0efb91890c` passed three checks, with native
conversion explicitly skipped. Artifact `14804526945`, SHA-256
`31874ad8a89c5316154fe328dc70c5d6227ab89aa1d738e59d76cfdbd3fcacb7`.

The subsequent native stage consumes only shared runtime artifact `14805600515`
from successful QA run `45147346793` / harness
`22a8577d215911976400adca4c541f2636212918`. ZIP SHA-256:
`bac1a37b55deff80cabd4670c1bf65d76266285275c0552436dcc13fcdafa487`;
inner runtime tar SHA-256:
`f3308bea282aedc444a10a039ec2c4e3904915d4c6c0b5607b088108407fb2e3`.
It originates in canonical P2 Desktop run `45143305147` / Linux job
`137586343061`, Office DEB SHA-256
`23258ac32f9368a6512b04ffcfda9a3f2be50dafeee6d8c7ca36a3a525a5f5d1`.
`prepare_runtime.py` checks the artifact ZIP, parent chain, descriptor, pinned
consumer verifier and all 15,082 runtime entries including modes/symlinks.
The converter receives the unchanged P2 safe profile in two private directories,
the production PPTX filter and printer-independent process environment. Only
its own process group is stopped on timeout; no system converter is selected.
## Completed native result — strict size gate remains failed

Final execution: [Linux CI run 45149020419](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45149020419)
at harness commit `aa011ba4c97ce8f4c865ec3c63159bf82f9c719d`;
application remains exact P2. The initial conversion execution
`45148472324` also found the same size mismatch; the follow-up finishes
edit/save/reopen before reporting that unchanged strict criterion.
The coordinator explicitly confirmed reuse of this exact runtime input.

- Source/package/oracle hashes are unchanged; private LibreOffice reports
  `26.8.2.2 9dea406ab7695df6325b11b0e19fdca8db4b7276`.
- The production open policy requests STI → PPTX, a new template-derived
  document and recommended PPTX save. The private CLI successfully converts it.
- Actual engine open, first-title prefix edit, PPTX save and fresh reopen
  preserve all seven ordered slides and all 24 source-derived paragraphs,
  allowing only the deliberate `STI_P2_EDIT_2026_48_1 ` prefix.
- Independent OOXML checks confirm those contents in converted, edited and
  freshly reopened saves. The two engine save outputs are byte-identical:
  SHA-256 `e15f6b13568fec82d6b86a89b361e0626137f6e1a7f85b92cc3ed9ba11caa3d6`.
- **Strict failure:** source 28 × 21 cm equals 10,080,000 × 7,560,000 EMU;
  converter output is 10,080,625 × 7,559,675 EMU. Delta +625 / −325 EMU
  (about +0.01736 / −0.00903 mm), each less than one twip. That size then
  remains exactly unchanged through edit/save/reopen. The original oracle and
  exact-size gate were not replaced with converted expectations or a tolerance.
  Numerical drift is independently observed; no visible or functional damage
  is established. Three tests pass, one strict route test fails; no skips.
  The bounded precision-policy investigation is recorded as
  [#373](https://github.com/OpenAEC-Foundation/open-office-studio/issues/373)
  (`presentatie`, `onderzoek`, `formaten`), linked to existing overview #30;
  no product correction or late intake is included.

Final artifact `14805567220` / `qa-sti-p2-0c73`, 3,658,743 bytes, ZIP SHA-256
`1aee8094531713c01d3621fb5b1bce44eb00e0a0f54faa165a61ffe4bdeb9d76`.
Its ZIP digest and required individual evidence files were independently checked
locally; XML-only local checks do not run a converter, engine, GUI or capture.
Optional runtime-profile cache files have Windows path-length extraction limits;
the complete original ZIP remains hash-verified. Raw reports are retained in
[`results/`](results/), including the exact runtime/parent-chain binding.

The coordinator's augmented descriptor is pinned at
`e1f1b84b94fdfa9932f8f33804da9b00c5cf6594:docs/tests/p2-runtime-input-2026-11-23/runtime-input-descriptor.json`,
SHA-256 `1c0e508276b37fbd5b92e55bf113446d7e8522fc1d9e1817bb7722d5b5dd53c6`.
Its base descriptor SHA-256 `9497f67c9c9e4f30b11c85f32cf3d3254a3f857ad6d53a40ab2f9a01d0f3adb5`
and all base fields match the consumed artifact; extra fields bind published
artifact IDs and the shared consumer pin.

Limits: one authentic factory STI, with no active media. No full visual fidelity,
Tauri dispatcher/native GUI, Windows/macOS runtime or real browser GUI acceptance.
The browser-boundary check exercises actual production logic in Node. No local
app/capture session was started, so there is no owned recording session to clean
up. This is QA outside P2 intake, not a release, standalone-app or format-wide
acceptance claim. No product correction or precision-policy decision is made.
