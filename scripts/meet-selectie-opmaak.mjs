/** Compare a pinned kernel in the same browser bundle, without changing vendor. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { preview } from "vite";
import {
  maakWerkmap,
  controleerWerkmap,
} from "./spreadsheet-proef-prestaties.mjs";

const [outDir, label, cpu = "4", wasm] = process.argv.slice(2);
assert(outDir && /^[a-zA-Z0-9_-]+$/.test(label) && Number(cpu) >= 1);
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href
    : "playwright"
);
const asset = fs
  .readdirSync(resolve(outDir, "assets"))
  .filter((n) => /^xlsx_wasm_bg-.*\.wasm$/.test(n));
assert.equal(asset.length, 1, "Expected exactly one spreadsheet kernel asset");
const kernel = fs.readFileSync(wasm ?? resolve(outDir, "assets", asset[0]));
const result = {
  label,
  cpu: Number(cpu),
  kernel: {
    sha256: createHash("sha256").update(kernel).digest("hex"),
    bytes: kernel.length,
    override: !!wasm,
  },
  errors: [],
};
maakWerkmap();
const server = await preview({
  configFile: false,
  build: { outDir },
  preview: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
  });
  page.setDefaultTimeout(180000);
  page.on("pageerror", (e) => result.errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({ taal: "en", thema: "light" }),
    ),
  );
  let requests = 0;
  await page.route(`**/${asset[0]}`, async (route) => {
    requests++;
    await route.fulfill({
      status: 200,
      contentType: "application/wasm",
      body: kernel,
    });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(cpu) });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(".local/performance.xlsx");
  await page.waitForFunction(
    () =>
      window.__appApis?.rekenblad?.handle &&
      document.querySelector('[data-testid="xlsx-scroll"]'),
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  assert.equal(requests, 1, "The intended native kernel must actually load");
  const samples = [];
  for (let i = 0; i < 7; i++) {
    samples.push(
      await page.evaluate(() => {
        const h = window.__appApis.rekenblad.handle;
        const version = h.version();
        const start = performance.now();
        const formatting = h.selectionFormatting(0, "A1:J10000");
        const ms = performance.now() - start;
        return { ms, formatting, unchanged: version === h.version() };
      }),
    );
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  const one = await page.evaluate(() =>
    window.__appApis.rekenblad.handle.selectionFormatting(0, "A1"),
  );
  for (const sample of samples) {
    assert.equal(sample.unchanged, true);
    assert.deepEqual(sample.formatting, one);
  }
  const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
  result.uniform = {
    cells: 100000,
    samplesMs: samples.map((s) => s.ms),
    medianMs: sorted[3],
    maxMs: sorted[6],
    formatting: one,
    unchanged: true,
  };
  console.log("uniform", JSON.stringify(result.uniform));
  result.semantics = await page.evaluate(() => {
    const h = window.__appApis.rekenblad.handle;
    const range = "A1:J10000";
    const uniform = h.selectionFormatting(0, range);
    if (!h.patchRangeStyle(0, "J10000", { bold: !uniform.bold }).applied)
      throw Error("Mixed-format mutation was not applied");
    const mixed = h.selectionFormatting(0, range);
    h.undo();
    const restored = h.selectionFormatting(0, range);
    if (
      !h.patchRangeStyle(0, "A1:J10", {
        border: { preset: "outer", style: "solid", color: "#FF0000" },
      }).applied
    )
      throw Error("Border mutation was not applied");
    const border = h.selectionFormatting(0, "A1:J10");
    h.undo();
    return { uniform, mixed, restored, border };
  });
  assert.equal(result.semantics.mixed.bold, undefined);
  assert.deepEqual(result.semantics.restored, result.semantics.uniform);
  assert.equal(result.semantics.border.borderPreset, "outer");
  assert.equal(result.semantics.border.borderColor?.toLowerCase(), "#ff0000");
  const start = performance.now();
  await page.evaluate(() =>
    window.__appApis.rekenblad.selectCells(0, {
      anchor: { row: 0, col: 0 },
      focus: { row: 9999, col: 9 },
    }),
  );
  await page.waitForFunction(
    () => window.__appStatus()?.statistiek?.aantal === 100000,
  );
  result.selectionAndStatisticsMs = performance.now() - start;
  const saved = await page.evaluate(async () =>
    Array.from(await window.__appApis.rekenblad.save()),
  );
  const file = `.local/selection-${label}.xlsx`;
  fs.writeFileSync(file, new Uint8Array(saved));
  result.verifiedCells = await controleerWerkmap(file, 1);
  assert.deepEqual(result.errors, []);
  fs.writeFileSync(
    `.local/selection-${label}.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await new Promise((r, j) => server.httpServer.close((e) => (e ? j(e) : r())));
}
