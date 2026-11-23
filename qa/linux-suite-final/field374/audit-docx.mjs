/** Audit retained native/browser DOCX bytes with the one shared source oracle. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { prepareOracle, auditDocx, MARKER, hash } from "./contract.mjs";

const [input, output, marker = MARKER] = process.argv.slice(2);
assert(input && output, "Usage: node audit-docx.mjs INPUT.docx NEW_OUTPUT [EXACT_MARKER]");
const root = resolve(output);
// A new directory prevents accidentally replacing an earlier proof or input.
await mkdir(root, { recursive: false });
const report = {
  kind: "retained-DOCX-content-audit-only", status: "failed", input: resolve(input), marker,
  harnessSha256: hash(await readFile(new URL("audit-docx.mjs", import.meta.url))),
  contractSha256: hash(await readFile(new URL("contract.mjs", import.meta.url))),
  limits: "No package identity, native operation, paint or platform acceptance is asserted by this content audit.",
};
try {
  const bytes = await readFile(input); report.inputSha256 = hash(bytes);
  const oracle = await prepareOracle(root);
  report.audit = await auditDocx(bytes, root, "retained", oracle, marker);
  assert.equal(hash(await readFile(input)), report.inputSha256, "Original input stays unchanged");
  report.exactFieldCacheAndAdjacentTextBoundary = true;
  report.status = "passed";
} catch (error) { report.error = String(error.stack || error); process.exitCode = 1; }
await writeFile(join(root, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ status: report.status, inputSha256: report.inputSha256, error: report.error }));
