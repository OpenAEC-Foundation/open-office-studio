/** #142: lange alinea via het echte lint; één Undo/Redo, opmaak en heropenen. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { chromium } from "playwright";
import { preview } from "vite";

const uitvoer = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-writer-hoofdletters",
);
await mkdir(uitvoer, { recursive: true });
const zin =
  "Dit is een gewone alinea voor de Windows-test van regelafstand, inspringing en paginaopmaak. De tekst loopt automatisch over meerdere regels zodat een wijziging van de regelafstand goed zichtbaar wordt. Alle woorden in dit document zijn zelfgemaakte proeftekst.";
const tekst = [zin, zin, zin].join(" ");
assert.equal(tekst.length, 785);
const pakket = unzipSync(await readFile("public/templates/nieuw.docx"));
const oud = strFromU8(pakket["word/document.xml"]);
const alinea = `<w:p><w:pPr><w:spacing w:line="480" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${tekst.slice(0, 10)}</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${tekst.slice(10)}</w:t></w:r></w:p>`;
const nieuw = oud.replace(/<w:p(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/, alinea);
assert.notEqual(nieuw, oud);
pakket["word/document.xml"] = strToU8(nieuw);
const bron = {
  name: "Hoofdletterproef.docx",
  mimeType:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  buffer: Buffer.from(zipSync(pakket)),
};
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const adres = server.httpServer.address();
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "en-US",
});
const verslag = { stappen: [], fouten: [] };
page.on("pageerror", (e) => verslag.fouten.push(String(e)));
page.on("console", (bericht) => {
  if (bericht.type() === "error") verslag.fouten.push(bericht.text());
});
try {
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({ taal: "en", spelling: { controleren: false } }),
    ),
  );
  await page.goto(`http://127.0.0.1:${adres.port}/?offscreenReplay=0`);
  const invoer = page.locator(".office input[type=file]").first();
  await invoer.setInputFiles(bron);
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
      ) {
        for (let s = f.memoizedState, i = 0; s && i < 200; i++, s = s.next) {
          const v = s.memoizedState?.current;
          if (v?.getEditorRef && v.commands) return v;
        }
      }
      return null;
    };
  });
  await page.waitForFunction(
    () => proefApi()?.getEditorRef()?.getLayout()?.pages.length,
    null,
    { timeout: 60_000 },
  );
  async function selecteer() {
    await page.evaluate(async () => {
      proefApi().getEditorRef().selectAll();
      await proefApi().flushPendingInput();
    });
  }
  async function controle(naam, verwacht) {
    await page.waitForTimeout(300);
    const bytes = Buffer.from(
      await page.evaluate(async () =>
        Array.from(new Uint8Array(await proefApi().save())),
      ),
    );
    const xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
    const runs = [...xml.matchAll(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g)].filter(
      (m) => /<w:t[\s>]/.test(m[0]),
    );
    const tekstUitRun = (run) =>
      [...run.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
        .map((m) => m[1])
        .join("");
    assert.equal(runs.map((m) => tekstUitRun(m[0])).join(""), verwacht, naam);
    assert.equal(
      runs
        .filter((m) => /<w:b(?:\s[^>]*)?\/>/.test(m[0]))
        .map((m) => tekstUitRun(m[0]))
        .join(""),
      verwacht.slice(0, 10),
      `${naam}: vet`,
    );
    assert.equal(
      runs
        .filter((m) => /<w:i(?:\s[^>]*)?\/>/.test(m[0]))
        .map((m) => tekstUitRun(m[0]))
        .join(""),
      verwacht.slice(10),
      `${naam}: cursief`,
    );
    assert(/w:line="480"/.test(xml), `${naam}: alineaopmaak`);
    verslag.stappen.push({
      naam,
      tekens: verwacht.length,
      opmaak: "vet/cursief en dubbele regelafstand behouden",
    });
    console.log(`Writer-hoofdletters: ${naam}`);
    return bytes;
  }
  await controle("begin", tekst);
  await selecteer();
  await page.getByRole("tab", { name: "Format", exact: true }).click();
  await page.getByRole("button", { name: "UPPERCASE", exact: true }).click();
  if (process.env.OFFICE_TEST_VERWACHT_FOUT === "1") {
    await page
      .getByText("The capitalization could not be changed.", { exact: true })
      .waitFor();
    await controle("oude fout gereproduceerd, tekst behouden", tekst);
  } else {
    const bytes = await controle(
      "785 tekens naar hoofdletters",
      tekst.toUpperCase(),
    );
    await page.getByRole("tab", { name: "Home", exact: true }).click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await controle("één Undo", tekst);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await controle("één Redo", tekst.toUpperCase());
    await writeFile(join(uitvoer, "Hoofdletters-bewaard.docx"), bytes);
    await page.evaluate(() => {
      window.oudeSessie = proefApi().getEditorRef().getYrsSession();
    });
    await invoer.setInputFiles({
      ...bron,
      name: "Hoofdletters-heropend.docx",
      buffer: bytes,
    });
    await page.waitForFunction(
      () =>
        proefApi()?.getEditorRef()?.getYrsSession() !== oudeSessie &&
        proefApi()?.getEditorRef()?.getLayout()?.pages.length,
      null,
      { timeout: 60_000 },
    );
    await controle("opnieuw geopend", tekst.toUpperCase());
  }
  assert.deepEqual(verslag.fouten, []);
  await page.screenshot({ path: join(uitvoer, "hoofdletters.png") });
} catch (fout) {
  verslag.fout = String(fout);
  await page
    .screenshot({ path: join(uitvoer, "afgekeurd.png") })
    .catch(() => {});
  throw fout;
} finally {
  await writeFile(
    join(uitvoer, "rapport.json"),
    JSON.stringify(verslag, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((ok, fout) =>
    server.httpServer.close((e) => (e ? fout(e) : ok())),
  );
}
