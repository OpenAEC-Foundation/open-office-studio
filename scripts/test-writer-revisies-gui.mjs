/** Controleer de echte revisieoverlay, gewone opmerkingen en bewaarde XML. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { chromium } from "playwright";
import { preview } from "vite";

const uitvoer = resolve(process.env.OFFICE_TEST_UIT ?? ".local/proef-writer-revisies");
await mkdir(uitvoer, { recursive: true });
const pakket = unzipSync(await readFile("public/templates/nieuw.docx"));
const xml = strFromU8(pakket["word/document.xml"]);
const inhoud = '<w:p><w:r><w:t>Basisalinea met gewone woorden.</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Een wijziging: </w:t></w:r><w:ins w:id="10" w:author="Proefauteur" w:date="2026-11-03T00:00:00Z"><w:r><w:t>Ingevoegde woorden</w:t></w:r></w:ins><w:r><w:t xml:space="preserve"> en </w:t></w:r><w:del w:id="11" w:author="Proefauteur" w:date="2026-11-03T00:00:00Z"><w:r><w:delText>Verwijderde woorden</w:delText></w:r></w:del></w:p>';
const sectie = xml.match(/<w:sectPr(?:\s[^>]*)?>[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/);
assert(sectie);
pakket["word/document.xml"] = strToU8(xml.replace(/<w:body>[\s\S]*?<\/w:body>/, '<w:body>' + inhoud + sectie[0] + '</w:body>'));
const bron = join(uitvoer, "Revisieproef.docx");
await writeFile(bron, zipSync(pakket));
const server = await preview({ configFile: false, build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" }, preview: { host: "127.0.0.1", port: 0, open: false } });
const sluit = () => new Promise((ok, fout) => server.httpServer.close(e => e ? fout(e) : ok()));
const browser = await chromium.launch(process.env.OFFICE_TEST_CHROMIUM ? { executablePath: process.env.OFFICE_TEST_CHROMIUM } : {}).catch(async e => { await sluit(); throw e; });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, locale: "en-US" });
const fouten = [];
page.on("pageerror", e => fouten.push(String(e)));
const rapport = { versie: JSON.parse(await readFile("package.json", "utf8")).version, geslaagd: false, stappen: [], fouten, grenzen: ["Gerichte Chromium-proef van de productie-UI; geen fysieke native-platform- of volledige pixelacceptatie."] };
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?offscreenReplay=0`);
  await page.locator(".office input[type=file]").first().setInputFiles(bron);
  await page.evaluate(() => {
    window.proefApi = () => {
      const el = document.querySelector(".office-tabpaneel:not([hidden]) .office-tekst");
      if (!el) return null;
      for (let f = el[Object.keys(el).find(k => k.startsWith("__reactFiber$"))]; f; f = f.return)
        for (let s = f.memoizedState, i = 0; s && i < 200; i++, s = s.next) {
          const v = s.memoizedState?.current;
          if (v?.getEditorRef && v.commands) return v;
        }
      return null;
    };
  });
  await page.waitForFunction(() => proefApi()?.getEditorRef()?.getLayout()?.pages.length > 0);
  await page.evaluate(async () => {
    await proefApi().flushPendingInput();
    if (!proefApi().commands.getState("commentsSidebar").active) await proefApi().commands.execute("commentsSidebar", null);
  });
  for (const zoom of [1, 1.5]) {
    await page.evaluate(async z => { proefApi().setZoom(z); await proefApi().flushPendingInput(); }, zoom);
    await page.waitForFunction(() => document.querySelectorAll(".docx-tracked-change-card").length === 2);
    await page.waitForFunction(() => [...document.querySelectorAll(".docx-tracked-change-card")].every(e => { const r = e.getBoundingClientRect(); return r.width > 100 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; }));
    const actieveVerbindingen = [];
    for (let kaart = 0; kaart < 2; kaart++) {
      await page.locator(".docx-tracked-change-card").nth(kaart).click();
      await page.waitForFunction(() => document.querySelectorAll(".docx-review-leader__path").length >= 1);
      // Een bestaande verbindingslijn betekent niet dat de schuifanimatie al klaar is.
      await page.evaluate(async () => {
        let vorige = "", sinds = performance.now(), einde = sinds + 8000;
        while (performance.now() < einde) {
          await new Promise(requestAnimationFrame);
          const stand = JSON.stringify([...document.querySelectorAll(".docx-tracked-change-card")].map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
          if (stand !== vorige) { vorige = stand; sinds = performance.now(); }
          if (performance.now() - sinds >= 250) return;
        }
        throw Error("Revisiekaarten blijven bewegen");
      });
      actieveVerbindingen.push(await page.locator(".docx-review-leader__path").evaluateAll(es => es.map(e => e.getAttribute("d"))));
    }
    const stand = await page.evaluate(() => ({
      kaarten: [...document.querySelectorAll(".docx-tracked-change-card")].map(e => { const r = e.getBoundingClientRect(); return { tekst: e.textContent, x: r.x, y: r.y, width: r.width, height: r.height }; }),
      verbindingen: [...document.querySelectorAll(".docx-review-leader__path")].map(e => e.getAttribute("d")),
    }));
    assert(stand.kaarten.some(k => k.tekst.includes("Ingevoegde woorden")));
    assert(stand.kaarten.some(k => k.tekst.includes("Verwijderde woorden")));
    assert(actieveVerbindingen.every(paden => paden.length >= 1 && paden.every(d => d && !/NaN|Infinity/.test(d))));
    const werkruimte = await page.locator(".docx-editor__scroll-container").boundingBox();
    const pixelschaal = await page.evaluate(() => devicePixelRatio);
    assert(Number.isFinite(pixelschaal) && pixelschaal > 0);
    const pixel = waarde => Math.round(waarde * pixelschaal);
    // Vergelijk geschilderde pixelgrenzen. De CI gaf bij 150% zoom een
    // subpixelpositie 207,890625 tegenover 208; beide vallen op pixel 208.
    rapport.stappen.push({ naam: "twee_revisies", zoom, ...stand, actieveVerbindingen, werkruimte, pixelschaal });
    assert(stand.kaarten.every(k => pixel(k.y) >= pixel(werkruimte.y) && pixel(k.y + k.height) <= pixel(werkruimte.y + werkruimte.height)), "Revisiekaarten vallen na de schuifanimatie buiten de werkruimte");
    await page.screenshot({ path: join(uitvoer, `revisies-${zoom}.png`) });
  }
  await page.locator(".docx-review-accept-all").click();
  await page.waitForFunction(() => document.querySelectorAll(".docx-tracked-change-card").length === 0);
  rapport.stappen.push({ naam: "alle_revisies_geaccepteerd", kaarten: 0 });
  const commentId = await page.evaluate(async () => {
    const a = proefApi(), p = a.getEditorRef().getYrsSession().paragraphs("body")[0];
    return await a.insertComment({ paraId: p.paraId, search: "Basisalinea", text: "Controleopmerking", author: "Proefauteur" });
  });
  assert.notEqual(commentId, null);
  await page.getByText("Controleopmerking", { exact: true }).first().waitFor({ state: "visible" });
  assert.equal(await page.locator(".docx-tracked-change-card").count(), 0);
  assert.equal(await page.locator(".docx-comment-card").count(), 1);
  await page.screenshot({ path: join(uitvoer, "gewone-opmerking.png") });
  rapport.stappen.push({ naam: "gewone_opmerking_zonder_revisies", commentId });
  const bytes = new Uint8Array(await page.evaluate(async () => { await proefApi().flushPendingInput(); return Array.from(new Uint8Array(await proefApi().save())); }));
  await writeFile(join(uitvoer, "Bewaarde-revisieproef.docx"), bytes);
  const terug = unzipSync(bytes), document = strFromU8(terug["word/document.xml"]), opmerkingen = strFromU8(terug["word/comments.xml"]);
  assert(!/<w:(?:ins|del)\b/.test(document));
  assert(document.includes("Ingevoegde woorden") && !document.includes("Verwijderde woorden"));
  assert(opmerkingen.includes("Controleopmerking"));
  rapport.stappen.push({ naam: "onafhankelijke_bewaarcontrole", revisies: 0, ingevoegde_tekst: true, verwijderde_tekst: false, opmerking: true });
  assert.deepEqual(fouten, []);
  rapport.geslaagd = true;
} catch (e) {
  rapport.fout = String(e);
  await page.screenshot({ path: join(uitvoer, "afgekeurd.png") }).catch(() => {});
  throw e;
} finally {
  await writeFile(join(uitvoer, "rapport.json"), JSON.stringify(rapport, null, 2) + "\n");
  await browser.close(); await sluit();
}
console.log(JSON.stringify({ geslaagd: rapport.geslaagd, stappen: rapport.stappen.length, uitvoer }));
