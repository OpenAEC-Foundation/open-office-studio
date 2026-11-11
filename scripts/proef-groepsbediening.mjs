import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer, preview } from "vite";
import { initWasm, openWorkbook } from "@betteroffice/xlsx";
import { unzipSync, strFromU8, strToU8, zipSync } from "fflate";
const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
await initWasm(fs.readFileSync("vendor/rekenbladengine/xlsx_wasm_bg.wasm"));
const h = openWorkbook(fs.readFileSync("public/templates/nieuw.xlsx"));
h.editCells(0, [
  { row: 1, col: 0, input: "10" },
  { row: 2, col: 0, input: "=A2*2" },
  { row: 19, col: 0, input: "50" },
]);
h.applyOps([
  {
    type: "setFreezePane",
    sheet: 0,
    pane: { rows: 1, cols: 1, top_left: { row: 1, col: 1 } },
  },
]);
let bytes = h.save();
h.dispose();
const lader = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let page;
try {
  const { wijzigGroep } = await lader.ssrLoadModule(
    "/src/rekenblad/groepen.ts",
  );
  for (const [as, van, tot] of [
    ["rij", 1, 5],
    ["rij", 2, 3],
    ["rij", 19, 23],
    ["kolom", 1, 3],
  ])
    bytes = wijzigGroep(bytes, 0, as, van, tot, "groepeer");
} finally {
  await lader.close();
}
const server = await preview({
  configFile: false,
  build: {
    outDir: process.env.OFFICE_TEST_DIST ?? ".local/spreadsheet-groepen-build",
  },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch({ headless: true });
const uit = ".local/proef-groepsbesturing",
  rapport = [],
  fouten = [];
fs.mkdirSync(uit, { recursive: true });
try {
  const context = await browser.newContext({
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
  page = await context.newPage();
  page.on("pageerror", (e) => fouten.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "outline.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(bytes),
    });
  const rijen = page.getByRole("group", {
      name: "Row outline controls",
      exact: true,
    }),
    kolommen = page.getByRole("group", {
      name: "Column outline controls",
      exact: true,
    });
  await rijen
    .getByRole("button", { name: "Collapse group 2:6", exact: true })
    .waitFor();
  await kolommen
    .getByRole("button", { name: "Collapse group B:D", exact: true })
    .waitFor();
  async function lijn(as, range, index) {
    await page.waitForFunction(
      ({ as, range, index }) => {
        const b = [
          ...document.querySelectorAll(
            `.rekenblad-outline-rail.is-${as} button`,
          ),
        ].find((b) => b.getAttribute("aria-label")?.endsWith(` ${range}`));
        const s = document.querySelector(
          `[data-soort="${as}"][data-spoor="${index}"]`,
        );
        if (!b || !s) return false;
        const k = b.getBoundingClientRect(),
          r = s.getBoundingClientRect();
        const klopt =
          as === "rij"
            ? k.right <= r.left + 0.5 &&
              Math.abs(k.y + k.height / 2 - r.y - r.height / 2) < 1
            : k.bottom <= r.top + 0.5 &&
              Math.abs(k.x + k.width / 2 - r.x - r.width / 2) < 1;
        const key = `${as}:${range}:${index}`;
        window.__outlineStabiel ??= {};
        window.__outlineStabiel[key] = klopt
          ? (window.__outlineStabiel[key] ?? 0) + 1
          : 0;
        return window.__outlineStabiel[key] >= 5;
      },
      { as, range, index },
    );
  }
  await lijn("rij", "2:6", 6);
  await lijn("kolom", "B:D", 4);
  await page.screenshot({ path: `${uit}/koppen.png` });
  rapport.push(
    "Separate row and column outline rails align with their real summary headers and leave native headers unobstructed.",
  );
  async function schakel(rail, naam, cancel = false) {
    await rail.getByRole("button", { name: naam, exact: true }).click();
    const d = page.getByRole("dialog", { name: naam, exact: true });
    await d.waitFor();
    assert.ok((await d.textContent()).includes("undo history is cleared"));
    await d
      .getByRole("button", { name: cancel ? "Cancel" : "Apply", exact: true })
      .click();
    await d.waitFor({ state: "detached" });
  }
  await schakel(rijen, "Collapse group 3:4", true);
  await rijen
    .getByRole("button", { name: "Collapse group 3:4", exact: true })
    .waitFor();
  rapport.push(
    "Cancel leaves an outline group unchanged after the visible history warning.",
  );
  await schakel(rijen, "Collapse group 3:4");
  await rijen
    .getByRole("button", { name: "Expand group 3:4", exact: true })
    .waitFor();
  await schakel(rijen, "Collapse group 2:6");
  await rijen
    .getByRole("button", { name: "Expand group 2:6", exact: true })
    .waitFor();
  assert.equal(
    await rijen
      .getByRole("button", { name: "Expand group 3:4", exact: true })
      .count(),
    0,
  );
  await schakel(rijen, "Expand group 2:6");
  await rijen
    .getByRole("button", { name: "Expand group 3:4", exact: true })
    .waitFor();
  rapport.push(
    "Collapsing a parent hides child controls; expanding it preserves an explicitly collapsed child.",
  );
  await schakel(kolommen, "Collapse group B:D");
  await kolommen
    .getByRole("button", { name: "Expand group B:D", exact: true })
    .waitFor();
  await schakel(kolommen, "Expand group B:D");
  await kolommen
    .getByRole("button", { name: "Collapse group B:D", exact: true })
    .waitFor();
  rapport.push(
    "Column outline controls collapse and expand the real column group.",
  );
  const scroll = page.locator("[data-testid=xlsx-scroll]");
  await scroll.evaluate((e) => {
    e.scrollTop = 300;
    e.scrollLeft = 180;
  });
  await rijen
    .getByRole("button", { name: "Collapse group 20:24", exact: true })
    .waitFor();
  await lijn("rij", "20:24", 24);
  await lijn("kolom", "B:D", 4);
  rapport.push(
    "Outline controls follow scrolling with a frozen first row and column.",
  );
  await scroll.evaluate((e) => {
    e.scrollTop = 0;
    e.scrollLeft = 0;
  });
  const zoom = page.getByRole("slider", { name: "Zoom", exact: true });
  async function wachtZoom(percent) {
    await page.waitForFunction(
      (percent) =>
        document
          .querySelector('input[type="range"][aria-label="Zoom"]')
          ?.getAttribute("aria-valuetext") === `${percent}%`,
      percent,
    );
  }
  await zoom.focus();
  for (const percent of [90, 80, 70, 60, 50]) {
    await zoom.press("ArrowLeft");
    await wachtZoom(percent);
  }
  await lijn("rij", "2:6", 6);
  await lijn("kolom", "B:D", 4);
  rapport.push(
    "At 50% zoom, outline buttons still fit their summary tracks and align with both headers.",
  );
  await page.screenshot({ path: `${uit}/zoom-50.png` });
  for (const percent of [40, 30, 20, 10]) {
    await zoom.press("ArrowLeft");
    await wachtZoom(percent);
  }
  await page
    .getByRole("button", { name: "Manage outline groups", exact: true })
    .click();
  const beheer = page.getByRole("dialog", {
    name: "Outline groups",
    exact: true,
  });
  await beheer.waitFor();
  await beheer
    .locator(".rekenblad-knoppen")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  rapport.push(
    "At 10% zoom, the accessible outline manager remains available when individual tracks cannot fit a button.",
  );
  await page.getByRole("button", { name: /back to 100%/ }).click();
  await wachtZoom(100);
  await scroll.focus();
  await page.keyboard.press("Control+s");
  const save = page.getByRole("dialog", { name: "Save as", exact: true });
  await save.waitFor();
  const pending = page.waitForEvent("download");
  await save.getByRole("button", { name: "Save", exact: true }).click();
  const dl = await pending;
  await dl.saveAs(`${uit}/outline.xlsx`);
  const saved = fs.readFileSync(`${uit}/outline.xlsx`),
    terug = openWorkbook(saved);
  assert.equal(terug.cell(0, 2, 0).input, "=A2*2");
  terug.dispose();
  const xml = strFromU8(unzipSync(saved)["xl/worksheets/sheet1.xml"]);
  assert.match(xml, /outlineLevel="2"/);
  assert.match(xml, /collapsed="1"/);
  rapport.push(
    "A real Save as download preserves nested groups and formulas after header-control actions.",
  );
  const beschermd = unzipSync(saved);
  beschermd["xl/worksheets/sheet1.xml"] = strToU8(
    strFromU8(beschermd["xl/worksheets/sheet1.xml"]).replace(
      "</sheetData>",
      '</sheetData><sheetProtection sheet="1"/>',
    ),
  );
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "beveiligd.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(zipSync(beschermd)),
    });
  await rijen
    .getByRole("button", { name: "Collapse group 2:6", exact: true })
    .waitFor();
  assert.equal(
    await rijen
      .getByRole("button", { name: "Collapse group 2:6", exact: true })
      .isDisabled(),
    true,
  );
  rapport.push(
    "Existing protected worksheets show their outline controls but refuse changes.",
  );
  assert.deepEqual(fouten, []);
  fs.writeFileSync(
    `${uit}/rapport.json`,
    JSON.stringify({ rapport, fouten }, null, 2),
  );
  console.log(JSON.stringify({ rapport, fouten }, null, 2));
} catch (e) {
  if (page) {
    await page.screenshot({ path: `${uit}/fout.png` });
    console.log(
      await page
        .locator(
          '.rekenblad-outline-rail button,[data-spoor="24"],[data-soort="kolom"][data-spoor="4"]',
        )
        .evaluateAll((es) =>
          es.map((e) => ({
            label: e.getAttribute("aria-label"),
            spoor: e.getAttribute("data-spoor"),
            soort: e.getAttribute("data-soort"),
            style: e.getAttribute("style"),
            marginTop: getComputedStyle(e).marginTop,
            transform: getComputedStyle(e).transform,
            rail: e
              .closest(".rekenblad-outline-rail")
              ?.getBoundingClientRect()
              .toJSON(),
            rect: e.getBoundingClientRect().toJSON(),
          })),
        ),
    );
  }
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
