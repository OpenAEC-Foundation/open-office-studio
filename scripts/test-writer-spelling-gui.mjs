/** Golflijnen en tabelgrepen blijven correct begrensd in een lang document. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { chromium } from "playwright";
import { preview } from "vite";
const uitvoer = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-writer-spelling",
);
await mkdir(uitvoer, { recursive: true });
const tekst = "xxyzz ".repeat(12).trim();
const alinea = (n) =>
  `<w:p><w:pPr>${n ? "<w:pageBreakBefore/>" : ""}</w:pPr><w:r><w:rPr><w:lang w:val="nl-NL"/></w:rPr><w:t>${tekst}</w:t></w:r></w:p>`;
const tabel = `<w:tbl><w:tblPr><w:tblW w:w="6000" w:type="dxa"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((s) => `<w:${s} w:val="single" w:sz="4"/>`).join("")}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>${Array.from({ length: 2 }, () => `<w:tr>${Array.from({ length: 2 }, () => `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p/></w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`;
const pakket = unzipSync(await readFile("public/templates/nieuw.docx"));
const oud = strFromU8(pakket["word/document.xml"]),
  inhoud = Array.from(
    { length: 500 },
    (_, n) => alinea(n) + (n === 249 ? tabel : ""),
  ).join("");
const nieuw = oud.replace(/<w:p(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/, inhoud);
assert.notEqual(nieuw, oud);
pakket["word/document.xml"] = strToU8(nieuw);
const bron = join(uitvoer, "Spelling op 500 paginas.docx");
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
  paginas: [],
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
    () => proefApi()?.getEditorRef()?.getLayout()?.pages.length === 500,
    null,
    { timeout: 120_000 },
  );
  await page.waitForFunction(
    () =>
      /6[,. ]?000 spelling errors/.test(
        document.querySelector(".office-statusbalk")?.textContent ?? "",
      ),
    null,
    { timeout: 120_000 },
  );
  const aantal = () =>
    page.evaluate(
      () => document.querySelector(".office-statusbalk").textContent,
    );
  const statusVoor = await aantal();
  for (const [nummer, zoom] of [
    [1, 1],
    [250, 1],
    [500, 1],
    [250, 1.5],
    [1, 1.5],
  ]) {
    await page.evaluate(
      async ([nummer, zoom]) => {
        proefApi().setZoom(zoom);
        await proefApi().flushPendingInput();
        const ed = proefApi().getEditorRef(),
          para = ed.getYrsSession().paragraphs("body")[nummer - 1];
        ed.setSelection(
          ed.yrsLocToDisplayPosition({
            story: "body",
            paraId: para.paraId,
            offset: 0,
          }),
        );
        proefApi().scrollToPage(nummer);
        proefApi().focus();
      },
      [nummer, zoom],
    );
    // Focus en zoomen kunnen nog naar de oude cursor terugscrollen. Controleer
    // de echte paginabox, niet alleen een bijna zichtbare overlay met marge.
    await page.waitForFunction(
      (nummer) => {
        const el = document.querySelector(
            `.canvas-page[data-page-index="${nummer - 1}"]`,
          ),
          scroll = document.querySelector(".docx-editor__scroll-container");
        if (!el || !scroll) return false;
        const r = el.getBoundingClientRect(),
          v = scroll.getBoundingClientRect(),
          delta = r.top - v.top - 24;
        if (Math.abs(delta) > 2) {
          scroll.scrollTop += delta;
          return false;
        }
        return true;
      },
      nummer,
      { timeout: 30_000 },
    );
    await page.waitForFunction(
      (nummer) =>
        document
          .querySelector(
            `.canvas-page[data-page-index="${nummer - 1}"] .canvas-page-mirror`,
          )
          ?.textContent.includes("xxyzz"),
      nummer,
      { timeout: 90_000 },
    );
    await page.waitForFunction(
      () =>
        Number(document.querySelector(".spelling-golflijnen")?.dataset.fouten) >
        0,
      null,
      { timeout: 90_000 },
    );
    await page.waitForFunction(
      (tabel) =>
        Number(document.querySelector(".tl-grepen")?.dataset.grepen) > 0 ===
        tabel,
      nummer === 250,
      { timeout: 30_000 },
    );
    const stand = await page.evaluate(() => ({
      golven: Number(
        document.querySelector(".spelling-golflijnen").dataset.fouten,
      ),
      grepen: Number(document.querySelector(".tl-grepen").dataset.grepen),
      status: document.querySelector(".office-statusbalk").textContent,
      grepenInBeeld: Array.from(document.querySelectorAll(".tl-greep")).filter(
        (e) => {
          const r = e.getBoundingClientRect(),
            v = document
              .querySelector(".docx-editor__scroll-container")
              .getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            r.bottom > v.top &&
            r.top < v.bottom &&
            r.right > v.left &&
            r.left < v.right
          );
        },
      ).length,
      golflijnen: Array.from(document.querySelectorAll(".spelling-golf")).map(
        (e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        },
      ),
    }));
    assert(stand.golven >= 12 && stand.golven <= 48, JSON.stringify(stand));
    assert.equal(
      stand.grepenInBeeld > 0,
      nummer === 250,
      "De tabelgrepen moeten echt in het venster staan",
    );
    assert(
      /6[,. ]?000 spelling errors/.test(stand.status),
      "Het volledige foutenoverzicht moet 6000 fouten blijven tellen",
    );
    assert(stand.golflijnen.every((r) => r.width > 0 && r.height > 0));
    rapport.paginas.push({ nummer, zoom, ...stand });
    await page.screenshot({
      path: join(uitvoer, `pagina-${nummer}-${zoom}.png`),
    });
  }
  rapport.statusVoor = statusVoor;
  const bytes = Buffer.from(
    await page.evaluate(async () =>
      Array.from(new Uint8Array(await proefApi().save())),
    ),
  );
  const doc = strFromU8(unzipSync(bytes)["word/document.xml"]);
  assert.equal((doc.match(/xxyzz/g) ?? []).length, 6000);
  assert.equal((doc.match(/<w:tbl>/g) ?? []).length, 1);
  assert.equal((doc.match(/<w:tr>/g) ?? []).length, 2);
  assert.deepEqual(fouten, []);
  await writeFile(join(uitvoer, "Bewaarde spellingproef.docx"), bytes);
  console.log(
    "Spelling, 6000 foutmeldingen en tabelgrepen op vijf pagina-/zoomstanden geslaagd.",
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
