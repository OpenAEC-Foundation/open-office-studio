# Isolated DERIVED P5 Mac save execution package

Prepared only. No build, signing, dispatch or native case is authorized by this
directory. The author is the sole Mac-save operator; the existing integration
chat is the sole future dispatcher. No main, integration, tag, release, asset or
publisher changes are part of this experiment.

`source-policy.json` pins the separate research source from exact P5. Its only
application changes are the already reviewed `03730b78` observer and the reviewed
QA identity overlay. This is a DERIVED research app, never the original signed
release. The identity is `org.openaec.office-studio.qa-save-trace`, version
`2026.48.101`. The historical failed proof and six diagnostic successes remain
unchanged and the historical cause remains open.

The producer uses `.github/workflows/release.yml` on the isolated immutable
`codex/mac-save-trace-producer-20261124` branch. It has only `workflow_dispatch`,
default stage `disabled`, read-only repository permissions, no publisher and no
automatic transition from build to native. An existing workflow path is used
because [GitHub requires the dispatch workflow to exist on the default branch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch).
The default branch is not changed. Every third-party Action is pinned to the
actual immutable Git object read during preparation; installed toolchain/runtime
versions remain recorded build inputs, not a promise of identical release bytes.

## Future explicit execution decision

Only after independent review of the frozen execution commit and explicit user
approval may integration fill a live request from `approval-template.json`:

1. Retain the user's literal scope approval. Pin the producer commit/tree,
   workflow SHA256, `files.json` SHA256, exact app commit/tree, a fresh 32-lowerhex
   nonce and issue/expiry UTC (at most two hours). Set only stage `build` and
   `allowBuild=true`, leaving native/publish/main/retry false. Integration checks
   critical Mac runner capacity immediately before its single dispatch. No
   dispatch helper exists here and this document performs no dispatch.
2. One ARM64 Suite-only build, at most 90 minutes. Before any compilation verify
   clean exact research source and the complete allowed 12-file delta. Compile
   TypeScript and Cargo default/off and observer/on with the locked dependency
   graph. Build only the normal Developer-ID/hardened/notarized DERIVED DMG.
   Secrets exist only in that build step; temporary key material is removed and
   potential credential output is masked in retained logs with raw hashes and
   redaction metadata. No signing/security fallback or updater asset is allowed.
3. Stop after package upload. Integration binds the successful run/attempt1,
   exact build job and all gates, unique official artifact ID/name/size/digest,
   creation/expiry times, original build nonce and SHA256 of the canonical live
   approval file. It fills `native-package-template.json` with actual values and
   creates a separate fresh native-stage request. Package placeholders cannot
   authorize any input. No other OS or extra app is built.
4. One fresh ARM64 native host, at most 20 minutes including cleanup and upload.
   At most 12 minutes is budgeted to acquisition and case work, followed by
   bounded own cleanup and evidence upload. The consumer authenticates metadata,
   hashes the whole ZIP, validates the original witness before member emission,
   verifies the DMG and copied .app signatures/identity/resource inventory, then
   compiles the actual Swift helpers and observes its current privacy gates.
   No grants, attach, debugger or JavaScript/model injection are implemented.
5. Only the original 7480-byte synthetic control is copied into the native
   observer's own nonce path. Launch the actual packaged executable with an
   explicit scrubbed environment and empty CWD. Native event90 with the actual
   PID/nonce, frontend91 and zero-loss99 are mandatory before input. Use the
   historical OCR/body-target/focus preflight and one ordinary Maximize; the
   historical helper's pointer/key transport is unchanged. The driver's only
   fork is its explicitly expected QA bundle identifier.
6. Exactly one Q then exactly one Command-S, without an extra post-Q observation
   barrier or input replay. Poll actual DOCX bytes/XML for at most the original
   20 seconds after save. Preserve failure pixels/AX, ledger and actual file.
   Only after the action drain the logging channel. Correlate exactly one owned
   serializer/IPC/native-target/write chain and its saved bytehash; duplicate,
   missing, early-error or interleaved events remain INCONCLUSIVE. Hash equality
   is not Q semantics; a separate XML comparison requires source text plus one Q.
7. If persisted, normal full quit, different actual PID, cold-open unchanged
   saved bytes and a real visible Q-token OCR target, then normal quit. A failed
   normal quit is never retried on the same PID. Cleanup may terminate only its
   exact own process; fallback termination is retained and fails normal lifecycle.
   The always-run cleanup script reserves no right to touch another operator.

`contract.py` uses only read-only Actions endpoints. Artifact downloads use the
[documented JSON Accept header and archive redirect](https://docs.github.com/en/rest/actions/artifacts#download-an-artifact);
the bearer token is never forwarded to the blob host. All artifacts are expiring
CI-only evidence with access according to repository permissions, not asserted
private storage and not release distribution.

## Validation and interpretation

`test_execution.py` tests contract/oracle/synthetic subprocess and driver mocks;
it never builds or runs an app. Parser checks and independent review cannot
replace the future actual compiler, signing, package or native gates.

The unchanged observer has session-global native69/71/73-76 events. Only a single
matching owned70/72 chain can be attributed; early `?`/cancel paths may omit71.
Missing logs never prove absence of command receipt. Buffer copying, hashing,
IPC, file writes and the derived identity/build can perturb timing. A success
means nonrecurrence in this new run; it does not explain or fix the historical
failure. Every new run remains separate from published-release acceptance.
