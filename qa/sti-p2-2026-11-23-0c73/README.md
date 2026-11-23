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
3. Pending the coordinator's verified small **P2** private-runtime descriptor:
   actual Linux CLI conversion requested by the production open route, real
   engine open, source-oracle comparison, a first-title text edit, recommended
   PPTX save and reopen. `check_pptx.py` independently checks OOXML contents.

At preparation time native conversion is **not run**, because the shared P2
runtime-only artifact is not yet bound. A skipped native test is not a pass.
Old I3/E92 and old system-LibreOffice results are not substituted. No 4 GB
release ZIP is fetched, no new Office build starts, and no local runtime runs.
This branch is outside the closed P2 intake. No claim of complete STI fidelity,
native GUI acceptance, Windows/macOS acceptance or general template coverage.

```text
python qa/sti-p2-2026-11-23-0c73/fixture.py
pnpm exec vitest run --config qa/sti-p2-2026-11-23-0c73/vitest.config.ts --configLoader runner
```

Native testing is guarded by Linux + GitHub Actions and a verified runtime
binding; a future binding must include the parent package/artifact chain and
runtime file identities. Each stage reports application P2 and harness commit
separately. Generated evidence stays in `.local/qa-sti-p2-0c73/` for CI artifacts.
