import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer, preview } from "vite";
import { strFromU8, unzipSync } from "fflate";
const { chromium } = await import(process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright");
const uit = resolve(process.env.OFFICE_TEST_UIT ?? ".local/proef-writer-nootvervolg");
await mkdir(uit, { recursive: true });
const ssr = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true }, appType: "custom" });
const { Pakket } = await ssr.ssrLoadModule("/src/tekst/pagina/ooxml.ts");
const { voegNootIn } = await ssr.ssrLoadModule("/src/tekst/pagina/noten.ts");
const gevallen = [
  { naam: "footnote", soort: "voetnoot", stijl: "Normal" },
  { naam: "endnote", soort: "eindnoot", stijl: "Normal" },
  { naam: "heading-footnote", soort: "voetnoot", stijl: "Heading1" },
  { naam: "manual-superscript", soort: "eindnoot", stijl: "Normal", super: true },
];
for (const g of gevallen) {
  const z = new Pakket(new Uint8Array(await readFile("public/templates/nieuw.docx")));
  z.schrijf("word/document.xml", z.lees("word/document.xml").replace(/<w:body>[\s\S]*?(<w:sectPr)/,
    `<w:body><w:p><w:pPr><w:pStyle w:val="${g.stijl}"/></w:pPr><w:r>${g.super ? '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>' : ""}<w:t>BeforeNoteProbeMARK</w:t></w:r></w:p>$1`));
  await writeFile(resolve(uit, `${g.naam}.docx`), voegNootIn(z.inpakken(), "MARK", g.soort, "Note body probe").bytes);
}
await ssr.close();
const server = await preview({ configFile: false, build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" }, preview: { host: "127.0.0.1", port: 0, open: false } });
const browser = await chromium.launch(), rapport = { gevallen: [], fouten: [] };
let page;
try {
  for (const g of gevallen) {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: "en-US" });
    page = await context.newPage();
    page.on("pageerror", e => rapport.fouten.push(String(e)));
    await page.addInitScript(() => localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "en", spelling: { controleren: false, autocorrectie: false } })));
    await page.addInitScript(() => {
      window.proefFouten = [];
      window.addEventListener("DOMContentLoaded", () => new MutationObserver(() => {
        for (const e of document.querySelectorAll('[role="alert"]')) {
          const t = e.textContent ?? "";
          if (t.startsWith("Error") && !window.proefFouten.includes(t)) window.proefFouten.push(t);
        }
      }).observe(document.body, { childList: true, characterData: true, subtree: true }));
    });
    await page.goto(server.resolvedUrls.local[0]);
    await page.locator(".office input[type=file]").first().setInputFiles(resolve(uit, `${g.naam}.docx`));
    await page.evaluate(() => { window.proefApi = () => {
      const el = document.querySelector(".office-tabpaneel:not([hidden]) .office-tekst");
      for (let f = el?.[Object.keys(el).find(k => k.startsWith("__reactFiber$"))]; f; f = f.return)
        for (let s = f.memoizedState, i = 0; s && i < 200; i++, s = s.next) { const v = s.memoizedState?.current; if (v?.getEditorRef && v.commands) return v; }
      return null;
    }; });
    await page.waitForFunction(() => window.proefApi?.()?.getEditorRef()?.getYrsSession());
    await page.evaluate(() => window.proefApi().whenLayoutComplete({ timeoutMs: 15000 }));
    const glyph = page.locator(".office-tekst .canvas-page .layout-run-text").first();
    await glyph.scrollIntoViewIfNeeded();
    const box = await glyph.boundingBox(); assert.ok(box);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.press("End");
    const einde = await page.evaluate(() => { const s = window.proefApi().getEditorRef().getYrsSession(); return { selection: s.selection(), length: s.paragraphSpans("body")[0].length }; });
    assert.equal(einde.selection.head.story, "body");
    assert.equal(einde.selection.head.offset, einde.length);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.proefApi().getEditorRef().getYrsSession().paragraphs("body").length === 2);
    await page.keyboard.insertText("AfterNoteProbe");
    const lees = () => page.evaluate(() => {
      const s = window.proefApi().getEditorRef().getYrsSession(), p = s.paragraphs("body")[1];
      if (!p) return { text: null, context: null };
      return { text: p.text, context: s.selectionContext({ story: "body", start: { paraId: p.paraId, offset: 0 }, end: { paraId: p.paraId, offset: p.text.length } }) };
    });
    let staat = await lees();
    assert.equal(staat.text, "AfterNoteProbe"); assert.equal(staat.context.superscript, !!g.super); assert.equal(staat.context.styleId, "Normal");
    if (!g.super) { assert.equal(staat.context.fontFamily, "Cambria"); assert.equal(staat.context.fontSize, 22); }
    await page.keyboard.press("Control+z");
    assert.notEqual((await lees()).text, "AfterNoteProbe");
    await page.keyboard.press("Control+y"); assert.equal((await lees()).text, "AfterNoteProbe");
    const bytes = Buffer.from(await page.evaluate(async () => Array.from(new Uint8Array(await window.proefApi().save()))));
    const save = page.getByRole("dialog", { name: "Save as", exact: true });
    if (await save.isVisible()) await save.getByRole("button", { name: "Cancel", exact: true }).click();
    const xml = strFromU8(unzipSync(bytes)["word/document.xml"]), runs = xml.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g) ?? [];
    const vervolg = runs.find(r => r.includes("AfterNoteProbe")); assert.ok(vervolg);
    assert.doesNotMatch(vervolg, /FootnoteReference|EndnoteReference/);
    if (!g.super) assert.doesNotMatch(vervolg, /superscript/);
    assert.match(runs.find(r => /<w:(footnote|endnote)Reference\b/.test(r)), /superscript/);
    const opgeslagen = resolve(uit, `${g.naam}-saved.docx`); await writeFile(opgeslagen, bytes);
    await page.evaluate(() => { window.oudeSessie = window.proefApi().getEditorRef().getYrsSession(); });
    await page.locator(".office input[type=file]").first().setInputFiles(opgeslagen);
    await page.waitForFunction(() => { const s = window.proefApi?.()?.getEditorRef()?.getYrsSession(); return s && s !== window.oudeSessie; });
    staat = await lees(); assert.equal(staat.text, "AfterNoteProbe"); assert.equal(staat.context.superscript, !!g.super); assert.equal(staat.context.styleId, "Normal");
    assert.deepEqual(await page.evaluate(() => window.proefFouten), []);
    rapport.gevallen.push({ naam: g.naam, saveReopen: true, undoRedo: true, superscript: staat.context.superscript });
    console.log("PASS", g.naam, "End → Enter → type → Undo/Redo → save → reopen");
    await context.close();
  }
  assert.deepEqual(rapport.fouten, []);
} catch (e) {
  if (page && !page.isClosed()) await page.screenshot({ path: resolve(uit, "failure.png") });
  throw e;
} finally {
  await writeFile(resolve(uit, "rapport.json"), JSON.stringify(rapport, null, 2));
  await browser.close(); await new Promise(done => server.httpServer.close(done));
}
