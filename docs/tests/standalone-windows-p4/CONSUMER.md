# P4 Windows: seven-product split, six standalone hosts

Only this preparation owns the canonical Windows ZIP download. Integration
reserved a separate Suite transfer for750b; its native/core scope is not ours.
The six fresh standalone hosts each receive only their own app's NSIS, report
and receipt. No Suite files reach those hosts. Original744d76b1 preparation and
all historical host/old-Writer evidence remain untouched.

## Producer and preparation gates

Product source `04fa6cd43b84e3f59fb9d5055bb2d00dde351a47`, tree
`94fa38c20b51a73e4912964f37f0e1a659b0fb1b`,2026.48.1.
Official Release producer45172070275, Windowsjob137683944804, attempt1,
artifact name `uitgave-Windows`. Root will provide original official artifact
metadata/go after this own job succeeds. Until then the config is `ready:false`
and `officialMetadataGo:false`; null artifact identities are blocking, not wildcards.
The unrelated Mac/Linux jobs do not gate a successfully completed Windows job.

Own prep workflow `.github/workflows/standalone-windows-p4.yml`, branch
`codex/standalone-windows-p4-2026-11-23`. It checks exact source/tree/job/attempt,
official parent artifact ID/digest/bytes, full downloaded parent ZIP SHA256,
original producer package reports and each inner NSIS name/size/SHA. Seven
independent executable identities are derived by extract-only7-Zip before any
installation. Consumer-installed executables must match those PE bytes and
actually validate Authenticode with timestamps. No app is rebuilt.

## Suite consumer contract for750b

`suite-consumer.pending.json` is a reviewable **blocked template**. The actual
final non-null schema is `suite-consumer.schema.json`. Its descriptor is emitted
by `bind_children.py` as `provenance/suite-consumer.json`,
alongside `provenance/binding.json` in artifact `standalone-windows-p4-binding`.
The final descriptor replaces null fields only with verified actual identities.
The pending template's `state` and `expectedChildZipMembers` are explanatory;
the emitted descriptor need not contain them. Validate the final schema instead.
Its `suite` is the producer receipt augmented after upload with
`childArtifact` and `packageReceiptSha256`.

The Suite child artifact is named `standalone-windows-p4-office-package` and
has exactly three root members:

1. `Open Office Studio_2026.48.1_x64-setup.exe`
2. `canonical-package-report.json` — unchanged original Office report bytes
3. `package.json` — original preparation receipt

Source member names are recorded in the descriptor: NSIS under
`dist-installers/office/nsis/`, report `pakketcontrole-Windows.json` (normally
`.local/pakketcontrole-Windows.json` in the parent ZIP). The emitted actual
`application.packagePath` / `canonicalPackageReport.parentMember` are authoritative.
Do not substitute or download an older public installer or rebuild the Suite.

Required consumer order:

- Reject null IDs/digests/sizes and a wrong producer/source/tree/job/attempt.
- Check official child artifact metadata: ID/name/digest, not expired, and
  `workflow_run.id == suite.preparerRun`,
  `workflow_run.head_sha == suite.preparerHarness`.
- Download the entire child ZIP once and strictly check its full official digest
  and size before safe extraction. A downloader's digest warning is insufficient.
- Require the exact three members, without duplicates/absolute/traversal/symlink
  paths. Verify raw `package.json` against `suite.packageReceiptSha256`.
- Verify original NSIS size/SHA and raw report size/SHA. Report must identify
  `open-office-studio`, Windows,2026.48.1 and the same package identity.
- Validate installed executable size/SHA against `application.payloadExecutable`,
  x64/app-ID/version/own profile and actual installer/app Authenticode/timestamps
  before native functional acceptance. Keep external requirements explicit.

**Product source and preparation harness are different identities.** The Suite
is built from P4; this QA branch only verifies/splits bytes. Do not compare the
child artifact's harness SHA directly to the product commit. The original child
`package.json` excludes the two post-upload fields; use its raw-byte SHA rather
than incorrectly comparing its entire object to the augmented final descriptor.

Eight focused source/input gate contracts and Python/Node/PowerShell syntax
checks pass without app/GUI execution. This preparation is not native acceptance.
Email uses actual compose/Ctrl+S, independent received MIME body/subject, full
quit/new-process reopen and synthetic loopback-only data; SMTP sending is disabled.
Database uses SQLite only because the exact P4 native UI explicitly accepts
`.sqlite/.sqlite3/.db`, with actual table/query/reopen and independent read-only
sqlite3/source-hash checks. No Access writes or internal import calls are promised.

No local GUI/capture, extra app/Mac build, current product fix/intake, main/tag or
publication is performed. #380 remains separate for a future product round.
