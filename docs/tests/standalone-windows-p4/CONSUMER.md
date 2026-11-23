# P5 Windows: seven-product split, six standalone hosts

**P5 repin:** Integration closed P5 after the two CI-only apt-resolver corrections.
Product source is `b696ab86bd1c128729a079b68c0082e6df3d36a5`, tree
`e30879fd772871e690847c061ef66e6b81808a05`,2026.48.1; immutable branch
`codex/release-candidate-2026-11-23-p5`. Release45177730188/attempt1,
Windowsjob137703365803, publication disabled. No original official artifact/go
exists yet. Config remains `ready:false` / `officialMetadataGo:false`; old P4
bytes are invalid. The directory/workflow/config filenames retain their earlier
P4 harness names for continuity; authoritative source identities and actual child
artifact names are now P5. Integration subsequently granted conditional native
QA go: once this exact Windows job succeeds and its required signing/package/
runtime gates and unique official artifact metadata/times agree, this owner may
close the actual ID/ZIP digest/size without another acknowledgement. No new
source, product build, main, tag or publication is authorized.

Only this preparation owns the canonical Windows ZIP download. Integration
reserved a separate Suite transfer for750b; its native/core scope is not ours.
The six fresh standalone hosts each receive only their own app's NSIS, report
and receipt. No Suite files reach those hosts. Original744d76b1 preparation and
all historical host/old-Writer evidence remain untouched.

## Producer and preparation gates

Product source `b696ab86bd1c128729a079b68c0082e6df3d36a5`, tree
`e30879fd772871e690847c061ef66e6b81808a05`,2026.48.1.
Official Release producer45177730188, Windowsjob137703365803, attempt1,
artifact name `uitgave-Windows`. Fetch original official artifact metadata
after this own job succeeds under integration's conditional go. Until then the config is `ready:false`
and `officialMetadataGo:false`; null artifact identities are blocking, not wildcards.
The unrelated Mac/Linux jobs do not gate a successfully completed Windows job.
Source-run provenance is fetched from `actions/runs/45177730188/attempts/1`,
and the exact Windows job is selected from that same attempt's `/jobs` response.
The raw attempt job list is retained as `source-attempt-jobs.json` (also in the
early Suite descriptor artifact). A Mac-only retry may raise the latest global
run attempt to 2; it does not replace our original Windows attempt1/job/artifact.
Old artifact bytes cannot be attached to a successful replacement attempt2 job.

Own prep workflow `.github/workflows/standalone-windows-p4.yml`, branch
`codex/standalone-windows-p4-2026-11-23`. It checks exact source/tree/job/attempt,
official parent artifact ID/digest/bytes, full downloaded parent ZIP SHA256,
original producer package reports and each inner NSIS name/size/SHA. Seven
independent executable identities are derived by extract-only7-Zip before any
installation. Consumer-installed executables must match those PE bytes and
actually validate Authenticode with timestamps. No app is rebuilt.

## Suite consumer contract for750b

`suite-consumer.pending.json` is a reviewable **blocked template**. The actual
final non-null schema is `suite-consumer.schema.json`. Immediately after the
verified Suite child upload, `bind_suite.py` publishes `suite-consumer.json` in
the small artifact `standalone-windows-p5-suite-descriptor`. It does not wait for
the other child uploads or native matrix. The same descriptor is also emitted
by `bind_children.py` as `provenance/suite-consumer.json`,
alongside `provenance/binding.json` in artifact `standalone-windows-p5-binding`.
The final descriptor replaces null fields only with verified actual identities.
The six app-only native jobs have `max-parallel: 6`; actual hosted runner
capacity and queue time remain external constraints.
The pending template's `state` and `expectedChildZipMembers` are explanatory;
the emitted descriptor need not contain them. Validate the final schema instead.
Its `suite` is the producer receipt augmented after upload with
`childArtifact` and `packageReceiptSha256`.

The Suite child artifact is named `standalone-windows-p5-office-package` and
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
is built from P5; this QA branch only verifies/splits bytes. Do not compare the
child artifact's harness SHA directly to the product commit. The original child
`package.json` excludes the two post-upload fields; use its raw-byte SHA rather
than incorrectly comparing its entire object to the augmented final descriptor.

Seventeen focused source/input gate contracts and Python/Node/PowerShell syntax
checks pass without app/GUI execution. This preparation is not native acceptance.
Email uses actual compose/Ctrl+S, independent received MIME body/subject, full
quit/new-process reopen and synthetic loopback-only data; SMTP sending is disabled.
Database uses SQLite only because the exact P5 native UI explicitly accepts
`.sqlite/.sqlite3/.db`, with actual table/query/reopen and independent read-only
sqlite3/source-hash checks. No Access writes or internal import calls are promised.

After the native jobs, `collect_proofs.py REPO PREPARER_RUN NEW_DESTINATION`
downloads only the small official binding/proof artifacts, strictly checks their
complete ZIP hashes, and independently rechecks receipts, identity/signatures,
two normal exits/different PIDs, cleanup and saved DOCX/XLSX/PPTX/JSON/MIME/SQLite
bytes. Failed native evidence is retained. Its functional audit explicitly leaves
visual acceptance pending: review both actual completed screenshots per app
before claiming that the native content was displayed correctly.

No local GUI/capture, extra app/Mac build, current product fix/intake, main/tag or
publication is performed. #380 remains separate for a future product round.
