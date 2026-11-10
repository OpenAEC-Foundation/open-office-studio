import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, preview } from "vite";
import { initWasm, openWorkbook } from "@betteroffice/xlsx";
const { chromium } = await import(
  process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright"
);
const uit = process.env.OFFICE_TEST_UIT ?? ".local/proef-draaitabel-gui";
await mkdir(uit, { recursive: true });
const ssr = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
  appType: "custom",
});
const { leesDraaitabellen } = await ssr.ssrLoadModule(
    "/src/rekenblad/draaitabellen.ts",
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
const data = [
  ["Region", "Product", "Amount", "Date", "Units"],
  ["North", "A", "10", "46024", "1"],
  ["South", "A", "20", "46056", "2"],
  ["North", "B", "40", "46026", "4"],
  ["North", "A", "30", "46086", "3"],
  ["South", "B", "50", "46118", "5"],
];
h.editCells(
  0,
  data.flatMap((r, row) => r.map((input, col) => ({ row, col, input }))),
);
h.setNumberFormat(0, "D2:D6", { type: "custom", pattern: "yyyy-mm-dd" });
const source = new Pakket(h.save());
h.dispose();
source.schrijf("customXml/table-probe.xml", "<keep>table-probe</keep>");
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? ".local/dist-pivot" },
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
  await open(source.inpakken(), "Tables.xlsx");
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

  async function kies(blad, row, col) {
    await page.evaluate(
      ({ blad, row, col }) => {
        proefApi().selectCells(blad, {
          anchor: { row, col },
          focus: { row, col },
        });
        proefApi().focus();
      },
      { blad, row, col },
    );
    await page.waitForFunction(
      ({ blad, row, col }) => {
        const s = proefContext()?.rekenbladLaag?.selectie();
        return (
          s?.sheetIndex === blad &&
          s.cells?.focus.row === row &&
          s.cells?.focus.col === col
        );
      },
      { blad, row, col },
    );
  }
  const bytes = async () =>
    new Uint8Array(
      await page.evaluate(async () =>
        Array.from(await proefContext().herlaad.bytes()),
      ),
    );
  const waarde = (blad, ref) =>
    page.evaluate(
      ({ blad, ref }) => {
        const h = proefApi().handle,
          r = h.readCells({
            ranges: [
              {
                sheetId: h.sheetInfo().sheetIds[blad],
                range: { kind: "a1", a1: ref },
              },
            ],
          });
        if (!r.ok) throw Error(r.failure.message);
        return r.ranges[0].cells[0][0].value;
      },
      { blad, ref },
    );
  async function venster() {
    await page.getByRole("tab", { name: "Data", exact: true }).click();
    await page
      .getByRole("button", { name: "Pivot table", exact: true })
      .click();
    const d = page.getByRole("dialog", { name: "Pivot table", exact: true });
    await d.getByLabel("Pivot name", { exact: true }).waitFor();
    await page.waitForFunction(
      () => !document.querySelector(".draaitabel-formulier input").disabled,
    );
    return d;
  }
  async function bewaar(d, name) {
    await page.evaluate(() => (window.oud = proefApi().handle));
    await d.getByRole("button", { name, exact: true }).click();
    await page.waitForFunction(
      () => proefApi()?.handle && proefApi().handle !== oud,
      null,
      { timeout: 60000 },
    );
  }
  await kies(0, 0, 0);
  let d = await venster();
  await d
    .getByLabel("Source range including headers", { exact: true })
    .fill("A1:E6");
  await d.getByRole("button", { name: "Read fields", exact: true }).click();
  await d.getByLabel("Pivot name", { exact: true }).fill("SalesPivot");
  await d.getByLabel("New sheet name", { exact: true }).fill("Summary");
  for (const [field, zone] of [
    ["Region", "rijen"],
    ["Product", "kolommen"],
    ["Amount", "waarden"],
  ]) {
    await d
      .locator(".draaitabel-bronvelden span")
      .filter({ hasText: new RegExp("^" + field + "$") })
      .dragTo(d.locator(`[data-pivot-zone="${zone}"]`));
    await d
      .locator(`[data-pivot-zone="${zone}"] [data-pivot-field="${field}"]`)
      .waitFor();
  }
  await bewaar(d, "Create pivot table");
  assert.equal(leesDraaitabellen(await bytes())[0].naam, "SalesPivot");
  assert.deepEqual(await waarde(1, "D5"), { kind: "number", value: 150 });
  step(
    "Creates a real pivot through drag and drop with cached worksheet results",
  );
  await page.evaluate(() => proefApi().handle.editCell(0, 1, 2, "100"));
  await kies(1, 0, 0);
  d = await venster();
  await bewaar(d, "Refresh pivot table");
  assert.deepEqual(await waarde(1, "D5"), { kind: "number", value: 240 });
  step("Refreshes aggregates after source edits");
  await kies(1, 0, 0);
  d = await venster();
  let row = d.locator('[data-pivot-zone="rijen"]');
  await row.getByLabel("Member order", { exact: true }).selectOption("desc");
  await row.locator("summary").click();
  await row.getByLabel("North", { exact: true }).uncheck();
  await bewaar(d, "Refresh pivot table");
  assert.deepEqual(await waarde(1, "D4"), { kind: "number", value: 70 });
  assert.deepEqual(await waarde(1, "A3"), { kind: "text", value: "South" });
  step("Filters axis members and stores sort order in the pivot definition");
  await kies(1, 0, 0);
  d = await venster();
  row = d.locator('[data-pivot-zone="rijen"]');
  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await d.getByLabel("Field", { exact: true }).selectOption("3");
  await d.getByRole("button", { name: "Add to Rows", exact: true }).click();
  await row.getByLabel("Grouping", { exact: true }).selectOption("month");
  await d
    .locator('[data-pivot-zone="waarden"]')
    .getByLabel("Show values as", { exact: true })
    .selectOption("grandPercent");
  await d.getByLabel("Field", { exact: true }).selectOption("4");
  await d.getByRole("button", { name: "Add to Filters", exact: true }).click();
  const filter = d.locator('[data-pivot-zone="filters"]');
  await filter.locator("summary").click();
  await filter
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await filter.getByLabel("1", { exact: true }).check();
  await bewaar(d, "Refresh pivot table");
  const saved = await bytes(),
    tables = leesDraaitabellen(saved);
  assert.equal(tables[0].keuze.rijen[0].groep.eenheid, "month");
  assert.equal(tables[0].keuze.waarden[0].weergave, "grandPercent");
  const p = new Pakket(saved);
  assert.match(p.lees(tables[0].cachePad), /groupBy="months"/);
  await writeFile(`${uit}/saved.xlsx`, saved);
  await page.screenshot({ path: `${uit}/pivot.png`, fullPage: true });
  step("Groups dates and displays percentages using standard pivot fields");
  await page.evaluate(() => (window.voorHeropen = proefApi().handle));
  await open(saved, "Reopened pivot.xlsx");
  await page.waitForFunction(
    () => proefApi()?.handle && proefApi().handle !== voorHeropen,
  );
  await kies(1, 0, 0);
  d = await venster();
  assert.equal(
    await d
      .locator('[data-pivot-zone="rijen"]')
      .getByLabel("Grouping", { exact: true })
      .inputValue(),
    "month",
  );
  assert.equal(
    await d
      .locator('[data-pivot-zone="waarden"]')
      .getByLabel("Show values as", { exact: true })
      .inputValue(),
    "grandPercent",
  );
  step("Reopens the saved pivot with its editable field layout");
  await d
    .locator(".rekenblad-knoppen")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await d.waitFor({ state: "hidden" });
  let imported = new Pakket(saved);
  const def = tables[0].pad;
  imported.schrijf(
    def,
    imported.lees(def).replace(/<extLst>[\s\S]*?<\/extLst>/, ""),
  );
  if (process.env.OOS_PIVOT_NATIVE_IMPORT)
    imported = new Pakket(
      new Uint8Array(await readFile(process.env.OOS_PIVOT_NATIVE_IMPORT)),
    );
  await page.evaluate(() => (window.voorHeropen = proefApi().handle));
  await open(imported.inpakken(), "Imported pivot.xlsx");
  await page.waitForFunction(
    () => proefApi()?.handle && proefApi().handle !== voorHeropen,
  );
  await kies(1, 0, 0);
  await page.getByRole("tab", { name: "Data", exact: true }).click();
  await page.getByRole("button", { name: "Pivot table", exact: true }).click();
  d = page.getByRole("dialog", { name: "Pivot table", exact: true });
  await d
    .getByRole("status")
    .filter({ hasText: "This imported pivot is preserved" })
    .waitFor();
  assert.equal(
    await d
      .getByRole("button", { name: "Refresh pivot table", exact: true })
      .count(),
    0,
  );
  const preserved = new Pakket(await bytes());
  assert.equal(leesDraaitabellen(preserved)[0].keuze, null);
  for (const n of imported
    .namen()
    .filter((n) => /^xl\/pivot(Cache|Tables)\//.test(n)))
    assert.equal(preserved.lees(n), imported.lees(n));
  step(
    "Preserves an imported pivot and shows its existing layout as read-only",
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
