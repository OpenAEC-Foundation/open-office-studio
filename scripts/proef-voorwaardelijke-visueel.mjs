/** Production canvas, threshold edit/Undo, native download and fresh-profile reopen. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer, preview } from "vite";
import { initWasm, openWorkbook } from "@betteroffice/xlsx";
import { chromium } from "playwright";

const out = ".local/proef-voorwaardelijke-visueel";
fs.mkdirSync(out, { recursive: true });
await initWasm(fs.readFileSync("vendor/rekenbladengine/xlsx_wasm_bg.wasm"));
const http = createHttpServer();
const loader = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: { server: http }, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let source;
try {
  const { Pakket } = await loader.ssrLoadModule("/src/grafieken/pakket.ts");
  const { werkbladDeel } = await loader.ssrLoadModule(
    "/src/rekenblad/pakket.ts",
  );
  const { sectie } = await loader.ssrLoadModule(
    "/src/rekenblad/werkboekXml.ts",
  );
  const { metBeginregio } = await loader.ssrLoadModule(
    "/src/rekenblad/werkmapregio.ts",
  );
  const { PICTOGRAMSETS } = await loader.ssrLoadModule(
    "/src/rekenblad/pictogrammen.ts",
  );
  const h = openWorkbook(
    metBeginregio(fs.readFileSync("public/templates/nieuw.xlsx"), "en-US"),
  );
  h.applyOps([
    {
      type: "mergeCells",
      sheet: 0,
      range: { start: { row: 0, col: 0 }, end: { row: 0, col: 2 } },
    },
    { type: "addSheet", index: 1, name: "Icon families" },
    ...[0, 1, 2, 3, 4].map((col) => ({
      type: "setColWidth",
      sheet: 0,
      col,
      width: 14,
    })),
    { type: "setColWidth", sheet: 1, col: 0, width: 27 },
    ...[1, 2, 3, 4, 5].map((col) => ({
      type: "setColWidth",
      sheet: 1,
      col,
      width: 12,
    })),
  ]);
  h.editCells(0, [
    { row: 0, col: 0, input: "100" },
    ...[10, 30, 70].map((n, i) => ({ row: i + 2, col: 0, input: String(n) })),
    { row: 2, col: 1, input: "25" },
    ...[0, 50, 100].map((n, i) => ({ row: i + 2, col: 2, input: String(n) })),
    ...[0, 25, 50, 75, 100].map((n, i) => ({
      row: i + 2,
      col: 3,
      input: String(n),
    })),
  ]);
  const icons = [];
  for (const [at, set] of PICTOGRAMSETS.entries()) {
    const row = at * 2 + 2,
      count = Number(set[0]);
    h.editCell(1, row, 0, set);
    h.editCells(
      1,
      Array.from({ length: count }, (_, i) => ({
        row,
        col: i + 1,
        input: String(i * 25),
      })),
    );
    icons.push(
      `<conditionalFormatting sqref="B${row + 1}:${String.fromCharCode(65 + count)}${row + 1}"><cfRule type="iconSet" priority="${at + 1}"><iconSet iconSet="${set}">${Array.from({ length: count }, (_, i) => `<cfvo type="num" val="${i * 25}"/>`).join("")}</iconSet></cfRule></conditionalFormatting>`,
    );
  }
  const p = new Pakket(h.save());
  h.dispose();
  const cf = (range, type, n, content) =>
    `<conditionalFormatting sqref="${range}"><cfRule type="${type}" priority="${n}">${content}</cfRule></conditionalFormatting>`;
  sectie(
    p,
    werkbladDeel(p, 0).pad,
    "conditionalFormatting",
    [
      cf(
        "A1",
        "dataBar",
        1,
        '<dataBar minLength="0" maxLength="100"><cfvo type="num" val="0"/><cfvo type="num" val="100"/><color rgb="FF3366CC"/></dataBar>',
      ),
      cf(
        "A3:A5",
        "iconSet",
        2,
        '<iconSet iconSet="3Arrows"><cfvo type="num" val="0"/><cfvo type="formula" val="$B$3"/><cfvo type="formula" val="$B$3*2"/></iconSet>',
      ),
      cf(
        "C3:C5",
        "iconSet",
        3,
        '<iconSet iconSet="3TrafficLights1"><cfvo type="num" val="0"/><cfvo type="num" val="50" gte="false"/><cfvo type="num" val="100"/></iconSet>',
      ),
      cf(
        "D3:D7",
        "iconSet",
        4,
        '<iconSet iconSet="5Quarters" reverse="true" showValue="0"><cfvo type="num" val="0"/><cfvo type="num" val="25"/><cfvo type="num" val="50"/><cfvo type="num" val="75"/><cfvo type="num" val="100"/></iconSet>',
      ),
    ].join(""),
  );
  sectie(p, werkbladDeel(p, 1).pad, "conditionalFormatting", icons.join(""));
  p.schrijf("custom/visual-unknown.bin", new Uint8Array([0, 255, 7, 42]));
  p.voegOverrideToe("custom/visual-unknown.bin", "application/octet-stream");
  source = p.inpakken();
  fs.writeFileSync(`${out}/source.xlsx`, source);
} finally {
  await loader.close();
}

const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? ".local/visual-build" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch({ headless: true });
const errors = [],
  checks = [];
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
      window.__visualTrace = [];
      const rect = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (...args) {
        if (this.fillStyle === "#3366cc")
          window.__visualTrace = [{ op: "bar", args }];
        return rect.apply(this, args);
      };
      const fill = CanvasRenderingContext2D.prototype.fill;
      CanvasRenderingContext2D.prototype.fill = function (...args) {
        if (["#d22f27", "#c9a000", "#27913a"].includes(this.fillStyle))
          window.__visualTrace.push({ op: "icon", color: this.fillStyle });
        return fill.apply(this, args);
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
  async function levels(p, expected) {
    await p.waitForFunction((expected) => {
      const icons = window.__visualTrace.filter((c) => c.op === "icon");
      return expected.every(
        (n, i) =>
          icons.filter((c) => c.color === ["#d22f27", "#c9a000", "#27913a"][i])
            .length === n,
      );
    }, expected);
  }
  page = await open(source, "visual-source.xlsx");
  await levels(page, [3, 1, 2]);
  const bar = await page.evaluate(() =>
    window.__visualTrace.find((c) => c.op === "bar"),
  );
  assert.ok(
    bar.args[2] > 250,
    `Merged bar unexpectedly narrow: ${bar.args[2]}`,
  );
  checks.push(
    "Production canvas paints full merged-cell bar, formula icon levels and lexical false equality.",
  );
  await page.screenshot({ path: `${out}/visual-canvas.png` });
  const name = page.locator(".rekenblad-naamvak:visible");
  await name.fill("B3");
  await name.press("Enter");
  await page.keyboard.type("40");
  await page.keyboard.press("Enter");
  await levels(page, [4, 1, 1]);
  await page.keyboard.press("Control+z");
  await levels(page, [3, 1, 2]);
  checks.push(
    "Editing the referenced threshold cell updates vector levels; one Undo restores the prior levels.",
  );
  await page.locator('[data-testid="xlsx-scroll"]').focus();
  await page.keyboard.press("Control+s");
  const save = page.getByRole("dialog", { name: "Save as", exact: true });
  await save.waitFor();
  const pending = page.waitForEvent("download");
  await save.getByRole("button", { name: "Save", exact: true }).click();
  await (await pending).saveAs(`${out}/saved.xlsx`);
  const saved = fs.readFileSync(`${out}/saved.xlsx`),
    h = openWorkbook(saved);
  assert.equal(h.cell(0, 2, 1).input, "25");
  assert.equal(h.conditionalFormats(0).length, 4);
  assert.equal(h.conditionalFormats(1).length, 17);
  h.dispose();
  checks.push(
    "Actual Save as retains the original numeric inputs, four targeted rules and all 17 imported families.",
  );
  const reopened = await open(saved, "visual-saved.xlsx");
  await levels(reopened, [3, 1, 2]);
  checks.push(
    "Fresh-profile reopen of the downloaded workbook reproduces the expected native canvas output.",
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    `${out}/report.json`,
    JSON.stringify({ checks, bar, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, bar, errors }, null, 2));
} catch (e) {
  if (page) {
    await page.screenshot({ path: `${out}/failure.png` });
    fs.writeFileSync(
      `${out}/failure.txt`,
      await page.locator("body").innerText(),
    );
  }
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
