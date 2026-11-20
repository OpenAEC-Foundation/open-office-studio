/** One actual macOS Chromium #361 diagnostic; frozen I3 app, external QA only. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const app = resolve(process.argv[2]),
  harness = resolve(process.argv[3]);
const sha = (data) => createHash("sha256").update(data).digest("hex");
const requestBytes = await readFile(
  join(harness, ".github/writer361-mac-I3-diagnostic.json"),
);
assert.equal(
  sha(requestBytes),
  process.env.WRITER361_DIAGNOSTIC_REQUEST_SHA256,
);
const request = JSON.parse(requestBytes);
assert.equal(request.profile, "browser-only-mac-361-diagnostic");
assert.equal(request.executionApproved, true);
assert.equal(request.nativeAppExecutionAllowed, false);
assert.equal(request.installerBuildAllowed, false);
assert.equal(request.route, "/");
assert.equal(request.sourceCommit, "7f126f4b8e5269a54388cf78c48c78d2acc0daa1");
assert.equal(request.sourceTree, "8bc608488760e48919d7fb4e72a42569175b52a4");
assert.equal(process.platform, "darwin");
assert.equal(process.env.GITHUB_ACTIONS, "true");
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
assert.equal(git(app, "rev-parse", "HEAD"), request.sourceCommit);
assert.equal(git(app, "rev-parse", "HEAD^{tree}"), request.sourceTree);
assert.equal(git(app, "status", "--porcelain"), "");
const probe = join(harness, "scripts/proef-writer-kolom-undo.mjs");
assert.equal(sha(await readFile(probe)), request.probeSha256);
const loader = pathToFileURL(
  join(harness, "scripts/writer361-external-browser-loader.mjs"),
).href;
const { verifyBuildReceipt } = await import(
  pathToFileURL(join(app, "scripts/writer-proefbuild.mjs")).href
);
const name = "writer361-I3-mac-diagnostic",
  outDir = ".local/dist-" + name,
  receiptPath = outDir + ".build.json";
const env = {
  ...process.env,
  OFFICE_TEST_APP_CWD: app,
  OFFICE_TEST_DIR: outDir,
  OFFICE_TEST_BASE: "/",
  OFFICE_TEST_BUILD_RECEIPT: receiptPath,
  OFFICE_TEST_SOURCE: request.sourceCommit,
};
const report = {
  diagnosticOnly: true,
  source: request.sourceCommit,
  tree: request.sourceTree,
  harnessCommit: git(harness, "rev-parse", "HEAD"),
  probeCommit: request.probeCommit,
  probeSha256: request.probeSha256,
  requestSha256: sha(requestBytes),
  route: "/",
  host: process.platform,
  arch: process.arch,
  originalRun: request.originalRun,
  nativeApplicationStarted: false,
  installerBuilt: false,
  limits: [
    "One actual macOS Chromium normal-route observation, no native WebKit claim",
    "If original failure does not recur this does not prove a race fix",
    "No extra Undo, focus repair or model action after a mismatched second Undo",
  ],
  passed: false,
};
await mkdir(join(app, ".local"), { recursive: true });
const run = (args) => {
  const r = spawnSync(process.execPath, args, {
    cwd: app,
    env,
    stdio: "inherit",
    timeout: 480000,
  });
  if (r.error || r.status !== 0)
    throw new Error(String(r.error ?? `exit ${r.status}`));
};
try {
  run(["scripts/writer-proefbuild.mjs", "build", outDir, "/"]);
  report.buildReceipt = await verifyBuildReceipt({
    cwd: app,
    outDir,
    route: "/",
    receiptPath,
  });
  report.buildReceiptSha256 = sha(await readFile(join(app, receiptPath)));
  report.trials = [];
  assert.equal(request.independentFreshDocumentCoreTrials, 3);
  for (let index = 1; index <= 3; index++) {
    const label = name + "-trial-" + index;
    const execution = spawnSync(
      process.execPath,
      ["--loader", loader, probe, label, "--fixed", "--left-core-only"],
      { cwd: app, env, stdio: "inherit", timeout: 180000 },
    );
    const raw = await readFile(join(app, ".local", label, "report.json"));
    const data = JSON.parse(raw),
      second = data.transitions?.find((t) => t.name === "left second Undo");
    const trial = {
      index,
      path: ".local/" + label + "/report.json",
      sha256: sha(raw),
      status: data.status,
      exitCode: execution.status,
      error: data.error,
      checks: data.checks.length,
      secondUndo: second,
      keyboardEvents: data.keyboardEvidence?.length,
    };
    report.trials.push(trial);
    assert.equal(data.source, request.sourceCommit);
    assert.equal(data.harness.sha256, request.probeSha256);
    assert.equal(data.keyboardContext.hostPlatform, "darwin");
    assert.equal(data.keyboardContext.synthetic, false);
    assert.deepEqual(data.errors, []);
    assert.deepEqual(data.cleanupErrors, []);
    if (execution.error || execution.status !== 0 || data.status !== "passed") {
      report.classification =
        "Core trial failed; inspect exact key delivery and bounded grid. Possible product route failure; no further fresh trial started.";
      throw new Error(
        trial.error ?? String(execution.error ?? "Core trial failed"),
      );
    }
    assert.equal(data.checks.length, 6);
    assert.equal(data.acceptance, true);
    assert(second);
  }
  report.lateGridOccurrences = report.trials.filter(
    (t) => !t.secondUndo.oldObservationMatched,
  ).length;
  report.classification = report.lateGridOccurrences
    ? "At least one single second Undo reached3cols only after old250ms observation; late grid observation demonstrated, no smoothness/product-fix claim"
    : "0/3 original failures observed; original cause remains unproven";
  await verifyBuildReceipt({ cwd: app, outDir, route: "/", receiptPath });
  report.passed = true;
} catch (error) {
  report.error = String(error.stack ?? error);
  process.exitCode = 1;
} finally {
  report.appSourceStillClean = git(app, "status", "--porcelain") === "";
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(app, ".local", name + "-summary.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
