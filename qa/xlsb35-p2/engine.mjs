/** One real XLSB conversion -> P2 TS/WASM -> edit -> disk save -> fresh reopen.
 * Isolated Linux CI only. No UI, app installation, macro, or catalog changes.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { initWasm, openWorkbook } from "@betteroffice/xlsx";
import { converteerProef } from "../../scripts/formaatconversie-proef.mjs";

const application = "dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b";
const tree = "5a644e397ecc6af5452a49b6404edf953687d1b2";
assert.equal(process.platform, "linux", "Runtime execution is isolated Linux CI only");
assert.equal(process.env.GITHUB_ACTIONS, "true");
const [programArg, bindingArg, outArg] = process.argv.slice(2);
assert(programArg && bindingArg && outArg, "Expected program, verified binding JSON, output directory");
const program = await realpath(programArg), out = resolve(outArg);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
assert.equal(git("rev-parse", `${application}^{tree}`), tree);
git("merge-base", "--is-ancestor", application, "HEAD");
const changed = git("diff", "--name-only", application).split("\n").filter(Boolean);
assert(changed.every((p) => p.startsWith("qa/xlsb35-p2/") || p === ".github/workflows/qa-xlsb35-p2-d410.yml"), changed);
assert.match(process.env.OOS_XLSB_RUNTIME_EXECUTABLE_SHA256 ?? "", /^[a-f0-9]{64}$/);
assert.equal(hash(await readFile(program)), process.env.OOS_XLSB_RUNTIME_EXECUTABLE_SHA256,
  "Runtime program must match the externally verified artifact descriptor before execution");
const binding = JSON.parse(await readFile(bindingArg, "utf8"));
const python = (args) => JSON.parse(execFileSync("python3", ["qa/xlsb35-p2/oracle.py", ...args], { encoding: "utf8" }));
const oracle = python([]);
await mkdir(out, { recursive: true });
const source = new Uint8Array(await readFile("qa/xlsb35-p2/shared_formula.xlsb"));
assert.equal(hash(source), oracle.source.sha256);
const report = {
  applicationCommit: application, applicationTree: tree, harnessCommit: git("rev-parse", "HEAD"),
  platform: process.platform, source: oracle.source, runtimeBinding: binding,
  runtimeProgramSha256: hash(await readFile(program)),
  profileSha256: hash(await readFile("src-tauri/src/conversieprofiel.xcu")),
  stages: [], phase: "initialize-production-loaders", status: "running",
  limits: ["No Rust IPC, installed native GUI, browser UI, Windows or macOS acceptance is inferred.",
    "Uses the real private runtime via the existing production-profile conversion helper and production TS/WASM entry points.",
    "One XLSB source only; no XLS/XLT/date-system/chart coverage, optional XLSB-save or macro-execution control."],
};
const loader = await createServer({ configFile: false, appType: "custom",
  server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true } });
try {
  const { bereidOpenen } = await loader.ssrLoadModule("/src/import/openen.ts");
  const { controleerRekenbladKern } = await loader.ssrLoadModule("/scripts/rekenbladengine-compatibiliteit.ts");
  controleerRekenbladKern();
  const wasm = await readFile("vendor/rekenbladengine/xlsx_wasm_bg.wasm");
  report.wasmSha256 = hash(wasm); report.wasmBytes = wasm.length;
  await initWasm(wasm);
  const catalog = JSON.parse(await readFile("src/formaten.json", "utf8"));
  assert(catalog.xlsx.invoer.includes("xlsb"));
  const importFilter = catalog.xlsx.uitvoer.xlsx.filter;
  assert.equal(typeof importFilter, "string");
  report.phase = "actual-xlsb-conversion";
  const imported = await bereidOpenen("Shared-formula.xlsb", source, {
    runtimeBeschikbaar: async () => true,
    converteer: async (bytes, from, to, kind) => {
      assert.equal(from, "xlsb"); assert.equal(to, "xlsx"); assert.equal(kind, "xlsx");
      assert.equal(hash(bytes), oracle.source.sha256);
      const converted = await converteerProef(program, bytes, from, to,
        importFilter, resolve(out, "conversion"));
      report.conversionMs = converted.ms;
      return converted.bytes;
    },
  });
  assert(imported); assert.equal(imported.soort, "xlsx");
  assert.equal(imported.naam, "Shared-formula.xlsx");
  assert.equal(imported.exportFormaat, undefined, "XLSB must not become the default save target");
  report.saveProposal = { importedName: imported.naam, module: imported.soort,
    sourceFormatOverride: imported.exportFormaat ?? null, recommendedExtension: "xlsx" };
  const convertedPath = resolve(out, "imported.xlsx");
  await writeFile(convertedPath, imported.bytes);
  report.phase = "independent-imported-content";
  report.independentImported = python(["--xlsx", convertedPath]);
  report.stages.push("Real private-runtime conversion and independent 30-formula/cache verification");

  function check(handle, edited) {
    const info = handle.sheetInfo();
    assert.deepEqual(info.sheetNames, oracle.sheets);
    const result = handle.readCells({ ranges: [{ sheetId: info.sheetIds[0], range: { kind: "a1", a1: "A1:A30" } }] });
    assert(result.ok); assert.equal(result.ranges[0].cells.length, 30);
    for (let i = 0; i < 30; i++) {
      const cell = result.ranges[0].cells[i][0], isEdit = edited && i === 14;
      assert.equal(cell.formula?.replaceAll(" ", "").replace(/^=/, ""), isEdit ? oracle.edit.formula : oracle.formula);
      assert.deepEqual(cell.value, { kind: "number", value: isEdit ? oracle.edit.value : oracle.cachedValue });
    }
  }
  report.phase = "production-engine-open-edit";
  const first = openWorkbook(imported.bytes);
  let saved;
  try {
    check(first, false);
    first.editCell(0, 14, 0, oracle.edit.input);
    check(first, true);
    saved = first.save();
  } finally { first.dispose(); }
  report.stages.push("Production WASM reads all original formulas and calculates edited A15=42");
  const savedPath = resolve(out, "Shared-formula-edited.xlsx");
  await writeFile(savedPath, saved);
  report.phase = "independent-saved-content";
  report.independentSaved = python(["--xlsx", savedPath, "--edited"]);
  report.stages.push("XLSX disk save independently preserves 30 formulas and their expected cached results");
  report.phase = "fresh-production-reopen";
  const reopened = await bereidOpenen("Shared-formula-edited.xlsx", new Uint8Array(await readFile(savedPath)), {
    runtimeBeschikbaar: async () => false,
    converteer: async () => { throw new Error("Saved XLSX must reopen directly without conversion"); },
  });
  assert(reopened); assert.equal(reopened.soort, "xlsx");
  const second = openWorkbook(reopened.bytes);
  try { check(second, true); } finally { second.dispose(); }
  report.reopenWithoutConversion = true;
  report.stages.push("Fresh production open from disk verifies all 30 formulas/results without converter");
  assert.equal(hash(await readFile("qa/xlsb35-p2/shared_formula.xlsb")), oracle.source.sha256);
  report.originalUnchanged = true;
  report.phase = "complete";
  report.status = "passed";
} catch (error) {
  report.status = "failed"; report.error = String(error); throw error;
} finally {
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await loader.close();
}
