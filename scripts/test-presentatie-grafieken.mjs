import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { initWasm, openPresentation } from "@betteroffice/pptx";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { preview } from "vite";
const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
await initWasm(
  await readFile(
    "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
  ),
);
const output = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-presentatie-grafieken",
);
await mkdir(output, { recursive: true });
const parts = unzipSync(await readFile("public/templates/nieuw.xlsx"));
let sheet = strFromU8(parts["xl/worksheets/sheet1.xml"]);
const data =
  '<sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>Series A</t></is></c><c r="C1" t="inlineStr"><is><t>Series B</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>2025</t></is></c><c r="B2"><v>12</v></c><c r="C2"><v>8</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>2026</t></is></c><c r="B3"><v>14</v></c><c r="C3"><v>9</v></c></row></sheetData>';
sheet = sheet.replace(
  /<sheetData\b[^>]*\/>|<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/,
  data,
);
parts["xl/worksheets/sheet1.xml"] = strToU8(sheet);
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch(),
  context = await browser.newContext({
    viewport: { width: 1500, height: 1050 },
    permissions: ["clipboard-read", "clipboard-write"],
  }),
  page = await context.newPage();
const report = { cases: [], errors: [] };
page.on("pageerror", (e) => report.errors.push(String(e)));
async function run(name, test) {
  await test();
  report.cases.push(name);
  console.log(`OK: ${name}`);
}
const ready = (kind) =>
  page.waitForFunction((k) => {
    try {
      return !!proefApis()?.[k]?.handle;
    } catch {
      return false;
    }
  }, kind);
const tab = () =>
  page
    .locator('button[role="tab"]:visible')
    .filter({ hasText: /^Insert$/ })
    .click();
const bytes = async () =>
  new Uint8Array(
    await page.evaluate(() =>
      Array.from(proefApis().presentatie.handle.save()),
    ),
  );
const charts = (b) =>
  Object.entries(unzipSync(b))
    .filter(([p]) => /^ppt\/charts\/[^/]+\.xml$/.test(p))
    .map(([p, v]) => ({ p, xml: strFromU8(v) }));
