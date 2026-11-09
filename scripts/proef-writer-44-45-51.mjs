import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { preview, createServer } from "vite";
import { strFromU8, unzipSync } from "fflate";
import { writerFixture } from "./writer-proeffixture.mjs";
const { chromium } = await import(process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright");
const uit = resolve(process.env.OFFICE_TEST_UIT ?? ".local/proef-writer-volledig");
await mkdir(uit, { recursive: true });
const ssr = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true }, appType: "custom" });
const stijlxml = await ssr.ssrLoadModule("/src/tekst/stijlen/stijlenxml.ts"), pakket = await ssr.ssrLoadModule("/src/tekst/stijlen/pakket.ts"), beheer = await ssr.ssrLoadModule("/src/tekst/stijlen/beheer.ts");
let bron = writerFixture();
bron = pakket.bewerkStijlOnderdelen(bron, o => {
  let xml = o.stijlen;
  for (const soort of ["paragraph", "character", "table", "numbering"]) xml = stijlxml.nieuweStijl(xml, { naam: `Imported ${soort}`, soort, eigenschappen: { lettertype: "Carlito", grootte: 13, vet: true, taal: "nl-NL", tabs: [{ position: 1440, alignment: "right", leader: "dot" }], randen: { bottom: { style: "double", size: 8, color: { rgb: "225588" } } }, ...(soort === "table" ? { tabelRanden: { top: { style: "double", size: 8, color: { rgb: "225588" } } }, tabelArcering: { fill: { rgb: "CCEEDD" } } } : {}) } }).xml;
  return { stijlen: xml };
});
bron = beheer.maakLijstStijl(bron, { styleId: "Importednumbering", format: "lowerRoman", start: 4 });
await ssr.close();
await writeFile(resolve(uit, "Writer.docx"), writerFixture()); await writeFile(resolve(uit, "Styles.dotx"), bron);
const server = await preview({ configFile: false, build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" }, preview: { host: "127.0.0.1", port: 0, open: false } });
const browser = await chromium.launch();
const rapport = { stappen: [], fouten: [] };
const stap = naam => { rapport.stappen.push(naam); console.log("PASS", naam); };
const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, locale: "en-US" });
const page = await context.newPage(); page.on("pageerror", e => rapport.fouten.push(String(e)));
await page.addInitScript(() => { localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "en", spelling: { controleren: false, autocorrectie: false } })); localStorage.setItem("open-tekst-pakketroute-bevestigd", "1"); });
async function apiKoppeling() {
  await page.evaluate(() => { window.proefApi = () => {
    const el = document.querySelector(".office-tabpaneel:not([hidden]) .office-tekst");
    for (let f = el?.[Object.keys(el).find(k => k.startsWith("__reactFiber$"))]; f; f = f.return)
      for (let s = f.memoizedState, i = 0; s && i < 200; i++, s = s.next) { const v = s.memoizedState?.current; if (v?.getEditorRef && v.commands) return v; }
    return null;
  }; });
  await page.waitForFunction(() => !!window.proefApi()?.getEditorRef()?.getYrsSession());
  // Creating a style from selection currently performs a second reload after
  // applying the new definition. Wait for the stable production handle.
  await page.waitForTimeout(650);
  for (let poging = 0; ; poging++) {
    try { await page.evaluate(() => window.proefApi().whenLayoutComplete({ timeoutMs: 15000 })); break; }
    catch (e) { if (poging >= 2 || !String(e).includes("unmounted")) throw e; await page.waitForTimeout(300); }
  }
}
async function opslaan(naam) {
  const bytes = Buffer.from(await page.evaluate(async () => Array.from(new Uint8Array(await window.proefApi().save()))));
  // Calling the engine save hook also opens the shell's Save as dialog.
  await page.waitForTimeout(80);
  const shell = page.getByRole("dialog", { name: "Save as", exact: true });
  if (await shell.isVisible()) await shell.getByRole("button", { name: "Cancel", exact: true }).click();
  await writeFile(resolve(uit, naam), bytes); return unzipSync(bytes);
}
async function styles() {
  await page.getByRole("tab", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "All Styles…", exact: true }).click();
  const d = page.getByRole("dialog", { name: "Styles", exact: true }); await d.waitFor(); return d;
}
async function sluit(d) { await d.getByRole("button", { name: "Close", exact: true }).last().click(); }
async function herlaadMet(klik) {
  await page.evaluate(() => { window.proefVoorHerladen = window.proefApi(); });
  await klik(); await page.waitForFunction(() => window.proefApi() && window.proefApi() !== window.proefVoorHerladen && window.proefApi().getEditorRef()?.getYrsSession());
  await apiKoppeling();
}
try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator(".office input[type=file]").first().setInputFiles(resolve(uit, "Writer.docx")); await apiKoppeling();
  let d = await styles();
  for (const id of ["AlleenKoptekst", "AlleenVoetnoot", "AlleenEindnoot", "EigenTabel"]) assert.equal(await d.getByText(id, { exact: true }).count(), 1);
  stap("Used styles includes header, footnote, endnote and table styles");
  await d.getByRole("button", { name: "Import styles…", exact: true }).click();
  d = page.getByRole("dialog", { name: "Import document styles", exact: true }); await d.locator('input[type="file"]').setInputFiles(resolve(uit, "Styles.dotx"));
  await d.getByLabel("Replace matching style IDs", { exact: true }).uncheck();
  await herlaadMet(() => d.getByRole("button", { name: "Import styles…", exact: true }).click());
  d = await styles(); await d.getByRole("combobox", { name: "Which styles", exact: true }).selectOption("alle");
  for (const soort of ["paragraph", "character", "table", "numbering"]) { await d.getByRole("combobox", { name: "Type", exact: true }).selectOption(soort); assert.equal(await d.getByText(`Imported ${soort}`, { exact: true }).count(), 1); }
  await sluit(d);
  let z = await opslaan("Writer-imported.docx");
  assert.match(strFromU8(z["word/styles.xml"]), /w:styleId="Importednumbering"/); assert.ok(Object.keys(z).some(n => /numbering.*\.xml$/.test(n)));
  stap("Import from template includes all four style types, dependencies and numbering");
  d = await styles(); await d.getByRole("button", { name: "New Style…", exact: true }).click();
  d = page.getByRole("dialog", { name: "New Style", exact: true }); await d.getByLabel("Name", { exact: true }).fill("Acceptance paragraph");
  await d.getByLabel("Language code", { exact: true }).fill("nl-NL"); await d.getByText("Tab stops", { exact: true }).click();
  await d.getByRole("button", { name: "Add tab stop", exact: true }).click(); await d.getByLabel("Position (cm)", { exact: true }).fill("2.54");
  await d.getByText("Borders and shading", { exact: true }).click(); await d.getByLabel("Bottom", { exact: true }).check();
  await herlaadMet(() => d.getByRole("button", { name: "Create", exact: true }).click());
  z = await opslaan("Writer-style-created.docx");
  let defs = stijlxml.leesStijlen(strFromU8(z["word/styles.xml"])), gemaakt = defs.find(s => s.naam === "Acceptance paragraph");
  assert.equal(gemaakt.eigenschappen.taal, "nl-NL"); assert.equal(gemaakt.eigenschappen.tabs[0].position, 1440); assert.equal(gemaakt.eigenschappen.randen.bottom.style, "single");
  stap("Create from selection saves language, tabs and borders in the style definition");
  d = await styles(); await d.getByRole("combobox", { name: "Which styles", exact: true }).selectOption("alle");
  await d.locator(".tekst-stijlenlijst").getByText("Acceptance paragraph", { exact: true }).click({ button: "right" }); await page.getByRole("menuitem", { name: "Modify…", exact: true }).click();
  d = page.getByRole("dialog", { name: "Modify Style: Acceptance paragraph", exact: true }); await d.getByLabel("Name", { exact: true }).fill("Renamed acceptance style"); await herlaadMet(() => d.getByRole("button", { name: "Modify", exact: true }).click());
  d = await styles(); await d.getByRole("combobox", { name: "Which styles", exact: true }).selectOption("alle");
  await d.locator(".tekst-stijlenlijst").getByText("Renamed acceptance style", { exact: true }).click({ button: "right" }); await page.getByRole("menuitem", { name: "Delete style…", exact: true }).click();
  d = page.getByRole("dialog", { name: "Delete custom style", exact: true }); await herlaadMet(() => d.getByRole("button", { name: "Delete style…", exact: true }).click());
  z = await opslaan("Writer-style-deleted.docx"); assert.doesNotMatch(strFromU8(z["word/styles.xml"]), /Renamed acceptance style/); assert.doesNotMatch(strFromU8(z["word/document.xml"]), new RegExp(`w:val="${gemaakt.styleId}"`));
  stap("Rename and delete a used custom style repairs document references");
  for (const [kind, id] of [["footnote", 1], ["endnote", 3]]) {
    const letter = page.locator(`#oox-${kind}-${id} .layout-run-text[data-doc-start]`).last(); await letter.scrollIntoViewIfNeeded(); const r = await letter.boundingBox();
    await page.mouse.click(r.x + Math.min(2, r.width / 2), r.y + r.height / 2); await page.keyboard.press("End"); await page.keyboard.type(` EDITED_${kind}`); await page.waitForTimeout(100);
    const current = await page.evaluate(() => window.proefApi().getEditorRef().getYrsSession().selection()?.head.story); assert.equal(current, `${kind === "footnote" ? "fn" : "en"}:${id}`);
    await page.keyboard.press("Control+z"); await page.keyboard.press("Control+y"); await page.keyboard.press("Escape");
  }
  z = await opslaan("Writer-notes-edited.docx"); assert.match(strFromU8(z["word/footnotes.xml"]), /EDITED_footnote/); assert.match(strFromU8(z["word/endnotes.xml"]), /EDITED_endnote/); assert.doesNotMatch(strFromU8(z["word/document.xml"]), /EDITED_/);
  stap("Edit both note kinds at their rendered location, Undo/Redo, and save separately from body text");
  await page.locator('[data-testid="yrs-input"]').focus(); await page.keyboard.press("Control+Home"); await page.keyboard.press("F9"); await page.waitForTimeout(650);
  z = await opslaan("Writer-fields-updated.docx"); const header = strFromU8(z["word/headerProef.xml"]);
  for (const v of ["Writer.docx", "Writer Test Author", "Writer Field Title"]) assert.ok(header.includes(v), v); assert.ok(!header.includes("OLD_"), header);
  stap("F9 refreshes field cache values in a shared header without changing instructions");
  await page.getByRole("tab", { name: "Insert", exact: true }).click(); await page.getByRole("button", { name: "Insert field…", exact: true }).click();
  d = page.getByRole("dialog", { name: "Insert document field", exact: true }); await d.getByRole("combobox", { name: "Field", exact: true }).selectOption("TIME"); await d.getByRole("button", { name: "Insert field…", exact: true }).click();
  z = await opslaan("Writer-field-inserted.docx"); assert.match(strFromU8(z["word/document.xml"]), /TIME/);
  stap("Insert a native TIME field from the shared field dialog");
  await page.screenshot({ path: resolve(uit, "writer.png") });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("office:afdrukvoorbeeld", { detail: {} })));
  const print = page.getByRole("dialog", { name: /^Print preview/ }); await print.waitFor();
  const pdf = page.waitForEvent("download", { timeout: 60000 }); await print.getByRole("button", { name: "Save as PDF", exact: true }).click({ timeout: 60000 });
  const download = await pdf; await download.saveAs(resolve(uit, "Writer.pdf"));
  assert.ok((await readFile(resolve(uit, "Writer.pdf"))).subarray(0, 8).toString().startsWith("%PDF-"));
  stap("The application renders the complete document and notes to its own PDF writer");
  assert.deepEqual(rapport.fouten, []);
} catch (e) { await page.screenshot({ path: resolve(uit, "failure.png") }); throw e; } finally {
  await writeFile(resolve(uit, "rapport.json"), JSON.stringify(rapport, null, 2));
  await browser.close(); await new Promise(klaar => server.httpServer.close(klaar));
}
