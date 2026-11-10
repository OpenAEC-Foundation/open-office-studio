import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
const z = unzipSync(fs.readFileSync("public/templates/nieuw.docx"));
z["word/document.xml"] = strToU8(strFromU8(z["word/document.xml"]).replace(/<w:body>[\s\S]*?<w:sectPr/,
  '<w:body><w:p><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></w:p>' +
  '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pageBreakBefore/></w:pPr><w:r><w:t>Bestemmingskop</w:t></w:r></w:p><w:sectPr'));
const root = path.resolve(process.argv[2] ?? "dist"), mime = { ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".html": "text/html", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost"), file = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return void res.writeHead(404).end();
  res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream"); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
let page;
try {
  page = await browser.newPage({ locale: "nl-NL", viewport: { width: 1440, height: 1000 } }); const errors = [];
  if (process.env.OOS_BROWSER_CPU_RATE) {
    const rate = Number(process.env.OOS_BROWSER_CPU_RATE); assert.ok(Number.isFinite(rate) && rate >= 1);
    await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate });
  }
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "nl", spelling: { controleren: false } })));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Verwijzingenproef.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(zipSync(z)) });
  await page.waitForFunction(() => document.title.includes("Verwijzingenproef.docx"));
  const input = page.locator('[data-testid="yrs-input"]:visible'); await input.waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.canvas-page').length >= 2);
  await input.focus(); await page.keyboard.press("Control+Home");
  await page.getByRole("tab", { name: "Verwijzingen", exact: true }).click();
  await page.getByRole("button", { name: "Bijschrift invoegen", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Omschrijving", { exact: true }).fill("Proefformule");
  await dialog.getByRole("button", { name: "Invoegen", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
  await input.focus(); await page.keyboard.press("Enter"); await page.keyboard.type("Zie ");
  const reference = async vorm => {
    await page.getByRole("button", { name: "Kruisverwijzing", exact: true }).click(); dialog = page.getByRole("dialog");
    await dialog.getByLabel("Verwijzen naar", { exact: true }).selectOption({ label: "Bestemmingskop" });
    await dialog.getByLabel("Verwijzing weergeven als", { exact: true }).selectOption(vorm);
    await dialog.getByRole("button", { name: "Invoegen", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
  };
  await reference("text"); await input.focus(); await page.keyboard.type(" op pagina "); await reference("page");
  await page.screenshot({ path: ".local/verwijs-document.png" });
  const link = await page.getByText("Bestemmingskop", { exact: true }).first().boundingBox(); assert.ok(link);
  await page.keyboard.down("Control"); await page.mouse.click(link.x + 10, link.y + link.height / 2); await page.keyboard.up("Control");
  await page.keyboard.type("KLIK");
  // Add a bookmark over a real text range, rename it, navigate and type at its exact start.
  await input.focus(); await page.keyboard.press("Control+End"); await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.getByRole("button", { name: "Bladwijzers", exact: true }).click(); dialog = page.getByRole("dialog");
  await dialog.getByLabel("Naam", { exact: true }).fill("Gebruikersdoel");
  await dialog.getByRole("button", { name: "Toevoegen", exact: true }).click();
  await dialog.getByLabel("Bladwijzers", { exact: true }).selectOption("Gebruikersdoel");
  await dialog.getByLabel("Naam", { exact: true }).fill("Hernoemd"); await dialog.getByRole("button", { name: "Naam wijzigen", exact: true }).click();
  await dialog.getByRole("button", { name: "Ga naar", exact: true }).click();
  await input.focus(); await page.keyboard.press("ArrowLeft"); await page.keyboard.type("Nieuw ");
  await page.getByRole("button", { name: "Verwijzingen bijwerken", exact: true }).click();
  const download = page.waitForEvent("download"); await input.focus(); await page.keyboard.press("Control+s");
  dialog = page.getByRole("dialog"); const route = await Promise.race([download.then(() => "download"), dialog.waitFor().then(() => "dialog")]);
  if (route === "dialog") await dialog.getByRole("button", { name: "Opslaan", exact: true }).click();
  const bytes = fs.readFileSync(await (await download).path()), xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
  fs.writeFileSync(path.resolve(".local/verwijzingen-uit.docx"), bytes);
  assert.ok(xml.includes('SEQ &quot;Figuur&quot;') || xml.includes('SEQ "Figuur"'), "caption field lost");
  assert.ok(xml.includes("Proefformule") && xml.includes("REF _OOS_Ref") && xml.includes("PAGEREF _OOS_Ref"));
  assert.ok(xml.includes('w:name="Hernoemd"') && !xml.includes('w:name="Gebruikersdoel"'));
  assert.ok(xml.replace(/<[^>]*>/g, "").includes("Nieuw KLIKBestemmingskop"), "Ctrl+click must navigate to the heading before typing");
  assert.match(xml, /PAGEREF[^>]*>[\s\S]*?<w:t[^>]*>2<\/w:t>/, "reference must use actual second-page layout");
  assert.deepEqual(errors, []);
  console.log("PASS: captions, heading text/page references, bookmark create/rename/navigation and native DOCX fields.");
} catch (e) { if (page) { await page.screenshot({ path: ".local/verwijs-fout.png" }); console.log(await page.locator('body').innerText()); } throw e; }
finally { await browser.close(); await new Promise(r => server.close(r)); }
