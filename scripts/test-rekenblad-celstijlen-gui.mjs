import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, preview } from "vite";
import { initWasm, openWorkbook } from "@betteroffice/xlsx";
const { chromium } = await import(
  process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright"
);
const uit = process.env.OFFICE_TEST_UIT ?? ".local/proef-celstijlen";
await mkdir(uit, { recursive: true });
const ssr = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
  appType: "custom",
});
const { leesCelStijlen } = await ssr.ssrLoadModule(
    "/src/rekenblad/celstijlen.ts",
  ),
  { Pakket } = await ssr.ssrLoadModule("/src/grafieken/pakket.ts");
await initWasm(
  await readFile(
    process.env.OOS_REKENBLAD_WASM ??
      "vendor/rekenbladengine/xlsx_wasm_bg.wasm",
  ),
);
const h = openWorkbook(
  new Uint8Array(await readFile("public/templates/nieuw.xlsx")),
);
h.editCell(0, 1, 1, "2.5");
h.editCell(0, 1, 2, "=B2*2");
h.setNumberFormat(0, "B2", { type: "custom", pattern: "$0.00" });
const source = new Pakket(h.save());
h.dispose();
source.schrijf("customXml/cell-style-probe.xml", "<keep>style-probe</keep>");
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? ".local/dist-spreadsheet" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch(),
  page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    locale: "en-GB",
  });
