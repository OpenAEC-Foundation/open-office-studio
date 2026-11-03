/** #127: de echte Ga-naar-dialoog verplaatst de cursor naar het paginabegin. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const uitvoer = resolve(process.env.OFFICE_TEST_UIT ?? ".local/proef-writer-paginanavigatie");
await mkdir(uitvoer, { recursive: true });
const server = await preview({ configFile: false, build: { outDir: process.env.OFFICE_TEST_DIST ?? ".local/pagina-fixes-dist" }, preview: { host: "127.0.0.1", port: 0, open: false } });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "en-US" });
const fouten = [], stappen = [];
const controles = {};
page.on("pageerror", e => fouten.push(String(e)));
try {
  await page.addInitScript(() => localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "en", spelling: { controleren: false } })));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?offscreenReplay=0`);
  const pakket = unzipSync(await readFile("public/templates/nieuw.docx"));
  const zin = "Een doorlopende alinea met tekst die meerdere paginas moet vullen.";
  const tekst = Array(140).fill(zin).join(" ");
  pakket["word/document.xml"] = strToU8(strFromU8(pakket["word/document.xml"]).replace(/<w:p(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/, `<w:p><w:r><w:t>${tekst}</w:t></w:r></w:p>`));
  const bestand = page.locator(".office input[type=file]").first();
  async function open(bytes, naam) {
    await page.evaluate(() => { window.proefVorigeSessie = window.proefApi?.()?.getEditorRef()?.getYrsSession(); });
    await bestand.setInputFiles({ name: naam, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(bytes) });
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
    await page.waitForFunction(() => {
      const e = proefApi()?.getEditorRef();
      return e?.getYrsSession() !== window.proefVorigeSessie && e?.getLayout()?.pages.length;
    }, null, { timeout: 60_000 });
  }
  async function ga(nummer, verwacht, route = "View") {
    await page.getByRole("tab", { name: route, exact: true }).click();
    await page.getByRole("button", { name: route === "View" ? "Go to Page" : "Go To", exact: true }).click();
    const dialoog = page.getByRole("dialog");
    await dialoog.locator("input").fill(String(nummer));
    await dialoog.getByRole("button", { name: "Go To", exact: true }).click();
    await page.waitForFunction(p => {
      const r = proefApi().getEditorRef().getSelectionRange();
      return r?.from === p && r?.to === p && document.activeElement?.classList.contains("paged-editor__yrs-input");
    }, verwacht, { timeout: 10_000 });
    await page.waitForFunction(n => proefApi().getCurrentPage() === n, nummer, { timeout: 10_000 });
    const positie = await page.evaluate(() => ({ selectie: proefApi().getEditorRef().getSelectionRange(), pagina: proefApi().getCurrentPage() }));
    assert.equal(positie.pagina, nummer);
    stappen.push({ route, nummer, verwacht, ...positie });
    console.log(`OK: pagina ${nummer}, cursorpositie ${verwacht}`);
  }
  await open(zipSync(pakket), "Doorlopende alinea.docx");
  const posities = await page.evaluate(() => proefApi().getEditorRef().getLayout().pages.map(p => p.fragments[0].resolvedLines[0].segments[0].run.pmStart));
  assert(posities.length >= 3);
  // Begin verderop in de alinea: scrollen alleen zou de cursor hier laten staan.
  await page.evaluate(() => proefApi().getEditorRef().setSelection(9000, 9000));
  for (const nummer of [1, 2, 3, 1]) await ga(nummer, posities[nummer - 1]);
  await ga(2, posities[1], "Home");
  await page.keyboard.insertText("TESTCURSOR");
  await page.waitForFunction(() => proefApi().getSelectionInfo()?.before?.includes("TESTCURSOR"));
  const getypteBytes = Buffer.from(await page.evaluate(async () => Array.from(new Uint8Array(await proefApi().save()))));
  const getypteXml = strFromU8(unzipSync(getypteBytes)["word/document.xml"]);
  const getypt = [...getypteXml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join("");
  assert.equal(getypt, tekst.slice(0, posities[1] - 1) + "TESTCURSOR" + tekst.slice(posities[1] - 1));
  controles.typenOpGekozenPaginabegin = true;
  await page.evaluate(() => proefApi().commands.execute("undo", null));
  const bytes = Buffer.from(await page.evaluate(async () => Array.from(new Uint8Array(await proefApi().save()))));
  const xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
  assert.equal([...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join(""), tekst);
  controles.undoEnOngewijzigdeDocumenttekst = true;
  await page.screenshot({ path: join(uitvoer, "paginabegin.png") });
  await open(await readFile("public/templates/nieuw.docx"), "Lege pagina.docx");
  await ga(1, 1);
  const tabelPakket = unzipSync(await readFile("public/templates/nieuw.docx"));
  const tabel = '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:tcPr/><w:p><w:r><w:t>Cel een</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>Na tabel</w:t></w:r></w:p>';
  tabelPakket["word/document.xml"] = strToU8(strFromU8(tabelPakket["word/document.xml"]).replace(/<w:p(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/, tabel));
  await open(zipSync(tabelPakket), "Tabel bovenaan.docx");
  const celBegin = await page.evaluate(() => {
    const e = proefApi().getEditorRef(), s = e.getYrsSession();
    return e.yrsLocToDisplayPosition({ story: "body:t0:r0c0", paraId: s.paragraphs("body:t0:r0c0")[0].paraId, offset: 0 });
  });
  await ga(1, celBegin);
  await page.keyboard.insertText("TABLESTART");
  const tabelBytes = Buffer.from(await page.evaluate(async () => Array.from(new Uint8Array(await proefApi().save()))));
  const tabelXml = strFromU8(unzipSync(tabelBytes)["word/document.xml"]);
  assert.match(tabelXml, /TABLESTARTCel een/);
  controles.typenInEersteTabelcel = true;
  assert.deepEqual(fouten, []);
} catch (e) {
  await page.screenshot({ path: join(uitvoer, "afgekeurd.png") }).catch(() => {});
  throw e;
} finally {
  await writeFile(join(uitvoer, "rapport.json"), JSON.stringify({ issue: 127, stappen, controles, fouten }, null, 2) + "\n");
  await browser.close();
  await new Promise(r => server.httpServer.close(r));
}
