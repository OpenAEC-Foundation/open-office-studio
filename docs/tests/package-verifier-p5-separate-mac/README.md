# P5 package verifier: one explicit separate Mac producer

QA-only adapter above reviewed `d65386164855a3b77bf8a031267b40349d5b2f59`.
Application source remains `b696ab86bd1c128729a079b68c0082e6df3d36a5`, tree
`e30879fd772871e690847c061ef66e6b81808a05`, version `2026.48.1`.

The disabled request is outside the workflow trigger path. `frozen=false` is
the actual early guard. Null artifact or witness digests are not approval;
root must bind the final official metadata and close/review the input before
placing any request at the existing trigger path. No workflow was changed.

Each new platform binding declares `producerRun` and `producerCommit`.
Windows/Linux are restricted to the original P5 run, app head, exact original
job IDs and attempt 1. The only different-head exception is Mac producer
`45195055147`, commit `2af94cdcefa3e88e4980b631d16a88d7d7de5ae8`, job
`137763371873`, attempt 1, exact workflow/ref and dispatch event. Other heads,
sources, runs, jobs and attempts are rejected. Legacy single-run requests keep
their existing path unchanged.

The exception also requires a root-frozen SHA256 for the original archive
member `.local/macos-only-producer-source.json`. All witness fields are checked,
including both application identities, both producer heads, run/attempt/job,
workflow ref, P5 checkout workflow digest (not the producer workflow digest),
`publiceren="false"` and `nativeAccepted=false`. The source-witness and signing
availability producer steps must succeed in addition to the original Mac
package/signature gates. Original job/attempt/source/artifact window checks
remain mandatory.

For the exception the Mac parent archive is downloaded and SHA256/size checked
first. Its exact original witness is validated **before any key import**. The
same parent is then consumed first; no duplicate Mac download is introduced.
Only one parent ZIP and one Linux payload are retained at a time. The original
28 payload hashes, 14 reports, 14 Linux detached signatures plus signed
58-entry SHA256SUMS/public-only verification and scoped GPG cleanup remain.
The witness is receipt evidence, not an additional release checksum member.

Receipts bind every platform to its own producer run/head and preserve the
original failed Mac job `137703365843` and its original steps. A successful
separate Mac producer never makes the whole original run green.

Validation: all 22 local tests pass (12 original tests unchanged plus ten new
cases with parameterized negatives). These cover wrong producer/application/
tree/run/attempt, missing/misplaced/mutated witness, all witness semantic fields
even after recomputing its hash, required gates, old original artifacts lending
new producer success, legacy behavior, and a synthetic download orchestration
that fails on witness mutation before any GPG command. `git diff --check` passes.
Tests use only synthetic archives/keys and metadata; no actual key import,
installer archive download, signing run, native operation or publication.

Official metadata independently read during preparation: the separate run's
head/ref/path/event/attempt match; source-witness and signing availability
steps are successful. Package production is still in progress, so actual
archive/witness-byte/package/signature acceptance is pending root review and
the final official artifact.

Run checks with the existing Python runtime:

```text
python -B scripts/qa-candidate-packages-20261123.test.py
```

Root review on 24 November: separate-producer adapter accepted after checking
all original gates, cleanup and nonpublishing workflow. Producer metadata now
uses the frozen attempt endpoint; both private-runtime gates are also required
and duplicate required steps are rejected. All 23 focused tests pass, including
a failed/skipped runtime gate and frozen-endpoint orchestration. Actual Mac
witness digest and archive bytes remain required before execution. No native
acceptance is inferred from package signing.
