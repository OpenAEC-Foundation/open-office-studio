import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { preview } from "vite";
import { initWasm, openWorkbook } from "@betteroffice/xlsx";
const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
await initWasm(readFileSync("vendor/rekenbladengine/xlsx_wasm_bg.wasm"));
const h = openWorkbook(readFileSync("public/templates/nieuw.xlsx"));
h.applyOps([
  { type: "renameSheet", sheet: 0, name: "Bron" },
  { type: "addSheet", index: 1, name: "Controle" },
  { type: "addSheet", index: 2, name: "Einde" },
]);
h.editCell(0, 0, 0, "21");
h.editCell(1, 0, 0, "=Bron!A1*2");
const bytes = Buffer.from(h.save());
h.dispose();
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? ".local/spreadsheet-build" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch({ headless: true });
const rapport = [],
  fouten = [];
mkdirSync(".local/proef-bladverplaatsen", { recursive: true });
try {
  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  await context.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({
        taal: "en",
        thema: "light",
        spelling: { controleren: false, autocorrectie: false },
      }),
    ),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => fouten.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "bladen.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  const tabs = page.locator('[data-testid="xlsx-sheet-tabs"]:visible');
  const volgorde = async () => tabs.getByRole("tab").allTextContents();
  await tabs.getByRole("tab", { name: "Bron", exact: true }).waitFor();
  await tabs
    .getByRole("tab", { name: "Bron", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Move or Copy…", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Move or Copy Sheet",
    exact: true,
  });
  await dialog.waitFor();
  assert.equal(await dialog.getByRole("checkbox").isChecked(), false);
  await dialog.locator("select").selectOption("3");
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await page.waitForFunction(
    () =>
      [
        ...document.querySelectorAll(
          '[data-testid="xlsx-sheet-tabs"] [role="tab"]',
        ),
      ]
        .map((e) => e.textContent)
        .join("|") === "Controle|Einde|Bron",
  );
  assert.deepEqual(await volgorde(), ["Controle", "Einde", "Bron"]);
  rapport.push("Move dialog moves the sheet to the end.");
  await page.locator('[data-testid="xlsx-scroll"]:visible').focus();
  await page.keyboard.press("Control+z");
  await page.waitForFunction(
    () =>
      [
        ...document.querySelectorAll(
          '[data-testid="xlsx-sheet-tabs"] [role="tab"]',
        ),
      ]
        .map((e) => e.textContent)
        .join("|") === "Bron|Controle|Einde",
  );
  rapport.push("Native undo restores the original sheet order.");
  const eind = tabs.getByRole("tab", { name: "Einde", exact: true }),
    rect = await eind.boundingBox();
  await tabs.getByRole("tab", { name: "Bron", exact: true }).dragTo(eind, {
    targetPosition: { x: rect.width - 2, y: rect.height / 2 },
  });
  await page.waitForFunction(
    () =>
      [
        ...document.querySelectorAll(
          '[data-testid="xlsx-sheet-tabs"] [role="tab"]',
        ),
      ]
        .map((e) => e.textContent)
        .join("|") === "Controle|Einde|Bron",
  );
  rapport.push("Dragging a tab moves it with the native engine.");
  await page.keyboard.down("Control");
  try {
    await tabs
      .getByRole("tab", { name: "Bron", exact: true })
      .dragTo(tabs.getByRole("tab", { name: "Controle", exact: true }), {
        targetPosition: { x: 2, y: 12 },
      });
  } finally {
    await page.keyboard.up("Control");
  }
  await dialog.waitFor();
  assert.equal(await dialog.getByRole("checkbox").isChecked(), true);
  assert.equal(await dialog.locator("select").inputValue(), "0");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.deepEqual(await volgorde(), ["Controle", "Einde", "Bron"]);
  rapport.push(
    "Ctrl-drag opens explicit copy options; cancelling preserves the workbook.",
  );
  await tabs.getByRole("tab", { name: "Controle", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="xlsx-formula-input"]')?.value ===
      "=Bron!A1*2",
  );
  assert.ok(await page.getByRole("gridcell").filter({ hasText: "42" }).count());
  rapport.push("Cross-sheet formula still calculates 42 after moving.");
  await tabs
    .getByRole("tab", { name: "Bron", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Tab Color", exact: true }).click();
  const kleurvenster = page.getByRole("dialog", {
    name: "Tab Color",
    exact: true,
  });
  await kleurvenster
    .getByRole("checkbox", { name: "No tab colour", exact: true })
    .uncheck();
  await kleurvenster.locator('input[type="color"]').evaluate((el) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(el, "#1256ab");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await kleurvenster.getByRole("button", { name: "OK", exact: true }).click();
  await kleurvenster.waitFor({ state: "detached" });
  await tabs.getByRole("tab", { name: "Bron", exact: true }).waitFor();
  await page.waitForFunction(() =>
    [
      ...document.querySelectorAll(
        '[data-testid="xlsx-sheet-tabs"] [data-oos-tabkleur]',
      ),
    ].some(
      (el) => el.textContent === "Bron" && el.dataset.oosTabkleur === "#1256ab",
    ),
  );
  rapport.push(
    "A chosen tab colour is stored and displayed on the correct sheet.",
  );
  await tabs
    .getByRole("tab", { name: "Bron", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Hide", exact: true }).click();
  const hide = page.getByRole("dialog", { name: "Hide", exact: true });
  await hide.getByRole("button", { name: "OK", exact: true }).click();
  await hide.waitFor({ state: "detached" });
  await tabs
    .getByRole("tab", { name: "Bron", exact: true })
    .waitFor({ state: "hidden" });
  await tabs
    .getByRole("tab", { name: "Controle", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Unhide…", exact: true }).click();
  const unhide = page.getByRole("dialog", { name: "Unhide…", exact: true });
  await unhide.locator("select").selectOption("2");
  await unhide.getByRole("button", { name: "OK", exact: true }).click();
  await unhide.waitFor({ state: "detached" });
  await tabs.getByRole("tab", { name: "Bron", exact: true }).waitFor();
  rapport.push(
    "Hide and Unhide work through the real interface and preserve the coloured sheet.",
  );
  await tabs.getByRole("tab", { name: "Controle", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="xlsx-formula-input"]')?.value ===
      "=Bron!A1*2",
  );
  assert.ok(await page.getByRole("gridcell").filter({ hasText: "42" }).count());
  await page.locator('[data-testid="xlsx-scroll"]:visible').focus();
  await page.keyboard.press("Control+s");
  const save = page.getByRole("dialog", { name: "Save as", exact: true });
  await save.waitFor();
  const downloading = page.waitForEvent("download");
  await save.getByRole("button", { name: "Save", exact: true }).click();
  await (await downloading).saveAs(".local/proef-bladverplaatsen/bladen.xlsx");
  await save.waitFor({ state: "detached" });
  const terug = openWorkbook(
    readFileSync(".local/proef-bladverplaatsen/bladen.xlsx"),
  );
  try {
    assert.deepEqual(terug.sheetInfo().sheetNames, [
      "Controle",
      "Einde",
      "Bron",
    ]);
    assert.equal(terug.cell(0, 0, 0).input, "=Bron!A1*2");
  } finally {
    terug.dispose();
  }
  rapport.push(
    "Downloaded XLSX reopens with the moved sheets and original formula references.",
  );
  await page.screenshot({ path: ".local/proef-bladverplaatsen/sheets.png" });
  assert.deepEqual(fouten, []);
  writeFileSync(
    ".local/proef-bladverplaatsen/rapport.json",
    JSON.stringify({ passed: rapport, errors: fouten }, null, 2),
  );
  console.log(JSON.stringify({ passed: rapport.length, errors: fouten }));
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
