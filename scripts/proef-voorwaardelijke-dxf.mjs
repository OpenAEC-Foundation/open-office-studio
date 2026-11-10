/** Actual production canvas, numeric overflow, edit/Undo, download and fresh reopen. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer, preview } from "vite";
import { initWasm, openWorkbook } from "@betteroffice/xlsx";
const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
const uit = ".local/proef-voorwaardelijke-dxf";
fs.mkdirSync(uit, { recursive: true });
await initWasm(fs.readFileSync("vendor/rekenbladengine/xlsx_wasm_bg.wasm"));
const loader = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let bytes;
try {
  const { Pakket } = await loader.ssrLoadModule("/src/grafieken/pakket.ts");
  const { leesXml, kind } = await loader.ssrLoadModule("/src/grafieken/xml.ts");
  const { werkbladDeel } = await loader.ssrLoadModule(
    "/src/rekenblad/pakket.ts",
  );
  const { sectie } = await loader.ssrLoadModule(
    "/src/rekenblad/werkboekXml.ts",
  );
  const { metBeginregio } = await loader.ssrLoadModule(
    "/src/rekenblad/werkmapregio.ts",
  );
  const h = openWorkbook(
    metBeginregio(fs.readFileSync("public/templates/nieuw.xlsx"), "en-US"),
  );
  h.editCells(0, [
    { row: 0, col: 0, input: "0.125" },
    { row: 1, col: 0, input: "0.5" },
    { row: 0, col: 1, input: "45000" },
    { row: 1, col: 1, input: "200" },
  ]);
  h.applyOps([
    { type: "setColWidth", sheet: 0, col: 0, width: 14 },
    { type: "setColWidth", sheet: 0, col: 1, width: 3 },
  ]);
  const p = new Pakket(h.save());
  h.dispose();
  const { werkmap, pad } = werkbladDeel(p, 0),
    rel = p.relaties(werkmap).find((r) => r.type.endsWith("/styles")),
    style = Pakket.doelPad(werkmap, rel.target);
  const dxfs =
    '<dxfs count="2"><dxf><font><color theme="4" tint="0.4"/><u/><strike/></font><fill><patternFill patternType="solid"><fgColor theme="5" tint="-0.25"/></patternFill></fill><numFmt numFmtId="165" formatCode="0.0%"/><border><bottom style="double"><color indexed="2"/></bottom></border></dxf><dxf><font><color rgb="FFFF0000"/></font><numFmt numFmtId="166" formatCode="yyyy-mm-dd"/></dxf></dxfs>';
  const xml = p.lees(style),
    old = kind(leesXml(xml), "dxfs");
  p.schrijf(
    style,
    old
      ? xml.slice(0, old.start) + dxfs + xml.slice(old.eind)
      : xml.replace("</styleSheet>", dxfs + "</styleSheet>"),
  );
  sectie(
    p,
    pad,
    "conditionalFormatting",
    '<conditionalFormatting sqref="A1:A2"><cfRule type="expression" priority="1" dxfId="0"><formula>A1&lt;0.3</formula></cfRule></conditionalFormatting>',
  );
  // Keep both groups at the schema-defined conditional-formatting position.
  p.schrijf(
    pad,
    p
      .lees(pad)
      .replace(
        "</conditionalFormatting>",
        '</conditionalFormatting><conditionalFormatting sqref="B1:B2"><cfRule type="expression" priority="2" dxfId="1"><formula>B1&gt;40000</formula></cfRule></conditionalFormatting>',
      ),
  );
  const themeRel = p.relaties(werkmap).find((r) => r.type.endsWith("/theme")),
    theme = Pakket.doelPad(werkmap, themeRel.target);
  p.schrijf(
    theme,
    p
      .lees(theme)
      .replace(/(<a:accent1>\s*<a:srgbClr val=")[^"]*/, "$14F81BD")
      .replace(/(<a:accent2>\s*<a:srgbClr val=")[^"]*/, "$1C0504D"),
  );
  p.schrijf("custom/unchanged.bin", new Uint8Array([0, 1, 255]));
  p.voegOverrideToe("custom/unchanged.bin", "application/octet-stream");
  bytes = p.inpakken();
  fs.writeFileSync(`${uit}/source.xlsx`, bytes);
} finally {
  await loader.close();
}
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? ".local/dxf-build" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch({ headless: true });
const rapport = [],
  errors = [];
