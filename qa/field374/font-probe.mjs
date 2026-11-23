/** Actual Canvas field-paint metrics versus the pinned SDK; one font, one title style. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { preloadLayoutWasm, registerMeasureFont, measureParagraphJson } from "@betteroffice/docx/wasm-layout";

const root = process.argv[2]; assert(root);
assert.equal(process.platform, "linux"); assert.equal(process.env.GITHUB_ACTIONS, "true");
await mkdir(root, { recursive: true });
const font = await readFile("node_modules/@betteroffice/fonts/assets/LiberationSans-Regular.ttf");
const wasm = await readFile("vendor/tekstengine/docx_layout_bg.wasm");
await preloadLayoutWasm(wasm); const id = registerMeasureFont(font);
const measure = (kind, text, caps, tracking) => JSON.parse(measureParagraphJson(JSON.stringify({
  block: { kind: "paragraph", runs: [{ kind, ...(kind === "field" ? { fallback: text } : { text }), allCaps: caps, letterSpacing: tracking }] },
  maxWidth: 2000, fontChains: { "liberation sans|0|0": [id] }, defaults: { fontFamily: "Liberation Sans", fontSize: 32 }, authoritativeShaping: true,
}))).lines[0].width;
let browser, context;
const report = { commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  fontSha256: createHash("sha256").update(font).digest("hex"), layoutWasmSha256: createHash("sha256").update(wasm).digest("hex"),
  status: "failed", cases: [] };
try {
  browser = await chromium.launch({ headless: true }); report.browser = browser.version();
  context = await browser.newContext({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent('<canvas id="paint" width="1200" height="700"></canvas>');
  const metrics = await page.evaluate(async ({ bytes }) => {
    const face = new FontFace("Field374", new Uint8Array(bytes)); await face.load(); document.fonts.add(face); await document.fonts.ready;
    const ctx = document.getElementById("paint").getContext("2d");
    ctx.font = "400 42.6666666666667px Field374";
    const cases = []; let y = 70;
    for (const tracking of [0, 16 / 3]) for (const text of ["Report Title", "REPORT TITLE", "STRASSE"]) {
      ctx.letterSpacing = tracking + "px";
      const m = ctx.measureText(text); ctx.fillText(text, 20, y); y += 70;
      cases.push({ text, tracking, width: m.width, inkLeft: m.actualBoundingBoxLeft, inkRight: m.actualBoundingBoxRight, kerning: ctx.fontKerning, font: ctx.font });
    }
    return cases;
  }, { bytes: [...font] });
  for (const item of metrics) report.cases.push({ ...item,
    sdkField: measure("field", item.text, false, item.tracking),
    sdkText: measure("text", item.text, false, item.tracking),
    sdkCapsFieldFromOriginalCache: measure("field", item.text === "REPORT TITLE" ? "Report Title" : item.text, true, item.tracking) });
  await page.screenshot({ path: root + "/canvas.png" });
  report.status = "captured-actual-canvas-metrics-not-a-fixed-product-pass";
} finally {
  await context?.close(); await browser?.close();
  report.cleanup = { contextClosed: !!context, browserClosed: !!browser && !browser.isConnected() };
  await writeFile(root + "/report.json", JSON.stringify(report, null, 2));
}
