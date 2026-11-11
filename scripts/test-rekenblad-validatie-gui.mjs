import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, preview } from "vite";
const { chromium } = await import(
  process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright"
);
const uit = process.env.OFFICE_TEST_UIT ?? ".local/proef-validatie";
await mkdir(uit, { recursive: true });
const ssr = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
  appType: "custom",
});
const { schrijfValidatie, nieuweValidatie, leesValidaties } =
  await ssr.ssrLoadModule("/src/rekenblad/gegevensvalidatie.ts");
const { Pakket } = await ssr.ssrLoadModule("/src/grafieken/pakket.ts");
const { werkmap, sectie, NS } = await ssr.ssrLoadModule(
  "/src/rekenblad/werkboekXml.ts",
);
const origineel = new Pakket(
  new Uint8Array(await readFile("public/templates/nieuw.xlsx")),
);
origineel.schrijf(
  "customXml/vendor-validation.xml",
  "<keep value='validation-probe'/>",
);
sectie(
  origineel,
  werkmap(origineel).bladen[0].pad,
  "sheetData",
  `<sheetData xmlns="${NS}"><row r="5"><c r="B5" t="inlineStr"><is><t>Orange</t></is></c></row></sheetData>`,
);
const bron = schrijfValidatie(origineel.inpakken(), 0, null, {
  ...nieuweValidatie("B2:B5"),
  type: "list",
  formule1: '"Red,Green,Blue"',
  invoerTitel: "Colour",
  invoer: "Choose a listed colour.",
  foutTitel: "Invalid colour",
  fout: "Use Red, Green or Blue.",
});
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
const stap = (t) => {
  rapport.stappen.push(t);
  console.log(t);
};
try {
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({ taal: "en", thema: "forge" }),
    ),
  );
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  const herhaald = schrijfValidatie(
    schrijfValidatie(bron, 0, null, nieuweValidatie("F1:F2")),
    0,
    0,
    { ...leesValidaties(bron)[0][0], invoerTitel: "Strict XML" },
  );
  const streng = new Pakket(herhaald);
  await page.evaluate(
    (xmls) => {
      for (const [naam, xml] of xmls) {
        const parsed = new DOMParser().parseFromString(xml, "application/xml");
        if (parsed.querySelector("parsererror"))
          throw new Error(
            naam + ": " + parsed.querySelector("parsererror").textContent,
          );
      }
    },
    streng
      .namen()
      .filter((n) => n.endsWith(".xml") || n.endsWith(".rels"))
      .map((n) => [n, streng.lees(n)]),
  );
  stap("Independent XML parser accepts repeated rule creation and editing");
  await page
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name: "Validation.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(bron),
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
  async function kies(row, col) {
    await page.evaluate(
      ({ row, col }) => {
        const a = proefApi();
        a.selectCells(0, { anchor: { row, col }, focus: { row, col } });
        a.focus();
      },
      { row, col },
    );
    await page.waitForTimeout(150);
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
      { timeout: 60000 },
    );
  }
  await kies(1, 1);
  await page
    .getByRole("note")
    .filter({ hasText: "Choose a listed colour." })
    .waitFor();
  await page
    .getByRole("button", { name: "Dropdown list", exact: true })
    .click();
  await page
    .getByRole("listbox", { name: "Dropdown list" })
    .selectOption("Green");
  assert.equal(
    await page.evaluate(() =>
      proefApi().handle.cell(0, 1, 1).input.replace(/^'/, ""),
    ),
    "Green",
  );
  stap("Existing rule: input message and in-cell dropdown select Green");
  await kies(1, 1);
  await page.keyboard.type("Orange");
  await page.getByTestId("xlsx-cell-editor").waitFor();
  await page.keyboard.press("Enter");
  await page.getByRole("alert").filter({ hasText: "Invalid colour" }).waitFor();
  assert.equal(
    await page.evaluate(() =>
      proefApi().handle.cell(0, 1, 1).input.replace(/^'/, ""),
    ),
    "Green",
  );
  await page.keyboard.press("Escape");
  stap("Typing invalid data is refused without changing the existing value");
  await page.getByRole("tab", { name: "Data", exact: true }).click();
  await page
    .getByRole("button", { name: "Circle invalid data", exact: true })
    .click();
  await page.locator(".validatie-ongeldig").waitFor();
  assert.equal(await page.locator(".validatie-ongeldig").count(), 1);
  await page
    .getByRole("button", { name: "Clear circles", exact: true })
    .click();
  assert.equal(await page.locator(".validatie-ongeldig").count(), 0);
  stap(
    "Existing invalid cell is circled; clearing circles leaves data unchanged",
  );
  await page
    .getByRole("button", { name: "Data validation", exact: true })
    .click();
  const d = page.getByRole("dialog", { name: "Data validation", exact: true });
  await d
    .getByLabel("Input message title", { exact: true })
    .fill("Pick a colour");
  await vervang(() =>
    d.getByRole("button", { name: "Save", exact: true }).click(),
  );
  assert.equal(
    leesValidaties(await bytes())[0][0].invoerTitel,
    "Pick a colour",
  );
  stap("Rule dialog edits and saves normal SpreadsheetML validation");
  await kies(2, 2);
  await page.getByRole("tab", { name: "Data", exact: true }).click();
  await page
    .getByRole("button", { name: "Data validation", exact: true })
    .click();
  const n = page.getByRole("dialog", { name: "Data validation", exact: true });
  await n.getByLabel("Cell range", { exact: true }).fill("C3:C5");
  await n.getByLabel("Value or formula", { exact: true }).fill("1");
  await n.getByLabel("Second bound", { exact: true }).fill("10");
  await vervang(() =>
    n.getByRole("button", { name: "Save", exact: true }).click(),
  );
  await kies(2, 2);
  await page.keyboard.type("7");
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() => proefApi().handle.cell(0, 2, 2).input),
    "7",
  );
  stap("Creates whole-number rule through UI and accepts valid typing");
  await kies(2, 2);
  await page.getByRole("tab", { name: "Data", exact: true }).click();
  await page
    .getByRole("button", { name: "Data validation", exact: true })
    .click();
  const w = page.getByRole("dialog", { name: "Data validation", exact: true });
  await w
    .getByLabel("Error alert style", { exact: true })
    .selectOption("warning");
  await vervang(() =>
    w.getByRole("button", { name: "Save", exact: true }).click(),
  );
  await kies(2, 2);
  page.once("dialog", (d) => d.dismiss());
  await page.keyboard.type("99");
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() => proefApi().handle.cell(0, 2, 2).input),
    "7",
  );
  await page.keyboard.press("Escape");
  await kies(2, 2);
  page.once("dialog", (d) => d.accept());
  await page.keyboard.type("99");
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() => proefApi().handle.cell(0, 2, 2).input),
    "99",
  );
  stap("Warning alert supports cancel and accept before committing the value");
  await page.evaluate(() =>
    proefApi().handle.editCell(0, 0, 0, "unchanged payload"),
  );
  let saved = await bytes();
  assert.equal(leesValidaties(saved)[0].length, 2);
  assert.equal(
    new Pakket(saved).lees("customXml/vendor-validation.xml"),
    "<keep value='validation-probe'/>",
  );
  await writeFile(`${uit}/saved.xlsx`, saved);
  await page
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name: "Reopened.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(saved),
    });
  await page.waitForFunction(
    () => {
      try {
        return proefApi()?.handle.cell(0, 0, 0).input === "unchanged payload";
      } catch {
        return false;
      }
    },
    null,
    { timeout: 60000 },
  );
  await kies(1, 1);
  await page
    .getByRole("button", { name: "Dropdown list", exact: true })
    .waitFor();
  assert.equal(leesValidaties(await bytes())[0].length, 2);
  stap(
    "Save/reopen preserves both rules, edited cells and unknown package part",
  );
  await page.screenshot({ path: `${uit}/validation.png` });
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