let page;
try {
  async function open(bytes, name) {
    const context = await browser.newContext({
      locale: "en-US",
      viewport: { width: 1280, height: 900 },
      acceptDownloads: true,
    });
    await context.addInitScript(() => {
      localStorage.setItem(
        "openaec-office-instellingen",
        JSON.stringify({
          taal: "en",
          thema: "light",
          spelling: { controleren: false, autocorrectie: false },
        }),
      );
      window.__dxfText = [];
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        if (/^(12\.5%|20\.0%|#+)$/.test(text))
          window.__dxfText.push({
            text,
            color: this.fillStyle,
            font: this.font,
          });
        return original.call(this, text, ...args);
      };
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(server.resolvedUrls.local[0]);
    await p
      .locator("input[type=file]")
      .first()
      .setInputFiles({
        name,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from(bytes),
      });
    await p.locator(".rekenblad-naamvak:visible").waitFor();
    return p;
  }
  page = await open(bytes, "dxf-source.xlsx");
  await page.waitForFunction(() =>
    window.__dxfText.some((c) => c.text === "12.5%" && c.color === "#95b3d7"),
  );
  rapport.push(
    "The actual production canvas paints the matching percentage in the workbook theme colour/tint.",
  );
  await page.waitForFunction(() =>
    window.__dxfText.some((c) => /^#+$/.test(c.text) && c.color === "#ff0000"),
  );
  rapport.push(
    "The real painter uses hashes for a conditional date format that does not fit its narrow column.",
  );
  await page.screenshot({ path: `${uit}/conditional-dxf.png` });
  const name = page.locator(".rekenblad-naamvak:visible");
  await name.fill("A1");
  await name.press("Enter");
  await page.evaluate(() => {
    window.__dxfText = [];
  });
  await page.keyboard.type("0.2");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    window.__dxfText.some((c) => c.text === "20.0%" && c.color === "#95b3d7"),
  );
  await page.evaluate(() => {
    window.__dxfText = [];
  });
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() =>
    window.__dxfText.some((c) => c.text === "12.5%" && c.color === "#95b3d7"),
  );
  rapport.push(
    "Typing recalculates the conditional number format; one ordinary Undo restores the value and display.",
  );
  await page.locator('[data-testid="xlsx-scroll"]').focus();
  await page.keyboard.press("Control+s");
  const save = page.getByRole("dialog", { name: "Save as", exact: true });
  await save.waitFor();
  const pending = page.waitForEvent("download");
  await save.getByRole("button", { name: "Save", exact: true }).click();
  await (await pending).saveAs(`${uit}/saved.xlsx`);
  const saved = fs.readFileSync(`${uit}/saved.xlsx`),
    h = openWorkbook(saved);
  assert.equal(h.cell(0, 0, 0).input, "0.125");
  assert.equal(h.cell(0, 0, 1).input, "45000");
  assert.equal(h.conditionalFormats(0).length, 2);
  h.dispose();
  rapport.push(
    "Save as retains original numeric inputs and both source rules without baking display styles into cell values.",
  );
  const reopened = await open(saved, "dxf-saved.xlsx");
  await reopened.waitForFunction(() =>
    window.__dxfText.some((c) => c.text === "12.5%" && c.color === "#95b3d7"),
  );
  await reopened.waitForFunction(() =>
    window.__dxfText.some((c) => /^#+$/.test(c.text) && c.color === "#ff0000"),
  );
  rapport.push(
    "A fresh browser profile reopens the actual download with the same themed percentage and numeric-overflow display.",
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    `${uit}/report.json`,
    JSON.stringify({ rapport, errors }, null, 2),
  );
  console.log(JSON.stringify({ rapport, errors }, null, 2));
} catch (e) {
  if (page) {
    await page.screenshot({ path: `${uit}/failure.png` });
    fs.writeFileSync(
      `${uit}/failure.txt`,
      await page.locator("body").innerText(),
    );
  }
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
