import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, preview } from "vite";
const { chromium } = await import(
  process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright"
);
const uit = process.env.OFFICE_TEST_UIT ?? ".local/proef-beveiliging";
await mkdir(uit, { recursive: true });
const ssr = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
  appType: "custom",
});
const { Pakket } = await ssr.ssrLoadModule("/src/grafieken/pakket.ts");
const { werkmap, sectie, NS } = await ssr.ssrLoadModule(
  "/src/rekenblad/werkboekXml.ts",
);
const { leesBeveiliging } = await ssr.ssrLoadModule(
  "/src/rekenblad/beveiliging.ts",
);
const p = new Pakket(
  new Uint8Array(await readFile("public/templates/nieuw.xlsx")),
);
sectie(
  p,
  werkmap(p).bladen[0].pad,
  "sheetData",
  `<sheetData xmlns="${NS}"><row r="1"><c r="A1"><f>B2+2</f><v>12</v></c><c r="B1" t="inlineStr"><is><t>Amount</t></is></c></row><row r="2"><c r="B2"><v>10</v></c></row><row r="3"><c r="B3"><v>5</v></c></row></sheetData>`,
);
p.schrijf("customXml/protection-probe.xml", "<keep source='protection'/>");
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? ".local/dist-spreadsheet" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch(),
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    locale: "en-GB",
  });
