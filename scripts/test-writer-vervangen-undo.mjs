/** #29: Undo/Redo direct na vervangen, zonder het zoekpaneel te sluiten. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { preview } from "vite";
import { strFromU8, strToU8, zipSync, unzipSync } from "fflate";

// Playwright is apart testgereedschap, zoals bij de andere productie-browserproeven.
const { chromium } = await import(process.env.OOS_PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.OOS_PLAYWRIGHT_MODULE)).href : "playwright");
const uitvoer = resolve(process.env.OOS_TEST_UIT ?? ".local/proef-writer-vervangen-undo");
await mkdir(uitvoer, { recursive: true });
const pakket = unzipSync(await readFile("public/templates/nieuw.docx"));
const p = (tekst, opmaak = "") => `<w:p><w:r>${opmaak ? `<w:rPr>${opmaak}</w:rPr>` : ""}<w:t>${tekst}</w:t></w:r></w:p>`;
const inhoud = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>kat</w:t></w:r><w:r><w:t xml:space="preserve"> en kat.</w:t></w:r></w:p>' + p("Een kat is een dier.", "<w:i/>") + `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="5000"/></w:tblGrid><w:tr><w:tc><w:tcPr/>${p("Een kat in de cel.")}</w:tc></w:tr></w:tbl>${p("")}`;
const xml = strFromU8(pakket["word/document.xml"]);
pakket["word/document.xml"] = strToU8(xml.replace(/<w:body>[\s\S]*?(<w:sectPr[\s\S]*?<\/w:sectPr>)\s*<\/w:body>/, `<w:body>${inhoud}$1</w:body>`));
assert.notEqual(strFromU8(pakket["word/document.xml"]), xml);
const bron = { name: "Vervangproef.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(zipSync(pakket)) };
const origineel = "kat en kat.Een kat is een dier.Een kat in de cel.";
const vervangen = origineel.replaceAll("kat", "hond");
const server = await preview({ configFile: false, build: { outDir: process.env.OOS_TEST_DIST ?? "dist" }, preview: { host: "127.0.0.1", port: 0, open: false } });
const browser = await chromium.launch();
const rapport = { stappen: [], fouten: [] };

function tekstVan(xml) { return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join(""); }
async function proef(naam, doe) {
  const page = await browser.newPage({ locale: "en-US", viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", e => rapport.fouten.push({ naam, fout: String(e) }));
  try {
    await page.addInitScript(() => localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "en", spelling: { controleren: false } })));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?offscreenReplay=0`);
    const bestand = page.locator(".office input[type=file]").first();
    await bestand.setInputFiles(bron);
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
      window.proefOpslag = () => {
        const el = document.querySelector(".office-tabpaneel:not([hidden]) .office-tekst");
        if (!el) return null;
        for (let f = el[Object.keys(el).find(k => k.startsWith("__reactFiber$"))]; f; f = f.return) {
          const v = f.memoizedProps?.value;
          if (v?.tekst && v?.herlaad?.bytes) return v.herlaad;
        }
        return null;
      };
    });
    await page.waitForFunction(() => proefApi()?.getEditorRef()?.getLayout()?.pages.length, null, { timeout: 60_000 });
    await page.evaluate(() => proefApi().focus());
    await page.keyboard.press("Control+h");
    const paneel = page.getByRole("search", { name: "Find and Replace", exact: true });
    const zoekveld = paneel.getByRole("searchbox", { name: "Find what", exact: true });
    const vervangveld = paneel.getByRole("textbox", { name: "Replace with", exact: true });
    async function zoek(zoek, door, aantal) {
      await zoekveld.fill(zoek); await vervangveld.fill(door);
      await page.waitForFunction(n => document.querySelector(".tw-zoek-telling")?.textContent === `${n} ${n === 1 ? "result" : "results"}`, aantal);
    }
    async function bewaard() {
      // De opslagkoppeling onderdrukt onSave; rechtstreeks ref.save() opent Opslaan als.
      const bytes = Buffer.from(await page.evaluate(async () => Array.from(await proefOpslag().bytes())));
      assert.equal(await page.getByRole("dialog").count(), 0, "Inspectie opent geen Opslaan-als-dialoog");
      return { bytes, xml: strFromU8(unzipSync(bytes)["word/document.xml"]) };
    }
    async function controle(verwacht) {
      // Typen en geschiedenis worden door de enginewachtrij verwerkt.
      await page.waitForFunction(async tekst => {
        const r = await proefApi().readParagraphs({ view: "accepted", story: "body" });
        return r.ok && r.paragraphs.map(p => p.text).join("").replaceAll("\uFFFC", "") === tekst;
      }, verwacht.replace(/Een (kat|hond) in de cel\.$/, ""), { timeout: 10_000 });
      const uit = await bewaard();
      assert.equal(tekstVan(uit.xml), verwacht);
      assert.equal(await paneel.count(), 1, "Paneel blijft open");
      return uit;
    }
    async function bulk(zoekTekst = "kat", door = "hond", aantal = 4) {
      await zoek(zoekTekst, door, aantal);
      await paneel.getByRole("button", { name: "Replace All", exact: true }).click();
      await page.waitForFunction(() => document.querySelector(".tw-zoek-telling")?.textContent?.includes("undoes this in one step"));
    }
    const ctx = { page, paneel, zoekveld, vervangveld, zoek, bulk, bewaard, controle, bestand };
    await doe(ctx);
    rapport.stappen.push({ naam, geslaagd: true });
    console.log(`OK: ${naam}`);
  } catch (e) {
    rapport.stappen.push({ naam, geslaagd: false, fout: String(e) });
    await page.screenshot({ path: join(uitvoer, `afgekeurd-${rapport.stappen.length}.png`) }).catch(() => {});
    console.error(`FOUT: ${naam}: ${e.message}`);
  } finally { await page.close(); }
}

try {
  await proef("Alles vervangen: Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, bewaren en heropenen", async c => {
    await c.bulk(); await c.controle(vervangen);
    await c.page.keyboard.press("Control+z");
    const terug = await c.controle(origineel);
    assert.match(terug.xml, /<w:b(?:\s|\/|>)/); assert.match(terug.xml, /<w:i(?:\s|\/|>)/);
    await c.page.keyboard.press("Control+y"); await c.controle(vervangen);
    await c.page.keyboard.press("Control+z"); await c.controle(origineel);
    await c.page.keyboard.press("Control+Shift+z"); const uit = await c.controle(vervangen);
    await c.page.evaluate(() => { window.proefVorigeSessie = proefApi().getEditorRef().getYrsSession(); });
    await c.bestand.setInputFiles({ ...bron, name: "Heropende vervangproef.docx", buffer: uit.bytes });
    await c.page.waitForFunction(() => proefApi()?.getEditorRef()?.getYrsSession() !== proefVorigeSessie && proefApi()?.getEditorRef()?.getLayout()?.pages.length, null, { timeout: 60_000 });
    assert.equal(tekstVan((await c.bewaard()).xml), vervangen);
  });
  await proef("Vervang-knop: Ctrl+Z draait één vervanging terug", async c => {
    await c.zoek("kat", "hond", 4);
    await c.paneel.getByRole("button", { name: "Next result", exact: true }).click();
    await c.paneel.getByRole("button", { name: "Replace", exact: true }).click();
    await c.controle(origineel.replace("kat", "hond"));
    await c.page.keyboard.press("Control+z"); await c.controle(origineel);
  });
  await proef("Laatste treffer: uitgeschakelde Vervang-knop laat Undo werken", async c => {
    await c.zoek("dier", "beest", 1);
    await c.paneel.getByRole("button", { name: "Next result", exact: true }).click();
    await c.paneel.getByRole("button", { name: "Replace", exact: true }).click();
    await c.controle(origineel.replace("dier", "beest"));
    await c.page.keyboard.press("Control+z"); await c.controle(origineel);
  });
  await proef("Enter in vervangveld: focus en lokale Undo blijven in het invoerveld", async c => {
    await c.zoek("kat", "hond", 4);
    await c.paneel.getByRole("button", { name: "Next result", exact: true }).click();
    await c.vervangveld.focus(); await c.vervangveld.press("Enter");
    const verwacht = origineel.replace("kat", "hond"); await c.controle(verwacht);
    assert(await c.vervangveld.evaluate(e => e === document.activeElement));
    await c.vervangveld.press("End"); await c.vervangveld.pressSequentially("X");
    await c.vervangveld.press("Control+z");
    assert.equal(await c.vervangveld.inputValue(), "hond");
    await c.controle(verwacht);
  });
  await proef("Zoekveld: lokale Ctrl+Z draait geen documentvervanging terug", async c => {
    await c.bulk(); await c.controle(vervangen);
    await c.zoekveld.focus(); await c.zoekveld.press("End"); await c.zoekveld.pressSequentially("X");
    await c.zoekveld.press("Control+z");
    assert.equal(await c.zoekveld.inputValue(), "kat");
    await c.controle(vervangen);
  });
  await proef("Vervangen over alineagrens: sessieroute blijft één Undo-stap", async c => {
    await c.bulk("kat.^pEen kat", "een hond", 1);
    await c.controle("kat en een hond is een dier.Een kat in de cel.");
    await c.page.keyboard.press("Control+z"); await c.controle(origineel);
  });
  assert.deepEqual(rapport.fouten, []);
  assert(rapport.stappen.every(s => s.geslaagd), "Niet alle Writer-Undo-proeven slagen");
} finally {
  await writeFile(join(uitvoer, "rapport.json"), JSON.stringify(rapport, null, 2) + "\n");
  await browser.close();
  await new Promise(r => server.httpServer.close(r));
}
