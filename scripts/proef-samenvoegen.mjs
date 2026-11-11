import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";
import { strFromU8, unzipSync } from "fflate";
const root = path.resolve(process.argv[2] ?? "dist");
const mime = { ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".html": "text/html", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost"), file = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return void res.writeHead(404).end();
  res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream"); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ locale: "nl-NL", viewport: { width: 1300, height: 950 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "nl", spelling: { controleren: false } })));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Briefsjabloon.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: fs.readFileSync("public/templates/nieuw.docx") });
  await page.waitForFunction(() => document.title.includes("Briefsjabloon.docx"));
  const input = page.locator('[data-testid="yrs-input"]:visible'); await input.focus();
  await page.keyboard.type("Beste ");
  await page.getByRole("tab", { name: "Invoegen", exact: true }).click();
  const open = () => page.getByRole("button", { name: "Samenvoegen", exact: true }).click();
  await open();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Gegevensbestand", { exact: true }).setInputFiles({ name: "Adressen.csv", mimeType: "text/csv", buffer: Buffer.from('Naam;Code\n"A & <B>";00123\nTwee;00456') });
  await dialog.getByRole("button", { name: "Veld invoegen", exact: true }).click();
  await open(); dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Veld", exact: true }).selectOption("Code");
  await dialog.getByRole("button", { name: "Veld invoegen", exact: true }).click();
  await open(); dialog = page.getByRole("dialog");
  if (process.env.OOS_MERGE_SCREENSHOT) {
    await dialog.getByRole("button", { name: "Recordkopie opslaan", exact: true }).waitFor();
    await page.screenshot({ path: process.env.OOS_MERGE_SCREENSHOT, animations: "disabled" });
  }
  for (let record = 0; record < 2; record++) {
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Recordkopie opslaan", exact: true }).click();
    const bytes = fs.readFileSync(await (await download).path()), xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
    assert.ok(xml.includes(record ? "Twee" : "A &amp; &lt;B&gt;"));
    assert.ok(xml.includes(record ? "00456" : "00123"));
    assert.ok(!xml.includes("MERGEFIELD"));
    if (!record) await dialog.getByRole("button", { name: "Volgende", exact: true }).click();
  }
  // Test uitsluitend het IPC-contract, zonder een echt native bestand te schrijven.
  await page.evaluate(() => { window.__TAURI_INTERNALS__ = { invoke: async (command, args, options) => { window.mergeIpc = { command, length: args.byteLength ?? args.length, name: options?.headers?.["x-office-naam"] }; return "record.docx"; } }; });
  await dialog.getByRole("button", { name: "Recordkopie opslaan", exact: true }).click();
  await page.waitForFunction(() => window.mergeIpc);
  const ipc = await page.evaluate(() => window.mergeIpc);
  assert.equal(ipc.command, "bewaar_kopie"); assert.ok(ipc.length > 100); assert.equal(ipc.name, "Record-0002.docx");
  await page.evaluate(() => { delete window.__TAURI_INTERNALS__; });
  await dialog.getByRole("button", { name: "Sluiten", exact: true }).last().click();
  const download = page.waitForEvent("download"); await page.keyboard.press("Control+s");
  dialog = page.getByRole("dialog");
  const route = await Promise.race([download.then(() => "download"), dialog.waitFor().then(() => "dialog")]);
  if (route === "dialog") await dialog.getByRole("button", { name: "Opslaan", exact: true }).click();
  const xml = strFromU8(unzipSync(fs.readFileSync(await (await download).path()))["word/document.xml"]);
  assert.ok(xml.includes("MERGEFIELD")); assert.ok(!xml.includes("A &amp; &lt;B&gt;"));
  assert.deepEqual(errors, []);
  console.log("PASS: CSV, veldinvoeging, recordnavigatie, twee onafhankelijke kopieën, codes/XML, IPC-contract en behouden sjabloonvelden.");
} catch (e) {
  for (const page of browser.contexts().flatMap(c => c.pages())) {
    console.log((await page.locator("body").innerText()).slice(-3000));
    await page.screenshot({ path: ".local/merge-failed.png" });
  }
  throw e;
} finally { await browser.close(); await new Promise(r => server.close(r)); }
