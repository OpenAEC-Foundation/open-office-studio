/** Actual candidate WASM, production canvas, edit/Undo and downloaded source. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createServer, preview } from "vite";
import { initWasm, openWorkbook } from "@betteroffice/xlsx";
import { chromium } from "playwright";

const baseline = process.argv.includes("--baseline");
const kernelPath =
  process.env.OOS_REKENBLAD_WASM ?? "vendor/rekenbladengine/xlsx_wasm_bg.wasm";
const kernel = fs.readFileSync(kernelPath);
await initWasm(kernel);
const out = ".local/proef-lineaire-trendlijn";
fs.mkdirSync(out, { recursive: true });
const http = createHttpServer();
const loader = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: { server: http }, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let bytes, Pakket;
try {
  ({ Pakket } = await loader.ssrLoadModule("/src/grafieken/pakket.ts"));
  const { standaardModel } = await loader.ssrLoadModule(
    "/src/grafieken/model.ts",
  );
  const { voegGrafiekToeXlsx } = await loader.ssrLoadModule(
    "/src/grafieken/documenten.ts",
  );
  const h = openWorkbook(fs.readFileSync("public/templates/nieuw.xlsx"));
  h.applyOps([
    { type: "renameSheet", sheet: 0, name: "Lijn" },
    { type: "addSheet", index: 1, name: "Spreiding" },
  ]);
  const names = ["Lijn", "Spreiding"],
    xValues = [
      [1, 2, 3],
      [10, 20, 40],
    ];
  for (let sheet = 0; sheet < 2; sheet++)
    h.editCells(sheet, [
      { row: 0, col: 0, input: "X" },
      { row: 0, col: 1, input: "Data" },
      ...[2, 6, 4].flatMap((n, i) => [
        { row: i + 1, col: 0, input: String(xValues[sheet][i]) },
        { row: i + 1, col: 1, input: String(n) },
      ]),
    ]);
  bytes = h.save();
  h.dispose();
  for (let sheet = 0; sheet < 2; sheet++) {
    const name = names[sheet];
    const model = standaardModel({
      soort: sheet ? "spreiding" : "lijn",
      titel: `Linear trend — ${name}`,
      categorieen: xValues[sheet].map(String),
      categorieenRef: `'${name}'!$A$2:$A$4`,
      reeksen: [
        {
          naam: "Data",
          naamRef: `'${name}'!$B$1`,
          waardenRef: `'${name}'!$B$2:$B$4`,
          waarden: [2, 6, 4],
          trendlijnen: [{ soort: "linear" }],
        },
      ],
    });
    const result = voegGrafiekToeXlsx(bytes, model, {
      blad: sheet,
      col: 3,
      row: 0,
      kolommen: 9,
      rijen: 18,
    });
    const p = new Pakket(result.bytes);
    p.schrijf(
      result.chartPad,
      p
        .lees(result.chartPad)
        .replace(/<c:trendline>[\s\S]*?<\/c:trendline>/, (xml) =>
          xml
            .replace(
              '<a:ln w="19050">',
              '<a:ln w="19050"><a:solidFill><a:srgbClr val="FF00EE"/></a:solidFill>',
            )
            .replace('val="dash"', 'val="solid"'),
        ),
    );
    bytes = p.inpakken();
  }
  const p = new Pakket(bytes);
  p.schrijf("custom/trend-unknown.bin", new Uint8Array([0, 255, 7, 42]));
  p.voegOverrideToe("custom/trend-unknown.bin", "application/octet-stream");
  bytes = p.inpakken();
  fs.writeFileSync(`${out}/source.xlsx`, bytes);
} finally {
  await loader.close();
}

const checks = [],
  errors = [];
const viewport = { x: 0, y: 0, width: 1100, height: 500 };
const metrics = {
  dpi: 96,
  maxDigitWidth: 7,
  defaultRowHeightPt: 15,
  fontSizePt: 11,
  fontFamily: "Calibri",
  fontAscent: 10,
  fontDescent: 3,
};
const magenta = (frame) =>
  frame.commands.filter(
    (c) => c.op === "line" && c.color.toLowerCase() === "#ff00ee",
  );
const book = openWorkbook(bytes);
for (let sheet = 0; sheet < 2; sheet++) {
  book.setActiveSheet(sheet);
  const version = book.version(),
    history = book.historyState();
  for (const frame of [
    book.displayList(viewport),
    book.displayListProfiled(viewport).displayList,
    book.printDisplayList(sheet, "A1:N25", metrics, false),
  ]) {
    assert.equal(frame.charts.length, 1);
    assert.ok(!frame.charts[0].placeholder);
    assert.equal(magenta(frame).length, baseline ? 0 : 1);
  }
  assert.equal(book.version(), version);
  assert.deepEqual(book.historyState(), history);
}
book.dispose();
checks.push(
  baseline
    ? "The pinned before-change kernel renders both charts without any trendline stroke on screen/profile/print."
    : "Candidate paints one explicit trendline for both line and non-uniform-X scatter charts on screen/profile/print without changing history/version.",
);
if (baseline) {
  fs.writeFileSync(
    `${out}/before.json`,
    JSON.stringify(
      {
        kernelSha256: createHash("sha256").update(kernel).digest("hex"),
        checks,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks }, null, 2));
  process.exit(0);
}

const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? ".local/trend-build" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch({ headless: true });
let page;
try {
  async function open(bytes, name) {
    const context = await browser.newContext({
      locale: "en-US",
      viewport: { width: 1280, height: 900 },
      acceptDownloads: true,
    });
    await context.route(/\/xlsx_wasm_bg-[^/]+\.wasm(?:\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/wasm",
        body: kernel,
      }),
    );
    await context.addInitScript(() => {
      localStorage.setItem(
        "openaec-office-instellingen",
        JSON.stringify({
          taal: "en",
          thema: "light",
          spelling: { controleren: false, autocorrectie: false },
        }),
      );
      window.__trendStrokes = [];
      const begin = CanvasRenderingContext2D.prototype.beginPath;
      CanvasRenderingContext2D.prototype.beginPath = function (...args) {
        this.__trendPoints = [];
        return begin.apply(this, args);
      };
      for (const name of ["moveTo", "lineTo"]) {
        const original = CanvasRenderingContext2D.prototype[name];
        CanvasRenderingContext2D.prototype[name] = function (x, y) {
          this.__trendPoints?.push([x, y]);
          return original.call(this, x, y);
        };
      }
      const stroke = CanvasRenderingContext2D.prototype.stroke;
      CanvasRenderingContext2D.prototype.stroke = function (...args) {
        if (this.strokeStyle === "#ff00ee")
          window.__trendStrokes.push(this.__trendPoints);
        return stroke.apply(this, args);
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
  async function direction(p, rising) {
    await p.waitForFunction(
      (rising) =>
        window.__trendStrokes.some(
          (path) => path?.length >= 2 && path[0][1] > path.at(-1)[1] === rising,
        ),
      rising,
    );
  }
  page = await open(bytes, "linear-trend-source.xlsx");
  await direction(page, true);
  await page.screenshot({ path: `${out}/line-chart.png` });
  const name = page.locator(".rekenblad-naamvak:visible");
  await name.fill("B2");
  await name.press("Enter");
  await page.evaluate(() => {
    window.__trendStrokes = [];
  });
  await page.keyboard.type("8");
  await page.keyboard.press("Enter");
  await direction(page, false);
  await page.evaluate(() => {
    window.__trendStrokes = [];
  });
  await page.keyboard.press("Control+z");
  await direction(page, true);
  checks.push(
    "Production canvas paints the line trend, reverses its slope after editing the source and restores it with one Undo.",
  );
  await page.getByText("Spreiding", { exact: true }).click();
  await page.evaluate(() => {
    window.__trendStrokes = [];
  });
  await page.locator(".rekenblad-naamvak:visible").fill("B2");
  await page.locator(".rekenblad-naamvak:visible").press("Enter");
  await direction(page, true);
  await page.screenshot({ path: `${out}/scatter-chart.png` });
  checks.push(
    "The real worksheet canvas also paints the scatter trend with non-uniform numeric X coordinates.",
  );
  await page.getByText("Lijn", { exact: true }).click();
  await page.locator('[data-testid="xlsx-scroll"]').focus();
  await page.keyboard.press("Control+s");
  const save = page.getByRole("dialog", { name: "Save as", exact: true });
  await save.waitFor();
  const pending = page.waitForEvent("download");
  await save.getByRole("button", { name: "Save", exact: true }).click();
  await (await pending).saveAs(`${out}/saved.xlsx`);
  const saved = fs.readFileSync(`${out}/saved.xlsx`),
    reopened = await open(saved, "linear-trend-saved.xlsx");
  await direction(reopened, true);
  checks.push(
    "Actual browser Save as/download and a fresh browser profile preserve the source and visible trend.",
  );
  assert.deepEqual(errors, []);
  const report = {
    kernelSha256: createHash("sha256").update(kernel).digest("hex"),
    checks,
    errors,
  };
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
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
