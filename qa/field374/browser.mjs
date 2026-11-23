/** Actual supported-browser field render/edit/save/fresh-open case, reusable at an explicit integration pin. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { preview } from "vite";
import { chromium } from "playwright";
import { fixture, prepareOracle, auditDocx, MARKER, hash } from "./contract.mjs";
import { capturePresentedStableFrame } from "./capture.mjs";

const [applicationCommit, outDir, route, output] = process.argv.slice(2);
assert.match(applicationCommit || "", /^[a-f0-9]{40}$/); assert(["/", "/office/"].includes(route)); assert(outDir && output);
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), applicationCommit);
const { verifyBuildReceipt } = await import(pathToFileURL(resolve("scripts/writer-proefbuild.mjs")));
const root = resolve(output); await mkdir(root, { recursive: true });
const sourceOracle = await prepareOracle(root), receiptPath = outDir + ".build.json";
const report = { applicationCommit, route, platform: process.platform, harnessSha256: hash(await readFile(new URL("browser.mjs", import.meta.url))),
  contractSha256: hash(await readFile(new URL("contract.mjs", import.meta.url))),
  captureSha256: hash(await readFile(new URL("capture.mjs", import.meta.url))),
  visualReview: "Original PNG marker/layout review is required separately from worker geometry and stable capture.",
  status: "failed", cases: [], errors: [], externalRequests: [] };
const MOD = process.platform === "darwin" ? "Meta" : "Control";
let browser, context, page, server, workers = [], hooks = [];

// Observe actual paint without changing source, field data, font choice, input
// or pixels. The same wrapper calls the original methods in DOM and workers.
function installPaintObserver({ captureTransform = false } = {}) {
  if (globalThis.__oosField374Paint) return;
  const records = [], latestFrames = {}, states = new WeakMap(); let serial = 0, seq = 0;
  const state = ctx => { let s = states.get(ctx); if (!s) { s = { id: ++serial, frame: 0 }; states.set(ctx, s); } return s; };
  globalThis.__oosField374Paint = { records, latestFrames };
  for (const name of ["CanvasRenderingContext2D", "OffscreenCanvasRenderingContext2D"]) {
    const proto = globalThis[name]?.prototype; if (!proto) continue;
    const clear = proto.clearRect, fill = proto.fillText;
    proto.clearRect = function (...args) { const s = state(this); s.frame++; latestFrames[s.id] = s.frame; return clear.apply(this, args); };
    proto.fillText = function (text, x, y, ...rest) {
      const result = fill.call(this, text, x, y, ...rest);
      const px = Number(/([\d.]+)px/.exec(this.font)?.[1]);
      if (px >= 40 && px <= 45 && this.canvas.width >= 750 && this.canvas.height >= 1000) {
        const m = this.measureText(String(text)), s = state(this);
        latestFrames[s.id] = s.frame;
        const transform = captureTransform ? this.getTransform() : null;
        records.push({ context: s.id, frame: s.frame, seq: ++seq, text: String(text), x, y, font: this.font,
          tracking: this.letterSpacing, width: m.width, inkLeft: x - m.actualBoundingBoxLeft, inkRight: x + m.actualBoundingBoxRight,
          ...(transform ? { transform: { a: transform.a, b: transform.b, c: transform.c, d: transform.d, e: transform.e, f: transform.f } } : {}),
          canvasWidth: this.canvas.width, canvasHeight: this.canvas.height });
        if (records.length > 2500) records.splice(0, records.length - 2500);
      }
      return result;
    };
  }
}
async function open(bytes, name) {
  workers = []; hooks = [];
  context = await browser.newContext({ locale: "en-GB", viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 1 });
  const observerOptions = { captureTransform: process.platform === "darwin" };
  page = await context.newPage(); page.setDefaultTimeout(60000); await page.addInitScript(installPaintObserver, observerOptions);
  page.on("worker", worker => { workers.push(worker); hooks.push(worker.evaluate(installPaintObserver, observerOptions).catch(() => {})); });
  page.on("pageerror", error => report.errors.push(String(error)));
  page.on("request", req => { if (/^https?:/.test(req.url()) && new URL(req.url()).hostname !== "127.0.0.1") report.externalRequests.push(req.url()); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}${route}`);
  assert.equal(new URL(page.url()).pathname, route); assert.equal(await page.evaluate(() => typeof window.__TAURI_INTERNALS__), "undefined");
  await page.locator(".office > input[type=file]").setInputFiles({ name, mimeType: "application/octet-stream", buffer: bytes });
  await page.locator(".office-tabnaam").filter({ hasText: name }).waitFor();
  await page.locator(".canvas-page canvas:visible").first().waitFor(); await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle"); await Promise.all(hooks);
}
async function paints() {
  const read = () => ({ value: globalThis.__oosField374Paint?.records || [], latestFrames: globalThis.__oosField374Paint?.latestFrames || {} });
  const sources = [{ name: "page", ...await page.evaluate(read) }];
  for (let i = 0; i < workers.length; i++) {
    try { sources.push({ name: `worker${i}`, ...await workers[i].evaluate(read) }); } catch {}
  }
  return sources;
}
async function snapshot(name, marker) {
  const wanted = ("REPORT TITLE" + marker).replace(/\s/g, ""); let observation;
  async function findObservation() {
    for (const source of await paints()) {
      const titles = source.value.filter(p => p.text === "REPORT TITLE");
      for (const title of titles.toReversed()) {
        if (source.latestFrames[title.context] !== title.frame) continue;
        const frame = source.value.filter(p => p.context === title.context && p.frame === title.frame).sort((a, b) => a.seq - b.seq);
        if (frame.map(p => p.text).join("").replace(/\s/g, "") !== wanted) continue;
        const neighbors = frame.filter(p => p.seq > title.seq && Math.abs(p.y - title.y) < 0.1 && p.text.trim());
        return { source: source.name, title, frame, neighbors,
          overlapping: neighbors.filter(p => p.inkLeft < title.inkRight - 0.75) };
      }
    }
  }
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    observation = await findObservation();
    if (observation) break;
    await delay(100);
  }
  assert(observation, `${name}: actual Canvas title/suffix paint not observed; classify as driver failure`);
  const stable = await capturePresentedStableFrame({ page, findObservation, root, name });
  observation = stable.observation;
  await writeFile(join(root, name + "-paint.json"), JSON.stringify(observation, null, 2));
  assert.deepEqual(observation.overlapping, [], `${name}: actual painted glyphs overlap`);
  report.cases.push({ name, paintedTitleObserved: true, fullExpectedTextPainted: true, overlappingGlyphRuns: 0, marker,
    stableOriginalPngSha256: stable.evidence.acceptedPngSha256, originalPngMarkerReviewRequired: true });
}
async function save(name, marker) {
  const input = page.locator('[data-testid="yrs-input"]:visible'); await input.focus();
  await page.keyboard.press(MOD + "+Shift+s");
  const dialog = page.getByRole("dialog", { name: /^(Save as|Opslaan als)$/i }); await dialog.waitFor();
  const download = page.waitForEvent("download"); void download.catch(() => {});
  await dialog.getByRole("button", { name: /^(Save|Opslaan)$/i }).click();
  const bytes = await readFile(await (await download).path());
  const audit = await auditDocx(bytes, root, name, sourceOracle, marker);
  report.cases.push({ name, saveAudit: audit }); return bytes;
}
try {
  const receipt = await verifyBuildReceipt({ outDir, route, receiptPath });
  assert.equal(receipt.source, applicationCommit); report.applicationTree = receipt.tree;
  await writeFile(join(root, "build-receipt.json"), await readFile(receiptPath));
  server = await preview({ configFile: false, base: route, cacheDir: join(root, "preview-cache"), build: { outDir }, preview: { host: "127.0.0.1", port: 0, open: false } });
  browser = await chromium.launch({ headless: true }); report.browser = browser.version();
  // Retained native Windows output is opened byte-for-byte, never flattened.
  await open(await fixture("windows-resaved.docx"), "Windows-retained.docx");
  await snapshot("unchanged-windows-source", MARKER); await save("windows-source-save", MARKER);
  await context.close(); context = undefined;
  await open(await fixture("converted.docx"), "Original-control.docx"); await snapshot("unmodified-control", "");
  const input = page.locator('[data-testid="yrs-input"]:visible');
  await page.locator(".canvas-page canvas:visible").first().click(); assert(await input.evaluate(el => el === document.activeElement));
  if (process.platform === "darwin") {
    const { moveMacCaretToCachedFieldEnd } = await import("./mac-field-caret.mjs");
    report.macCaretPreflight = await moveMacCaretToCachedFieldEnd({ page, root });
  } else {
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("End");
  }
  await page.keyboard.type(MARKER); await snapshot("after-real-edit", MARKER);
  const saved = await save("after-edit-save", MARKER); await context.close(); context = undefined;
  await open(saved, "Fresh-reopen.docx"); await snapshot("fresh-context-reopen", MARKER); await save("reopened-save", MARKER);
  await context.close(); context = undefined;
  await verifyBuildReceipt({ outDir, route, receiptPath }); assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
  await fixture("windows-resaved.docx"); await fixture("converted.docx"); report.status = "passed";
} catch (error) {
  report.error = String(error.stack || error); process.exitCode = 1;
  try { await page?.screenshot({ path: join(root, "failure.png") }); } catch {}
} finally {
  const errors = [];
  for (const [name, close] of [["context", () => context?.close()], ["browser", () => browser?.close()], ["server", () => server?.close()]]) {
    try { await close(); } catch (error) { errors.push({ name, error: String(error) }); }
  }
  report.cleanup = { contextsClosed: errors.length === 0, browserClosed: !!browser && !browser.isConnected(), serverClosed: !!server && !server.httpServer.listening, errors, localNativeGuiStarted: false };
  if (errors.length) { report.status = "failed-cleanup"; process.exitCode = 1; }
  await writeFile(join(root, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, cases: report.cases.length, error: report.error }));
}
