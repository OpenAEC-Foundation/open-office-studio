import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, preview } from "vite";
import { initWasm, openWorkbook } from "@betteroffice/xlsx";
const { chromium } = await import(
  process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright"
);
const uit = process.env.OFFICE_TEST_UIT ?? ".local/proef-tabellen";
await mkdir(uit, { recursive: true });
const ssr = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
  appType: "custom",
});
const { leesTabellen } = await ssr.ssrLoadModule("/src/rekenblad/tabellen.ts"),
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
h.editCells(0, [
  { row: 0, col: 0, input: "Item" },
  { row: 0, col: 1, input: "Amount" },
  { row: 1, col: 0, input: "First" },
  { row: 1, col: 1, input: "2" },
  { row: 2, col: 0, input: "Second" },
  { row: 2, col: 1, input: "3" },
]);
h.setNumberFormat(0, "B2:B3", { type: "custom", pattern: "$0.00" });
const source = new Pakket(h.save());
h.dispose();
source.schrijf("customXml/table-probe.xml", "<keep>table-probe</keep>");
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
  async function tabel() {
    await page.getByRole("tab", { name: "Format", exact: true }).click();
    await page
      .getByRole("button", { name: "Format as table", exact: true })
      .click();
    const d = page.getByRole("dialog", {
      name: "Format as table",
      exact: true,
    });
    await d.getByLabel("Table name", { exact: true }).waitFor();
    return d;
  }
  await kies(0, 0);
  let d = await tabel();
  await d.getByLabel("Table name", { exact: true }).fill("Sales");
  await d
    .getByLabel("Header and data range (without totals)", { exact: true })
    .fill("A1:B3");
  await vervang(() =>
    d.getByRole("button", { name: "Save", exact: true }).click(),
  );
  assert.equal(leesTabellen(await bytes())[0][0].naam, "Sales");
  await page.locator(".rekenblad-tabelpijl").first().waitFor();
  step(
    "Creates a structured styled table through the ribbon with header filter buttons",
  );
  await page.evaluate(() =>
    proefApi().handle.editCell(0, 0, 4, "=SUM(Sales[Amount])"),
  );
  await kies(3, 1);
  await page.keyboard.type("7");
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => proefApi().handle.cell(0, 3, 1).input === "7",
  );
  assert.equal(leesTabellen(await bytes())[0][0].ref, "A1:B4");
  await page.evaluate(() => proefApi().handle.undo());
  assert.equal(leesTabellen(await bytes())[0][0].ref, "A1:B3");
  await page.evaluate(() => proefApi().handle.redo());
  step(
    "Typing in the next row expands the table; Undo and Redo include geometry",
  );
  await kies(0, 0);
  d = await tabel();
  await d.getByLabel("Totals row", { exact: true }).check();
  await d.getByLabel("Table style", { exact: true }).selectOption("green");
  await vervang(() =>
    d.getByRole("button", { name: "Save", exact: true }).click(),
  );
  assert.equal(leesTabellen(await bytes())[0][0].ref, "A1:B5");
  step("Adds a totals row while preserving the expanded data range");
  const waarde = (ref) =>
    page.evaluate((ref) => {
      const h = proefApi().handle,
        r = h.readCells({
          ranges: [
            {
              sheetId: h.sheetInfo().sheetIds[0],
              range: { kind: "a1", a1: ref },
            },
          ],
        });
      if (!r.ok) throw Error(r.failure.message);
      return r.ranges[0].cells[0][0].value;
    }, ref);
  assert.deepEqual(await waarde("B5"), { kind: "number", value: 12 });
  await page.locator(".rekenblad-tabelpijl[data-kolom='0']").click();
  d = page.locator(".rekenblad-filtermenu");
  await d.getByLabel("Second", { exact: true }).uncheck();
  await vervang(() =>
    d.getByRole("button", { name: "OK", exact: true }).click(),
  );
  assert.equal(
    leesTabellen(await bytes())[0][0].criteria.get(0).soort,
    "waarden",
  );
  assert.deepEqual(await waarde("B5"), { kind: "number", value: 9 });
  await kies(0, 1);
  await page.keyboard.press("Alt+ArrowDown");
  d = page.locator(".rekenblad-filtermenu");
  await vervang(() =>
    d
      .getByRole("button", { name: "Sort largest to smallest", exact: true })
      .click(),
  );
  assert.deepEqual(await waarde("B2"), { kind: "number", value: 7 });
  assert.deepEqual(await waarde("B5"), { kind: "number", value: 9 });
  await page.locator(".rekenblad-tabelpijl[data-kolom='1']").click();
  d = page.locator(".rekenblad-filtermenu");
  await vervang(() =>
    d
      .getByRole("button", { name: "Sort smallest to largest", exact: true })
      .click(),
  );
  assert.deepEqual(await waarde("B2"), { kind: "number", value: 2 });
  step(
    "Keyboard filter access and sorting retain data, criteria and visible-row totals",
  );
  let saved = await bytes(),
    p = new Pakket(saved);
  await page.evaluate(
    (xmls) => {
      for (const [n, xml] of xmls) {
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        if (doc.querySelector("parsererror"))
          throw Error(n + ":" + doc.querySelector("parsererror").textContent);
      }
    },
    p
      .namen()
      .filter((n) => /\.(xml|rels)$/.test(n))
      .map((n) => [n, p.lees(n)]),
  );
  assert.equal(p.lees("customXml/table-probe.xml"), "<keep>table-probe</keep>");
  await writeFile(`${uit}/saved.xlsx`, saved);
  await page.screenshot({ path: `${uit}/table-filter.png`, fullPage: true });
  step(
    "Header filtering stores standard table criteria and produces strict, valid XML",
  );
  await open(saved, "Reopened tables.xlsx");
  await page
    .locator(".office-tabpaneel:not([hidden]) .rekenblad-tabelpijl")
    .first()
    .waitFor();
  await page
    .locator(
      ".office-tabpaneel:not([hidden]) .rekenblad-tabelpijl[data-kolom='0']",
    )
    .click();
  d = page.locator(".rekenblad-filtermenu");
  assert.equal(
    await d.getByLabel("Second", { exact: true }).isChecked(),
    false,
  );
  step(
    "Reopening retains structured tables, custom table styles, totals and filter choices",
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