const report = { steps: [], errors: [] };
page.on("pageerror", (e) => report.errors.push(String(e)));
const step = (s) => {
  report.steps.push(s);
  console.log(s);
};
try {
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({ taal: "en", thema: "forge" }),
    ),
  );
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  async function open(bytes, name) {
    await page
      .locator(".office input[type=file]")
      .first()
      .setInputFiles({
        name,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from(bytes),
      });
  }
  await open(source.inpakken(), "Styles.xlsx");
  await page.evaluate(() => {
    window.proefContext = () => {
      const el = document.querySelector(
        ".office-tabpaneel:not([hidden]) .office-rekenblad-host",
      );
      if (!el) return null;
      for (
        let f = el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      ) {
        const v = f.memoizedProps?.value;
        if (v?.rekenblad?.handle && v.herlaad) return v;
      }
      return null;
    };
    window.proefApi = () => proefContext()?.rekenblad;
  });
  await page.waitForFunction(
    () => {
      try {
        return !!proefApi()?.handle.sheetInfo().sheetNames.length;
      } catch {
        return false;
      }
    },
    null,
    { timeout: 60000 },
  );
  async function kies(row, col) {
    await page.evaluate(
      ({ row, col }) => {
        proefApi().selectCells(0, {
          anchor: { row, col },
          focus: { row, col },
        });
        proefApi().focus();
      },
      { row, col },
    );
  }
  const bytes = async () =>
    new Uint8Array(
      await page.evaluate(async () =>
        Array.from(await proefContext().herlaad.bytes()),
      ),
    );
  async function vervang(actie) {
    await page.evaluate(() => (window.oud = proefApi().handle));
    await actie();
    await page.waitForFunction(
      () => {
        try {
          return (
            !!proefApi() &&
            proefApi().handle !== oud &&
            !!proefApi().handle.sheetInfo().sheetNames.length
          );
        } catch {
          return false;
        }
      },
      null,
      { timeout: 60000 },
    );
  }
  async function stijl() {
    await page.getByRole("tab", { name: "Format", exact: true }).click();
    await page
      .getByRole("button", { name: "Cell styles", exact: true })
      .click();
    const d = page.getByRole("dialog", { name: "Cell styles", exact: true });
    await d.getByLabel("Choose a style", { exact: true }).waitFor();
    return d;
  }
  await kies(1, 1);
  let d = await stijl();
  await d.getByLabel("Choose a style", { exact: true }).selectOption("Good");
  await d.getByLabel("Cell range", { exact: true }).fill("B2:C3");
  await vervang(() =>
    d.getByRole("button", { name: "Apply style", exact: true }).click(),
  );
  assert.equal(
    leesCelStijlen(await bytes()).find((s) => s.naam === "Good").builtinId,
    26,
  );
  const f = await page.evaluate(() =>
    proefApi().handle.selectionFormatting(0, "B2"),
  );
  assert.equal(f.fillColor.toLowerCase(), "#c6efce");
  assert.equal(f.numberFormatPattern, "$0.00");
  assert.equal(
    await page.evaluate(() => proefApi().handle.cell(0, 1, 2).input),
    "=B2*2",
  );
  step(
    "Applies Good through the ribbon and preserves currency formatting and formulas",
  );
  d = await stijl();
  await d
    .getByRole("button", { name: "New style from active cell", exact: true })
    .click();
  await d.getByLabel("Style name", { exact: true }).fill("Project result");
  await d.getByLabel("Font size", { exact: true }).fill("18");
  await d.getByLabel("Bold", { exact: true }).check();
  await d.getByLabel("Number format code", { exact: true }).fill("0.000");
  await vervang(() =>
    d.getByRole("button", { name: "Save", exact: true }).click(),
  );
  assert.ok(
    leesCelStijlen(await bytes()).some((s) => s.naam === "Project result"),
  );
  await kies(3, 3);
  d = await stijl();
  await d
    .getByLabel("Choose a style", { exact: true })
    .selectOption("Project result");
  await d.getByLabel("Cell range", { exact: true }).fill("D4:D5");
  await vervang(() =>
    d.getByRole("button", { name: "Apply style", exact: true }).click(),
  );
  assert.equal(
    await page.evaluate(
      () => proefApi().handle.selectionFormatting(0, "D4").fontSize,
    ),
    18,
  );
  step(
    "Creates a named style from the active cell and applies it to another range",
  );
  d = await stijl();
  await d
    .getByLabel("Choose a style", { exact: true })
    .selectOption("Project result");
  await d.getByRole("button", { name: "Modify style", exact: true }).click();
  await d.getByLabel("Font size", { exact: true }).fill("22");
  await d.getByLabel("Use background colour", { exact: true }).check();
  await d.getByLabel("Background colour", { exact: true }).fill("#eeccaa");
  await vervang(() =>
    d.getByRole("button", { name: "Save", exact: true }).click(),
  );
  const modified = await page.evaluate(() =>
    proefApi().handle.selectionFormatting(0, "D4:D5"),
  );
  assert.equal(modified.fontSize, 22);
  assert.equal(modified.fillColor.toLowerCase(), "#eeccaa");
  assert.equal(modified.bold, true);
  step("Modifying a named style updates its applied cells");
  const saved = await bytes(),
    p = new Pakket(saved);
  assert.equal(
    p.lees("customXml/cell-style-probe.xml"),
    "<keep>style-probe</keep>",
  );
  await page.evaluate(
    (xmls) => {
      for (const [n, xml] of xmls) {
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        if (doc.querySelector("parsererror"))
          throw Error(n + ": " + doc.querySelector("parsererror").textContent);
      }
    },
    p
      .namen()
      .filter((n) => /\.(xml|rels)$/.test(n))
      .map((n) => [n, p.lees(n)]),
  );
  await writeFile(`${uit}/saved.xlsx`, saved);
  await open(saved, "Reopened styles.xlsx");
  await page.waitForFunction(
    () => {
      try {
        return proefApi()?.handle.selectionFormatting(0, "D4").fontSize === 22;
      } catch {
        return false;
      }
    },
    null,
    { timeout: 60000 },
  );
  await kies(3, 3);
  d = await stijl();
  await d
    .getByLabel("Choose a style", { exact: true })
    .selectOption("Project result");
  await page.screenshot({ path: `${uit}/style-picker.png`, fullPage: true });
  assert.equal(
    await page.evaluate(() => proefApi().handle.cell(0, 1, 1).input),
    "2.5",
  );
  assert.equal(
    await page.evaluate(() => proefApi().handle.cell(0, 1, 2).input),
    "=B2*2",
  );
  step(
    "Save/reopen retains named styles, formulas, values, association and unknown parts; strict XML is valid",
  );
  assert.deepEqual(report.errors, []);
} catch (f) {
  report.failure = String(f);
  await page.screenshot({ path: `${uit}/failure.png`, fullPage: true });
  await writeFile(`${uit}/failure.txt`, await page.locator("body").innerText());
  throw f;
} finally {
  await writeFile(`${uit}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
  await ssr.close();
}
