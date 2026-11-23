/** One real legacy template, immutable source oracle, private Linux runtime and P2 Writer engine. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, lstat, readlink, realpath, writeFile } from "node:fs/promises";
import { resolve, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";
// Resolve existing helpers from the immutable application checkout, not the nested QA checkout.
const { converteerProef } = await import(pathToFileURL(resolve("scripts/formaatconversie-proef.mjs")).href);
const { MANIFEST, CACHE, DESTINATION, prepareRuntime } = await import(pathToFileURL(resolve("scripts/voorbereiden-kantoorruntime.mjs")).href);

const APP = "dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b";
const TREE = "5a644e397ecc6af5452a49b6404edf953687d1b2";
const MARKER = " — STW30 EDIT 2026-11-23";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const python = process.env.OOS_RUNTIME_PYTHON || "python3";
assert.equal(process.platform, "linux", "Do not execute the runtime on a local test host");
assert.equal(process.env.GITHUB_ACTIONS, "true", "Linux CI only");
assert.equal(git("rev-parse", "HEAD"), APP);
assert.equal(git("rev-parse", "HEAD^{tree}"), TREE);
assert.equal(JSON.parse(await readFile("versie.json", "utf8")).versie, "2026.48.1");
assert.equal(process.env.OPENAEC_CONVERSIE_PROGRAMMA, undefined, "No system/external runtime override");
assert.equal(git("status", "--porcelain", "--untracked-files=no"), "", "Product source must remain pristine");
const root = resolve(process.argv[2] || ".local/format30-stw-proof");
await mkdir(root, { recursive: false });
const sourceInfo = JSON.parse(await readFile(new URL("../docs/tests/format30-stw/source.json", import.meta.url), "utf8"));
assert.equal(sourceInfo.applicationCommit, APP);
const fixture = sourceInfo.fixture;
const response = await fetch(fixture.url, { signal: AbortSignal.timeout(30000) });
assert(response.ok, `Fixture HTTP ${response.status}`);
const bytes = new Uint8Array(await response.arrayBuffer());
assert.equal(bytes.length, fixture.bytes);
assert.equal(hash(bytes), fixture.sha256);
const sourcePath = join(root, "original.stw");
await writeFile(sourcePath, bytes, { flag: "wx" });
const oracleScript = fileURLToPath(new URL("format30-stw-oracle.py", import.meta.url));
const sourceOracle = join(root, "source-oracle.json");
execFileSync(python, ["-B", oracleScript, "source", sourcePath, "--report", sourceOracle], { stdio: "inherit", timeout: 20000 });
const expected = JSON.parse(await readFile(sourceOracle, "utf8"));
const audit = (path, name, marker = "") => {
  const report = join(root, `${name}-oracle.json`);
  execFileSync(python, ["-B", oracleScript, "audit", path, "--oracle", sourceOracle, "--marker", marker, "--report", report], { stdio: "inherit", timeout: 20000 });
  return report;
};
const report = { applicationCommit: APP, applicationTree: TREE, version: "2026.48.1",
  harnessCommit: process.env.OOS_STW_HARNESS_COMMIT, fixture, status: "failed", stages: [],
  packageBinding: { desktopRun: 45143305147, status: "pending canonical artifact binding; private runtime proof is not installer acceptance" },
  limits: ["No GUI, keyboard, native Rust IPC or file-dialog proof", "No non-empty table in source", "No universal STW variant, font substitution, pagination or complete TOC-field fidelity claim",
    "No Windows/macOS native checks; no browser STW support claim; no release/catalog promotion"] };
let loader, kernel, activeSessions = 0, destroyedSessions = 0, program, reusedBytes;
try {
  const reuseRoot = process.env.OOS_STW_REUSE_PROOF;
  if (reuseRoot) {
    const binding = JSON.parse(await readFile(new URL("../docs/tests/format30-stw/conversion-binding.json", import.meta.url), "utf8"));
    const verified = {};
    for (const [path, pin] of Object.entries(binding.files)) {
      const value = await readFile(join(reuseRoot, path));
      assert.equal(value.length, pin.bytes, path);
      assert.equal(hash(value), pin.sha256, path);
      verified[path] = value;
      await mkdir(join(root, path, ".."), { recursive: true });
      await writeFile(join(root, path), value);
    }
    const prior = JSON.parse(verified["report.json"]);
    // A completed conversion is reusable even though the first oracle failed on generated field delimiters.
    // Preserve its failed report separately; never promote the original job to passed.
    await writeFile(join(root, "conversion-origin-report.json"), verified["report.json"]);
    assert.equal(prior.status, "failed");
    assert.equal(prior.harnessCommit, binding.harnessCommit);
    assert.equal(prior.applicationCommit, APP);
    assert.equal(prior.applicationTree, TREE);
    assert.equal(prior.fixture.sha256, fixture.sha256);
    assert.equal(hash(await readFile(join(reuseRoot, "original.stw"))), fixture.sha256);
    assert.equal(prior.runtime.archiveSha256, MANIFEST.targets["linux-x64"].sha256);
    assert.equal(prior.runtime.receipt.sourceSha256, prior.runtime.archiveSha256);
    assert.equal(prior.profileSha256, hash(await readFile("src-tauri/src/conversieprofiel.xcu")));
    assert.equal(prior.editSha256, hash(await readFile("vendor/tekstengine/docx_edit_bg.wasm")));
    assert.equal(prior.layoutSha256, hash(await readFile("vendor/tekstengine/docx_layout_bg.wasm")));
    const inventory = JSON.parse(verified["runtime-inventory.json"]);
    assert.equal(hash(JSON.stringify(inventory)), prior.runtime.inventorySha256);
    assert.equal(inventory.length, prior.runtime.inventoryEntries);
    reusedBytes = verified["converted.docx"];
    assert.deepEqual(reusedBytes, verified["conversion/omgezet.docx"]);
    report.runtime = prior.runtime;
    report.reusedConversion = { ...binding, nativeConverterExecutedThisRun: false, originJobStatus: prior.status,
      reason: "Reuse verified actual P2 conversion; correct source-field oracle and continue real Linux engine tests" };
  } else {
  const receipt = await prepareRuntime({ key: "linux-x64", offline: true, checkOnly: true });
  const asset = MANIFEST.targets["linux-x64"];
  const archive = join(CACHE, asset.archive);
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(archive)) digest.update(chunk);
  assert.equal(digest.digest("hex"), asset.sha256, "Actual private source archive must match P2's pin");
  assert.equal(receipt.sourceSha256, asset.sha256);
  program = await realpath(join(DESTINATION, asset.executable));
  assert(program.startsWith((await realpath(DESTINATION)) + sep));
  const inventory = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const p = join(path, entry.name), item = { path: relative(DESTINATION, p).replaceAll("\\", "/") };
      const stat = await lstat(p);
      if (stat.isSymbolicLink()) inventory.push({ ...item, link: await readlink(p) });
      else if (stat.isDirectory()) await walk(p);
      else {
        const h = createHash("sha256");
        for await (const chunk of createReadStream(p)) h.update(chunk);
        inventory.push({ ...item, bytes: stat.size, sha256: h.digest("hex") });
      }
    }
  }
  await walk(DESTINATION);
  inventory.sort((a, b) => a.path.localeCompare(b.path));
  await writeFile(join(root, "runtime-inventory.json"), JSON.stringify(inventory, null, 2));
  report.runtime = { receipt, archiveSha256: asset.sha256, archiveBytes: (await lstat(archive)).size,
    executable: asset.executable, executableSha256: hash(await readFile(program)),
    inventorySha256: hash(JSON.stringify(inventory)), inventoryEntries: inventory.length,
    version: execFileSync(program, ["--version"], { encoding: "utf8", timeout: 15000,
      env: { ...process.env, SAL_DISABLE_DEFAULTPRINTER: "1", SAL_DISABLE_PRINTERLIST: "1" } }).trim() };
  assert(report.runtime.version.includes(MANIFEST.version));
  }
  const inventory = JSON.parse(await readFile(join(root, "runtime-inventory.json"), "utf8"));
  const payload = inventory.filter(entry => !entry.path.startsWith("meta/"));
  report.runtimePayload = { entries: payload.length, sha256: hash(JSON.stringify(payload)),
    excludedGeneratedMetadata: inventory.filter(entry => entry.path.startsWith("meta/")).map(entry => entry.path) };
  report.profileSha256 = hash(await readFile("src-tauri/src/conversieprofiel.xcu"));
  report.editSha256 = hash(await readFile("vendor/tekstengine/docx_edit_bg.wasm"));
  report.layoutSha256 = hash(await readFile("vendor/tekstengine/docx_layout_bg.wasm"));
  loader = await createServer({ configFile: false, appType: "custom", optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, watch: null } });
  await loader.ssrLoadModule("/src/i18n/testopzet.ts");
  const { bereidOpenen } = await loader.ssrLoadModule("/src/import/openen.ts");
  const formats = await loader.ssrLoadModule("/src/formaten.ts");
  const { isSjabloon } = await loader.ssrLoadModule("/src/import/sjabloon.ts");
  assert(formats.bestandstypen.docx.invoer.includes("stw"));
  assert(isSjabloon("Report.stw"));
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {};
    assert.equal((await formats.conversieStatus()).gevonden, false);
    await assert.rejects(bereidOpenen("Report.stw", bytes, { runtimeBeschikbaar: async () => false, converteer: formats.converteer }),
      error => /STW/.test(error.message) && /desktop/i.test(error.message) && /DOCX/.test(error.message));
    report.browserLimit = { passed: true, noTauri: true, runtimeUnavailable: true, messageContains: ["STW", "desktop", "DOCX"], scope: "Production no-Tauri guard in Node; no browser GUI executed" };
  } finally { if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; }
  let conversions = 0;
  const opened = await bereidOpenen("Report.stw", bytes, { runtimeBeschikbaar: async () => true,
    converteer: async (input, from, to, module) => {
      assert.equal(hash(input), fixture.sha256);
      assert.deepEqual([from, to, module], ["stw", "docx", "docx"]);
      conversions++;
      if (reusedBytes) return new Uint8Array(reusedBytes);
      const result = await converteerProef(program, input, from, to, formats.bestandstypen.docx.uitvoer.docx.filter, join(root, "conversion"));
      return result.bytes;
    } });
  assert.equal(conversions, 1);
  assert(opened);
  assert.equal(opened.soort, "docx");
  assert.equal(opened.alsNieuw, true);
  assert.equal(opened.gewijzigd, true);
  assert.equal(opened.exportFormaat, "docx", "Recommended modern document save must not overwrite the STW source");
  assert(!opened.rapport?.regels.some(r => r.id === "empty-conversion"));
  report.openResult = { naam: opened.naam, soort: opened.soort, alsNieuw: opened.alsNieuw, gewijzigd: opened.gewijzigd, exportFormaat: opened.exportFormaat, rapport: opened.rapport };
  const converted = join(root, "converted.docx");
  await writeFile(converted, opened.bytes);
  audit(converted, "converted"); report.stages.push(reusedBytes
    ? "Verified prior actual private-runtime conversion; fresh source-derived OOXML audit"
    : "Actual private-runtime conversion and source-derived OOXML audit");
  const { openTekstkernProef } = await loader.ssrLoadModule("/scripts/tekstkern-proef.ts");
  kernel = await openTekstkernProef();
  report.engineCompatibility = kernel.aansluiting;
  function modelText(session) {
    const result = session.exportStructured({ revisionView: "accepted", stories: ["body"], includeFormatting: true });
    assert(result.ok, JSON.stringify(result));
    const inline = xs => xs.map(x => x.kind === "text" ? x.text : x.kind === "tab" ? " " : x.kind === "contentControl" ? inline(x.inlines) : x.kind === "field" ? x.cachedResult.kind === "inline" ? inline(x.cachedResult.inlines) : x.cachedResult.kind === "blocks" ? blocks(x.cachedResult.blocks) : "" : "").join("");
    const blocks = xs => xs.map(b => b.paragraph ? inline(b.paragraph.inlines) : b.kind === "contentControl" ? blocks(b.blocks) : b.kind === "table" ? b.table.rows.flatMap(r => r.cells.map(c => blocks(c.blocks))).join("\n") : "").join("\n");
    return { text: result.content.stories.map(s => blocks(s.blocks)).join("\n"), structured: result };
  }
  function checkModel(session, edited) {
    const result = modelText(session), normalized = result.text.replace(/\s+/g, " ");
    let at = 0;
    for (let i = 0; i < expected.paragraphs.length; i++) {
      const text = expected.paragraphs[i].stableText + (i === 0 && edited ? MARKER : "");
      const found = normalized.indexOf(text, at);
      assert(found >= 0, `Native engine lost/reordered source block ${i}: ${text}`);
      at = found + text.length;
    }
    assert.equal(result.text.includes(MARKER), edited);
    return result;
  }
  const session = await kernel.sdk.createYrsSession();
  activeSessions++;
  let saved;
  try {
    session.openDocx(opened.bytes, true);
    const openedModel = checkModel(session, false).structured;
    await writeFile(join(root, "engine-open.json"), JSON.stringify(openedModel, null, 2));
    // This genuine template title is a DOCVARIABLE field, represented by one editable engine embed.
    // Resolve its paragraph through the exported field anchor, then append after the embed.
    const titleBlock = openedModel.content.stories.flatMap(story => story.blocks).find(block =>
      block.paragraph?.inlines.some(inline => inline.kind === "field" && inline.fieldType === "DOCVARIABLE" &&
        inline.cachedResult.kind === "inline" && inline.cachedResult.inlines.some(run => run.text === expected.paragraphs[0].text)));
    assert(titleBlock?.anchor?.paraId, "Expected source title field anchor");
    const title = session.paragraphs("body").find(p => p.paraId === titleBlock.anchor.paraId);
    assert(title, "Expected editable source title paragraph");
    report.editTarget = { fieldType: "DOCVARIABLE", paraId: title.paraId, engineOffset: title.text.length,
      operation: "Append after source title field; retain original cached title" };
    const at = { story: "body", paraId: title.paraId, offset: title.text.length };
    session.setSelection(at);
    session.beginUndoCapture("body"); session.addUndoBoundary();
    session.insertText(at, MARKER); session.addUndoBoundary();
    checkModel(session, true);
    session.undo(); checkModel(session, false);
    session.redo(); checkModel(session, true);
    saved = (await kernel.sdk.saveYrsDocx(session)).bytes;
  } finally { session.destroy(); activeSessions--; destroyedSessions++; }
  const editedPath = join(root, "edited.docx");
  await writeFile(editedPath, saved); audit(editedPath, "edited", MARKER);
  const reopened = await kernel.sdk.createYrsSession();
  activeSessions++;
  try {
    reopened.openDocx(saved, true);
    await writeFile(join(root, "engine-reopen.json"), JSON.stringify(checkModel(reopened, true).structured, null, 2));
    const again = (await kernel.sdk.saveYrsDocx(reopened)).bytes;
    const path = join(root, "reopened.docx");
    await writeFile(path, again); audit(path, "reopened", MARKER);
  } finally { reopened.destroy(); activeSessions--; destroyedSessions++; }
  assert.equal(hash(await readFile(sourcePath)), fixture.sha256);
  assert.equal(git("status", "--porcelain", "--untracked-files=no"), "");
  report.stages.push("P2 Writer kernel open, title edit, Undo/Redo, modern DOCX save and fresh-session reopen with independent XML audits");
  report.status = reusedBytes ? "passed-reused-private-conversion-and-live-engine" : "passed-private-runtime-and-engine";
} catch (error) {
  report.error = { message: String(error), stack: error.stack };
  throw error;
} finally {
  const cleanup = { activeSessions, destroyedSessions, privateEngineCopy: kernel ? "pending" : "not-created", loader: loader ? "pending" : "not-created",
    conversionProfiles: "P2 helper finally owns profile cleanup; not independently inventoried; no live user profile touched", guiCaptureStarted: false };
  try { if (kernel) { kernel.sluit(); cleanup.privateEngineCopy = "closed"; } } catch (error) { cleanup.engineError = String(error); }
  try { if (loader) { await loader.close(); cleanup.loader = "closed"; } } catch (error) { cleanup.loaderError = String(error); }
  report.cleanup = cleanup;
  if (activeSessions || cleanup.engineError || cleanup.loaderError) {
    report.status = "failed-cleanup";
    process.exitCode = 1;
  }
  await writeFile(join(root, "report.json"), JSON.stringify(report, null, 2));
}
