// Bouw eerst met Vite; geef eventueel de dist-map mee als eerste argument.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { strFromU8, unzipSync } from "fflate";

const { preloadEditWasm } = await import(pathToFileURL(path.resolve("node_modules/@betteroffice/docx/dist/wasm-edit.mjs")).href);
await preloadEditWasm(fs.readFileSync("vendor/tekstengine/docx_edit_bg.wasm"));
const { createYrsSession, saveYrsDocx } = await import("@betteroffice/docx/yrs");
const s = await createYrsSession();
let fixture;
try {
  s.openDocx(fs.readFileSync("public/templates/nieuw.docx"), true);
  const loc = { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 };
  s.insertImage(loc, {
    width: 320, height: 160, wrapType: "inline", cropTop: 0.2, cropBottom: 0.3,
    alt: "Vervangproef", src: `data:image/png;base64,${fs.readFileSync("src-tauri/icons/32x32.png").toString("base64")}`,
  });
  fixture = Buffer.from((await saveYrsDocx(s)).bytes);
} finally { s.destroy(); }

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
  const page = await browser.newPage({ locale: "nl-NL", viewport: { width: 1300, height: 950 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "nl", spelling: { controleren: false } })));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const open = async (name, buffer) => {
    await page.locator('input[type="file"]').first().setInputFiles({ name, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer });
    await page.waitForFunction(name => document.title.includes(name), name);
  };
  async function kiesBeeld() {
    await page.locator('[data-testid="yrs-input"]:visible').waitFor();
    const tab = page.getByRole("tab", { name: /afbeelding/i });
    // Het enige beeld staat op de eerste tekstpositie, bij vaste proefmarges
    // en viewport. De contexttab bevestigt dat de tekenlaag de klik verwerkt.
    const einde = Date.now() + 15000;
    while (!await tab.count() && Date.now() < einde) {
      await page.mouse.click(530, 400);
      await page.waitForTimeout(100);
    }
    await tab.click();
  }
  const height = page.getByRole("spinbutton", { name: "Hoogte (cm)", exact: true });
  const width = page.getByRole("spinbutton", { name: "Breedte (cm)", exact: true });
  const maten = async () => ({ width: await width.inputValue(), height: await height.inputValue() });
  await open("Vervangproef.docx", fixture);
  await kiesBeeld();
  const voor = await maten();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Afbeelding wijzigen", exact: true }).click();
  await (await chooser).setFiles("src-tauri/icons/128x128.png");
  // Opslaan wacht op de afgeronde invoer en levert een waarneembare bevestiging
  // dat de asynchrone bestandskeuze en bewerking verwerkt zijn.
  const download = page.waitForEvent("download");
  await page.waitForTimeout(500);
  assert.deepEqual(await maten(), voor);
  await page.keyboard.press("Control+s");
  const dialog = page.getByRole("dialog");
  const route = await Promise.race([
    download.then(() => "download"),
    dialog.waitFor().then(() => "dialog"),
  ]);
  if (route === "dialog") await dialog.getByRole("button", { name: "Opslaan", exact: true }).click();
  const saved = await download;
  const bytes = fs.readFileSync(await saved.path());
  const delen = unzipSync(bytes), xml = strFromU8(delen["word/document.xml"]);
  assert.ok(xml.includes('cx="3048000"') && xml.includes('cy="1524000"'), "Weergavemaat gewijzigd");
  assert.ok(xml.includes('t="20000"') && xml.includes('b="30000"'), "Bijsnijding gewijzigd");
  const replacement = fs.readFileSync("src-tauri/icons/128x128.png");
  assert.ok(Object.entries(delen).some(([n, d]) => n.startsWith("word/media/") && Buffer.from(d).equals(replacement)), "Nieuwe mediabytes ontbreken");
  await open("Heropende-vervangproef.docx", bytes);
  await kiesBeeld();
  assert.deepEqual(await maten(), voor);
  assert.deepEqual(errors, []);
  console.log("PASS: vervangingsknop, nieuwe mediabytes, afmetingen, bijsnijding en heropenen; geen paginafouten.");
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
