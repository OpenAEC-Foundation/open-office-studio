import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
const root = path.resolve(process.argv[2] ?? ".local/dist"), uit = path.resolve(".local/sorteren"); fs.mkdirSync(uit, { recursive: true });
const z = unzipSync(fs.readFileSync("public/templates/nieuw.docx"));
const rows = [["Kolom A", "Kolom B", "Kolom C"], ["Zebra", "2", "2026-11-09"], ["Alfa", "1", "2026-11-08"]];
const table = '<w:tbl><w:tblPr/><w:tblGrid>' + '<w:gridCol w:w="2400"/>'.repeat(3) + '</w:tblGrid>' + rows.map(row => '<w:tr>' + row.map(t => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`).join("") + '</w:tr>').join("") + '</w:tbl><w:p/>';
z["word/document.xml"] = strToU8(strFromU8(z["word/document.xml"]).replace(/<w:body>[\s\S]*?<w:sectPr/, `<w:body>${table}<w:sectPr`));
const mime = { ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".html": "text/html", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, "." + (new URL(req.url, "http://localhost").pathname === "/" ? "/index.html" : decodeURIComponent(new URL(req.url, "http://localhost").pathname)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return void res.writeHead(404).end();
  res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream"); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r)); const browser = await chromium.launch({ headless: true });
let page;
try {
  for (const theme of ["forge", "light"]) {
    page = await browser.newPage({ locale: "nl-NL", viewport: { width: 1400, height: 1000 } }); const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(thema => localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "nl", thema, spelling: { controleren: false } })), theme);
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('input[type="file"]').first().setInputFiles({ name: "Sorteren.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(zipSync(z)) });
    await page.waitForFunction(() => document.title.includes("Sorteren.docx"));
    await page.locator(".canvas-page").first().waitFor();
    const sheet = await page.locator(".canvas-page").first().boundingBox(); assert.ok(sheet);
    await page.mouse.click(sheet.x + 135, sheet.y + 137);
    await page.getByRole("tab", { name: "Tabelopmaak", exact: true }).click();
    await page.getByRole("button", { name: "Gegevens", exact: true }).click();
    await page.getByRole("button", { name: "Sorteren", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Sorteren", exact: true }); await dialog.waitFor();
    const colors = await dialog.locator("select").evaluateAll(nodes => nodes.map(n => {
      const c = getComputedStyle(n), option = getComputedStyle(n.options[0]);
      return { disabled: n.disabled, color: c.color, bg: c.backgroundColor, scheme: c.colorScheme, optionColor: option.color, optionBg: option.backgroundColor };
    }));
    console.log(theme, JSON.stringify(colors));
    if (!process.env.OOS_EXPECT_UNFIXED) {
      for (const c of colors) {
        assert.equal(c.bg, theme === "forge" ? "rgb(42, 42, 49)" : "rgb(255, 255, 255)");
        assert.equal(c.color, theme === "forge" ? "rgb(242, 242, 240)" : "rgb(43, 47, 54)");
        assert.equal(c.optionBg, c.bg); assert.equal(c.optionColor, c.color);
      }
    }
    await dialog.getByRole("checkbox").check();
    await dialog.locator("select").first().selectOption("0");
    assert.match(await dialog.locator("select").first().innerText(), /Kolom A/);
    await page.screenshot({ path: path.join(uit, `${theme}.png`), animations: "disabled" });
    await dialog.getByRole("button", { name: "Sorteren", exact: true }).click();
    const download = page.waitForEvent("download"); await page.keyboard.press("Control+s");
    const save = page.getByRole("dialog"); const route = await Promise.race([download.then(() => "download"), save.waitFor().then(() => "dialog")]); if (route === "dialog") await save.getByRole("button", { name: "Opslaan", exact: true }).click();
    const xml = strFromU8(unzipSync(fs.readFileSync(await (await download).path()))["word/document.xml"]);
    assert.ok(xml.indexOf("Kolom A") < xml.indexOf("Alfa") && xml.indexOf("Alfa") < xml.indexOf("Zebra"));
    assert.deepEqual(errors, []); await page.close();
  }
  console.log("PASS: sort controls/options in dark/light themes, header labels and actual ascending sort.");
} catch (e) { if (page) { console.log((await page.locator("body").innerText()).slice(-2500)); await page.screenshot({ path: path.join(uit, "failure.png") }); } throw e; }
finally { await browser.close(); await new Promise(r => server.close(r)); }

