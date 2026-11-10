import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer, preview } from "vite";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { writerFixture } from "./writer-proeffixture.mjs";
const { chromium } = await import(process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright");
const uit = resolve(process.env.OFFICE_TEST_UIT ?? ".local/proef-writer-onderdelen");
await mkdir(uit, { recursive: true });
const ssr = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true }, appType: "custom" });
const { nieuweStijl } = await ssr.ssrLoadModule("/src/tekst/stijlen/stijlenxml.ts");
const source = unzipSync(writerFixture());
source["word/styles.xml"] = strToU8(nieuweStijl(strFromU8(source["word/styles.xml"]), { naam: "CursorFooterTable", soort: "table", eigenschappen: { tabelArcering: { fill: { rgb: "CCEEDD" } } } }).xml);
for (const [naam,soort] of [["CursorStoryParagraph","paragraph"],["CursorStoryCharacter","character"]])
  source["word/styles.xml"] = strToU8(nieuweStijl(strFromU8(source["word/styles.xml"]), { naam, soort, eigenschappen: { vet:true,kleur:"225588" } }).xml);
source["word/footerProef.xml"] = strToU8(strFromU8(source["word/footerProef.xml"]).replace(/<w:p>[\s\S]*<\/w:p>/, '<w:tbl><w:tblPr><w:tblW w:w="8000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="8000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="8000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>FooterCellProbe</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p/>'));
await writeFile(resolve(uit, "CustomStoryParts.docx"), zipSync(source));
await ssr.close();
const server = await preview({ configFile: false, build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" }, preview: { host: "127.0.0.1", port: 0, open: false } });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, locale: "en-US" });
const page = await context.newPage(), rapport = { stappen: [], fouten: [] };
page.on("pageerror", e => rapport.fouten.push(String(e)));
await page.addInitScript(() => { localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "en", spelling: { controleren: false, autocorrectie: false } })); localStorage.setItem("open-tekst-pakketroute-bevestigd", "1"); });
await page.addInitScript(() => {
  window.proefFoutmeldingen = [];
  window.addEventListener("DOMContentLoaded", () => {
    new MutationObserver(() => {
      for (const e of document.querySelectorAll('[role="alert"]')) {
        const text = e.textContent ?? "";
        if (text.startsWith("Error") && !window.proefFoutmeldingen.includes(text)) window.proefFoutmeldingen.push(text);
      }
    }).observe(document.body, { childList: true, characterData: true, subtree: true });
  });
});
function stap(s) { rapport.stappen.push(s); console.log("PASS", s); }
async function klaar() {
  await page.waitForFunction(() => window.proefApi?.()?.getEditorRef()?.getYrsSession());
  // Package mutations replace the production handle while it finishes opening.
  await page.waitForTimeout(650);
  for (let poging = 0; ; poging++) {
    try { await page.evaluate(() => window.proefApi().whenLayoutComplete({ timeoutMs: 15000 })); break; }
    catch (e) { if (poging >= 2 || !String(e).includes("unmounted")) throw e; await page.waitForTimeout(300); }
  }
}
async function herlaad(klik) {
  await page.evaluate(() => { window.oudeSessie = window.proefApi().getEditorRef().getYrsSession(); });
  await klik();
  await page.waitForFunction(() => {
    const sessie = window.proefApi()?.getEditorRef()?.getYrsSession();
    return sessie && sessie !== window.oudeSessie;
  });
  await klaar();
}
async function bewaar(naam) {
  const bytes = Buffer.from(await page.evaluate(async () => Array.from(new Uint8Array(await window.proefApi().save()))));
  await page.waitForTimeout(100);
  const shell = page.getByRole("dialog", { name: "Save as", exact: true });
  if (await shell.isVisible()) await shell.getByRole("button", { name: "Cancel", exact: true }).click();
  await writeFile(resolve(uit, naam), bytes); return unzipSync(bytes);
}
async function stijlen(soort, sneltoets = true) {
  if (sneltoets) await page.keyboard.press("Control+Alt+Shift+s");
  else {
    await page.getByRole("tab", { name: "Home", exact: true }).click();
    await page.getByRole("button", { name: "All Styles…", exact: true }).click();
  }
  const styles = page.getByRole("dialog", { name: "Styles", exact: true });
  await styles.getByRole("combobox", { name: "Which styles", exact: true }).selectOption("alle");
  await styles.getByRole("combobox", { name: "Type", exact: true }).selectOption(soort);
  return styles;
}
async function voetcel() {
  await page.getByRole("tab", { name: "Header & Footer", exact: true }).click();
  await page.getByRole("button", { name: "Edit Footer", exact: true }).click();
  await page.waitForSelector(".hf-inline-editor");
  const text = page.getByText("FooterCellProbe", { exact: true }).first().locator(".layout-run-text").first();
  await text.scrollIntoViewIfNeeded(); const box = await text.boundingBox(); assert.ok(box);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const story = await page.evaluate(() => window.proefApi().getEditorRef().getYrsSession().selection()?.head.story);
  assert.ok(story.startsWith("hf:"), story);
}
try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator(".office input[type=file]").first().setInputFiles(resolve(uit, "CustomStoryParts.docx"));
  await page.evaluate(() => { window.proefApi = () => {
    const el = document.querySelector(".office-tabpaneel:not([hidden]) .office-tekst");
    for (let f = el?.[Object.keys(el).find(k => k.startsWith("__reactFiber$"))]; f; f = f.return)
      for (let s = f.memoizedState, i = 0; s && i < 200; i++, s = s.next) { const v = s.memoizedState?.current; if (v?.getEditorRef && v.commands) return v; }
    return null;
  }; });
  await klaar();
  await page.getByRole("tab", { name: "Header & Footer", exact: true }).click();
  await page.getByRole("button", { name: "Edit Header", exact: true }).click();
  await page.waitForSelector(".hf-inline-editor");
  await page.keyboard.press("End");
  await page.getByRole("button", { name: "Page Number", exact: true }).click();
  await herlaad(() => page.getByRole("menuitem", { name: /^Current Position/ }).click());
  let z = await bewaar("Header-field.docx");
  const originalFields = (strFromU8(source["word/headerProef.xml"]).match(/<w:instrText/g) ?? []).length;
  assert.equal((strFromU8(z["word/headerProef.xml"]).match(/<w:instrText/g) ?? []).length, originalFields + 1);
  assert.ok(!strFromU8(z["word/headerProef.xml"]).includes("OOSMARK"));
  assert.ok(!strFromU8(z["word/document.xml"]).includes("OOSMARK"));
  stap("Page Number → Current Position inserts in headerProef.xml and removes the live marker");
  await page.getByRole("tab", { name: "Header & Footer", exact: true }).click();
  const close = page.getByRole("button", { name: "Close Header and Footer", exact: true });
  if (await close.isEnabled()) await close.click();
  await voetcel();
  let styles = await stijlen("table");
  await herlaad(() => styles.locator(".tekst-stijlenlijst").getByText("CursorFooterTable", { exact: true }).click());
  z = await bewaar("Footer-table-style.docx");
  assert.ok(strFromU8(z["word/footerProef.xml"]).includes('w:tblStyle w:val="CursorFooterTable"'));
  assert.ok(!strFromU8(z["word/document.xml"]).includes('w:tblStyle w:val="CursorFooterTable"'));
  for (const part of ["word/document.xml", "word/headerProef.xml", "word/footerProef.xml"]) assert.ok(!strFromU8(z[part]).includes("OOSMARK"), part);
  stap("Applying a named table style edits the footer table without changing body-table styles");
  await voetcel(); await page.keyboard.press("Home"); await page.keyboard.press("Shift+End");
  styles = await stijlen("character", false);
  await styles.locator(".tekst-stijlenlijst").getByText("CursorStoryCharacter", { exact: true }).click();
  await styles.getByRole("button", { name:"Close",exact:true }).last().click();
  z = await bewaar("Footer-character-style.docx");
  assert.ok(strFromU8(z["word/footerProef.xml"]).includes('w:rStyle w:val="CursorStoryCharacter"'));
  assert.ok(!strFromU8(z["word/document.xml"]).includes('w:rStyle w:val="CursorStoryCharacter"'));
  stap("Character styles remain available in a footer and affect only the selected footer text");
  await voetcel();
  styles = await stijlen("paragraph");
  await styles.locator(".tekst-stijlenlijst").getByText("CursorStoryParagraph", { exact: true }).click();
  await styles.getByRole("button", { name:"Close",exact:true }).last().click();
  z = await bewaar("Footer-paragraph-style.docx");
  assert.ok(strFromU8(z["word/footerProef.xml"]).includes('w:pStyle w:val="CursorStoryParagraph"'));
  assert.ok(!strFromU8(z["word/document.xml"]).includes('w:pStyle w:val="CursorStoryParagraph"'));
  stap("Paragraph styles remain available in a footer without restyling the body");
  for (const [kind,story,type,name,part,tag] of [
    ["footnote","fn:1","paragraph","CursorStoryParagraph","word/footnotes.xml","pStyle"],
    ["endnote","en:1","character","CursorStoryCharacter","word/endnotes.xml","rStyle"],
  ]) {
    const glyph = page.locator(`#oox-${kind}-1 .layout-run-text`).last();
    await glyph.scrollIntoViewIfNeeded(); const box = await glyph.boundingBox(); assert.ok(box);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    assert.equal(await page.evaluate(()=>window.proefApi().getEditorRef().getYrsSession().selection()?.head.story),story);
    await page.keyboard.press("Home");
    if(type==="character") { await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Shift+End"); }
    styles=await stijlen(type);
    await styles.locator(".tekst-stijlenlijst").getByText(name,{exact:true}).click();
    await styles.getByRole("button",{name:"Close",exact:true}).last().click();
    if(type==="character") { await page.keyboard.press("Control+z"); await page.keyboard.press("Control+y"); }
    z=await bewaar(`${kind}-style.docx`);
    assert.ok(strFromU8(z[part]).includes(`w:${tag} w:val="${name}"`));
    assert.ok(!strFromU8(z["word/document.xml"]).includes(`w:${tag} w:val="${name}"`));
    stap(`${type} style applies to the actual ${kind} story and persists separately from the body`);
  }
  assert.deepEqual(await page.evaluate(() => window.proefFoutmeldingen), []);
  await page.screenshot({ path: resolve(uit, "writer-custom-parts.png") });
  assert.deepEqual(rapport.fouten, []);
} catch (e) {
  await writeFile(resolve(uit, "failure-state.json"), JSON.stringify(await page.evaluate(() => {
    const api = window.proefApi(), s = api.getEditorRef().getYrsSession();
    return { selection: s.selection(), stories: s.storyIds().map(id => ({ id, paragraphs: s.paragraphs(id) })), textNodes: [...document.querySelectorAll("span,p")].filter(e => e.textContent === "FooterCellProbe").map(e => ({ html: e.outerHTML, rect: e.getBoundingClientRect().toJSON() })) };
  }), null, 2));
  await page.screenshot({ path: resolve(uit, "failure.png") }); throw e;
} finally {
  await writeFile(resolve(uit, "rapport.json"), JSON.stringify(rapport, null, 2));
  await browser.close(); await new Promise(done => server.httpServer.close(done));
}