const rapport = { stappen: [], fouten: [] };
page.on("pageerror", (e) => rapport.fouten.push(String(e)));
const stap = (s) => {
  rapport.stappen.push(s);
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
  await page
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name: "Protection.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(p.inpakken()),
    });
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
  async function kies(row, col, endRow = row, endCol = col) {
    const gelukt = await page.evaluate(
      ({ row, col, endRow, endCol }) => {
        const a = proefApi(),
          r = a.selectCells(0, {
            anchor: { row: endRow, col: endCol },
            focus: { row, col },
          });
        a.focus();
        return r;
      },
      { row, col, endRow, endCol },
    );
    assert(gelukt);
    await page.waitForTimeout(150);
  }
  async function open(naam) {
    await page.getByRole("tab", { name: "Tools", exact: true }).click();
    await page.getByRole("button", { name: naam, exact: true }).click();
    const d = page.getByRole("dialog", { name: naam, exact: true });
    await d.getByRole("button", { name: "Save", exact: true }).waitFor();
    await page.waitForTimeout(100);
    return d;
  }
  async function bytes() {
    return new Uint8Array(
      await page.evaluate(async () =>
        Array.from(await proefContext().herlaad.bytes()),
      ),
    );
  }
  async function vervang(actie) {
    await page.evaluate(() => (window.oud = proefApi().handle));
    await actie();
    await page.waitForFunction(
      () => {
        try {
          return (
            !!proefApi() &&
            proefApi().handle !== oud &&
            proefApi().handle.sheetInfo().sheetNames.length
          );
        } catch {
          return false;
        }
      },
      null,
      { timeout: 90000 },
    );
  }
  await kies(1, 1, 2, 1);
  let d = await open("Cell protection");
  await d.getByLabel("Locked", { exact: true }).selectOption("no");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(
    () =>
      proefApi().handle.captureFormat(0, "B2").formats[0].protection?.locked ===
      false,
  );
  await page.keyboard.press("Control+z");
  await page.waitForFunction(
    () =>
      proefApi().handle.captureFormat(0, "B2").formats[0].protection?.locked !==
      false,
  );
  await page.keyboard.press("Control+y");
  await page.waitForFunction(
    () =>
      proefApi().handle.captureFormat(0, "B2").formats[0].protection?.locked ===
      false,
  );
  stap("Unlocking a range uses native Undo/Redo");
  await kies(0, 0);
  d = await open("Cell protection");
  await d.getByLabel("Hide formula", { exact: true }).selectOption("yes");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await kies(1, 1);
  d = await open("Protect sheet");
  await d
    .getByLabel("New password (optional)", { exact: true })
    .fill("Test123");
  await d.getByLabel("Repeat new password", { exact: true }).fill("Test123");
  await d.getByLabel("Insert rows", { exact: true }).check();
  await d.getByLabel("Sort (unlocked cells)", { exact: true }).check();
  await d.getByLabel("Use existing filters", { exact: true }).check();
  await vervang(() =>
    d.getByRole("button", { name: "Save", exact: true }).click(),
  );
  let saved = await bytes();
  assert(leesBeveiliging(saved).bladen[0].actief);
  assert.equal(leesBeveiliging(saved).bladen[0].attrs.algorithmName, "SHA-512");
  stap("Protect-sheet dialog writes password and allowed actions");
  await kies(1, 1);
  await page.keyboard.type("20");
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() => proefApi().handle.cell(0, 1, 1).input),
    "20",
  );
  await kies(0, 0);
  assert.equal(
    await page
      .locator('[data-testid="xlsx-formula-input"]:visible')
      .inputValue(),
    "22",
  );
  await page.keyboard.type("99");
  await page.keyboard.press("Enter");
  await page
    .getByRole("alert")
    .filter({ hasText: "not allowed on the protected sheet" })
    .waitFor();
  await page.keyboard.press("Escape");
  assert.equal(
    await page.evaluate(() => proefApi().handle.cell(0, 0, 0).input),
    "22",
  );
  stap(
    "Unlocked typing succeeds; locked typing is refused; formula stays hidden and calculates",
  );
  await kies(1, 1);
  await page.getByRole("tab", { name: "Sheet", exact: true }).click();
  await page
    .getByRole("button", { name: "Insert Rows Above", exact: true })
    .click();
  await page.waitForFunction(
    () => proefApi().handle.cell(0, 2, 1).input === "20",
  );
  stap("Allowed row insertion shifts values and cell protection");
  d = await open("Protect workbook");
  await d
    .getByLabel("New password (optional)", { exact: true })
    .fill("Book123");
  await d.getByLabel("Repeat new password", { exact: true }).fill("Book123");
  await vervang(() =>
    d.getByRole("button", { name: "Save", exact: true }).click(),
  );
  assert(leesBeveiliging(await bytes()).structuur);
  await page.getByRole("tab", { name: "Sheet", exact: true }).click();
  await page.getByRole("button", { name: "Insert Sheet", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: /structure.*protected/i })
    .waitFor();
  assert.equal(
    await page.evaluate(() => proefApi().handle.sheetInfo().sheetNames.length),
    1,
  );
  stap("Workbook structure protection rejects adding a sheet");
  saved = await bytes();
  assert.equal(
    new Pakket(saved).lees("customXml/protection-probe.xml"),
    "<keep source='protection'/>",
  );
  await writeFile(`${uit}/saved.xlsx`, saved);
  await page
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name: "Reopened-protected.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(saved),
    });
  await page.waitForFunction(
    () => {
      try {
        return proefApi()?.handle.cell(0, 2, 1).input === "20";
      } catch {
        return false;
      }
    },
    null,
    { timeout: 60000 },
  );
  d = await open("Protect sheet");
  await d.getByLabel("Protect this sheet", { exact: true }).uncheck();
  await d.getByLabel("Current password", { exact: true }).fill("wrong");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await d.getByRole("alert").waitFor({ timeout: 90000 });
  assert(leesBeveiliging(await bytes()).bladen[0].actief);
  await d.getByLabel("Current password", { exact: true }).fill("Test123");
  await vervang(() =>
    d.getByRole("button", { name: "Save", exact: true }).click(),
  );
  assert(!leesBeveiliging(await bytes()).bladen[0].actief);
  await kies(0, 0);
  assert.equal(
    await page
      .locator('[data-testid="xlsx-formula-input"]:visible')
      .inputValue(),
    "=B3+2",
  );
  stap(
    "Save/reopen preserves protection; wrong password leaves it intact; correct password restores formula editing",
  );
  d = await open("Protect sheet");
  await d.getByLabel("Select locked cells", { exact: true }).uncheck();
  await vervang(() =>
    d.getByRole("button", { name: "Save", exact: true }).click(),
  );
  await kies(2, 1);
  assert.equal(
    await page.evaluate(() =>
      proefApi().selectCells(0, {
        anchor: { row: 0, col: 0 },
        focus: { row: 0, col: 0 },
      }),
    ),
    false,
  );
  const punt = await page.evaluate(() => {
    const r = document
      .querySelector(
        '.office-tabpaneel:not([hidden]) [data-testid="xlsx-scroll"]',
      )
      .getBoundingClientRect();
    for (let y = r.y + 2; y < r.y + 100; y += 5)
      for (let x = r.x + 2; x < r.x + 200; x += 5) {
        const c = proefApi().getPositionAtPoint(x, y);
        if (c?.row === 0 && c.col === 0) return { x, y };
      }
    return null;
  });
  assert(punt);
  await page.mouse.click(punt.x, punt.y);
  await page.waitForTimeout(150);
  assert.deepEqual(
    await page.evaluate(
      () => proefContext().rekenbladLaag.selectie()?.cells?.focus,
    ),
    { row: 2, col: 1 },
  );
  stap(
    "Selection permissions reject both host navigation and clicking a locked cell",
  );
  d = await open("Protect sheet");
  await d.getByLabel("Select unlocked cells", { exact: true }).uncheck();
  await vervang(() =>
    d.getByRole("button", { name: "Save", exact: true }).click(),
  );
  await page.waitForFunction(
    () => !proefContext().rekenbladLaag.selectie()?.cells,
  );
  d = await open("Protect sheet");
  await d.getByLabel("Protect this sheet", { exact: true }).uncheck();
  await vervang(() =>
    d.getByRole("button", { name: "Save", exact: true }).click(),
  );
  assert(!leesBeveiliging(await bytes()).bladen[0].actief);
  stap("Protection can still be removed when no cell is selectable");
  await page.screenshot({ path: `${uit}/protection.png` });
  assert.deepEqual(rapport.fouten, []);
} catch (e) {
  await page.screenshot({ path: `${uit}/failure.png` });
  throw e;
} finally {
  await writeFile(`${uit}/report.json`, JSON.stringify(rapport, null, 2));
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
  await ssr.close();
}
