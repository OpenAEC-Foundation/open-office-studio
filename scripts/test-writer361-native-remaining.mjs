import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  verifyPreviousCoverage,
  retainPreviousFailure,
} from "./writer361-native-remaining.mjs";
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
function fixture(change = () => {}) {
  const origin = {
    platform: "Linux",
    sourceCommit: "1".repeat(40),
    sourceTree: "2".repeat(40),
    artifactRun: 3,
    artifactId: 4,
    packageSha256: "5".repeat(64),
    rootFrozenCandidateSha256: "6".repeat(64),
    executableSha256: "7".repeat(64),
  };
  const previous = {
    origin: { ...origin },
    harnessCommit: "8".repeat(40),
    status: "failed",
    error: "AssertionError: 'abc' !== ''",
    packagedExecutableSha256: origin.executableSha256,
    installedExecutableSha256: origin.executableSha256,
    checks: names.map((name) => ({
      name,
      tables: [{ columns: 4, rows: 3, cells: ["alpha"] }],
    })),
    failureState: {
      focus: { tag: "INPUT", label: "Find what" },
      tables: [{ columns: 4, rows: 3, cells: ["alpha"] }],
    },
    cleanup: { ownedApplicationClosed: true },
  };
  change(previous);
  const raw = Buffer.from(JSON.stringify(previous));
  origin.remainingCoverage = {
    executionApproved: true,
    run: 9,
    harnessCommit: previous.harnessCommit,
    reportSha256: createHash("sha256").update(raw).digest("hex"),
    reportBase64: raw.toString("base64"),
  };
  return origin;
}
test("exact same-point proof retained as failed and unexecuted, not silently passed", () => {
  const origin = fixture();
  const report = { checks: [], limits: [] };
  retainPreviousFailure(report, verifyPreviousCoverage(origin));
  assert.equal(report.writer361Status, "failed");
  assert.equal(report.nativePass, false);
  assert.equal(report.failures[0].status, "failed");
  assert.equal(report.failures[0].actual, "abc");
  assert.equal(report.reusedChecks.checks.length, 17);
  assert.equal(report.reusedChecks.executedInThisSession, false);
  assert.deepEqual(report.checks, []);
});
test("absent mode stays absent; unapproved remaining mode fails closed", () => {
  assert.equal(verifyPreviousCoverage({}), null);
  const o = fixture();
  o.remainingCoverage.executionApproved = false;
  assert.throws(() => verifyPreviousCoverage(o), /own integration release/);
});
test("tampered report bytes and mismatched app/package/ELF are rejected", () => {
  const o = fixture();
  o.remainingCoverage.reportBase64 = Buffer.from("{}").toString("base64");
  assert.throws(() => verifyPreviousCoverage(o), /byte hash/);
  for (const field of ["sourceCommit", "packageSha256", "executableSha256"]) {
    const v = fixture();
    v[field] = "0".repeat(v[field].length);
    assert.throws(() => verifyPreviousCoverage(v));
  }
});
test("unrelated failure, incomplete passes and changed document grid are rejected", () => {
  for (const change of [
    (p) => (p.error = "another failure"),
    (p) => p.checks.pop(),
    (p) => (p.failureState.tables[0].columns = 3),
    (p) => (p.failureState.focus.label = "Document input"),
    (p) => (p.cleanup.ownedApplicationClosed = false),
  ])
    assert.throws(() => verifyPreviousCoverage(fixture(change)));
});
