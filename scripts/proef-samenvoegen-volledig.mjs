import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
const root = path.resolve(process.argv[2] ?? "dist"), uit = path.resolve(".local/samenvoegen-volledig"); fs.mkdirSync(uit, { recursive: true });
const z = unzipSync(fs.readFileSync("public/templates/nieuw.docx"));
const field = n => `<w:fldSimple w:instr=" MERGEFIELD ${n} "><w:r><w:t>«${n}»</w:t></w:r></w:fldSimple>`;
z["word/document.xml"] = strToU8(strFromU8(z["word/document.xml"]).replace(/<w:body>[\s\S]*?<w:sectPr/, `<w:body><w:p><w:r><w:t>Beste </w:t></w:r>${field("Naam")}</w:p><w:p>${field("Code")}</w:p><w:sectPr`));
const xlsx = unzipSync(fs.readFileSync("public/templates/nieuw.xlsx"));
const rows = [["Naam", "Code", "Plaats"], ["Ada", "00001", "Delft"], ["Grace", "00002", "Utrecht"], ["Linus", "00003", "Delft"]];
xlsx["xl/worksheets/sheet1.xml"] = strToU8('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + rows.map((row, i) => `<row r="${i + 1}">${row.map((v, c) => `<c r="${String.fromCharCode(65 + c)}${i + 1}" t="inlineStr"><is><t>${v}</t></is></c>`).join("")}</row>`).join("") + '</sheetData></worksheet>');
const mime = { ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".html": "text/html", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost"), file = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return void res.writeHead(404).end();
  res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream"); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r)); const browser = await chromium.launch({ headless: true }); let page;
try {
  page = await browser.newPage({ locale: "nl-NL", viewport: { width: 1440, height: 1100 } }); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "nl", spelling: { controleren: false } })));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Samenvoegvolledig.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(zipSync(z)) });
  await page.waitForFunction(() => document.title.includes("Samenvoegvolledig.docx"));
  await page.locator('[data-testid="yrs-input"]:visible').first().waitFor(); await page.getByRole("tab", { name: "Invoegen", exact: true }).click();
  await page.getByRole("button", { name: "Samenvoegen", exact: true }).click(); let dialog = page.getByRole("dialog", { name: "Samenvoegen", exact: true });
  await dialog.getByLabel("Gegevensbestand", { exact: true }).setInputFiles({ name: "Adressen.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(zipSync(xlsx)) });
  await dialog.getByText("Record 1 van 3", { exact: true }).waitFor();
  await dialog.getByLabel("Filterkolom", { exact: true }).selectOption("Plaats"); await dialog.getByLabel("Voorwaarde", { exact: true }).selectOption("equals");
  await dialog.getByLabel("Waarde", { exact: true }).fill("Delft"); await dialog.getByLabel("Sorteren op", { exact: true }).selectOption("Naam"); await dialog.getByRole("checkbox", { name: "Aflopend", exact: true }).check();
  assert.match(await dialog.locator("table").innerText(), /Linus[\s\S]*00003/);
  await dialog.getByRole("button", { name: "Documentvoorbeeld", exact: true }).click(); await dialog.getByRole("img", { name: /^Record-/ }).first().waitFor({ timeout: 90000 });
  await page.screenshot({ path: path.join(uit, "preview.png"), animations: "disabled" });
  async function download(soort, naam) {
    await dialog.getByLabel("Samenvoegen naar", { exact: true }).selectOption(soort);
    const wacht = page.waitForEvent("download", { timeout: 120000 }); await dialog.getByRole("button", { name: "Samenvoeging maken", exact: true }).click();
    const bestand = await wacht; await bestand.saveAs(path.join(uit, naam));
    await dialog.getByRole("button", { name: "Samenvoeging maken", exact: true }).waitFor(); return fs.readFileSync(path.join(uit, naam));
  }
  const merged = await download("docx", "brieven.docx"), xml = strFromU8(unzipSync(merged)["word/document.xml"]), text = xml.replace(/<[^>]*>/g, "");
  assert.ok(text.includes("Linus") && text.includes("Ada") && !text.includes("Grace")); assert.ok(text.indexOf("Linus") < text.indexOf("Ada")); assert.ok(!xml.includes("MERGEFIELD"));
  const pdf = await download("pdf", "brieven.pdf"); assert.match(pdf.toString("latin1"), /\/Count 2\b/);
  const individual = unzipSync(await download("pdfPerRecord", "records.zip")); assert.deepEqual(Object.keys(individual).sort(), ["Record-0001.pdf", "Record-0003.pdf"]); assert.ok(Object.values(individual).every(b => Buffer.from(b).toString("latin1").includes("%PDF-")));
  await dialog.getByLabel("Documentsoort", { exact: true }).selectOption("labels"); const labels = await download("pdf", "etiketten.pdf"); assert.match(labels.toString("latin1"), /\/Count 1\b/);
  await dialog.getByLabel("Documentsoort", { exact: true }).selectOption("envelopes"); const envelopes = await download("pdf", "enveloppen.pdf"); assert.match(envelopes.toString("latin1"), /\/Count 2\b/); assert.match(envelopes.toString("latin1"), /\/MediaBox\s*\[0 0 623\./);
  await dialog.getByLabel("Documentsoort", { exact: true }).selectOption("letters");
  await page.evaluate(() => {
    window.__mergePrint = [];
    const observer = new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n instanceof HTMLIFrameElement && n.contentWindow) n.contentWindow.print = () => window.__mergePrint.push({ pages: n.contentDocument.querySelectorAll('.pagina').length, title: n.contentDocument.title }); });
    observer.observe(document.body, { childList: true });
  });
  await dialog.getByLabel("Samenvoegen naar", { exact: true }).selectOption("printer"); await dialog.getByRole("button", { name: "Samenvoeging maken", exact: true }).click();
  await page.waitForFunction(() => window.__mergePrint?.some(p => p.pages === 2), null, { timeout: 120000 });
  await dialog.getByRole("button", { name: "Samenvoeging maken", exact: true }).waitFor();
  await dialog.getByLabel("Samenvoegen naar", { exact: true }).selectOption("document"); await dialog.getByRole("button", { name: "Samenvoeging maken", exact: true }).click();
  await page.waitForFunction(() => document.title.includes("Samenvoegen.docx"));
  await page.locator('[data-testid="yrs-input"]:visible').first().waitFor();
  await page.getByLabel("Geopende tabbladen").getByText("Samenvoegvolledig.docx", { exact: true }).click();
  await page.locator('[data-testid="yrs-input"]:visible').first().focus(); const original = page.waitForEvent("download"); await page.keyboard.press("Control+s");
  const save = page.getByRole("dialog"); const route = await Promise.race([original.then(() => "download"), save.waitFor().then(() => "dialog")]); if (route === "dialog") await save.getByRole("button", { name: "Opslaan", exact: true }).click();
  const bytes = fs.readFileSync(await (await original).path()); assert.ok(strFromU8(unzipSync(bytes)["word/document.xml"]).includes("MERGEFIELD"));
  await page.getByRole("tab", { name: "Invoegen", exact: true }).click();
  await page.getByRole("button", { name: "Samenvoegen", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Samenvoegen", exact: true });
  const ods = zipSync({ "content.xml": strToU8('<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="Adressen">' + [["Naam", "Code"], ["ODS Person", "00888"]].map(row => '<table:table-row>' + row.map(v => `<table:table-cell office:value-type="string"><text:p>${v}</text:p></table:table-cell>`).join("") + '</table:table-row>').join("") + '</table:table></office:spreadsheet></office:body></office:document-content>') });
  await dialog.getByLabel("Gegevensbestand", { exact: true }).setInputFiles({ name: "Adressen.ods", mimeType: "application/vnd.oasis.opendocument.spreadsheet", buffer: Buffer.from(ods) });
  await dialog.getByText("Record 1 van 1", { exact: true }).waitFor(); assert.match(await dialog.locator("table").innerText(), /ODS Person[\s\S]*00888/);
  const odsDoc = new TextDecoder().decode(unzipSync(await download("docx", "ods-brieven.docx"))["word/document.xml"]); assert.ok(odsDoc.includes("ODS Person"));
  await dialog.getByRole("button", { name: "Sluiten", exact: true }).last().click();
  assert.ok(fs.existsSync(path.join(uit, "studio.sqlite")), "Generate the real Database Studio fixture with OOS_MERGE_DATABASE_FIXTURE when running database.test.ts");
  await page.getByLabel("Geopende tabbladen").getByRole("tab", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: "Database Studio", exact: true }).click();
  await page.getByLabel("Database of werkkopie kiezen", { exact: true }).setInputFiles(path.join(uit, "studio.sqlite"));
  await page.getByRole("heading", { name: "studio.sqlite", exact: true }).waitFor();
  await page.getByLabel("Geopende tabbladen").getByText("Samenvoegvolledig.docx", { exact: true }).click();
  await page.locator('[data-testid="yrs-input"]:visible').first().waitFor();
  await page.getByRole("button", { name: "Samenvoegen", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Samenvoegen", exact: true });
  await dialog.getByLabel("Soort bron", { exact: true }).selectOption("database");
  await dialog.getByLabel("Tabel", { exact: true }).selectOption("Adressen", { timeout: 30000 });
  await dialog.getByRole("button", { name: "Deze tabel gebruiken", exact: true }).click();
  await dialog.getByRole("cell", { name: "DatabasePerson", exact: true }).waitFor(); assert.match(await dialog.locator("table").innerText(), /DatabasePerson[\s\S]*00999/);
  const dbDoc = new TextDecoder().decode(unzipSync(await download("docx", "database-brieven.docx"))["word/document.xml"]); assert.ok(dbDoc.includes("DatabasePerson"));
  assert.deepEqual(errors, []); console.log("PASS: XLSX, ODS, real Database Studio table, filtering/sorting, full preview, combined DOCX/PDF, per-record PDF ZIP, labels, envelopes, printer contract, new document and preserved template fields.");
} catch (e) { if (page) { fs.writeFileSync(path.join(uit, "failure.html"), await page.content()); await page.screenshot({ path: path.join(uit, "failure.png") }); console.log((await page.locator("body").innerText()).slice(-4500)); } throw e; }
finally { await browser.close(); await new Promise(r => server.close(r)); }





