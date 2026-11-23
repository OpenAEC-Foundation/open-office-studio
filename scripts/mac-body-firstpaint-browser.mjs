/** External, read-only first-paint diagnosis on a byte-verified preserved build. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const dependencyRoot = resolve(process.env.OOS_DIAGNOSTIC_DEPENDENCIES);
const appRoot = resolve(process.env.OOS_DIAGNOSTIC_APP);
const require = createRequire(join(dependencyRoot, "package.json"));
const { chromium, webkit } = require("playwright");
const { preview } = await import(pathToFileURL(require.resolve("vite")));
const out = resolve(process.argv[2]);
await mkdir(out, { recursive: false });
const sha = value => createHash("sha256").update(value).digest("hex");
const receiptPath = join(appRoot, process.env.OOS_DIAGNOSTIC_RECEIPT ?? ".local/nov20-I3-normal.build.json");
const receiptBytes = await readFile(receiptPath), receipt = JSON.parse(receiptBytes);
assert.equal(receipt.source, process.env.OOS_DIAGNOSTIC_SOURCE ?? "7f126f4b8e5269a54388cf78c48c78d2acc0daa1");
assert.equal(receipt.tree, process.env.OOS_DIAGNOSTIC_TREE ?? "8bc608488760e48919d7fb4e72a42569175b52a4");
for (const [name, expected] of Object.entries(receipt.files))
  assert.equal(sha(await readFile(join(appRoot, receipt.outDir, name))), expected, name);
const report = { diagnosticOnly: true, nativePass: false, source: receipt.source,
  tree: receipt.tree, buildReceiptSha256: sha(receiptBytes), filesVerified: Object.keys(receipt.files).length,
  platform: process.platform, initialBodyInputSent: false, fixtures: [] };
let server, browser;
try {
  server = await preview({ configFile: false, base: "/", build: { outDir: join(appRoot, receipt.outDir) }, preview: { host: "127.0.0.1", port: 0 } });
  const matrix = process.env.OOS_DIAGNOSTIC_BROWSER_MATRIX === "1";
  if (matrix) assert.equal(process.platform,"darwin");
  const plans = matrix ? [{name:"chromium-default",engine:chromium,query:""},{name:"webkit-default",engine:webkit,query:""},{name:"webkit-dom-replay",engine:webkit,query:"?offscreenReplay=0"}] : [{name:"chromium-default",engine:chromium,query:""}];
  for (const plan of plans) {
  browser = await plan.engine.launch({ headless: true });
  for (const [fixtureName, fixture] of [["original361", "docs/tests/2026-11-20-mac-native-body-diagnostic/44750058759-activation-observed/mac-body-diagnostic/writer361-macos-table.docx"], ["saved356", "scripts/proeven/mac-body-positive-356.docx"]]) {
    const name = matrix ? plan.name+"-"+fixtureName : fixtureName;
    const bytes = await readFile(new URL("../" + fixture, import.meta.url));
    const record = { name, browserVersion:browser.version(), browserPlan:plan.name, query:plan.query, fixtureSha256: sha(bytes), errors: [], console: [], failedRequests: [], responses: [] };
    report.fixtures.push(record);
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    await context.addInitScript(() => localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "en", thema: "forge", spelling: { controleren: false, autocorrectie: false } })));
    const page = await context.newPage();
    page.on("pageerror", e => record.errors.push(String(e)));
    page.on("console", m => record.console.push({ type: m.type(), text: m.text().slice(0, 3000) }));
    page.on("requestfailed", r => record.failedRequests.push({ url: r.url(), failure: r.failure() }));
    page.on("response", r => { if (/font|\.ttf|\.woff|\.wasm/.test(r.url())) record.responses.push({ url: r.url(), status: r.status() }); });
    await page.goto(server.resolvedUrls.local[0]+plan.query);
    await page.locator("input[type=file]").first().setInputFiles({ name: name + ".docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: bytes });
    const canvas = page.locator(".canvas-page canvas").first();
    await canvas.waitFor({ timeout: 60_000 });
    await page.waitForTimeout(5000);
    // Original screenshot is captured before DOM/fiber/layout inspection or canvas readback.
    await page.screenshot({ path: join(out, name + "-initial.png") });
    record.inspection = await page.evaluate(() => {
      const c = document.querySelector(".canvas-page canvas");
      const result = { canvas: { width: c.width, height: c.height, rect: c.getBoundingClientRect().toJSON() }, fontsStatus: document.fonts.status,
        active: { tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute("aria-label") },
        tables: [...document.querySelectorAll("[role=table]")].map(t => ({ rows: t.getAttribute("aria-rowcount"), columns: t.getAttribute("aria-colcount"), text: t.textContent })), refs: [], paintProps: [] };
      const key = Object.keys(c).find(k => k.startsWith("__reactFiber$"));
      const visited = new Set();
      for (let fiber = c[key], depth = 0; fiber && depth < 80; fiber = fiber.return, depth++) {
        const props = fiber.memoizedProps;
        if (props?.displayList) result.paintProps.push({ depth, displayList: props.displayList, frame: props.frame ?? null, offscreenReplay: !!props.offscreenReplay, fontFamilies: props.fontFamilies ?? null });
        for (let hook = fiber.memoizedState, i = 0; hook && i < 100; hook = hook.next, i++) {
          const ref = hook.memoizedState?.current;
          if (ref && typeof ref.getEditorRef === "function" && !visited.has(ref)) {
            visited.add(ref); const editor = ref.getEditorRef();
            result.refs.push({ depth, keys: Object.keys(ref), layout: editor?.getLayout?.() ?? null, request: editor?.getLayoutRequest?.() ?? null, selection: editor?.getSelectionRange?.() ?? null });
          }
        }
      }
      return result;
    });
    await writeFile(join(out, name + "-inspection.json"), JSON.stringify(record.inspection, (_, v) => typeof v === "bigint" ? String(v) : v, 2));
    delete record.inspection;
    await page.waitForTimeout(5000);
    await page.screenshot({ path: join(out, name + "-after-readonly-inspection.png") });
    await context.close();
  }
  await browser.close();
  }
  report.completed = true;
} finally {
  await browser?.close(); await server?.close();
  report.cleanup = { browserClosed: true, serverClosed: true };
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
}
