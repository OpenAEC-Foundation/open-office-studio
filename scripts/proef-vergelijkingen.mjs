import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";
import { strFromU8, unzipSync } from "fflate";
const root = path.resolve(process.argv[2] ?? "dist");
const mime = { ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".html": "text/html", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const file = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return void res.writeHead(404).end();
  res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream"); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ locale: "nl-NL", viewport: { width: 1300, height: 950 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  if (process.env.OOS_BROWSER_CPU_RATE) {
    const rate = Number(process.env.OOS_BROWSER_CPU_RATE); assert.ok(Number.isFinite(rate) && rate >= 1);
    await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate });
  }
  await page.addInitScript(() => localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "nl", spelling: { controleren: false } })));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Formuleproef.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: fs.readFileSync("public/templates/nieuw.docx") });
  await page.waitForFunction(() => document.title.includes("Formuleproef.docx"));
  await page.locator('[data-testid="yrs-input"]:visible').focus();
  await page.getByRole("tab", { name: "Invoegen", exact: true }).click();
  await page.getByRole("button", { name: "Vergelijking", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Formule", exact: true }).fill("frac(α,2)");
  await dialog.locator("math mfrac").waitFor();
  if (process.env.OOS_FORMULE_SCREENSHOT) await page.screenshot({ path: process.env.OOS_FORMULE_SCREENSHOT });
  await dialog.getByRole("button", { name: "Toepassen", exact: true }).click();
  await page.getByRole("button", { name: "Vergelijking", exact: true }).click();
  dialog = page.getByRole("dialog");
  assert.equal(await dialog.getByRole("textbox", { name: "Formule", exact: true }).inputValue(), "frac(α,2)");
  await dialog.getByRole("textbox", { name: "Formule", exact: true }).fill("sqrt(sup(x,2))");
  await dialog.getByRole("checkbox", { name: "Weergegeven vergelijking" }).check();
  await dialog.getByRole("button", { name: "Toepassen", exact: true }).click();
  if (process.env.OOS_FORMULE_DOCUMENT) await page.screenshot({ path: process.env.OOS_FORMULE_DOCUMENT });
  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  dialog = page.getByRole("dialog");
  const route = await Promise.race([download.then(() => "download"), dialog.waitFor().then(() => "dialog")]);
  if (route === "dialog") await dialog.getByRole("button", { name: "Opslaan", exact: true }).click();
  const bytes = fs.readFileSync(await (await download).path()), xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
  assert.ok(xml.includes("<m:rad>") && xml.includes("<m:sSup>") && xml.includes("<m:oMathPara"));
  assert.deepEqual(errors, []);
  console.log("PASS: invoegen, MathML-preview, bewerken en DOCX-download met geneste OMML; geen paginafouten.");
} finally { await browser.close(); await new Promise(r => server.close(r)); }
