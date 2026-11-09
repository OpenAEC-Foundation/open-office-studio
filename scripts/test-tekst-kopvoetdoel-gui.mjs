/** #209: echte invoer in afzonderlijke eerste/even/oneven kop- en voetteksten. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer, preview } from "vite";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
const { chromium } = await import(process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright");
const uit = resolve(process.env.OFFICE_TEST_UIT ?? ".local/proef-kopvoetdoel");
await mkdir(uit, { recursive: true });
const ssr = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true }, appType: "custom" });
const k = await ssr.ssrLoadModule("/src/tekst/pagina/kopvoet.ts");
const o = await ssr.ssrLoadModule("/src/tekst/pagina/ooxml.ts");
function paginas(bytes, aantal) {
  const z = unzipSync(bytes);
  const inhoud = Array.from({ length: aantal }, (_, i) => `<w:p><w:r>${i ? '<w:br w:type="page"/>' : ""}<w:t>Page${i + 1}</w:t></w:r></w:p>`).join("");
  z["word/document.xml"] = strToU8(strFromU8(z["word/document.xml"]).replace(/(<w:body>)[\s\S]*?(<w:sectPr)/, `$1${inhoud}$2`));
  return zipSync(z);
}
const bron = new Uint8Array(await readFile("public/templates/nieuw.docx"));
const leeg = k.zetEvenOnevenAnders(paginas(bron, 2), true);
let bytes = k.zetEvenOnevenAnders(k.zetEerstePaginaAnders(paginas(bron, 3), 0, true), true);
for (const soort of ["header", "footer"]) bytes = k.zorgVoorKopVoet(bytes, 0, soort) ?? bytes;
const p = new o.Pakket(bytes), doc = o.openDocument(p), onderdelen = {};
for (const soort of ["header", "footer"]) for (const type of ["default", "first", "even"]) {
  const deel = k.effectiefDeel(doc, 0, soort, type);
  onderdelen[`${soort}:${type}`] = deel;
  p.schrijf(deel.pad, p.lees(deel.pad).replace("</w:p>", `<w:r><w:t>${soort}-${type}</w:t></w:r></w:p>`));
}
bytes = p.inpakken();
await ssr.close();
const server = await preview({ configFile: false, build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" }, preview: { host: "127.0.0.1", port: 0, open: false } });
const browser = await chromium.launch();
const rapport = { stappen: [], fouten: [], instellingen: { spelling: false, autocorrectie: false } };
const stap = (naam) => { rapport.stappen.push(naam); console.log(naam); };
let nummer = 0;
async function open(buffer = bytes, aantal = 3) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-US" });
  const page = await context.newPage();
  page.on("pageerror", (e) => rapport.fouten.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") rapport.fouten.push(m.text()); });
  await page.addInitScript(() => {
    localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "en", thema: "forge", spelling: { controleren: false, autocorrectie: false } }));
    localStorage.setItem("open-tekst-pakketroute-bevestigd", "1");
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator(".office input[type=file]").first().setInputFiles({ name: `Headers-${++nummer}.docx`, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(buffer) });
  await page.waitForSelector("canvas");
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
  await page.waitForFunction((aantal) => window.proefApi()?.getEditorRef()?.getLayout()?.pages.length === aantal, aantal);
  await page.getByRole("tab", { name: "Header & Footer", exact: true }).click();
  return { page, close: () => context.close() };
}
async function body(page, index) {
  await page.evaluate((index) => {
    const p = document.querySelectorAll(".canvas-page")[index], s = document.querySelector(".docx-editor__scroll-container");
    s.scrollTop += p.getBoundingClientRect().top - s.getBoundingClientRect().top - 50;
  }, index);
  await page.locator("canvas").nth(index).click({ position: { x: 130, y: 110 } });
}
async function edit(page, soort, index, afknippen = false) {
  await body(page, index);
  if (afknippen) await page.evaluate(() => { document.querySelector(".docx-editor__scroll-container").scrollTop += 220; });
  await page.getByRole("button", { name: soort === "header" ? "Edit Header" : "Edit Footer", exact: true }).click();
  await page.waitForSelector(".hf-inline-editor");
}
async function stand(page) {
  return page.evaluate(async () => {
    const api = window.proefApi(); await api.flushPendingInput();
    const s = api.getEditorRef().getYrsSession();
    return { selectie: s.selection(), stories: Object.fromEntries(s.storyIds().map((id) => [id, s.paragraphs(id).map((p) => p.text).join("\n")])) };
  });
}
const story = (soort, type) => `hf:${onderdelen[`${soort}:${type}`].rid}`;
async function sluit(page) {
  await page.getByRole("button", { name: "Close Header and Footer", exact: true }).click();
  await page.waitForSelector(".hf-inline-editor", { state: "detached" });
}
function alleen(voor, na, doel, tekst) {
  assert.equal(na.selectie.head.story, doel);
  assert.equal(na.stories[doel], tekst + voor.stories[doel]);
  for (const id of Object.keys(voor.stories)) if (id !== doel) assert.equal(na.stories[id], voor.stories[id], id);
}
try {
  let d = await open();
  const voor = await stand(d.page);
  await edit(d.page, "header", 1, true);
  await d.page.keyboard.press("x");
  alleen(voor, await stand(d.page), story("header", "even"), "x");
  stap("Even header: Edit Header brengt de afgeknipte marge in beeld en gewone toetsinvoer raakt alleen de even kop");
  await d.page.keyboard.press("Control+z");
  assert.equal((await stand(d.page)).stories[story("header", "even")], voor.stories[story("header", "even")]);
  await d.page.keyboard.press("Control+y");
  alleen(voor, await stand(d.page), story("header", "even"), "x");
  stap("Ongedaan maken en opnieuw uitvoeren blijven bij de juiste koptekst");
  const bewaard = Buffer.from(await d.page.evaluate(async () => Array.from(new Uint8Array(await window.proefApi().save()))));
  const z = unzipSync(bewaard);
  assert.match(strFromU8(z[onderdelen["header:even"].pad]), /xheader-even/);
  assert.doesNotMatch(strFromU8(z[onderdelen["header:default"].pad]), /xheader-even/);
  assert.doesNotMatch(strFromU8(z[onderdelen["header:first"].pad]), /xheader-even/);
  await writeFile(resolve(uit, "Even-header.docx"), bewaard);
  await d.close(); d = await open(bewaard);
  assert.equal((await stand(d.page)).stories[story("header", "even")], "xheader-even");
  stap("Opslaan, DOCX-onderdelen controleren en heropenen bewaren de afzonderlijke even kop");
  await d.close();

  for (const [soort, type, index] of [["header", "first", 0], ["header", "default", 2], ["footer", "even", 1]]) {
    d = await open(); const voor = await stand(d.page);
    await edit(d.page, soort, index);
    await d.page.keyboard.press("q");
    alleen(voor, await stand(d.page), story(soort, type), "q");
    stap(`${soort}-${type}: alleen het gekozen onderdeel verandert; de hoofdtekst en alle andere varianten blijven gelijk`);
    await sluit(d.page); await d.close();
  }

  d = await open();
  await edit(d.page, "header", 0);
  await d.page.locator("canvas").nth(1).dblclick({ position: { x: 130, y: 55 } });
  await d.page.keyboard.press("e");
  alleen(voor, await stand(d.page), story("header", "even"), "e");
  stap("Dubbelklik wisselt vanuit een eerste kop naar de afzonderlijke even kop");
  await d.close();

  d = await open();
  await edit(d.page, "header", 1);
  await d.page.locator(".hf-inline-editor button").first().click();
  await d.page.getByRole("button", { name: "Remove header", exact: true }).click();
  await d.page.waitForFunction((rid) => window.proefApi()?.getDocument()?.package.document.finalSectionProperties.headerReferences.every((r) => r.rId !== rid), onderdelen["header:even"].rid);
  const verwijderd = Buffer.from(await d.page.evaluate(async () => Array.from(new Uint8Array(await window.proefApi().save()))));
  const zonderEven = new o.Pakket(verwijderd), zonderEvenDoc = o.openDocument(zonderEven);
  assert.equal(k.effectiefDeel(zonderEvenDoc, 0, "header", "even"), null);
  for (const type of ["first", "default"]) {
    const deel = k.effectiefDeel(zonderEvenDoc, 0, "header", type);
    assert.match(zonderEven.lees(deel.pad), new RegExp(`header-${type}`));
  }
  stap("Verwijderen via de inline bewerkbalk verwijdert de even verwijzing en behoudt eerste/oneven koppen");
  await d.close();

  d = await open(leeg, 2);
  const legeHoofdtekst = (await stand(d.page)).stories.body;
  await edit(d.page, "header", 1);
  await d.page.waitForTimeout(700);
  await d.page.keyboard.press("a");
  const na = await stand(d.page);
  assert.equal(na.stories.body, legeHoofdtekst);
  assert.equal(na.stories[na.selectie.head.story], "a");
  const opgeslagen = Buffer.from(await d.page.evaluate(async () => Array.from(new Uint8Array(await window.proefApi().save()))));
  const p = new o.Pakket(opgeslagen), doc = o.openDocument(p), even = k.effectiefDeel(doc, 0, "header", "even"), oneven = k.effectiefDeel(doc, 0, "header", "default");
  assert.match(p.lees(even.pad), /<w:t[^>]*>a<\/w:t>/);
  assert.doesNotMatch(p.lees(oneven.pad), /<w:t[^>]*>a<\/w:t>/);
  assert.doesNotMatch((await d.page.locator(".pagina-melding").allTextContents()).join(""), /removed/i);
  assert.deepEqual(await d.page.getByRole("alert").allTextContents(), []);
  stap("Zonder bestaande koppen: toevoegen, herladen en bewerken opent direct de lege even kop op pagina 2 zonder fout/verwijdermelding");
  await d.close();
  assert.deepEqual(rapport.fouten, []);
} finally {
  await writeFile(resolve(uit, "rapport.json"), JSON.stringify(rapport, null, 2) + "\n");
  await browser.close(); await server.httpServer.close();
}
