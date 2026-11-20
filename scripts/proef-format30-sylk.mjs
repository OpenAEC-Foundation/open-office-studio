/** One format route: real canonical private runtime and production XLSX engine. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { initWasm, openWorkbook } from "@betteroffice/xlsx";
import { converteerProef } from "./formaatconversie-proef.mjs";

const APP = "7f126f4b8e5269a54388cf78c48c78d2acc0daa1";
const TREE = "8bc608488760e48919d7fb4e72a42569175b52a4";
const SOURCE = "bcfaae8f2ce55e393c100dcd95c37301129b9121af0429586de75b3ec99df420";
const URL = "https://raw.githubusercontent.com/LibreOffice/core/92c170f11d44857d8e365f2e29fb449dfb567ff5/sc/qa/unit/data/slk/pass/ooo80484-1.slk";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const python = process.env.OOS_RUNTIME_PYTHON || (process.platform === "win32" ? "python" : "python3");
assert.equal(process.env.GITHUB_ACTIONS, "true", "Converter execution is isolated-CI only");
assert.equal(git("rev-parse", "HEAD"), APP);
assert.equal(git("rev-parse", "HEAD^{tree}"), TREE);
const tracked = () => git("status", "--porcelain", "--untracked-files=no");
assert.equal(tracked(), "", "Application source must remain pristine");
assert.equal(process.env.OPENAEC_CONVERSIE_PROGRAMMA, undefined, "No external runtime override");
const [planPath, platform, installerRoot, output] = process.argv.slice(2);
assert(planPath && platform && installerRoot && output);
const plan = JSON.parse(await readFile(planPath, "utf8"));
assert.equal(plan.applicationCommit, APP); assert.equal(plan.desktopRun, 44715026752); assert.equal(plan.frozen, true);
const verification = JSON.parse(await readFile(join(installerRoot, "verified.json"), "utf8"));
assert.equal(verification.applicationCommit, APP); assert.equal(verification.platform, platform);
assert.deepEqual(verification.packages, plan.artifacts[platform].packages);
const root = resolve(output); await mkdir(root, { recursive: false });
const fixturePath = join(root, "original.sylk");
const response = await fetch(URL, { signal: AbortSignal.timeout(30000) });
assert(response.ok, `Fixture HTTP ${response.status}`);
const fixture = new Uint8Array(await response.arrayBuffer());
assert.equal(fixture.length, 2581); assert.equal(hash(fixture), SOURCE);
await writeFile(fixturePath, fixture, { flag: "wx" });
const oracle = fileURLToPath(new URL("format30-sylk-oracle.py", import.meta.url));
execFileSync(python, ["-B", oracle, "--source", fixturePath, "--report", join(root, "source-oracle.json")], { stdio: "inherit", timeout: 20000 });
const expected = JSON.parse(await readFile(join(root, "source-oracle.json"), "utf8")).expectedCells;
const report = { applicationCommit: APP, applicationTree: TREE, desktopRun: plan.desktopRun,
  harnessCommit: process.env.OOS_FORMAT30_HARNESS, platform, source: { url: URL, sha256: SOURCE, bytes: fixture.length,
    alias: ".sylk is tested with the immutable genuine SYLK bytes originally named .slk; not evidence of a different format" },
  artifactVerification: verification, scope: "Real private runtime + production TypeScript input/engine route; no native app/dialog/visual claim", cases: [], status: "failed" };
let loader;
try {
  await initWasm(await readFile("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"));
  loader = await createServer({ configFile: false, appType: "custom", optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, watch: null } });
  await loader.ssrLoadModule("/src/i18n/testopzet.ts");
  const { bereidOpenen } = await loader.ssrLoadModule("/src/import/openen.ts");
  const formats = await loader.ssrLoadModule("/src/formaten.ts");
  assert(formats.bestandstypen.xlsx.invoer.includes("sylk"));
  const oldWindow = globalThis.window;
  try {
    globalThis.window = {}; // Test the actual no-Tauri guard, not a native IPC substitute.
    await assert.rejects(bereidOpenen("Bron.sylk", fixture, { runtimeBeschikbaar: async () => false,
      converteer: formats.converteer }), error => /SYLK/.test(error.message) && /desktopapp/.test(error.message) && /XLSX/.test(error.message));
    report.browserLimitation = { noTauriGuard: true, desktopAlternative: true,
      scope: "Production source-level no-Tauri guard in Node; actual hosted GUI not executed by this job" };
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
  function assertCells(book, marker = false) {
    const info = book.sheetInfo(); assert.equal(info.sheetIds.length, 1);
    for (const [address, value] of Object.entries(expected)) {
      const cells = book.readCells({ ranges: [{ sheetId: info.sheetIds[0], range: { kind: "a1", a1: address } }] });
      assert(cells.ok, `readCells ${address}`);
      const actual = cells.ranges[0].cells[0][0].value;
      assert.equal(actual.kind, value.kind === "string" ? "text" : "number", address);
      if (value.kind === "number") assert(Math.abs(actual.value - value.value) < 1e-8, address);
      else assert.equal(actual.value, value.value, address);
    }
    if (marker) {
      const cells = book.readCells({ ranges: [{ sheetId: info.sheetIds[0], range: {kind: "a1", a1: "L1"} }] });
      assert(cells.ok); assert.deepEqual(cells.ranges[0].cells[0][0].value, { kind: "text", value: "SYLK30 EDIT" });
    }
  }
  for (const pkg of verification.packages) {
    const tempBase = await realpath(tmpdir()), temporary = await mkdtemp(join(tempBase, "oos-format30-sylk-"));
    const caseRoot = join(root, pkg.kind); await mkdir(caseRoot);
    const item = { kind: pkg.kind, packageSha256: pkg.sha256, status: "failed", extensions: [] };
    report.cases.push(item);
    try {
      const packagePath = join(installerRoot, "packages", pkg.path);
      assert.equal(hash(await readFile(packagePath)), pkg.sha256);
      execFileSync(python, ["scripts/pak-runtimeproef-uit.py", packagePath, join(temporary, "payload"), join(caseRoot, "package.json")], { stdio: "inherit", timeout: 180000 });
      const payload = JSON.parse(await readFile(join(caseRoot, "package.json"), "utf8"));
      assert.equal(payload.packageSha256, pkg.sha256);
      item.runtimeVersion = execFileSync(payload.program, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 20000 }).trim();
      assert(item.runtimeVersion.includes("26.8.2.2"));
      item.profileSha256 = hash(await readFile("src-tauri/src/conversieprofiel.xcu"));
      for (const ext of ["slk", "sylk"]) {
        const dir = join(caseRoot, ext); await mkdir(dir);
        const result = { ext, status: "failed" }; item.extensions.push(result);
        let conversions = 0;
        const opened = await bereidOpenen(`Bron.${ext}`, fixture, { runtimeBeschikbaar: async () => true,
          converteer: async (bytes, from, to, module) => {
            assert.equal(from, ext); assert.equal(to, "xlsx"); assert.equal(module, "xlsx"); conversions++;
            return (await converteerProef(payload.program, bytes, from, to, formats.bestandstypen.xlsx.uitvoer.xlsx.filter, dir)).bytes;
          } });
        assert.equal(conversions, 1); assert(opened && opened.soort === "xlsx" && opened.naam.endsWith(".xlsx"));
        const converted = join(dir, "converted.xlsx"), saved = join(dir, "saved.xlsx"), reopened = join(dir, "reopened.xlsx");
        await writeFile(converted, opened.bytes);
        execFileSync(python, ["-B", oracle, "--source", fixturePath, "--xlsx", converted, "--report", join(dir, "converted-oracle.json")], { stdio: "inherit", timeout: 20000 });
        const book = openWorkbook(opened.bytes); let bytes;
        try { assertCells(book); book.editCell(0, 0, 11, "SYLK30 EDIT"); assertCells(book, true); bytes = book.save(); }
        finally { book.dispose(); }
        await writeFile(saved, bytes);
        const again = openWorkbook(bytes);
        try { assertCells(again, true); await writeFile(reopened, again.save()); }
        finally { again.dispose(); }
        for (const [path, stage] of [[saved, "saved"], [reopened, "reopened"]])
          execFileSync(python, ["-B", oracle, "--source", fixturePath, "--xlsx", path, "--marker", "--report", join(dir, `${stage}-oracle.json`)], { stdio: "inherit", timeout: 20000 });
        assert.equal(hash(await readFile(fixturePath)), SOURCE);
        assert.equal(hash(fixture), SOURCE);
        Object.assign(result, { status: "passed", originalUnchanged: true, convertedSha256: hash(opened.bytes),
          savedSha256: hash(bytes), reopenedSha256: hash(await readFile(reopened)), expectedCellsChecked: Object.keys(expected).length, markerSavedReopened: true });
      }
      item.status = "passed";
    } finally {
      const target = await realpath(temporary);
      assert.equal(dirname(target), tempBase); assert(basename(target).startsWith("oos-format30-sylk-"));
      await rm(target, { recursive: true, force: true });
      item.temporaryDisposed = true;
    }
  }
  assert.equal(tracked(), ""); report.dataAndRoutePassed = true;
} catch (error) { report.error = String(error.stack || error); throw error; }
finally {
  let cleanupError;
  try { if (loader) await loader.close(); report.loaderClosed = true; }
  catch (error) { cleanupError = error; report.cleanupError = String(error); }
  report.status = report.dataAndRoutePassed && report.loaderClosed && !report.error ? "passed" : "failed";
  await writeFile(join(root, "report.json"), JSON.stringify(report, null, 2));
  if (cleanupError) throw cleanupError;
}
