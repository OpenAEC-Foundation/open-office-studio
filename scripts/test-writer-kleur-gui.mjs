/** Gekozen tekenachtergrond blijft behouden na de asynchrone lintopdracht (#125). */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { chromium } from "playwright";
import { preview } from "vite";
const uitvoer = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-writer-kleur",
);
await mkdir(uitvoer, { recursive: true });
const tekst = "Een proef voor de markeerkleur.";
const pakket = unzipSync(await readFile("public/templates/nieuw.docx"));
const oud = strFromU8(pakket["word/document.xml"]);
const xml = oud.replace(
  /<w:p(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/,
  `<w:p><w:r><w:t>${tekst}</w:t></w:r></w:p>`,
);
assert.notEqual(xml, oud);
pakket["word/document.xml"] = strToU8(xml);
const bron = join(uitvoer, "Markeerkleurproef.docx");
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
const fouten = [];
const rapport = {
  versie: JSON.parse(await readFile("package.json", "utf8")).version,
  stappen: [],
  fouten,
};
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "en-US",
});
page.on("pageerror", (e) => fouten.push(String(e)));
try {
  await page.goto(`http://127.0.0.1:${adres.port}/?offscreenReplay=0`);
  const bestand = page.locator(".office input[type=file]").first();
  await bestand.setInputFiles(bron);
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
  async function selecteren() {
    await page.waitForFunction(
      () => proefApi()?.getEditorRef()?.getLayout()?.pages.length,
      { timeout: 60_000 },
    );
    await page.evaluate(async () => {
      proefApi().getEditorRef().selectAll();
      await proefApi().flushPendingInput();
    });
  }
  await selecteren();
  const kleur = page.locator(".ribbon-kleur input:visible").first();
  async function controle(naam, verwacht) {
    await page.waitForTimeout(500);
    const bytes = Buffer.from(
      await page.evaluate(async () =>
        Array.from(new Uint8Array(await proefApi().save())),
      ),
    );
    const doc = strFromU8(unzipSync(bytes)["word/document.xml"]);
    const tekstBron = [...doc.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
      .map((m) => m[1])
      .join("");
    assert.equal(tekstBron, tekst);
    const vullingen = [...doc.matchAll(/<w:shd\s[^>]*w:fill="([^"]+)"/g)].map(
      (m) => m[1].toLowerCase(),
    );
    assert.deepEqual(vullingen, verwacht ? [verwacht] : [], naam);
    rapport.stappen.push({ naam, vullingen, tekstOngewijzigd: true });
    console.log(`Writer-markering: ${naam} — ${JSON.stringify(vullingen)}.`);
    return bytes;
  }
  await controle("begin", null);
  await kleur.fill("#f6d32d");
  await controle("geel via kleurveld", "f6d32d");
  await page.evaluate(() => proefApi().commands.execute("undo", null));
  await controle("ongedaan", null);
  await page.evaluate(() => proefApi().commands.execute("redo", null));
  await controle("opnieuw", "f6d32d");
  await kleur.fill("#99c1f1");
  const bytes = await controle("andere kleur", "99c1f1");
  await writeFile(join(uitvoer, "Bewaarde markeerkleur.docx"), bytes);
  await page.evaluate(() => {
    window.oudeSessie = proefApi().getEditorRef().getYrsSession();
  });
  await bestand.setInputFiles({
    name: "Heropende markeerkleur.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: bytes,
  });
  await page.waitForFunction(
    () => {
      try {
        return (
          proefApi()?.getEditorRef()?.getYrsSession() !== oudeSessie &&
          proefApi()?.getEditorRef()?.getLayout()?.pages.length
        );
      } catch {
        return false;
      }
    },
    { timeout: 60_000 },
  );
  await selecteren();
  await controle("nieuwe editorsessie", "99c1f1");
  assert.deepEqual(fouten, []);
  await page.screenshot({ path: join(uitvoer, "markeerkleur.png") });
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
