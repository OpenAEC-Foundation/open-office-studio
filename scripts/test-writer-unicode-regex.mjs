/** #29: lege regex-treffers vóór een emoji mogen de zoeklus niet blokkeren. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { preview } from "vite";

const { chromium } = await import(process.env.OOS_PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.OOS_PLAYWRIGHT_MODULE)).href : "playwright");
const uitvoer = resolve(process.env.OOS_TEST_UIT ?? ".local/proef-writer-unicode-regex");
await mkdir(uitvoer, { recursive: true });
const origineel = "a😀😀x einde";
const pakket = unzipSync(await readFile("public/templates/nieuw.docx"));
const xml = strFromU8(pakket["word/document.xml"]);
pakket["word/document.xml"] = strToU8(xml.replace(/<w:p(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/, `<w:p><w:r><w:t>${origineel}</w:t></w:r></w:p>`));
const server = await preview({ configFile: false, build: { outDir: process.env.OOS_TEST_DIST ?? "dist" }, preview: { host: "127.0.0.1", port: 0, open: false } });
const browser = await chromium.launch();
const page = await browser.newPage({ locale: "en-US", viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(5000);
const rapport = { stappen: [], fouten: [] };
page.on("pageerror", e => rapport.fouten.push(String(e)));

async function proef(naam, doe) {
  try { await doe(); rapport.stappen.push({ naam, geslaagd: true }); console.log(`OK: ${naam}`); }
  catch (e) { rapport.stappen.push({ naam, geslaagd: false, fout: String(e) }); console.error(`FOUT: ${naam}: ${e.message}`); }
}

try {
  await page.addInitScript(bewaken => {
    localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "en", spelling: { controleren: false } }));
    if (!bewaken) return;
    // Alleen voor een veilige baselineproef: breek een vastgelopen regex af
    // vóór hij het browserproces blokkeert. De gecorrigeerde lus raakt dit niet.
    const exec = RegExp.prototype.exec;
    const tellers = new WeakMap();
    RegExp.prototype.exec = function (tekst) {
      if (this.source.includes("(?=😀)")) {
        const aantal = (tellers.get(this) ?? 0) + 1;
        tellers.set(this, aantal);
        if (aantal > 100) throw new Error("Zoeklus maakt geen voortgang");
      }
      return exec.call(this, tekst);
    };
  }, process.env.OOS_TEST_BASELINE_GUARD === "1");
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?offscreenReplay=0`);
  await page.locator(".office input[type=file]").first().setInputFiles({ name: "Unicodeproef.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(zipSync(pakket)) });
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
  await paneel.getByRole("checkbox", { name: "Regular expression", exact: true }).check();
  await proef("Lege treffers vóór emoji geven geen resultaten en houden de interface bereikbaar", async () => {
    await zoekveld.fill("(?=😀)");
    await page.waitForTimeout(700);
    assert.equal(await paneel.getByRole("status").textContent(), "No results.");
    assert(await paneel.getByRole("button", { name: "Replace All", exact: true }).isDisabled());
  });
  await proef("Zoeken gaat na twee emoji verder naar de echte treffer", async () => {
    await zoekveld.fill("(?=😀)|x");
    await page.waitForTimeout(700);
    assert.match(await paneel.getByRole("status").textContent(), /^(?:1 of )?1 result$/);
    assert.equal(await paneel.locator(".tw-zoek-resultaten li").count(), 1);
  });
  await proef("Vervang alles bewaart emoji en schrijft alleen de echte treffer weg", async () => {
    await paneel.getByRole("textbox", { name: "Replace with", exact: true }).fill("Y");
    assert(!(await paneel.getByRole("button", { name: "Replace All", exact: true }).isDisabled()));
    await paneel.getByRole("button", { name: "Replace All", exact: true }).click();
    const verwacht = "a😀😀Y einde";
    await page.waitForFunction(async tekst => (await proefContext().tekst().readParagraphs({ view: "accepted" })).paragraphs.map(p => p.text).join("") === tekst, verwacht, { timeout: 5000 });
    const bytes = Buffer.from(await page.evaluate(async () => Array.from(await proefContext().herlaad.bytes())));
    const bewaard = strFromU8(unzipSync(bytes)["word/document.xml"]);
    assert.equal([...bewaard.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join(""), verwacht);
  });
  await proef("Normaal zoeken blijft bruikbaar na de regexopdracht", async () => {
    await paneel.getByRole("checkbox", { name: "Regular expression", exact: true }).uncheck();
    await zoekveld.fill("einde");
    await page.waitForTimeout(700);
    assert.match(await paneel.getByRole("status").textContent(), /^(?:1 of )?1 result$/);
  });
  assert.deepEqual(rapport.fouten, []);
  assert(rapport.stappen.every(s => s.geslaagd), "Niet alle unicode-regexproeven slagen");
} finally {
  await writeFile(join(uitvoer, "rapport.json"), JSON.stringify(rapport, null, 2) + "\n");
  await browser.close(); await new Promise(r => server.httpServer.close(r));
}
