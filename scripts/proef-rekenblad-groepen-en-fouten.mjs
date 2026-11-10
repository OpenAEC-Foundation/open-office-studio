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
  { row: 0, col: 1, input: "=1/0" },
  { row: 0, col: 2, input: "=C1+1" },
  { row: 1, col: 0, input: "10" },
  { row: 2, col: 0, input: "=A2*2" },
]);
h.applyOps([{ type: "setRowHeight", sheet: 0, row: 2, height: 33 }]);
const bytes = Buffer.from(h.save());
h.dispose();
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? ".local/spreadsheet-build" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch({ headless: true });
const rapport = [],
  fouten = [],
  uit = ".local/proef-groepen-en-fouten";
mkdirSync(uit, { recursive: true });
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
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "groepen.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: bytes,
    });
  const naam = page.locator(".rekenblad-naamvak:visible");
  await naam.waitFor();
  async function gaNaar(a1) {
    await naam.fill(a1);
    await naam.press("Enter");
  }
  await gaNaar("B1");
  const error = page.locator(".rekenblad-formulefout");
  await error.getByText("#DIV/0!", { exact: true }).waitFor();
  await error.locator("summary").click();
  assert.ok((await error.textContent()).includes("divisor"));
  rapport.push("Division by zero has accessible, actionable explanation.");
  await gaNaar("C1");
  await error
    .getByText("Circular reference", { exact: true })
    .first()
    .waitFor();
  rapport.push(
    "Circular reference is distinguished from its numeric placeholder.",
  );
  await gaNaar("D1");
  await error.waitFor({ state: "hidden" });
  rapport.push("Error explanation disappears on a valid empty cell.");
  await gaNaar("A2:A6");
  await page.getByRole("tab", { name: "Sheet", exact: true }).click();
  await page.getByRole("tab", { name: "Sheet", exact: true }).click();
  await page
    .getByRole("button", { name: "Outline groups", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Outline groups",
    exact: true,
  });
  await dialog.waitFor();
  assert.equal(await dialog.getByRole("textbox").inputValue(), "2:6");
  assert.ok((await dialog.textContent()).includes("undo history is cleared"));
  await dialog.getByRole("button", { name: "Group", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  await naam.waitFor();
  await page.getByRole("tab", { name: "Sheet", exact: true }).click();
  await page
    .getByRole("button", { name: "Outline groups", exact: true })
    .click();
  await dialog.waitFor();
  await dialog
    .getByRole("button", { name: "Collapse group 2:6", exact: true })
    .click();
  await dialog.waitFor({ state: "detached" });
  await naam.waitFor();
  await page.getByRole("tab", { name: "Sheet", exact: true }).click();
  await page
    .getByRole("button", { name: "Outline groups", exact: true })
    .click();
  await dialog.waitFor();
  await dialog
    .getByRole("button", { name: "Expand group 2:6", exact: true })
    .waitFor();
  await dialog
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  rapport.push("Row grouping and minus/plus controls survive editor reload.");
  await page.locator('[data-testid="xlsx-scroll"]:visible').focus();
  await page.keyboard.press("Control+s");
  const save = page.getByRole("dialog", { name: "Save as", exact: true });
  await save.waitFor();
  const downloading = page.waitForEvent("download");
  await save.getByRole("button", { name: "Save", exact: true }).click();
  await (await downloading).saveAs(`${uit}/groep.xlsx`);
  await save.waitFor({ state: "detached" });
  const opgeslagen = readFileSync(`${uit}/groep.xlsx`),
    sheet = strFromU8(unzipSync(opgeslagen)["xl/worksheets/sheet1.xml"]);
  assert.ok(/outlineLevel="1"/.test(sheet));
  assert.ok(/collapsed="1"/.test(sheet));
  const terug = openWorkbook(opgeslagen);
  try {
    assert.equal(terug.cell(0, 2, 0).input, "=A2*2");
  } finally {
    terug.dispose();
  }
  rapport.push("Real Save as download preserves outline XML and formulas.");
  await page.screenshot({ path: `${uit}/groepen.png` });
  assert.deepEqual(fouten, []);
  writeFileSync(
    `${uit}/rapport.json`,
    JSON.stringify({ passed: rapport, errors: fouten }, null, 2),
  );
  console.log(JSON.stringify({ passed: rapport.length, errors: fouten }));
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
