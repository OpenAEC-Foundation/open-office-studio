/** One bounded actual-browser render observation; no product edits, conversion or fix claim. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { preview } from "vite";
import { chromium } from "playwright";

const APP = "dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b";
const TREE = "5a644e397ecc6af5452a49b6404edf953687d1b2";
const sha = b => createHash("sha256").update(b).digest("hex");
assert.equal(process.platform, "linux"); assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), APP);
assert.equal(execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim(), TREE);
const { verifyBuildReceipt } = await import(pathToFileURL(resolve("scripts/writer-proefbuild.mjs")));
const [outDir, output] = process.argv.slice(2), root = resolve(output);
await mkdir(root);
const inputDir = fileURLToPath(new URL("../docs/tests/format30-stw/render-inputs/", import.meta.url));
const inputs = JSON.parse(await readFile(join(inputDir, "manifest.json"), "utf8"));
assert.equal(inputs.applicationCommit, APP); assert.equal(inputs.applicationTree, TREE);
const receiptPath = outDir + ".build.json";
const report = { applicationCommit: APP, applicationTree: TREE, harnessCommit: process.env.OOS_STW_HARNESS_COMMIT,
  scope: "Read-only browser display of unchanged Windows DOCX, unchanged conversion control and explicitly derived field-flattening diagnostic; not native acceptance or a fix",
  status: "failed", cases: [], errors: [], externalRequests: [] };
let server, browser, context, page;
try {
  await verifyBuildReceipt({ outDir, route: "/", receiptPath });
  await writeFile(join(root, "build-receipt.json"), await readFile(receiptPath));
  await writeFile(join(root, "input-manifest.json"), await readFile(join(inputDir, "manifest.json")));
  server = await preview({ configFile: false, base: "/", cacheDir: join(root, "preview-cache"), build: { outDir }, preview: { host: "127.0.0.1", port: 0, open: false } });
  browser = await chromium.launch({ headless: true });
  for (const name of ["unmodified-converter-control.docx", "windows-native-resaved.docx", "diagnostic-title-as-text.docx"]) {
    const bytes = await readFile(join(inputDir, name)), pin = inputs.inputs[name];
    assert.equal(bytes.length, pin.bytes); assert.equal(sha(bytes), pin.sha256);
    context = await browser.newContext({ locale: "en-GB", viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 1 });
    page = await context.newPage(); page.setDefaultTimeout(60000);
    page.on("pageerror", error => report.errors.push({ input: name, error: String(error) }));
    page.on("request", request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== "127.0.0.1") report.externalRequests.push(request.url()); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    assert.equal(await page.evaluate(() => typeof window.__TAURI_INTERNALS__), "undefined");
    await page.locator(".office > input[type=file]").setInputFiles({ name, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: bytes });
    await page.locator(".office-tabnaam").filter({ hasText: name }).waitFor();
    const canvas = page.locator(".canvas-page canvas:visible").first(); await canvas.waitFor();
    await page.evaluate(() => document.fonts.ready); await page.waitForLoadState("networkidle");
    const caseDir = join(root, name.replace(".docx", "")); await mkdir(caseDir);
    await page.screenshot({ path: join(caseDir, "visible-document.png"), animations: "disabled" });
    await page.locator(".canvas-page").first().screenshot({ path: join(caseDir, "first-page.png"), animations: "disabled" });
    const environment = await page.evaluate(() => ({ route: location.pathname, title: document.title,
      fontsStatus: document.fonts.status, fonts: [...document.fonts].map(f => ({ family: f.family, style: f.style, weight: f.weight, status: f.status })),
      messages: [...document.querySelectorAll(".office-melding")].map(e => e.innerText),
      canvases: [...document.querySelectorAll(".canvas-page canvas")].map(e => ({ width: e.width, height: e.height, cssWidth: e.getBoundingClientRect().width, cssHeight: e.getBoundingClientRect().height })) }));
    assert.equal(environment.route, "/"); assert.equal(environment.fontsStatus, "loaded"); assert(environment.canvases.length);
    await writeFile(join(caseDir, "environment.json"), JSON.stringify(environment, null, 2));
    await context.close(); context = undefined; page = undefined;
    report.cases.push({ name, ...pin, noEditsOrSaves: true, contextClosed: true, observed: "Captured for independent image review; no automatic visual-pass inference" });
    assert.equal(sha(await readFile(join(inputDir, name))), pin.sha256);
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
  await verifyBuildReceipt({ outDir, route: "/", receiptPath });
  report.status = "captured-for-visual-triage";
} catch (error) {
  report.error = String(error.stack || error); process.exitCode = 1;
  try { await page?.screenshot({ path: join(root, "failure.png") }); } catch {}
} finally {
  const errors = [];
  for (const [name, close] of [["context", () => context?.close()], ["browser", () => browser?.close()], ["server", () => server?.close()]]) {
    try { await close(); } catch (error) { errors.push({ name, error: String(error) }); }
  }
  report.cleanup = { contextsClosed: !context || errors.length === 0, browserClosed: !!browser && !browser.isConnected(), serverClosed: !!server && !server.httpServer.listening, errors };
  if (errors.length) { report.status = "failed-cleanup"; process.exitCode = 1; }
  await writeFile(join(root, "report.json"), JSON.stringify(report, null, 2));
}
