// Productieproef voor #52: bestaande bladwijzers via Ctrl+G bezoeken.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const delen = unzipSync(fs.readFileSync("public/templates/nieuw.docx"));
delen["word/document.xml"] = strToU8(strFromU8(delen["word/document.xml"]).replace(/<w:body>[\s\S]*?<w:sectPr/,
  '<w:body><w:p><w:r><w:t>Voor </w:t></w:r><w:bookmarkStart w:id="1" w:name="Bestemming"/><w:r><w:t>Hier na.</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p>' +
  '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc><w:tcPr/><w:p><w:r><w:t>Cel </w:t></w:r><w:bookmarkStart w:id="2" w:name="InTabel"/><w:r><w:t>doel</w:t></w:r><w:bookmarkEnd w:id="2"/></w:p></w:tc></w:tr></w:tbl><w:sectPr'));
const root = path.resolve(process.argv[2] ?? "dist");
const mime = { ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".html": "text/html", ".json": "application/json" };
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
  const page = await browser.newPage({ locale: "nl-NL" });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "nl", spelling: { controleren: false } })));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Bladwijzerproef.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(zipSync(delen)) });
  await page.waitForFunction(() => document.title.includes("Bladwijzerproef.docx"));
  const input = page.locator('[data-testid="yrs-input"]:visible');
  await input.waitFor();
  for (const [name, text] of [["Bestemming", "BODY"], ["InTabel", "CELL"]]) {
    await input.focus();
    await page.keyboard.press("Control+g");
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("option", { name: "Bladwijzer", exact: true }).click();
    await dialog.getByRole("button", { name, exact: true }).click();
    await page.keyboard.press("Escape");
    await input.focus();
    await page.keyboard.type(text);
  }
  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const dialog = page.getByRole("dialog");
  const route = await Promise.race([download.then(() => "download"), dialog.waitFor().then(() => "dialog")]);
  if (route === "dialog") await dialog.getByRole("button", { name: "Opslaan", exact: true }).click();
  const bytes = fs.readFileSync(await (await download).path());
  const xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
  const plain = xml.replace(/<[^>]*>/g, "");
  assert.ok(plain.includes("Voor BODYHier na."), "Cursor sprong niet naar de exacte bladwijzer in hoofdtekst");
  assert.ok(plain.includes("Cel CELLdoel"), "Cursor sprong niet naar de exacte bladwijzer in de tabel");
  assert.deepEqual(errors, []);
  console.log("PASS: Ctrl+G, bladwijzerlijst, hoofdtekst- en tabeloffsets, typen en DOCX-download; geen paginafouten.");
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
