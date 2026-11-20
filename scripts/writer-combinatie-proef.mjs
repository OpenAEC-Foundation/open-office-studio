/** Exercise all four fixes against one already-built, source-bound frontend. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { verifyBuildReceipt } from "./writer-proefbuild.mjs";

const outDir = process.argv[2],
  route = process.argv[3];
assert(["/", "/office/"].includes(route));
const key = route === "/" ? "normal" : "hosted";
const label = `writer-combination-${key}`;
const output = `.local/${label}`;
await mkdir(output, { recursive: true });
const receiptPath = process.env.OFFICE_TEST_BUILD_RECEIPT;
const report = {
  browserOnly: true,
  platform: process.platform,
  route,
  issues: [],
  startedAt: new Date().toISOString(),
};
try {
  const build = await verifyBuildReceipt({ outDir, route, receiptPath });
  report.source = build.source;
  report.tree = build.tree;
  report.buildReceipt = receiptPath;
  report.buildReceiptSha256 = createHash("sha256")
    .update(await readFile(receiptPath))
    .digest("hex");
  const probes = [
    {
      issue: 361,
      args: ["scripts/proef-writer-kolom-undo.mjs", `${label}-361`, "--fixed"],
    },
    {
      issue: 362,
      args: ["scripts/proef-writer-linthoogte.mjs", outDir, `${label}-362`],
    },
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
      const raw = await readFile(`${proof}/report.json`);
      result.reportSha256 = createHash("sha256").update(raw).digest("hex");
      const data = JSON.parse(raw);
      if (data.acceptance === false || data.error) result.passed = false;
    } catch (error) {
      result.passed = false;
      result.error = String(error);
    }
    report.issues.push(result);
  }
  await verifyBuildReceipt({ outDir, route, receiptPath });
  assert(
    report.issues.every((r) => r.passed),
    "One or more scoped Writer probes failed; inspect individual receipts",
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
