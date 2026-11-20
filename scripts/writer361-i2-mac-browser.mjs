/** One real macOS browser job; immutable I2 app plus separately pinned QA code. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const app = resolve(process.argv[2]),
  harness = resolve(process.argv[3]);
const requestPath = join(harness, ".github/writer361-mac-browser-I2.json");
const bytes = await readFile(requestPath);
const hash = (data) => createHash("sha256").update(data).digest("hex");
assert.equal(hash(bytes), process.env.WRITER361_BROWSER_REQUEST_SHA256);
const request = JSON.parse(bytes);
assert.equal(request.profile, "browser-only-mac");
assert.equal(request.executionApproved, true);
assert.equal(request.sourceCommit, "5acab18c516e1fb07118cb41f807a3c0e05182bf");
assert.equal(request.sourceTree, "f857aabbca465d3135f38d9a95b8ad0863ea76b1");
assert.equal(process.platform, "darwin", "Real macOS browser host required");
assert.equal(process.env.GITHUB_ACTIONS, "true", "Disposable QA runner only");
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
assert.equal(git(app, "rev-parse", "HEAD"), request.sourceCommit);
assert.equal(git(app, "rev-parse", "HEAD^{tree}"), request.sourceTree);
assert.equal(git(app, "status", "--porcelain"), "");
const externalProbe = join(harness, "scripts/proef-writer-kolom-undo.mjs");
assert.equal(hash(await readFile(externalProbe)), request.correctedProbeSha256);
const loader = pathToFileURL(
  join(harness, "scripts/writer361-external-browser-loader.mjs"),
).href;
const { verifyBuildReceipt } = await import(
  pathToFileURL(join(app, "scripts/writer-proefbuild.mjs")).href
);
const report = {
  browserOnly: true,
  nativeApplicationStarted: false,
  source: request.sourceCommit,
  tree: request.sourceTree,
  harnessCommit: git(harness, "rev-parse", "HEAD"),
  externalProbeSha256: request.correctedProbeSha256,
  requestSha256: hash(bytes),
  host: process.platform,
  arch: process.arch,
  routes: [],
  passed: false,
  limits: [
    "Actual macOS Chromium frontend, not installed WKWebView/native app acceptance",
    "Canonical desktop installer source remains unchanged I2; no installers built or downloaded",
  ],
};
await mkdir(join(app, ".local"), { recursive: true });
async function run(args, env, label, timeout = 480000) {
  const result = spawnSync(process.execPath, args, {
    cwd: app,
    env: { ...process.env, ...env },
    stdio: "inherit",
    timeout,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${label}: ${result.error ?? `exit ${result.status}, signal ${result.signal}`}`,
    );
}
try {
  for (const [name, route] of [
    ["normal", "/"],
    ["hosted", "/office/"],
  ]) {
    const prefix = `writer361-I2-mac-${name}`,
      outDir = `.local/dist-${prefix}`,
      receiptPath = outDir + ".build.json";
    const env = {
      OFFICE_TEST_SOURCE: request.sourceCommit,
      OFFICE_TEST_APP_CWD: app,
      OFFICE_TEST_DIR: outDir,
      OFFICE_TEST_BASE: route,
      OFFICE_TEST_BUILD_RECEIPT: receiptPath,
      OOS_TEST_DIST: outDir,
      OOS_TEST_ROUTE: route,
      OOS_TEST_UIT: `.local/${prefix}-office`,
      WRITER363_OUT: `.local/${prefix}-363`,
      EPUB356_OUT: `.local/${prefix}-356`,
    };
    const routeReport = { route, outDir, receiptPath, probes: [] };
    report.routes.push(routeReport);
    await run(
      ["scripts/writer-proefbuild.mjs", "build", outDir, route],
      env,
      `${name} canonical app build`,
    );
    routeReport.buildReceipt = await verifyBuildReceipt({
      cwd: app,
      outDir,
      route,
      receiptPath,
    });
    routeReport.buildReceiptSha256 = hash(
      await readFile(join(app, receiptPath)),
    );
    await run(
      ["scripts/test-office-tab-undo.mjs"],
      env,
      `${name} Office tab regression`,
    );
    const officePath = `.local/${prefix}-office/report.json`;
    routeReport.office = {
      path: officePath,
      sha256: hash(await readFile(join(app, officePath))),
    };
    await verifyBuildReceipt({ cwd: app, outDir, route, receiptPath });
    const probes = [
      {
        issue: 361,
        args: ["--loader", loader, externalProbe, `${prefix}-361`, "--fixed"],
      },
      {
        issue: 362,
        args: ["scripts/proef-writer-linthoogte.mjs", outDir, `${prefix}-362`],
      },
      {
        issue: 363,
        args: ["scripts/proef-writer-363-labels.mjs", outDir, route],
      },
      { issue: 356, args: ["scripts/proef-epub356-hosted.mjs"] },
    ];
    for (const probe of probes) {
      const entry = {
        issue: probe.issue,
        path: `.local/${prefix}-${probe.issue}/report.json`,
        passed: false,
      };
      routeReport.probes.push(entry);
      try {
        await run(probe.args, env, `${name} issue ${probe.issue}`);
        const raw = await readFile(join(app, entry.path)),
          data = JSON.parse(raw);
        entry.sha256 = hash(raw);
        assert.notEqual(data.acceptance, false);
        assert.ok(!data.error);
        if (probe.issue === 361) {
          assert.equal(data.status, "passed");
          assert.equal(data.checks.length, 27);
          assert.equal(data.harness.sha256, request.correctedProbeSha256);
          assert.equal(data.keyboardContext.hostPlatform, "darwin");
          assert.equal(data.keyboardContext.synthetic, false);
          assert.match(data.keyboardContext.browserPlatform, /Mac/);
          assert.deepEqual(data.errors, []);
          assert.deepEqual(data.cleanupErrors, []);
          entry.checks = 27;
          entry.keyboardContext = data.keyboardContext;
        }
        entry.passed = true;
      } catch (error) {
        entry.error = String(error);
        if (probe.issue === 361) {
          report.stoppedAtCorrectedMac361 = true;
          throw new Error(
            "Corrected real macOS command route failed; stop and ask integration to assess product vs probe evidence",
          );
        }
      }
    }
    await verifyBuildReceipt({ cwd: app, outDir, route, receiptPath });
  }
  assert(
    report.routes.every((r) => r.probes.every((p) => p.passed)),
    "One or more scoped Mac frontend probes failed",
  );
  assert.equal(git(app, "status", "--porcelain"), "");
  report.passed = true;
} catch (error) {
  report.error = String(error.stack ?? error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  report.appSourceStillClean = git(app, "status", "--porcelain") === "";
  await writeFile(
    join(app, ".local/writer361-I2-mac-browser-summary.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
