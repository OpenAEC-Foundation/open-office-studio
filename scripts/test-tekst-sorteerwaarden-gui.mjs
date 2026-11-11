/** #48: datumherkenning en sorteren via de productie-interface. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { preview } from "vite";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
const { chromium } = await import(process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright");
const uit = resolve(process.env.OFFICE_TEST_UIT ?? ".local/proef-sorteerwaarden");
await mkdir(uit, { recursive: true });
const rijen = [["Datum", "ID"], ["31-02-2026", "A"], ["02-03-2026", "B"], ["01-03-2026", "C"], ["", "D"], ["2026-13-01", "E"]];
const z = unzipSync(await readFile("public/templates/nieuw.docx"));
const tbl = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="1500"/></w:tblGrid>' +
  rijen.map((rij, i) => `<w:tr>${i ? "" : '<w:trPr><w:tblHeader/></w:trPr>'}${rij.map((t, j) => `<w:tc><w:p><w:r>${j ? '<w:rPr><w:b/></w:rPr>' : ""}<w:t>${t}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`).join("") + '</w:tbl><w:p/>';
z["word/document.xml"] = strToU8(strFromU8(z["word/document.xml"]).replace(/(<w:body>)[\s\S]*?(<w:sectPr)/, `$1${tbl}$2`));
const bron = zipSync(z);
const server = await preview({ configFile: false, build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" }, preview: { host: "127.0.0.1", port: 0, open: false } });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "en-US" });
const rapport = { stappen: [], fouten: [] };
page.on("pageerror", (e) => rapport.fouten.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") rapport.fouten.push(m.text()); });
const stap = (naam) => { rapport.stappen.push(naam); console.log(naam); };
async function lees() {
  return page.evaluate(async () => {
    const api = window.proefApi(); await api.flushPendingInput();
    const s = api.getEditorRef().getYrsSession();
    return s.tablePayload("body", 0).rows.map((r) => r.cells.map((c) => s.paragraphs(c.story).map((p) => p.text).join("\n")));
  });
}
async function sorteer(aflopend, controleerType = false) {
  await page.evaluate(() => {
    const e = window.proefApi().getEditorRef(), s = e.getYrsSession(), story = s.tablePayload("body", 0).rows[1].cells[0].story;
    const loc = { story, paraId: s.paragraphs(story)[0].paraId, offset: 0 };
    e.setSelection(e.yrsLocToDisplayPosition(loc)); e.focus();
  });
  await page.getByRole("tab", { name: "Table Design", exact: true }).click();
  await page.getByRole("button", { name: "Sort", exact: true }).click();
  const d = page.getByRole("dialog", { name: "Sort", exact: true });
  if (controleerType) assert.equal(await d.getByLabel("Type", { exact: true }).first().inputValue(), "tekst");
  await d.getByLabel("Type", { exact: true }).first().selectOption("datum");
  await d.getByLabel("My list has a header row", { exact: true }).check();
  await d.getByLabel(aflopend ? "Descending" : "Ascending", { exact: true }).first().check();
  await d.getByRole("button", { name: "Sort", exact: true }).click();
  await d.waitFor({ state: "detached" });
}
try {
  await page.addInitScript(() => localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "en", thema: "light", spelling: { controleren: false, autocorrectie: false } })));
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator(".office input[type=file]").first().setInputFiles({ name: "Datums.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(bron) });
  await page.waitForSelector("canvas");
  await page.evaluate(() => {
    window.proefApi = () => {
      const el = document.querySelector(".office-tabpaneel:not([hidden]) .office-tekst");
      for (let f = el?.[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))]; f; f = f.return)
        for (let s = f.memoizedState, i = 0; s && i < 200; i++, s = s.next) {
          const v = s.memoizedState?.current;
          if (v?.getEditorRef && v.commands) return v;
        }
      return null;
    };
  });
  await page.waitForFunction(() => window.proefApi()?.getEditorRef()?.getLayout()?.pages.length);
  await sorteer(false, true);
  assert.deepEqual(await lees(), [0, 3, 2, 1, 4, 5].map((i) => rijen[i]));
  stap("Gemengde ongeldige datums worden niet automatisch als Datum/Getal herkend; expliciet oplopend sorteren houdt ongeldige waarden achteraan en rijgegevens bij elkaar");
  await page.evaluate(() => window.proefApi().getEditorRef().focus());
  await page.keyboard.press("Control+z");
  assert.deepEqual(await lees(), rijen);
  await page.keyboard.press("Control+y");
  assert.deepEqual(await lees(), [0, 3, 2, 1, 4, 5].map((i) => rijen[i]));
  stap("Undo en Redo herstellen de hele rijvolgorde");
  await sorteer(true);
  const verwacht = [0, 2, 3, 1, 4, 5].map((i) => rijen[i]);
  assert.deepEqual(await lees(), verwacht);
  stap("Aflopend sorteren houdt de kopregel en ongeldige/lege waarden op hun plaats");
  const bewaard = Buffer.from(await page.evaluate(async () => Array.from(new Uint8Array(await window.proefApi().save()))));
  await writeFile(resolve(uit, "Gesorteerd.docx"), bewaard);
  await page.evaluate(() => { window.proefOud = window.proefApi(); });
  await page.locator(".office input[type=file]").first().setInputFiles({ name: "Heropend.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: bewaard });
  await page.waitForFunction(() => window.proefApi() && window.proefApi() !== window.proefOud && window.proefApi().getEditorRef()?.getLayout()?.pages.length);
  assert.deepEqual(await lees(), verwacht);
  stap("Opslaan en heropenen behouden de gesorteerde tabel zonder gewijzigde datumteksten");
  assert.deepEqual(rapport.fouten, []);
} finally {
  await writeFile(resolve(uit, "rapport.json"), JSON.stringify(rapport, null, 2) + "\n");
  await browser.close(); await server.httpServer.close();
}

