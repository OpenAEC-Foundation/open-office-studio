/** Reuse frozen same-package proof while retaining its real Find-Undo failure. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const names = [
  "baseline",
  "Left ribbon focus",
  "Left inserted",
  "Left immediate Undo",
  "Left Redo",
  "Left final Undo",
  "Right ribbon focus",
  "Right inserted",
  "Right immediate Undo",
  "Right Redo",
  "Right final Undo",
  "last-cell Tab and typing",
  "Tab row Undo",
  "ordinary typing",
  "typing Undo",
  "typing Redo",
  "before Find",
];
export function verifyPreviousCoverage(origin) {
  const reference = origin.remainingCoverage;
  if (reference === undefined) return null;
  assert.equal(origin.platform, "Linux");
  assert.equal(
    reference.executionApproved,
    true,
    "Remaining coverage requires its own integration release",
  );
  assert(Number.isSafeInteger(reference.run) && reference.run > 0);
  assert.match(reference.reportSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.match(reference.harnessCommit ?? "", /^[a-f0-9]{40}$/);
  assert.equal(typeof reference.reportBase64, "string");
  const raw = Buffer.from(reference.reportBase64, "base64");
  assert.equal(
    sha(raw),
    reference.reportSha256,
    "Previous proof byte hash differs",
  );
  const previous = JSON.parse(raw);
  for (const key of [
    "sourceCommit",
    "sourceTree",
    "artifactRun",
    "artifactId",
    "packageSha256",
    "rootFrozenCandidateSha256",
  ])
    assert.equal(
      previous.origin[key],
      origin[key],
      "Previous proof identity differs: " + key,
    );
  for (const key of ["packagedExecutableSha256", "installedExecutableSha256"])
    assert.equal(
      previous[key],
      origin.executableSha256,
      "Previous executable differs",
    );
  assert.equal(previous.harnessCommit, reference.harnessCommit);
  assert.equal(previous.status, "failed");
  assert.match(previous.error, /'abc' !== ''/);
  assert.deepEqual(
    previous.checks.map((c) => c.name),
    names,
    "Only the exact17 prior passing checks are reusable",
  );
  assert.equal(previous.failureState.focus.tag, "INPUT");
  assert.equal(previous.failureState.focus.label, "Find what");
  assert.deepEqual(
    previous.failureState.tables,
    previous.checks.at(-1).tables,
    "Find failure must preserve document grid",
  );
  assert.equal(previous.failureState.tables[0].columns, 4);
  assert.equal(previous.cleanup.ownedApplicationClosed, true);
  return { raw, previous, reference };
}
export function retainPreviousFailure(report, verified) {
  if (!verified) return;
  const { previous, reference } = verified;
  report.reusedChecks = {
    executedInThisSession: false,
    fromRun: reference.run,
    reportSha256: reference.reportSha256,
    checks: previous.checks,
  };
  report.failures = [
    {
      name: "Find input owns Undo",
      status: "failed",
      expected: "",
      actual: "abc",
      executedInThisSession: false,
      fromRun: reference.run,
      reportSha256: reference.reportSha256,
      focus: previous.failureState.focus,
      tables: previous.failureState.tables,
    },
  ];
  report.writer361Status = "failed";
  report.nativePass = false;
  report.limits.push(
    "Remaining coverage only: prior17pass reused on exact same app/package/ELF; original Find-Undo failure retained, not retried or marked passed",
  );
  report.limits.push(
    "Previous run did not persist /proc PID-exe hash; reused evidence is limited to exact source/package/installedELF plus driverlog PID. New sessions record actual /proc executable identity.",
  );
  report.remainingCoverageSetup =
    "Fresh independent fixture; only baseline3 + InsertColumnRight4 + Find open/UI close recreated. Failed prior Find input CtrlZ is retained, not retried.";
}