async function apply(d, kind, button) {
  await page.evaluate((k) => (window.voorGrafiek = proefApis()[k]), kind);
  await d.getByRole("button", { name: button, exact: true }).click();
  await d.waitFor({ state: "hidden" });
  await page.waitForFunction((k) => {
    try {
      return proefApis()?.[k] && proefApis()[k] !== window.voorGrafiek;
    } catch {
      return false;
    }
  }, kind);
}
try {
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({
        taal: "en",
        thema: "forge",
        spelling: { controleren: false },
      }),
    ),
  );
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name: "Source.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(zipSync(parts)),
    });
  await page.evaluate(() => {
    window.proefApis = () => {
      const el = document.querySelector(
        ".office-tabpaneel:not([hidden]) .office-rekenblad,.office-tabpaneel:not([hidden]) .office-presentatie",
      );
      if (!el) return null;
      for (
        let f = el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      )
        if (
          f.memoizedProps?.value?.rekenblad ||
          f.memoizedProps?.value?.presentatie
        )
          return f.memoizedProps.value;
      return null;
    };
  });
  await ready("rekenblad");
  await run(
    "Create the source chart through the Spreadsheet chart editor",
    async () => {
      await tab();
      await page.getByRole("button", { name: "Chart", exact: true }).click();
      const d = page.getByRole("dialog", { name: "Insert chart", exact: true });
      await d.waitFor();
      const name = await page.evaluate(
        () => proefApis().rekenblad.handle.sheetInfo().sheetNames[0],
      );
      await d
        .getByLabel("Cell range", { exact: true })
        .fill(`'${name.replaceAll("'", "''")}'!A1:C3`);
      await d.getByLabel("Cell range", { exact: true }).press("Enter");
      await d.getByLabel("Title", { exact: true }).fill("Source chart");
      await d
        .getByRole("button", { name: "Line with markers", exact: true })
        .click();
      await apply(d, "rekenblad", "Insert");
    },
  );
  let payload;
  await run(
    "Copy current source values instead of stale chart cache values",
    async () => {
      const result = await page.evaluate(async () => {
        const api = proefApis().rekenblad,
          h = api.handle;
        const r = await api.applyEdits({
          expectVersion: await api.version(),
          steps: [
            {
              op: "setCellValues",
              target: {
                sheetId: h.sheetInfo().sheetIds[0],
                range: { kind: "a1", a1: "B2" },
              },
              values: [[{ kind: "number", value: 777 }]],
            },
          ],
        });
        window.sourceXlsx = api;
        return r.ok;
      });
      assert.equal(result, true);
      await tab();
      await page
        .getByRole("button", { name: "Copy chart", exact: true })
        .click();
      const d = page.getByRole("dialog", { name: "Copy chart", exact: true });
      await d.waitFor();
      await d.getByRole("button", { name: "Copy chart", exact: true }).click();
      await d.waitFor({ state: "hidden" });
      payload = await page.evaluate(() => navigator.clipboard.readText());

      assert.ok(/^OpenOfficeStudio.Chart\/1\r?\n/.test(payload));
      const clip = unzipSync(Buffer.from(payload.split("\n")[1], "base64"));
      assert.ok(strFromU8(clip["chart/chart.xml"]).includes(">777<"));
      assert.ok(!Object.keys(clip).some((p) => p.includes("worksheets")));
    },
  );
  await page
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name: "Charts.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: await readFile("public/templates/nieuw.pptx"),
    });
  await ready("presentatie");

  await run(
    "Actual Ctrl+V pastes an editable chart with an embedded data sheet",
    async () => {
      await page
        .locator(
          '.office-tabpaneel:not([hidden]) canvas[data-testid="pptx-slide-canvas"]',
        )
        .last()
        .click();
      await page.keyboard.press("Control+v");
      const d = page.getByRole("dialog", { name: "Insert chart", exact: true });
      await d.waitFor();
      assert.equal(
        await d
          .getByLabel("Value row 1, series 1", { exact: true })
          .inputValue(),
        "777",
      );
      await d.getByLabel("Value row 1, series 1", { exact: true }).fill("888");
      await d.getByLabel("Title", { exact: true }).fill("Pasted chart");
      await page.screenshot({ path: resolve(output, "chart-paste.png") });
      await apply(d, "presentatie", "Insert");
      const b = await bytes(),
        list = charts(b);
      assert.equal(list.length, 1);
      assert.ok(list[0].xml.includes("lineChart"));
      assert.ok(list[0].xml.includes(">888<"));
      assert.ok(Object.keys(unzipSync(b)).some((p) => p.endsWith(".xlsx")));
    },
  );
  await run(
    "Edit existing chart type, formatting and embedded data through the shared component",
    async () => {
      await tab();
      await page
        .getByRole("button", { name: "Edit chart", exact: true })
        .click();
      const d = page.getByRole("dialog", { name: "Edit chart", exact: true });
      await d.waitFor();
      await d.getByRole("button", { name: "Column", exact: true }).click();
      await d.getByLabel("Title", { exact: true }).fill("Edited chart");
      await d.getByLabel("Value row 2, series 2", { exact: true }).fill("901");
      await apply(d, "presentatie", "Update");
      const list = charts(await bytes());
      assert.ok(list[0].xml.includes("barChart"));
      assert.ok(list[0].xml.includes("Edited chart"));
      assert.ok(list[0].xml.includes(">901<"));
      const original = await page.evaluate(async () => {
        const api = window.sourceXlsx;
        const r = await api.readCells({
          ranges: [
            {
              sheetId: api.handle.sheetInfo().sheetIds[0],
              range: { kind: "a1", a1: "B2" },
            },
          ],
        });
        return r.ranges[0].cells[0][0].value.value;
      });
      assert.equal(original, 777);
    },
  );
  await run(
    "Paste button previews copied charts and invalid clipboard content causes no mutation",
    async () => {
      await tab();
      await page.evaluate(() => navigator.clipboard.writeText("Ordinary text"));
      const before = charts(await bytes()).length;
      await page
        .getByRole("button", { name: "Paste chart", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "supported chart copy" })
        .waitFor();
      assert.equal(charts(await bytes()).length, before);
      await page.evaluate((s) => navigator.clipboard.writeText(s), payload);
      await page
        .getByRole("button", { name: "Paste chart", exact: true })
        .click();
      const d = page.getByRole("dialog", { name: "Insert chart", exact: true });
      await d.waitFor();
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(charts(await bytes()).length, before);
    },
  );
  await run(
    "Insert a second native presentation chart with editable data",
    async () => {
      await tab();
      await page.getByRole("button", { name: "Chart", exact: true }).click();
      const d = page.getByRole("dialog", { name: "Insert chart", exact: true });
      await d.waitFor();
      await d.getByLabel("Title", { exact: true }).fill("Native chart");
      await d.getByLabel("Value row 1, series 1", { exact: true }).fill("42");
      await apply(d, "presentatie", "Insert");
      assert.equal(charts(await bytes()).length, 2);
    },
  );
  await run(
    "Save As and independent engine/app reopen preserve both charts and data",
    async () => {
      await page.keyboard.press("Control+s");
      const d = page.getByRole("dialog", { name: "Save as", exact: true });
      await d.waitFor();
      const pending = page.waitForEvent("download");
      await d.getByRole("button", { name: "Save", exact: true }).click();
      const dl = await pending,
        path = resolve(output, "charts-saved.pptx");
      await dl.saveAs(path);
      const b = await readFile(path),
        h = openPresentation(b);
      try {
        h.registerFont({
          family: "Arial",
          bytes: await readFile(
            "node_modules/@betteroffice/fonts/assets/LiberationSans-Regular.ttf",
          ),
        });
        assert.equal(
          h.layoutSlide(0).primitives.filter((p) => p.kind === "chart").length,
          2,
        );
        assert.ok(charts(h.save()).some((c) => c.xml.includes(">901<")));
      } finally {
        h.dispose();
      }
      await page.evaluate(() => (window.voorGrafiek = proefApis().presentatie));
      await page
        .locator(".office input[type=file]")
        .first()
        .setInputFiles(path);
      await page.waitForFunction(() => {
        try {
          return (
            proefApis()?.presentatie &&
            proefApis().presentatie !== window.voorGrafiek
          );
        } catch {
          return false;
        }
      });
      assert.equal(charts(await bytes()).length, 2);
      await page
        .locator(
          '.office-tabpaneel:not([hidden]) canvas[data-testid="pptx-slide-canvas"]',
        )
        .last()
        .click();
      await page.keyboard.press("Control+v");
      const paste = page.getByRole("dialog", {
        name: "Insert chart",
        exact: true,
      });
      await paste.waitFor();
      assert.equal(await paste.count(), 1);
      await paste.getByRole("button", { name: "Cancel", exact: true }).click();
    },
  );
  assert.deepEqual(report.errors, []);
} catch (e) {
  await page.screenshot({ path: resolve(output, "failure.png") });
  throw e;
} finally {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
