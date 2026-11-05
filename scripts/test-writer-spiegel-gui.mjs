/** De tekstspiegel behoudt leesbare inhoud, links en de plaats van een tabelvoorbeeld. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { chromium } from "playwright";
import { preview } from "vite";
const uitvoer = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-writer-spiegel",
);
await mkdir(uitvoer, { recursive: true });
const tekst = "Een leesbare proef voor de tekstspiegel.";
const inhoud = `<w:p><w:bookmarkStart w:id="41" w:name="Controle"/><w:r><w:t>${tekst}</w:t></w:r><w:bookmarkEnd w:id="41"/></w:p><w:p><w:hyperlink w:anchor="Controle"><w:r><w:t>Naar de proef</w:t></w:r></w:hyperlink></w:p><w:p><w:r><w:rPr><w:rtl/><w:lang w:bidi="ar-SA"/></w:rPr><w:t>مرحبا</w:t></w:r></w:p>`;
const pakket = unzipSync(await readFile("public/templates/nieuw.docx")),
  oud = strFromU8(pakket["word/document.xml"]);
const nieuw = oud.replace(/<w:p(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/, inhoud);
assert.notEqual(nieuw, oud);
pakket["word/document.xml"] = strToU8(nieuw);
const bron = join(uitvoer, "Tekstspiegel.docx");
await writeFile(bron, zipSync(pakket));
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const adres = server.httpServer.address();
assert(adres && typeof adres !== "string");
const sluitServer = () =>
  new Promise((ok, fout) =>
    server.httpServer.close((e) => (e ? fout(e) : ok())),
  );
const browser = await chromium
  .launch(
    process.env.OFFICE_TEST_CHROMIUM
      ? { executablePath: process.env.OFFICE_TEST_CHROMIUM }
      : {},
  )
  .catch(async (e) => {
    await sluitServer();
    throw e;
  });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "en-US",
});
const fouten = [];
page.on("pageerror", (e) => fouten.push(String(e)));
const rapport = {
  versie: JSON.parse(await readFile("package.json", "utf8")).version,
  spiegel: null,
  voorbeelden: [],
  fouten,
};
try {
  await page.goto(`http://127.0.0.1:${adres.port}/?offscreenReplay=0`);
  await page.locator(".office input[type=file]").first().setInputFiles(bron);
  await page.evaluate(() => {
    window.proefApi = () => {
      const el = document.querySelector(
        ".office-tabpaneel:not([hidden]) .office-tekst",
      );
      if (!el) return null;
      for (
        let f = el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      )
        for (let s = f.memoizedState, i = 0; s && i < 200; i++, s = s.next) {
          const v = s.memoizedState?.current;
          if (v?.getEditorRef && v.commands) return v;
        }
      return null;
    };
  });
  await page.waitForFunction(
    () => proefApi()?.getEditorRef()?.getLayout()?.pages.length,
    { timeout: 60_000 },
  );
  await page.waitForFunction(() =>
    document
      .querySelector(".canvas-page-mirror")
      ?.textContent?.includes("Naar de proef"),
  );
  rapport.spiegel = await page.evaluate(() => {
    const e = document.querySelector(".canvas-page-mirror");
    return {
      tekst: e.textContent,
      nodes: e.querySelectorAll("*").length,
      links: Array.from(e.querySelectorAll("a[href]")).map((a) => ({
        tekst: a.textContent,
        href: a.getAttribute("href"),
      })),
      rtl: e.querySelector("[dir=rtl]") !== null,
      bladwijzerdoelInDom: document.querySelector("[id=Controle]") !== null,
    };
  });
  assert(rapport.spiegel.tekst.includes(tekst));
  assert(rapport.spiegel.tekst.includes("مرحبا"));
  assert(rapport.spiegel.links.length > 0);
  assert(rapport.spiegel.links.every((a) => a.href === "#Controle"));
  assert.equal(
    rapport.spiegel.links.map((a) => a.tekst).join(""),
    "Naar de proef",
  );
  // De bestaande engine maakt ook in de volledige spiegel geen DOM-doel voor
  // deze bladwijzer. Leg dat gebrek vast; bewijs wel behoud in het bronbestand.
  assert(
    rapport.spiegel.rtl,
    "De Arabische leesrichting moet in de tekstspiegel blijven",
  );
  await page.getByRole("tab", { name: "Insert", exact: true }).click();
  for (const zoom of [1, 1.5]) {
    await page.evaluate(async (zoom) => {
      proefApi().setZoom(zoom);
      await proefApi().flushPendingInput();
      const ed = proefApi().getEditorRef(),
        p = ed.getYrsSession().paragraphs("body")[0];
      ed.setSelection(
        ed.yrsLocToDisplayPosition({
          story: "body",
          paraId: p.paraId,
          offset: p.text.length,
        }),
      );
      proefApi().focus();
    }, zoom);
    await page.waitForTimeout(500);
    await page.locator(".tabelkiezer button").first().click();
    const raster = page.locator(".tabelkiezer-raster");
    const rand = await raster.boundingBox();
    const cel = await page.locator(".tabelkiezer-cel").nth(12).boundingBox();
    assert(rand && cel);
    // De cellen laten de pointer bewust aan het bedienbare raster door.
    await raster.hover({
      position: {
        x: cel.x + cel.width / 2 - rand.x,
        y: cel.y + cel.height / 2 - rand.y,
      },
    });
    const voorbeeld = page.locator(".tabelvoorbeeld");
    await voorbeeld.waitFor({ state: "visible" });
    const r = await voorbeeld.boundingBox(),
      pagina = await page.locator(".canvas-page").first().boundingBox();
    assert(r && pagina);
    assert(r.width > 0 && r.height > 0);
    assert(r.x >= pagina.x - 2 && r.x + r.width <= pagina.x + pagina.width + 2);
    assert(r.y > pagina.y && r.y < pagina.y + pagina.height);
    rapport.voorbeelden.push({ zoom, voorbeeld: r, pagina });
    await page.screenshot({
      path: join(uitvoer, `tabelvoorbeeld-${zoom}.png`),
    });
    await page.locator(".tabelkiezer-raster").press("Escape");
  }
  const bytes = Buffer.from(
    await page.evaluate(async () =>
      Array.from(new Uint8Array(await proefApi().save())),
    ),
  );
  const doc = strFromU8(unzipSync(bytes)["word/document.xml"]);
  assert(!doc.includes("<w:tbl>"), "Een voorbeeld mag geen tabel invoegen");
  assert(
    doc.includes('w:name="Controle"') && doc.includes('w:anchor="Controle"'),
    "De bladwijzer en verwijzing moeten in het document blijven",
  );
  assert(
    doc.includes(tekst) &&
      doc.includes("Naar de proef") &&
      doc.includes("مرحبا"),
  );
  assert.deepEqual(fouten, []);
  await writeFile(join(uitvoer, "Bewaarde tekstspiegel.docx"), bytes);
  console.log(
    "Tekstspiegel, link, leesrichting en tabelvoorbeeld bij twee zoomstanden geslaagd.",
  );
} catch (e) {
  rapport.fout = String(e);
  await page
    .screenshot({ path: join(uitvoer, "afgekeurd.png") })
    .catch(() => {});
  throw e;
} finally {
  await writeFile(
    join(uitvoer, "rapport.json"),
    JSON.stringify(rapport, null, 2) + "\n",
  );
  await browser.close();
  await sluitServer();
}
