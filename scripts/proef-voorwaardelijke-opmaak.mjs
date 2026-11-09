import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { preview } from "vite";
import { initWasm, openWorkbook } from "@betteroffice/xlsx";
import { unzipSync, strFromU8 } from "fflate";
const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
await initWasm(readFileSync("vendor/rekenbladengine/xlsx_wasm_bg.wasm"));
const h = openWorkbook(readFileSync("public/templates/nieuw.xlsx"));
h.editCells(0, [
  { row: 0, col: 0, input: "10" },
  { row: 1, col: 0, input: "2" },
  { row: 2, col: 0, input: "=A1+A2" },
]);
const bytes = Buffer.from(h.save());
h.dispose();
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? ".local/spreadsheet-build" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch({ headless: true });
const uit = ".local/proef-voorwaardelijke-opmaak",
  rapport = [],
  fouten = [];
mkdirSync(uit, { recursive: true });
try {
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
    window.__cfVullingen = [];
    const origineel = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (window.__cfVullingen.length > 4000)
        window.__cfVullingen.splice(0, 2000);
      window.__cfVullingen.push(String(this.fillStyle).toLowerCase());
      return origineel.apply(this, args);
    };
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => fouten.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  async function openFile(buffer, name = "regels.xlsx") {
    await page.locator('input[type="file"]').first().setInputFiles({
      name,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    });
    await page.locator(".rekenblad-naamvak:visible").waitFor();
  }
  await openFile(bytes);
  const naam = page.locator(".rekenblad-naamvak:visible");
  async function gaNaar(a1) {
    await naam.fill(a1);
    await naam.press("Enter");
  }
  async function venster() {
    await page.getByRole("tab", { name: "Format", exact: true }).click();
    await page
      .getByRole("button", { name: "Manage rules…", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Conditional formatting",
      exact: true,
    });
    await dialog.waitFor();
    return dialog;
  }
  await gaNaar("A1:A3");
  let d = await venster();
  assert.equal(
    await d.getByLabel("Applies to", { exact: true }).inputValue(),
    "A1:A3",
  );
  await d.getByLabel("Value, text or formula", { exact: true }).fill("5");
  await d.getByLabel("Fill", { exact: true }).fill("#ffff00");
  await d.getByLabel("Font colour", { exact: true }).fill("#ff0000");
  await d.getByLabel("Bold", { exact: true }).check();
  await d.getByRole("button", { name: "Add rule", exact: true }).click();
  await d.getByRole("checkbox", { name: "Stop if true", exact: true }).check();
  await page.screenshot({ path: `${uit}/regelvenster.png` });
  await d.getByRole("button", { name: "OK", exact: true }).click();
  await d.waitFor({ state: "detached" });
  await page.waitForFunction(() => window.__cfVullingen.includes("#ffff00"));
  rapport.push(
    "A real rule is added in the ribbon dialog and paints its fill on the production canvas.",
  );
  await page.screenshot({ path: `${uit}/opmaak.png` });
  d = await venster();
  assert.equal(await d.locator(".rekenblad-cf-regels li").count(), 1);
  await d.getByRole("button", { name: "Edit", exact: true }).click();
  await d
    .getByLabel("Formula (English function names)", { exact: true })
    .fill("AND(ROW()=3,A3>5)");
  await d.getByRole("button", { name: "Update rule", exact: true }).click();
  await d.getByLabel("Applies to 1", { exact: true }).fill("A1:A4");
  await d.getByRole("button", { name: "OK", exact: true }).click();
  await d.waitFor({ state: "detached" });
  rapport.push(
    "Editing uses the source cell context, including ROW(), and preserves StopIfTrue.",
  );
  const grid = page.getByRole("grid").first();
  await grid.focus();
  await page.keyboard.press("Control+z");
  d = await venster();
  assert.ok(
    (await d.locator(".rekenblad-cf-regels").textContent()).includes("A1>(5)"),
  );
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
  await grid.focus();
  await page.keyboard.press("Control+y");
  d = await venster();
  assert.ok(
    (await d.locator(".rekenblad-cf-regels").textContent()).includes("ROW()=3"),
  );
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
  rapport.push(
    "Undo and redo restore the whole rule edit as one native history operation.",
  );
  await grid.focus();
  await page.keyboard.press("Control+s");
  const save = page.getByRole("dialog", { name: "Save as", exact: true });
  await save.waitFor();
  const pending = page.waitForEvent("download");
  await save.getByRole("button", { name: "Save", exact: true }).click();
  const download = await pending;
  const path = `${uit}/regels.xlsx`;
  await download.saveAs(path);
  const saved = readFileSync(path);
  const terug = openWorkbook(saved);
  assert.equal(terug.sheetCount(), 1);
  assert.equal(terug.conditionalFormats(0).length, 1);
  assert.equal(terug.conditionalFormats(0)[0].range, "A1:A4");
  assert.equal(terug.cell(0, 2, 0).input, "=A1+A2");
  const lezing = terug.readCells({
    ranges: [
      {
        sheetId: terug.sheetInfo().sheetIds[0],
        range: { kind: "a1", a1: "A3" },
      },
    ],
  });
  assert.ok(lezing.ok);
  assert.deepEqual(lezing.ranges[0].cells[0][0].value, {
    kind: "number",
    value: 12,
  });
  assert.ok(terug.conditionalFormats(0)[0].formulas[0].includes("ROW()=3"));
  terug.dispose();
  const xml = strFromU8(unzipSync(saved)["xl/worksheets/sheet1.xml"]);
  assert.match(xml, /stopIfTrue="1"/);
  assert.ok(xml.includes("ROW()=3"));
  rapport.push(
    "The actual Save as download reopens in the native core with its rule, style, formulas and StopIfTrue, without scratch sheets.",
  );
  await openFile(saved, "heropend.xlsx");
  d = await venster();
  assert.equal(await d.locator(".rekenblad-cf-regels li").count(), 1);
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  await d.getByRole("button", { name: "OK", exact: true }).click();
  await d.waitFor({ state: "detached" });
  d = await venster();
  assert.equal(await d.locator(".rekenblad-cf-regels li").count(), 0);
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
  rapport.push(
    "Reopened rules remain editable and can be deleted through the manager.",
  );
  assert.deepEqual(fouten, []);
  writeFileSync(
    `${uit}/rapport.json`,
    JSON.stringify({ rapport, fouten }, null, 2),
  );
  console.log(JSON.stringify({ rapport, fouten }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
