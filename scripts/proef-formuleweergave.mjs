import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";
import { formuleDocx } from "./formule-proeffixture.mjs";
const root = path.resolve(process.argv[2] ?? "dist"), uit = path.resolve(".local/formuleweergave"); fs.mkdirSync(uit, { recursive: true });
const mime = { ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".html": "text/html", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost"), file = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return void res.writeHead(404).end();
  res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream"); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true }); let page;
try {
  page = await browser.newPage({ locale: "nl-NL", viewport: { width: 1440, height: 1100 } }); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "nl", spelling: { controleren: false } }));
    window.__mathImages = [];
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(img, ...args) {
      if (img instanceof HTMLImageElement && img.src.startsWith("data:image/svg+xml")) window.__mathImages.push({ src: img.src, width: img.naturalWidth, height: img.naturalHeight, args });
      return draw.call(this, img, ...args);
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Formuleweergave.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(formuleDocx()) });
  await page.waitForFunction(() => document.title.includes("Formuleweergave.docx"));
  await page.waitForFunction(() => new Set(window.__mathImages.map(i => i.src)).size >= 4, null, { timeout: 30000 });
  const images = await page.evaluate(() => [...new Map(window.__mathImages.map(i => [i.src, i])).values()]);
  assert.equal(images.length, 4); assert.ok(images.every(i => i.width > 5 && i.height > 5));
  await page.screenshot({ path: path.join(uit, "document.png") });
  await page.locator('[data-testid="yrs-input"]:visible').focus(); await page.keyboard.press("Control+p");
  const dialog = page.getByRole("dialog", { name: /^Afdrukvoorbeeld/ }); await dialog.waitFor();
  const download = page.waitForEvent("download", { timeout: 60000 });
  await dialog.getByRole("button", { name: "Opslaan als PDF", exact: true }).click({ timeout: 60000 });
  await (await download).saveAs(path.join(uit, "formules.pdf"));
  assert.ok(fs.readFileSync(path.join(uit, "formules.pdf")).subarray(0, 8).toString().startsWith("%PDF-"));
  fs.writeFileSync(path.join(uit, "images.json"), JSON.stringify(images, null, 2));
  assert.deepEqual(errors, []); console.log("PASS: four imported equations render as native images and export through the application's PDF pipeline.");
} catch (e) { if (page) { await page.screenshot({ path: path.join(uit, "failure.png") }); console.log((await page.locator("body").innerText()).slice(-2500)); } throw e; }
finally { await browser.close(); await new Promise(r => server.close(r)); }
