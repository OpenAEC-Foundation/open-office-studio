/** Echte toetsen, formulefouten en bewaren/heropenen tegen de productiebuild. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";

const uitvoer = resolve(process.env.OFFICE_TEST_UIT ?? ".local/proef-rekenblad-gui");
await mkdir(uitvoer, { recursive: true });
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const adres = server.httpServer.address();
assert(adres && typeof adres !== "string", "Geen lokale proefserver");
const browser = await chromium.launch({
  ...(process.env.OFFICE_TEST_CHROMIUM ? { executablePath: process.env.OFFICE_TEST_CHROMIUM } : {}),
}).catch(async fout => {
  await new Promise((ok, mis) => server.httpServer.close(e => e ? mis(e) : ok()));
  throw fout;
});
const verslag = { versie: JSON.parse(await readFile("package.json", "utf8")).version, rondes: [] };
try {
  // De beginroute wordt herhaald: de oude fout hing van een render tijdens invoer af.
  for (const [ronde, f2] of [false, false, false, true].entries()) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const fouten = [];
    page.on("pageerror", fout => fouten.push(String(fout)));
    try {
      await page.goto(`http://127.0.0.1:${adres.port}/?offscreenReplay=0`);
      const bestand = page.locator(".office input[type=file]").first();
      await bestand.setInputFiles("public/templates/nieuw.xlsx");
      await page.evaluate(() => {
        // De host ontvangt deze openbare engine-API via onReady. Alleen de
        // proef zoekt haar in React; alle documentbewerkingen hieronder zijn toetsen.
        window.proefApi = () => {
          const el = document.querySelector(".office-tabpaneel:not([hidden]) .office-rekenblad-host");
          if (!el) return null;
          for (let f = el[Object.keys(el).find(k => k.startsWith("__reactFiber$"))]; f; f = f.return) {
            for (let s = f.memoizedState, i = 0; s && i < 200; i++, s = s.next) {
              let v = s.memoizedState;
              if (v?.handle?.sheetInfo && v.commands) return v;
              v = v?.current;
              if (v?.handle?.sheetInfo && v.commands) return v;
            }
          }
          return null;
        };
        window.proefCel = a1 => {
          const h = proefApi().handle;
          const r = h.readCells({ ranges: [{ sheetId: h.sheetInfo().sheetIds[0], range: { kind: "a1", a1 } }] });
          if (!r.ok) throw Error(r.failure.message);
          return r.ranges[0].cells[0][0];
        };
      });
      await page.waitForFunction(() => proefApi()?.handle.sheetInfo().sheetNames.length, { timeout: 60_000 });

      async function invoer(row, tekst) {
        await page.evaluate(row => {
          const a = proefApi();
          assertSelectie(a.selectCells(0, { anchor: { row, col: 0 }, focus: { row, col: 0 } }));
          a.focus();
          function assertSelectie(ok) { if (!ok) throw Error("Geen celselectie"); }
        }, row);
        if (f2) {
          await page.keyboard.press("F2");
          await page.locator('[data-testid="xlsx-cell-editor"]').waitFor({ state: "visible" });
        }
        await page.keyboard.type(tekst, { delay: 12 });
        assert.equal(await page.locator('[data-testid="xlsx-cell-editor"]').inputValue(), tekst,
          `Ronde ${ronde}: invoer gewijzigd vóór Enter`);
        await page.keyboard.press("Enter");
        await page.evaluate(() => proefApi().version());
        assert.equal(await page.evaluate(row => proefApi().handle.cell(0, row, 0).input, row), tekst);
      }

      await invoer(3, "=ISOWEEKNUM(44197)");
      assert.equal((await page.evaluate(() => proefCel("A4"))).displayText, "53");
      await invoer(1, "=ISOWEEKNUM()");
      assert.equal((await page.evaluate(() => proefCel("A2"))).displayText, "#VALUE!");
      await invoer(0, "7");
      await invoer(2, "=A1*2");
      assert.equal((await page.evaluate(() => proefCel("A3"))).displayText, "14");
      const bytes = Buffer.from(await page.evaluate(async () => {
        await proefApi().version();
        return Array.from(proefApi().save());
      }));
      await writeFile(join(uitvoer, `ronde-${ronde}.xlsx`), bytes);
      await page.evaluate(() => { window.proefOudeHandle = proefApi().handle; });
      await bestand.setInputFiles({ name: `Heropend-${ronde}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: bytes });
      await page.waitForFunction(() => {
        try { return proefApi()?.handle !== proefOudeHandle && proefCel("A3").displayText === "14"; } catch { return false; }
      }, { timeout: 60_000 });
      assert.equal(await page.evaluate(() => proefApi().handle.cell(0, 1, 0).input), "=ISOWEEKNUM()");
      assert.equal((await page.evaluate(() => proefCel("A2"))).displayText, "#VALUE!");
      assert.equal((await page.evaluate(() => proefCel("A4"))).displayText, "53");
      assert.deepEqual(fouten, []);
      await page.screenshot({ path: join(uitvoer, `ronde-${ronde}.png`) });
      verslag.rondes.push({ ronde, f2, exacteInvoer: true, vervolgbewerking: true, heropend: true, fouten });
      console.log(`Rekenblad-GUI ronde ${ronde + 1}: exacte invoer, celfout en bewaren/heropenen geslaagd.`);
    } catch (fout) {
      await page.screenshot({ path: join(uitvoer, `afgekeurd-${ronde}.png`) }).catch(() => {});
      verslag.rondes.push({ ronde, f2, geslaagd: false, fout: String(fout), fouten });
      throw fout;
    } finally {
      await context.close();
    }
  }
} finally {
  await writeFile(join(uitvoer, "rapport.json"), JSON.stringify(verslag, null, 2) + "\n");
  await browser.close();
  await new Promise((ok, fout) => server.httpServer.close(e => e ? fout(e) : ok()));
}
