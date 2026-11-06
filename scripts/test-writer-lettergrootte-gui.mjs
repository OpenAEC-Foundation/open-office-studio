/** Lettergrootte via echte pijltjes, handmatige invoer en de bewaarde DOCX (#124). */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { chromium } from "playwright";
import { preview } from "vite";

const uitvoer = resolve(process.env.OFFICE_TEST_UIT ?? ".local/proef-writer-lettergrootte");
await mkdir(uitvoer, { recursive: true });
const tekst = "Een proef voor de lettergrootte.";
const pakket = unzipSync(await readFile("public/templates/nieuw.docx"));
const xml = strFromU8(pakket["word/document.xml"]);
const inhoud = xml.replace(/<w:p(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/,
  `<w:p><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${tekst}</w:t></w:r></w:p>`);
assert.notEqual(inhoud, xml, "Het sjabloon heeft geen vervangbare alinea");
pakket["word/document.xml"] = strToU8(inhoud);
const bron = join(uitvoer, "Lettergrootteproef.docx");
await writeFile(bron, zipSync(pakket));
const server = await preview({ configFile: false, build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" }, preview: { host: "127.0.0.1", port: 0, open: false } });
const adres = server.httpServer.address();
assert(adres && typeof adres !== "string");
const sluitServer = () => new Promise((ok, fout) => server.httpServer.close(e => e ? fout(e) : ok()));
const browser = await chromium.launch({
  ...(process.env.OFFICE_TEST_CHROMIUM ? { executablePath: process.env.OFFICE_TEST_CHROMIUM } : {}),
}).catch(async fout => { await sluitServer(); throw fout; });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "en-US" });
const fouten = [];
const verslag = { versie: JSON.parse(await readFile("package.json", "utf8")).version, stappen: [], fouten };
page.on("pageerror", fout => fouten.push(String(fout)));
try {
  await page.goto(`http://127.0.0.1:${adres.port}/?offscreenReplay=0`);
  const bestand = page.locator(".office input[type=file]").first();
  await bestand.setInputFiles(bron);
  await page.evaluate(() => {
    window.proefApi = () => {
      const el = document.querySelector(".office-tabpaneel:not([hidden]) .office-tekst");
      if (!el) return null;
      for (let f = el[Object.keys(el).find(k => k.startsWith("__reactFiber$"))]; f; f = f.return) {
        for (let s = f.memoizedState, i = 0; s && i < 200; i++, s = s.next) {
          const v = s.memoizedState?.current;
          if (v?.getEditorRef && v.commands) return v;
        }
      }
      return null;
    };
  });
  async function selecteren() {
    await page.waitForFunction(() => proefApi()?.getEditorRef()?.getLayout()?.pages.length, { timeout: 60_000 });
    await page.evaluate(async () => { proefApi().getEditorRef().selectAll(); await proefApi().flushPendingInput(); });
  }
  await selecteren();
  const veld = page.locator("input.ribbon-getal:visible").first();
  async function bewaard() {
    return Buffer.from(await page.evaluate(async () => Array.from(new Uint8Array(await proefApi().save()))));
  }
  async function controle(naam, punten) {
    // Opmaakantwoorden en de lintstatus mogen asynchroon binnenkomen.
    await page.waitForTimeout(350);
    // Lees de actuele synchrone lintbron vóór save deze kan verversen.
    const actueel = await page.evaluate(async () => {
      await proefApi().flushPendingInput();
      const document = proefApi().getDocument();
      if (!document?.package.document) throw Error("Actuele lintbron ontbreekt");
      const tekst = [], groottes = [];
      function lees(knoop) {
        if (!knoop || typeof knoop !== "object") return;
        if (knoop.type === "text") tekst.push(knoop.text);
        if (knoop.type === "run" && knoop.content?.some(k => k.type === "text" && k.text))
          groottes.push(knoop.formatting?.fontSize ?? null);
        for (const kind of knoop.content ?? []) lees(kind);
      }
      for (const blok of document.package.document.content) lees(blok);
      return { tekst: tekst.join(""), groottes };
    });
    assert.equal(actueel.tekst, tekst, `${naam}: actuele linttekst vóór bewaren`);
    assert(actueel.groottes.length > 0);
    assert(actueel.groottes.every(g => g === punten * 2), `${naam}: actuele lintlettergrootte vóór bewaren: ${actueel.groottes}`);
    const bytes = await bewaard();
    const doc = strFromU8(unzipSync(bytes)["word/document.xml"]);
    assert.equal([...doc.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join(""), tekst, naam);
    const halvePunten = [...doc.matchAll(/<w:sz\s[^>]*w:val="([^"]+)"/g)].map(m => Number(m[1]));
    assert.deepEqual(halvePunten, [punten * 2], naam);
    verslag.stappen.push({ naam, punten, opgeslagenHalvePunten: halvePunten, tekstOngewijzigd: true });
    console.log(`Writer-lettergrootte: ${naam} — ${punten} pt bewaard.`);
    return bytes;
  }
  async function pijltje(omhoog, aantal = 1) {
    await veld.hover();
    const r = await veld.boundingBox();
    assert(r);
    await page.mouse.click(r.x + r.width - 7, r.y + r.height / 2 + (omhoog ? -4 : 4), { clickCount: aantal, delay: 25 });
  }
  await controle("begin", 11);
  await pijltje(true); await controle("muis omhoog", 12);
  await pijltje(false); await controle("muis omlaag", 11);
  await veld.press("ArrowUp"); await controle("toets omhoog", 12);
  await veld.press("ArrowDown"); await controle("toets omlaag", 11);
  await page.waitForTimeout(700);
  await veld.fill("16"); await controle("handmatig concept nog niet bevestigd", 11);
  await veld.press("Enter"); await controle("handmatig bevestigd", 16);
  await page.evaluate(() => proefApi().commands.execute("undo", null)); await controle("ongedaan", 11);
  await page.evaluate(() => proefApi().commands.execute("redo", null)); await controle("opnieuw", 16);
  await pijltje(true, 3); const bytes = await controle("drie snelle muisklikken", 19);
  await writeFile(join(uitvoer, "Bewaarde lettergrootte.docx"), bytes);
  await page.evaluate(() => { window.proefOudeSessie = proefApi().getEditorRef().getYrsSession(); });
  await bestand.setInputFiles({ name: "Heropende lettergrootte.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: bytes });
  await page.waitForFunction(() => {
    try { return proefApi()?.getEditorRef()?.getYrsSession() !== proefOudeSessie && proefApi()?.getEditorRef()?.getLayout()?.pages.length; } catch { return false; }
  }, { timeout: 60_000 });
  await selecteren();
  await controle("heropend in een nieuwe editorsessie", 19);
  assert.deepEqual(fouten, []);
  await page.screenshot({ path: join(uitvoer, "lettergrootte.png") });
} catch (fout) {
  verslag.fout = String(fout);
  await page.screenshot({ path: join(uitvoer, "afgekeurd.png") }).catch(() => {});
  throw fout;
} finally {
  await writeFile(join(uitvoer, "rapport.json"), JSON.stringify(verslag, null, 2) + "\n");
  await browser.close();
  await sluitServer();
}
