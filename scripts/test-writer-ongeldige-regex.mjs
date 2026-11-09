/** #189: een ongeldige regex mag niet geldig worden door 'hele woorden'. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { preview } from "vite";

const { chromium } = await import(process.env.OOS_PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.OOS_PLAYWRIGHT_MODULE)).href : "playwright");
const uitvoer = resolve(process.env.OOS_TEST_UIT ?? ".local/proef-writer-ongeldige-regex");
await mkdir(uitvoer, { recursive: true });
const origineel = "kat katten Kat katapult 123 456";
const pakket = unzipSync(await readFile("public/templates/nieuw.docx"));
const xml = strFromU8(pakket["word/document.xml"]);
pakket["word/document.xml"] = strToU8(xml.replace(/<w:p(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/, `<w:p><w:r><w:t>${origineel}</w:t></w:r></w:p>`));
const server = await preview({ configFile: false, build: { outDir: process.env.OOS_TEST_DIST ?? "dist" }, preview: { host: "127.0.0.1", port: 0, open: false } });
const browser = await chromium.launch();
const page = await browser.newPage({ locale: "en-US", viewport: { width: 1440, height: 1000 } });
const rapport = { stappen: [], fouten: [] };
page.on("pageerror", e => rapport.fouten.push(String(e)));

async function proef(naam, doe) {
  try { await doe(); rapport.stappen.push({ naam, geslaagd: true }); console.log(`OK: ${naam}`); }
  catch (e) {
    rapport.stappen.push({ naam, geslaagd: false, fout: String(e), status: await page.locator(".tw-zoek-telling").textContent() });
    await page.screenshot({ path: join(uitvoer, `afgekeurd-${rapport.stappen.length}.png`) });
    console.error(`FOUT: ${naam}: ${e.message}`);
  }
}

try {
  await page.addInitScript(() => localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "en", spelling: { controleren: false } })));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?offscreenReplay=0`);
  await page.locator(".office input[type=file]").first().setInputFiles({ name: "Regexproef.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(zipSync(pakket)) });
  await page.evaluate(() => {
    window.proefContext = () => {
      const el = document.querySelector(".office-tabpaneel:not([hidden]) .office-tekst");
      if (!el) return null;
      for (let f = el[Object.keys(el).find(k => k.startsWith("__reactFiber$"))]; f; f = f.return) {
        const v = f.memoizedProps?.value;
        if (v?.tekst && v.herlaad?.bytes) return v;
      }
      return null;
    };
  });
  await page.waitForFunction(() => proefContext()?.tekst()?.getEditorRef()?.getLayout()?.pages.length, null, { timeout: 60_000 });
  await page.evaluate(() => proefContext().tekst().focus());
  await page.keyboard.press("Control+h");
  const paneel = page.getByRole("search", { name: "Find and Replace", exact: true });
  const zoekveld = paneel.getByRole("searchbox", { name: "Find what", exact: true });
  const heleWoorden = paneel.getByRole("checkbox", { name: "Find whole words only", exact: true });
  const hoofdletters = paneel.getByRole("checkbox", { name: "Match case", exact: true });
  const regex = paneel.getByRole("checkbox", { name: "Regular expression", exact: true });
  const melding = paneel.getByRole("status");
  await paneel.getByRole("textbox", { name: "Replace with", exact: true }).fill("X");
  await regex.check();
  for (const hoofdlettergevoelig of [false, true]) {
    await hoofdletters.setChecked(hoofdlettergevoelig);
    for (const heel of [false, true]) {
      await heleWoorden.setChecked(heel);
      for (const zoek of ["[", "[abc", "a["]) await proef(`regex ${zoek}, hele woorden ${heel}, hoofdlettergevoelig ${hoofdlettergevoelig}`, async () => {
        await zoekveld.fill(zoek);
        // De zoekopdracht gebruikt een debounce van 250 ms. Een identieke fouttekst
        // na wisselen van een optie hoeft geen DOM-mutatie te veroorzaken.
        await page.waitForTimeout(700);
        assert.match(await melding.textContent(), /Invalid search:/);
        assert.equal(await paneel.locator(".tw-zoek-resultaten li").count(), 0);
        for (const naam of ["Previous result", "Next result", "Replace", "Replace All"])
          assert(await paneel.getByRole("button", { name: naam, exact: true }).isDisabled(), naam);
      });
    }
  }
  await proef("Hele woorden uit/aan laat de oorspronkelijke [ ongeldig", async () => {
    await zoekveld.fill("[");
    for (const heel of [false, true, false, true]) {
      await heleWoorden.setChecked(heel); await page.waitForTimeout(700);
      assert.match(await melding.textContent(), /Invalid search:/);
    }
    const gelezen = await page.evaluate(() => proefContext().tekst().readParagraphs({ view: "accepted" }));
    assert.equal(gelezen.paragraphs.map(p => p.text).join(""), origineel);
    await page.screenshot({ path: join(uitvoer, "ongeldige-regex.png") });
  });
  await proef("Letterlijk [ zonder regexmodus blijft een geldige zoekopdracht", async () => {
    await regex.uncheck(); await zoekveld.fill("[");
    await page.waitForFunction(() => document.querySelector(".tw-zoek-telling")?.textContent === "No results.");
  });
  await proef("Geldige hele-woorden-regex behoudt hoofdletterkeuze en groepen bij vervangen", async () => {
    await regex.check(); await heleWoorden.check(); await hoofdletters.uncheck();
    await zoekveld.fill("(kat|\\d+)");
    await page.waitForFunction(() => document.querySelector(".tw-zoek-telling")?.textContent === "4 results");
    await hoofdletters.check();
    await page.waitForFunction(() => document.querySelector(".tw-zoek-telling")?.textContent === "3 results");
    await hoofdletters.uncheck(); await zoekveld.fill("(k)(at)");
    await page.waitForFunction(() => document.querySelector(".tw-zoek-telling")?.textContent === "2 results");
    await paneel.getByRole("textbox", { name: "Replace with", exact: true }).fill("$2$1");
    await paneel.getByRole("button", { name: "Replace All", exact: true }).click();
    const verwacht = "atk katten atK katapult 123 456";
    await page.waitForFunction(async tekst => (await proefContext().tekst().readParagraphs({ view: "accepted" })).paragraphs.map(p => p.text).join("") === tekst, verwacht);
    const bytes = Buffer.from(await page.evaluate(async () => Array.from(await proefContext().herlaad.bytes())));
    const bewaard = strFromU8(unzipSync(bytes)["word/document.xml"]);
    assert.equal([...bewaard.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join(""), verwacht);
  });
  assert.deepEqual(rapport.fouten, []);
  assert(rapport.stappen.every(s => s.geslaagd), "Niet alle regexproeven slagen");
} finally {
  await writeFile(join(uitvoer, "rapport.json"), JSON.stringify(rapport, null, 2) + "\n");
  await browser.close(); await new Promise(r => server.httpServer.close(r));
}
