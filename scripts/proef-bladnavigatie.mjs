// Productiebrowserproef voor #61. Bouw eerst; optioneel: pad naar dist als argument.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { initWasm, openWorkbook } from "@betteroffice/xlsx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

await initWasm(fs.readFileSync("vendor/rekenbladengine/xlsx_wasm_bg.wasm"));
const h = openWorkbook(fs.readFileSync("public/templates/nieuw.xlsx"));
const naam = (i) => `Werkblad ${String(i + 1).padStart(2, "0")} lange naam`;
h.applyOps([{ type: "renameSheet", sheet: 0, name: naam(0) }]);
for (let i = 1; i < 26; i++) h.applyOps([{ type: "addSheet", index: i, name: naam(i) }]);
const delen = unzipSync(h.save());
h.dispose();
let i = 0;
delen["xl/workbook.xml"] = strToU8(strFromU8(delen["xl/workbook.xml"]).replace(/<sheet\b[^>]*\/>/g, tag => {
  const state = i === 2 ? "veryHidden" : [0, 24].includes(i) ? "hidden" : "visible";
  i++;
  return tag.replace(/\s+state="[^"]*"/, "").replace("/>", ` state="${state}"/>`);
}));
assert.equal(i, 26);
const bestand = Buffer.from(zipSync(delen));
const root = path.resolve(process.argv[2] ?? "dist");
const mime = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".html": "text/html" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const file = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return void res.writeHead(404).end();
  res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ locale: "nl-NL", viewport: { width: 1000, height: 750 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "veel-bladen.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: bestand });
  const tabs = page.locator('[data-testid="xlsx-sheet-tabs"]:visible');
  const actief = tabs.locator('[aria-selected="true"]');
  await actief.filter({ hasText: naam(1) }).waitFor();
  assert.equal(await tabs.getByRole("tab").count(), 23);
  const vorige = page.getByRole("button", { name: "Vorig blad", exact: true });
  const volgende = page.getByRole("button", { name: "Volgend blad", exact: true });
  if (process.env.OOS_PROEF_BASELINE === "1") {
    assert.equal(await volgende.count(), 0, "Baseline unexpectedly has next-sheet navigation");
    await page.getByRole("button", { name: "Alle bladen", exact: true }).click();
    await page.getByRole("menuitem", { name: naam(25), exact: true }).click();
    await actief.filter({ hasText: naam(25) }).waitFor();
    const offscreen = await tabs.evaluate(el => {
      const a = el.getBoundingClientRect(), b = el.querySelector('[aria-selected="true"]').getBoundingClientRect();
      return b.right > a.right + 1;
    });
    assert.ok(offscreen, "Baseline did not reproduce offscreen active tab");
    console.log("Baseline reproduced: no navigation arrows; selected final sheet is offscreen.");
  } else {
    const inBeeld = async () => {
      await page.waitForFunction(() => {
        const el = [...document.querySelectorAll('[data-testid="xlsx-sheet-tabs"]')].find(el => el.getBoundingClientRect().width > 0);
        const tab = el?.querySelector('[aria-selected="true"]');
        if (!tab) return false;
        const a = el.getBoundingClientRect(), b = tab.getBoundingClientRect();
        return b.left >= a.left - 1 && b.right <= a.right + 1;
      });
    };
    assert.ok(await vorige.isDisabled());
    await volgende.click();
    await actief.filter({ hasText: naam(3) }).waitFor(); // veryHidden wordt overgeslagen.
    await vorige.click();
    await actief.filter({ hasText: naam(1) }).waitFor();
    await page.getByRole("button", { name: "Alle bladen", exact: true }).click();
    await page.getByRole("menuitem", { name: naam(25), exact: true }).click();
    await actief.filter({ hasText: naam(25) }).waitFor();
    await inBeeld();
    assert.ok(await volgende.isDisabled());
    await vorige.click();
    await actief.filter({ hasText: naam(23) }).waitFor(); // hidden wordt overgeslagen.
    await inBeeld();
    await volgende.focus();
    await page.keyboard.press("Enter");
    await actief.filter({ hasText: naam(25) }).waitFor();
    await page.setViewportSize({ width: 640, height: 600 });
    await inBeeld();
    const overlap = await page.locator('.rekenblad-bladnavigatie').evaluate(nav => {
      const a = nav.getBoundingClientRect(), b = nav.parentElement.querySelector('[data-testid="xlsx-sheet-tabs"]').getBoundingClientRect();
      return a.right > b.left;
    });
    assert.equal(overlap, false, "Navigation overlaps scrollable sheet tabs");
    await page.getByRole("button", { name: "Alle bladen", exact: true }).click();
    await page.getByRole("menuitem", { name: naam(1), exact: true }).click();
    await actief.filter({ hasText: naam(1) }).waitFor();
    await inBeeld();
    assert.ok(await vorige.isDisabled());
    assert.ok((await tabs.boundingBox()).height < 45, "Long sheet names should stay on one line");
    if (process.env.OOS_PROEF_SCREENSHOT) {
      const close = page.locator('.office-melding-sluiten');
      while (await close.count()) await close.first().click();
      await page.screenshot({ path: process.env.OOS_PROEF_SCREENSHOT });
    }
    await page.locator('input[type="file"]').first().setInputFiles({ name: "een-blad.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync("public/templates/nieuw.xlsx") });
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="xlsx-sheet-tabs"]')].some(el => el.getBoundingClientRect().width > 0 && el.querySelectorAll('[role="tab"]').length === 1));
    assert.ok(await vorige.isDisabled());
    assert.ok(await volgende.isDisabled());
    assert.deepEqual(errors, []);
    console.log("Passed: hidden/veryHidden skipped, endpoints disabled, list navigation, horizontal reveal both ways, keyboard activation, narrow viewport, single-sheet workbook, no overlap or page errors.");
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
