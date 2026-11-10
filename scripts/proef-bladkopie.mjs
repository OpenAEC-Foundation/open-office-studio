/** Production UI regression: copy a rich sheet, edit it, download and reopen. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer, preview } from "vite";
import { initWasm, openWorkbook } from "@betteroffice/xlsx";
const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
const uit = ".local/proef-bladkopie";
fs.mkdirSync(uit, { recursive: true });
await initWasm(fs.readFileSync("vendor/rekenbladengine/xlsx_wasm_bg.wasm"));
const lader = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let bytes, leesTekenobjecten, leesCelnotities, leesDiscussies, lijstGrafieken;
try {
  const teken = await lader.ssrLoadModule("/src/rekenblad/tekenobjecten.ts");
  const notities = await lader.ssrLoadModule("/src/rekenblad/celnotities.ts");
  const discussies = await lader.ssrLoadModule("/src/rekenblad/discussies.ts");
  const grafieken = await lader.ssrLoadModule("/src/grafieken/documenten.ts");
  const model = await lader.ssrLoadModule("/src/grafieken/model.ts");
  ({ leesTekenobjecten } = teken);
  ({ leesCelnotities } = notities);
  ({ leesDiscussies } = discussies);
  ({ lijstGrafieken } = grafieken);
  const h = openWorkbook(fs.readFileSync("public/templates/nieuw.xlsx"));
  h.editCells(0, [
    { row: 0, col: 0, input: "7" },
    { row: 0, col: 1, input: "='Blad 1'!A1*2" },
    { row: 1, col: 0, input: "Category" },
    { row: 1, col: 1, input: "Values" },
    { row: 2, col: 0, input: "One" },
    { row: 2, col: 1, input: "7" },
    { row: 3, col: 0, input: "Two" },
    { row: 3, col: 1, input: "8" },
  ]);
  bytes = h.save();
  h.dispose();
  const plek = { row: 5, col: 4, x: 0, y: 0, breedte: 180, hoogte: 70 };
  bytes = teken.voegTekenobjectToe(bytes, 0, {
    naam: "Copy text",
    tekst: "Keep this text",
    plek,
  });
  bytes = teken.voegTekenobjectToe(bytes, 0, {
    naam: "Copy picture",
    plek: { ...plek, row: 10 },
    afbeelding: Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
        "base64",
      ),
    ),
  });
  bytes = notities.schrijfCelnotitie(bytes, 0, "D2", {
    auteur: "Anna",
    tekst: "Preserve note",
    zichtbaar: false,
  });
  bytes = discussies.wijzigDiscussie(bytes, 0, {
    soort: "nieuw",
    cel: "D3",
    auteur: "Anna",
    tekst: "Preserve discussion",
  });
  bytes = grafieken.voegGrafiekToeXlsx(
    bytes,
    model.standaardModel({
      ...model.gegevensUitRaster(
        [
          ["Category", "Values"],
          ["One", 7],
          ["Two", 8],
        ],
        { koprij: true, kopkolom: true, reeksenIn: "kolommen" },
        { blad: "Blad 1", top: 1, left: 0 },
      ),
    }),
    { blad: 0, row: 16, col: 0 },
  ).bytes;
  fs.writeFileSync(`${uit}/source.xlsx`, bytes);
} finally {
  await lader.close();
}
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? ".local/copy61-build" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch({ headless: true });
const rapport = [],
  fouten = [];
let page;
try {
  async function open(bytes, name) {
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
    const p = await context.newPage();
    p.on("pageerror", (e) => fouten.push(e.message));
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
    await p
      .locator('[data-testid="xlsx-sheet-tabs"] [data-oos-blad="0"]')
      .waitFor();
    return p;
  }
  page = await open(bytes, "source.xlsx");
  const tabs = page.locator('[data-testid="xlsx-sheet-tabs"] [data-oos-blad]');
  async function copyDialog() {
    await tabs.first().click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "Move or Copy…", exact: true })
      .click();
    return page.getByRole("dialog", {
      name: "Move or Copy Sheet",
      exact: true,
    });
  }
  let dialog = await copyDialog();
  await dialog.getByLabel("Create a copy", { exact: true }).check();
  assert.match(await dialog.textContent(), /undo history is cleared/);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await tabs.count(), 1);
  rapport.push(
    "Cancel leaves the source unchanged after the visible undo-history warning.",
  );
  dialog = await copyDialog();
  await dialog.getByLabel("Create a copy", { exact: true }).check();
  await dialog.getByLabel("Name of the copy", { exact: true }).fill("Blad 1");
  await dialog.getByRole("button", { name: "Copy", exact: true }).click();
  await dialog
    .locator('[role="status"]')
    .filter({ hasText: /already|bestaat/i })
    .waitFor();
  assert.equal(await tabs.count(), 1);
  rapport.push(
    "A duplicate name is refused in the dialog without adding a sheet.",
  );
  await dialog.getByLabel("Name of the copy", { exact: true }).fill("Copy");
  await dialog.getByRole("combobox").selectOption("0");
  await dialog.getByRole("button", { name: "Copy", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  await page.getByRole("tab", { name: "Copy", exact: true }).waitFor();
  assert.equal(await tabs.count(), 2);
  await page.getByLabel("Shape: Copy text", { exact: true }).waitFor();
  await page.getByLabel("Image: Copy picture", { exact: true }).waitFor();
  rapport.push(
    "Copy-to-front reloads on the copied tab with its visible picture and text object.",
  );
  await page.screenshot({ path: `${uit}/copied.png` });
  await page.keyboard.down("Control");
  try {
    await tabs
      .first()
      .dragTo(tabs.last(), { targetPosition: { x: 30, y: 12 } });
  } finally {
    await page.keyboard.up("Control");
  }
  dialog = page.getByRole("dialog", {
    name: "Move or Copy Sheet",
    exact: true,
  });
  await dialog.waitFor();
  assert.equal(
    await dialog.getByLabel("Create a copy", { exact: true }).isChecked(),
    true,
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await tabs.count(), 2);
  rapport.push(
    "Actual Ctrl+drag opens the same copy route with Create a copy selected; Cancel preserves both sheets.",
  );
  const name = page.locator(".rekenblad-naamvak:visible");
  await name.fill("A1");
  await name.press("Enter");
  await page.keyboard.type("11");
  await page.keyboard.press("Enter");
  await page.locator('[data-testid="xlsx-scroll"]').focus();
  await page.keyboard.press("Control+s");
  const save = page.getByRole("dialog", { name: "Save as", exact: true });
  await save.waitFor();
  const pending = page.waitForEvent("download");
  await save.getByRole("button", { name: "Save", exact: true }).click();
  await (await pending).saveAs(`${uit}/copied.xlsx`);
  const saved = fs.readFileSync(`${uit}/copied.xlsx`),
    h = openWorkbook(saved);
  assert.deepEqual(h.sheetInfo().sheetNames, ["Copy", "Blad 1"]);
  assert.equal(h.cell(0, 0, 0).input, "11");
  assert.equal(h.cell(1, 0, 0).input, "7");
  const values = h.readCells({
    ranges: h.sheetInfo().sheetIds.map((sheetId) => ({
      sheetId,
      range: { kind: "a1", a1: "B1" },
    })),
  });
  assert.ok(values.ok);
  assert.deepEqual(
    values.ranges.map((r) => r.cells[0][0].displayText),
    ["22", "14"],
  );
  h.dispose();
  assert.equal(leesTekenobjecten(saved).length, 4);
  assert.deepEqual(
    leesCelnotities(saved).map((s) => s[0].tekst),
    ["Preserve note", "Preserve note"],
  );
  const threads = leesDiscussies(saved);
  assert.notEqual(threads[0][0].id, threads[1][0].id);
  assert.equal(lijstGrafieken(saved, "xlsx").length, 2);
  rapport.push(
    "Actual UI edit, Save as download and native reopen retain independent formula results 22/14, both charts, four objects, notes and distinct discussions.",
  );
  const reopened = await open(saved, "copied.xlsx");
  await reopened.getByRole("tab", { name: "Copy", exact: true }).waitFor();
  await reopened.getByLabel("Shape: Copy text", { exact: true }).waitFor();
  await reopened.getByRole("tab", { name: "Blad 1", exact: true }).click();
  await reopened.getByLabel("Image: Copy picture", { exact: true }).waitFor();
  rapport.push(
    "A fresh browser profile reopens the downloaded workbook and displays copied and original objects.",
  );
  assert.deepEqual(fouten, []);
  fs.writeFileSync(
    `${uit}/report.json`,
    JSON.stringify({ rapport, fouten }, null, 2),
  );
  console.log(JSON.stringify({ rapport, fouten }, null, 2));
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
