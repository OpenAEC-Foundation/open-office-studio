import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer, preview } from "vite";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
const { chromium } = await import(process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright");
const out = resolve(process.env.OFFICE_TEST_UIT ?? ".local/writer-pdf-interne-links");
await mkdir(out, { recursive: true });
const z = unzipSync(await readFile("public/templates/nieuw.docx"));
const body = '<w:p><w:hyperlink w:anchor="KnownBookmark"><w:r><w:t>Named link</w:t></w:r></w:hyperlink><w:r><w:t> / </w:t></w:r><w:hyperlink w:anchor="MissingBookmark"><w:r><w:t>Missing link</w:t></w:r></w:hyperlink><w:r><w:t> / </w:t></w:r><w:hyperlink r:id="rIdSafePdf"><w:r><w:t>Safe external</w:t></w:r></w:hyperlink><w:r><w:t> / </w:t></w:r><w:hyperlink r:id="rIdUnsafePdf"><w:r><w:t>Unsafe external</w:t></w:r></w:hyperlink></w:p>' +
  '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pageBreakBefore/></w:pPr><w:r><w:t>Shared destination</w:t></w:r></w:p>' +
  '<w:p><w:bookmarkStart w:id="42" w:name="KnownBookmark"/><w:r><w:t>Named bookmark destination</w:t></w:r><w:bookmarkEnd w:id="42"/></w:p>' +
  '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pageBreakBefore/></w:pPr><w:r><w:t>Shared destination</w:t></w:r></w:p>';
z["word/document.xml"] = strToU8(strFromU8(z["word/document.xml"]).replace(/<w:body>[\s\S]*?<w:sectPr/, `<w:body>${body}<w:sectPr`));
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";
z["word/_rels/document.xml.rels"] = strToU8(strFromU8(z["word/_rels/document.xml.rels"]).replace("</Relationships>",
  `<Relationship Id="rIdSafePdf" Type="${rel}" Target="https://example.invalid/pdf-safe" TargetMode="External"/><Relationship Id="rIdUnsafePdf" Type="${rel}" Target="javascript:alert(1)" TargetMode="External"/></Relationships>`));
const ssr = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true }, appType: "custom" });
let bytes;
try {
  const { voegInhoudsopgaveIn, STANDAARD_INHOUD } = await ssr.ssrLoadModule("/src/tekst/pagina/inhoudsopgave.ts");
  bytes = voegInhoudsopgaveIn(zipSync(z), null, [2, 3].map(p => ({ tekst: "Shared destination", niveau: 1, pagina: String(p) })), { ...STANDAARD_INHOUD, titel: "Contents" });
} finally { await ssr.close(); }
await writeFile(resolve(out, "InternalLinks.docx"), bytes);
const sourceXml = strFromU8(unzipSync(bytes)["word/document.xml"]);
const bookmarks = xml => [...xml.matchAll(/<w:bookmarkStart\b[^>]*w:name="([^"]+)"/g)].map(m => m[1]).sort();
const sourceBookmarks = bookmarks(sourceXml);
assert.equal(sourceBookmarks.length, 3);
const server = process.env.OFFICE_TEST_URL ? null : await preview({ configFile: false, build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" }, preview: { host: "127.0.0.1", port: 0 } });
const browser = await chromium.launch();
const report = { browser: browser.version(), url: process.env.OFFICE_TEST_URL ?? server.resolvedUrls.local[0], cases: [], errors: [] };
try {
  const page = await browser.newPage({ locale: "en-US", viewport: { width: 1500, height: 1100 } });
  page.on("pageerror", e => report.errors.push(String(e)));
  page.on("response", r => { if (r.status() >= 400) report.errors.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript(() => {
    localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "en", spelling: { controleren: false, autocorrectie: false } }));
    localStorage.setItem("open-tekst-pakketroute-bevestigd", "1");
  });
  await page.goto(report.url);
  await page.locator(".office input[type=file]").first().setInputFiles(resolve(out, "InternalLinks.docx"));
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
  await page.keyboard.press("Control+p");
  const dialog = page.getByRole("dialog", { name: /^Print preview/ });
  await dialog.waitFor({ timeout: 60000 });
  await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some(e => e.textContent.includes("Preparing pages")));
  await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] img')].some(img => img.complete && img.naturalWidth > 0));
  await page.screenshot({ path: resolve(out, "preview.png") });
  for (const [name, range, expectedPages, expectedInternal] of [["all", "", 3, 4], ["first-only", "1", 1, 0], ["subset", "1,3", 2, 2], ["reordered", "3,1", 2, 2]]) {
    await dialog.getByRole("textbox", { name: "Pages", exact: true }).fill(range);
    const download = page.waitForEvent("download", { timeout: 60000 });
    await dialog.getByRole("button", { name: "Save as PDF", exact: true }).click();
    const path = resolve(out, `${name}.pdf`);
    await (await download).saveAs(path);
    const pdf = (await readFile(path)).toString("latin1");
    const pageIds = [...pdf.matchAll(/(\d+) 0 obj\n<< \/Type \/Page \/Parent/g)].map(m => Number(m[1]));
    const targets = [...pdf.matchAll(/\/Dest \[(\d+) 0 R \/XYZ ([^\]]+)\]/g)].map(m => ({ id: Number(m[1]), xy: m[2] }));
    // Outlines also have /Dest; Link objects are checked separately.
    const links = [...pdf.matchAll(/\d+ 0 obj\n(<< \/Type \/Annot \/Subtype \/Link [^\n]+)\nendobj/g)].map(m => m[1]);
    const internal = links.filter(s => s.includes("/Dest ["));
    assert.equal(pageIds.length, expectedPages, name);
    assert.equal(internal.length, expectedInternal, `${name}: complete TOC and named links`);
    assert.equal(links.length, expectedInternal + 1, `${name}: only one safe external control`);
    assert.ok(pdf.includes("/URI (https://example.invalid/pdf-safe)"));
    assert.ok(!pdf.includes("/URI (#") && !pdf.includes("javascript:"));
    for (const a of internal) assert.ok(pageIds.includes(Number(/\/Dest \[(\d+)/.exec(a)[1])), "destination must name an exported page object");
    if (name === "all") assert.equal(new Set(internal.map(a => /\/Dest \[(\d+)/.exec(a)[1])).size, 2, "same heading titles still lead to different pages");
    if (name === "subset" || name === "reordered") {
      const target = pageIds[name === "subset" ? 1 : 0];
      assert.ok(internal.every(a => a.includes(`/Dest [${target} 0 R`)), `${name}: remapped physical destination`);
    }
    report.cases.push({ name, range, pageIds, internal: internal.length, targets });
    console.log("PASS", name);
  }
  await page.keyboard.press("Escape");
  const saved = Buffer.from(await page.evaluate(async () => Array.from(new Uint8Array(await window.proefApi().save()))));
  await writeFile(resolve(out, "after-print.docx"), saved);
  const savedXml = strFromU8(unzipSync(saved)["word/document.xml"]);
  assert.deepEqual(bookmarks(savedXml), sourceBookmarks, "source bookmark identities survive PDF and save");
  assert.ok(savedXml.includes("TOC ") && savedXml.includes("KnownBookmark") && savedXml.includes("MissingBookmark"), "source field and links remain native");
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  if (server) await new Promise(r => server.httpServer.close(r));
}
