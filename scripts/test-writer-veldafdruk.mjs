import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { preview } from "vite";
import { writerFixture } from "./writer-proeffixture.mjs";
const { chromium } = await import(process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright");

// Real production UI → print canvas → downloaded PDF. Retain the artifacts for
// independent PDF glyph/visual inspection; canvas geometry catches #323 before
// PDF serialization can mask it. No machine-specific input files are needed.
const out = resolve(process.env.OFFICE_TEST_UIT ?? ".local/writer-veldafdruk");
const longName = "writer-native-stories-1e5afa39-2026-11-10.docx";
const modes = ["full", "pair", "literal", "short", "bold-italic"];
const inputs = new Map();
for (const mode of modes) {
  const z = unzipSync(writerFixture());
  let header = strFromU8(z["word/headerProef.xml"]);
  header = header.replace("OLD_FILENAME", longName).replace("OLD_AUTHOR", "Writer Test Author").replace("OLD_TITLE", "Writer Field Title");
  if (mode !== "full") {
    const fields = header.match(/<w:fldSimple\b[\s\S]*?<\/w:fldSimple>/g);
    let filename = fields.find(s => /w:instr=" FILENAME "/.test(s));
    let author = fields.find(s => /w:instr=" AUTHOR "/.test(s));
    assert.ok(filename && author);
    if (mode === "literal") {
      filename = filename.replace(/^<w:fldSimple[^>]*>|<\/w:fldSimple>$/g, "");
      author = author.replace(/^<w:fldSimple[^>]*>|<\/w:fldSimple>$/g, "");
    }
    header = header.replace(/(<w:p>[\s\S]*?<\/w:p>)<w:p>[\s\S]*?<\/w:p>/,
      `$1<w:p>${filename}<w:r><w:t xml:space="preserve"> | </w:t></w:r>${author}</w:p>`);
  }
  if (mode === "bold-italic") header = header.replaceAll("<w:r>", "<w:r><w:rPr><w:b/><w:i/></w:rPr>");
  z["word/headerProef.xml"] = strToU8(header);
  const dir = resolve(out, mode), name = mode === "short" ? "a.docx" : longName;
  await mkdir(dir, { recursive: true });
  const file = resolve(dir, name);
  await writeFile(file, zipSync(z));
  inputs.set(mode, file);
}
const server = process.env.OFFICE_TEST_URL ? null : await preview({ configFile: false, build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" }, preview: { host: "127.0.0.1", port: 0, open: false } });
const url = process.env.OFFICE_TEST_URL ?? server.resolvedUrls.local[0];
const browser = await chromium.launch();
const report = [];
try {
  for (const mode of modes) {
    const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, locale: "en-US" });
    try {
      const page = await context.newPage(), errors = [];
      page.on("pageerror", e => errors.push(String(e)));
      page.on("response", r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
      await page.addInitScript(() => {
        localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "en", spelling: { controleren: false, autocorrectie: false } }));
        localStorage.setItem("open-tekst-pakketroute-bevestigd", "1");
      });
      await page.goto(url);
      await page.locator(".office input[type=file]").first().setInputFiles(inputs.get(mode));
      await page.evaluate(() => {
        window.proefApi = () => {
          const el = document.querySelector(".office-tabpaneel:not([hidden]) .office-tekst");
          for (let f = el?.[Object.keys(el).find(k => k.startsWith("__reactFiber$"))]; f; f = f.return)
            for (let s = f.memoizedState, i = 0; s && i < 200; i++, s = s.next) {
              const v = s.memoizedState?.current;
              if (v?.getEditorRef && v.commands) return v;
            }
          return null;
        };
      });
      await page.waitForFunction(() => window.proefApi?.()?.getEditorRef()?.getYrsSession());
      await page.evaluate(() => window.proefApi().whenLayoutComplete({ timeoutMs: 15000 }));
      await page.evaluate(() => {
        window.printText = [];
        const original = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, x, y, max) {
          if (!this.canvas.isConnected && this.canvas.width > 1000) {
            const m = this.getTransform();
            window.printText.push({ text: String(text), x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f,
              font: this.font, width: this.measureText(String(text)).width * Math.hypot(m.a, m.b), max });
          }
          return original.call(this, text, x, y, max);
        };
      });
      await page.keyboard.press("Control+p");
      const dialog = page.getByRole("dialog", { name: /^Print preview/ });
      await dialog.waitFor({ timeout: 60000 });
      const save = dialog.getByRole("button", { name: "Save as PDF", exact: true });
      await save.waitFor();
      await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some(e => e.textContent.includes("Preparing pages")));
      await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] img')].some(img => img.complete && img.naturalWidth > 0));
      await page.screenshot({ path: resolve(out, mode, "preview.png") });
      const download = page.waitForEvent("download", { timeout: 60000 });
      await save.click();
      await (await download).saveAs(resolve(out, mode, "export.pdf"));
      const text = await page.evaluate(() => window.printText);
      await writeFile(resolve(out, mode, "canvas-text.json"), JSON.stringify(text, null, 2));
      const fields = text.filter(t => t.text === (mode === "short" ? "a.docx" : longName));
      if (mode !== "literal") {
        assert.equal(fields.length, 3, `${mode}: filename appears on each of the three pages`);
        for (const field of fields) {
          const after = text.slice(text.indexOf(field) + 1);
          const separator = after.find(t => t.text === "|" && t.y === field.y);
          const author = after.find(t => t.text === "Writer Test Author" && t.y === field.y);
          assert.ok(separator && author);
          assert.ok(field.x + field.width < separator.x, `${mode}: filename overlaps separator`);
          assert.ok(field.x + field.width < author.x, `${mode}: filename overlaps author`);
          assert.ok(field.width > 0 && field.max === undefined, `${mode}: field remains complete, without clipping`);
          if (mode === "full") {
            const next = after.slice(after.indexOf(author) + 1).find(t => t.text === "|" && t.y === author.y);
            assert.ok(author.x + author.width < next.x, "author overlaps the following field");
          }
        }
      } else {
        assert.equal(text.filter(t => t.text === "|").length, 3);
        assert.ok(!text.some(t => /oos-veld-/.test(t.font)), "literal control must retain its existing paint route");
      }
      assert.deepEqual(errors, []);
      report.push({ mode, headerPages: 3, errors, filename: fields.map(({ x, y, width, font }) => ({ x, y, width, font })) });
      console.log("PASS", mode);
    } finally { await context.close(); }
  }
} finally {
  await writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  if (server) await new Promise(r => server.httpServer.close(r));
}
