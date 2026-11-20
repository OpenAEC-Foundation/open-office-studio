/** All four fixes and Linux compatibility corrections on a frozen release candidate, with a separately pinned 362 harness. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const harnessRoot = fileURLToPath(new URL("../", import.meta.url));
const request = JSON.parse(
  await readFile(
    resolve(harnessRoot, ".github/office-writer-I3-qa.json"),
    "utf8",
  ),
);
const { verifyBuildReceipt } = await import(
  pathToFileURL(resolve("scripts/writer-proefbuild.mjs")).href
);
const hash = (raw) => createHash("sha256").update(raw).digest("hex");
const externalProbe = resolve(
  harnessRoot,
  "scripts/proef-writer-linthoogte.mjs",
);
const externalProbeBytes = await readFile(externalProbe);
const externalProbeSha256 = hash(externalProbeBytes);
const externalProbeGitBlobSha256 = hash(
  Buffer.from(externalProbeBytes.toString("utf8").replace(/\r\n/g, "\n")),
);
assert.equal(externalProbeGitBlobSha256, request.externalProbeSha256);
const outDir = process.argv[2],
  route = process.argv[3];
assert(["/", "/office/"].includes(route));
const key = route === "/" ? "normal" : "hosted";
const label = `writer-471-QA-${key}`;
const output = `.local/${label}`;
const receiptPath = `${outDir}.build.json`;
await mkdir(output, { recursive: true });
const report = {
  browserOnly: true,
  nativeApplicationStarted: false,
  platform: process.platform,
  route,
  harnessCommit: execFileSync("git", ["-C", harnessRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  externalProbeSha256,
  externalProbeGitBlobSha256,
  issues: [],
  startedAt: new Date().toISOString(),
};
try {
  const build = await verifyBuildReceipt({ outDir, route, receiptPath });
  assert.equal(build.source, request.applicationCommit);
  assert.equal(build.tree, request.applicationTree);
  report.source = build.source;
  report.tree = build.tree;
  report.buildReceipt = receiptPath;
  report.buildReceiptSha256 = hash(await readFile(receiptPath));
  const officeOutput = `${output}-office`;
  const office = spawnSync(
    process.execPath,
    ["scripts/test-office-tab-undo.mjs"],
    {
      stdio: "inherit",
      timeout: 8 * 60 * 1000,
      env: {
        ...process.env,
        OOS_TEST_DIST: outDir,
        OOS_TEST_ROUTE: route,
        OOS_TEST_UIT: officeOutput,
      },
    },
  );
  assert.equal(office.status, 0, "Office document-tab regression failed");
  const officeRaw = await readFile(`${officeOutput}/report.json`);
  const officeReport = JSON.parse(officeRaw);
  assert.equal(officeReport.codepoint, build.source);
  assert.equal(officeReport.cases.length, 9);
  assert(
    officeReport.cases.every((c) => c.passed) && !officeReport.errors.length,
  );
  report.office = {
    path: `${officeOutput}/report.json`,
    sha256: hash(officeRaw),
    passed: true,
  };
  const probes = [
    {
      issue: 361,
      args: ["scripts/proef-writer-kolom-undo.mjs", `${label}-361`, "--fixed"],
    },
    { issue: 362, args: [externalProbe, outDir, `${label}-362`] },
    {
      issue: 363,
      args: ["scripts/proef-writer-363-labels.mjs", outDir, route],
    },
    { issue: 356, args: ["scripts/proef-epub356-hosted.mjs"] },
  ];
  for (const probe of probes) {
    const proof = `.local/${label}-${probe.issue}`;
    const child = spawnSync(process.execPath, probe.args, {
      stdio: "inherit",
      timeout: 8 * 60 * 1000,
      env: {
        ...process.env,
        OFFICE_TEST_DIR: outDir,
        OFFICE_TEST_BASE: route,
        OFFICE_TEST_BUILD_RECEIPT: receiptPath,
        WRITER363_OUT: proof,
        EPUB356_OUT: proof,
      },
    });
    const result = {
      issue: probe.issue,
      passed: child.status === 0,
      exitCode: child.status,
      signal: child.signal,
      output: proof,
    };
    if (child.error) result.error = String(child.error);
    try {
      const raw = await readFile(`${proof}/report.json`),
        data = JSON.parse(raw);
      result.reportSha256 = hash(raw);
      if (data.status !== "passed" || data.acceptance === false || data.error)
        result.passed = false;
      assert.equal(data.source ?? data.applicationCommit, build.source);
      assert.equal(data.route, route);
    } catch (error) {
      result.passed = false;
      result.error = String(error);
    }
    report.issues.push(result);
  }
  await verifyBuildReceipt({ outDir, route, receiptPath });
  assert(
    report.issues.every((r) => r.passed),
    "Inspect the scoped probe reports",
  );
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = String(error);
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(
    `${output}/summary.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
}
assert(report.passed, report.error);
