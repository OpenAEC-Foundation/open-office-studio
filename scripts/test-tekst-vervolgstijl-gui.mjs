/** #199: toetsenbord, stijlovergang, bewaren en heropenen in de productiebundel. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { preview } from "vite";
import { strFromU8, unzipSync } from "fflate";
const { chromium } = await import(process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright");
const uit = resolve(process.env.OFFICE_TEST_UIT ?? ".local/proef-tekst-vervolgstijl");
await mkdir(uit, { recursive: true });
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch();
const rapport = { stappen: [], fouten: [], instellingen: { spelling: false, autocorrectie: false } };
const stap = (naam) => { rapport.stappen.push(naam); console.log(naam); };
const bron = await readFile("public/templates/nieuw.docx");
let nummer = 0;
async function open(bytes = bron) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-US" });
  const page = await context.newPage();
  page.on("pageerror", (e) => rapport.fouten.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") rapport.fouten.push(m.text()); });
  await page.addInitScript(() => localStorage.setItem("openaec-office-instellingen", JSON.stringify({
    taal: "en", thema: "forge", spelling: { controleren: false, autocorrectie: false },
  })));
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator(".office input[type=file]").first().setInputFiles({
    name: `Vervolgstijl-${++nummer}.docx`,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(bytes),
  });
  await page.waitForSelector(".office-tekst");
  await page.evaluate(() => {
    window.proefApi = () => {
      const el = document.querySelector(".office-tabpaneel:not([hidden]) .office-tekst");
      for (let f = el?.[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))]; f; f = f.return)
        for (let s = f.memoizedState, i = 0; s && i < 200; i++, s = s.next) {
          const v = s.memoizedState?.current;
          if (v?.getEditorRef && v.commands) return v;
        }
      return null;
    };
  });
  await page.waitForFunction(() => window.proefApi()?.getEditorRef()?.getLayout()?.pages.length);
  await page.locator("canvas").first().click({ position: { x: 120, y: 120 } });
  return { page, close: () => context.close() };
}
async function state(page) {
  return page.evaluate(async () => {
    const e = window.proefApi().getEditorRef();
    await e.flushPendingInput();
    const s = e.getYrsSession(), l = s.selection().head;
    const bereik = (p) => ({ story: l.story, start: { paraId: p.paraId, offset: 0 }, end: { paraId: p.paraId, offset: p.text.length } });
    const paragraphs = s.paragraphs(l.story);
    return {
      paragraphs,
      contexts: paragraphs.map((p) => s.selectionContext(bereik(p))),
      context: s.selectionContext({ story: l.story, start: l, end: l }),
    };
  });
}
const normaal = (c) => {
  assert.equal(c.styleId, "Normal"); assert.equal(c.fontFamily, "Cambria");
  assert.equal(c.fontSize, 22); assert.equal(c.color, null); assert.equal(c.bold, false);
};
async function kop(page, niveau = 1, tekst = "a") {
  await page.keyboard.press("Enter");
  await page.keyboard.type(tekst, { delay: 30 });
  await page.keyboard.press(`Control+${niveau}`);
  await page.waitForFunction(({ niveau, tekst }) => {
    const e = window.proefApi().getEditorRef(), s = e.getYrsSession(), l = s.selection();
    return l.anchor.offset === l.head.offset && l.head.offset === tekst.length &&
      s.selectionContext({ story: l.head.story, start: l.head, end: l.head }).styleId === `Heading${niveau}`;
  }, { niveau, tekst });
}
try {
  let doc = await open();
  await kop(doc.page);
  const heading = (await state(doc.page)).contexts[1];
  assert.equal(heading.fontFamily, "Calibri"); assert.equal(heading.color, "365F91");
  await doc.page.keyboard.press("Enter");
  const empty = (await state(doc.page)).paragraphs[2];
  assert.equal(empty.properties.pStyle, "Normal");
  assert.equal(empty.properties.defaultTextFormatting.fontFamily.ascii, "Cambria");
  assert.equal(empty.properties.defaultTextFormatting.color, undefined);
  await doc.page.waitForTimeout(1000);
  await doc.page.keyboard.press("a");
  normaal((await state(doc.page)).context);
  stap("Heading 1 → Normal: lege alinea en eerste echte toetsaanslag behouden normale opmaak");
  const opgeslagen = Buffer.from(await doc.page.evaluate(async () => Array.from(new Uint8Array(await window.proefApi().save()))));
  const xml = strFromU8(unzipSync(opgeslagen)["word/document.xml"]);
  const alineas = await doc.page.evaluate((xml) => {
    const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    return Array.from(doc.getElementsByTagNameNS(ns, "p"), (p) => ({
      stijl: p.getElementsByTagNameNS(ns, "pStyle")[0]?.getAttributeNS(ns, "val"),
      tekst: Array.from(p.getElementsByTagNameNS(ns, "t"), (t) => t.textContent).join(""),
      xml: new XMLSerializer().serializeToString(p),
    }));
  }, xml);
  assert.match(alineas.find((p) => p.stijl === "Heading1").xml, /365F91/);
  const gewoneXml = alineas.find((p) => p.stijl === "Normal" && p.tekst === "a").xml;
  assert.doesNotMatch(gewoneXml, /365F91|Calibri/);
  await writeFile(resolve(uit, "Heading-Normal.docx"), opgeslagen);
  await doc.close();
  doc = await open(opgeslagen);
  const heropend = await state(doc.page);
  normaal(heropend.contexts[2]); assert.equal(heropend.contexts[1].color, "365F91");
  stap("DOCX-XML en heropenen: normale tekst blijft normaal en de kop blijft blauw");
  await doc.close();

  for (const niveau of [1, 2]) {
    doc = await open(); await kop(doc.page, niveau, "Kop");
    await doc.page.keyboard.press("Enter");
    await doc.page.keyboard.type("Snel verder", { delay: 1 });
    normaal((await state(doc.page)).context);
    stap(`Heading ${niveau} → Normal: direct verder typen zonder wachten`);
    await doc.close();
  }

  doc = await open(); await kop(doc.page, 1, "abc");
  await doc.page.keyboard.press("ArrowLeft"); await doc.page.keyboard.press("Enter");
  const midden = await state(doc.page);
  assert.deepEqual(midden.paragraphs.map((p) => p.text), ["", "ab", "c"]);
  assert.equal(midden.context.styleId, "Heading1"); assert.equal(midden.context.color, "365F91");
  stap("Enter midden in een kop behoudt de kopstijl en bestaande tekenopmaak");
  await doc.close();

  doc = await open(); await doc.page.keyboard.type("abc", { delay: 30 });
  await doc.page.evaluate(() => {
    const e = window.proefApi().getEditorRef(), s = e.getYrsSession(), l = s.selection().head;
    s.formatRange({ story: l.story, start: { paraId: l.paraId, offset: 0 }, end: l }, {
      color: { rgb: "C00000" }, fontFamily: { ascii: "Inter", hAnsi: "Inter" },
    });
    e.syncYrsInputState(true, [l.story]);
  });
  await doc.page.keyboard.press("Enter"); await doc.page.keyboard.press("a");
  const gewoon = (await state(doc.page)).context;
  assert.equal(gewoon.fontFamily, "Inter"); assert.equal(gewoon.color, "C00000");
  stap("Enter in gewone tekst behoudt een bewust gekozen kleur en lettertype");
  await doc.close();
  assert.deepEqual(rapport.fouten, []);
} finally {
  await writeFile(resolve(uit, "rapport.json"), JSON.stringify(rapport, null, 2) + "\n");
  await browser.close(); await server.httpServer.close();
}
