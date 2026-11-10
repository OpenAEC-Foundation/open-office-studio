/** #75: zichtbare objectbediening plus onafhankelijke inspectie van opgeslagen OOXML. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer, preview } from "vite";
import { createHash } from "node:crypto";
const { chromium } = await import(
  process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright"
);
const uit = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-rekenblad-objecten",
);
await mkdir(uit, { recursive: true });
const ssr = await createServer({
  cacheDir: ".local/vite-cache-object-ssr",
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
  appType: "custom",
});
const { voegTekenobjectToe, leesTekenobjecten } = await ssr.ssrLoadModule(
  "/src/rekenblad/tekenobjecten.ts",
);
const { Pakket } = await ssr.ssrLoadModule("/src/grafieken/pakket.ts");
const { groepFixture } = await ssr.ssrLoadModule(
  "/src/rekenblad/testdata/groep.ts",
);
const basis = new Uint8Array(await readFile("public/templates/nieuw.xlsx"));
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
  "base64",
);
let bron = voegTekenobjectToe(basis, 0, {
  naam: "Imported logo",
  afbeelding: png,
  plek: { row: 2, col: 2, x: 5, y: 3, breedte: 100, hoogte: 60 },
});
bron = voegTekenobjectToe(bron, 0, {
  naam: "Imported label",
  tekst: "Original text",
  vorm: "roundRect",
  vulling: "#FF8800",
  plek: { row: 8, col: 2, x: 0, y: 0, breedte: 180, hoogte: 90 },
});
const pakket = new Pakket(bron);
pakket.schrijf("custom/object-probe.bin", new Uint8Array([7, 8, 9]));
// A real distant cell makes the native grid scrollable; drawings alone do not
// currently expand the engine's scroll extent.
pakket.schrijf(
  "xl/worksheets/sheet1.xml",
  pakket
    .lees("xl/worksheets/sheet1.xml")
    .replace(/<dimension\b[^>]*\/>/, '<dimension ref="A1:A201"/>')
    .replace(
      "</sheetData>",
      '<row r="201"><c r="A201"><v>1</v></c></row></sheetData>',
    ),
);
bron = pakket.inpakken();
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? ".local/dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "en-US",
});
const rapport = { stappen: [], fouten: [] };
page.on("pageerror", (e) => rapport.fouten.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") rapport.fouten.push(m.text());
});
const stap = (naam) => {
  rapport.stappen.push(naam);
  console.log(naam);
};
try {
  const override = process.env.OOS_TEST_REKENBLAD_WASM
    ? await readFile(process.env.OOS_TEST_REKENBLAD_WASM)
    : null;
  rapport.wasmSha256 = createHash("sha256")
    .update(
      override ?? (await readFile("vendor/rekenbladengine/xlsx_wasm_bg.wasm")),
    )
    .digest("hex");
  if (override) {
    await page.route(/\/assets\/xlsx_wasm_bg-[^/]+\.wasm(?:\?.*)?$/, (route) =>
      route.fulfill({ body: override, contentType: "application/wasm" }),
    );
  }
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({
        taal: "en",
        thema: "forge",
        spelling: false,
        autocorrectie: false,
      }),
    ),
  );
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name: "Objects.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(bron),
    });
  await page.evaluate(() => {
    window.proefApis = () => {
      const el = document.querySelector(
        ".office-tabpaneel:not([hidden]) .office-rekenblad-host",
      );
      for (
        let f =
          el?.[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      ) {
        const v = f.memoizedProps?.value;
        if (v?.rekenblad?.handle && v.herlaad) return v;
      }
      return null;
    };
  });
  await page.waitForFunction(
    () => proefApis()?.rekenblad?.handle.sheetInfo().sheetNames.length,
    null,
    { timeout: 60000 },
  );
  await page
    .getByRole("button", { name: "Image: Imported logo", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Shape: Imported label", exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator(".rekenblad-tekenobject img")
      .evaluate((el) => el.complete && el.naturalWidth),
    1,
  );
  await page.screenshot({ path: `${uit}/01-existing.png` });
  stap("Imported image and text box are visible with decoded image data");
  async function kies(row, col) {
    await page.evaluate(
      ({ row, col }) => {
        const api = proefApis().rekenblad;
        api.selectCells(0, { anchor: { row, col }, focus: { row, col } });
        api.focus();
      },
      { row, col },
    );
    await page.waitForFunction(
      ({ row, col }) => {
        let letters = "",
          n = col + 1;
        while (n) {
          n--;
          letters = String.fromCharCode(65 + (n % 26)) + letters;
          n = Math.floor(n / 26);
        }
        return (
          document.querySelector(
            '.office-tabpaneel:not([hidden]) [data-testid="xlsx-name-box"]',
          )?.value === `${letters}${row + 1}`
        );
      },
      { row, col },
    );
  }
  async function bytes() {
    return new Uint8Array(
      await page.evaluate(async () =>
        Array.from(await proefApis().herlaad.bytes()),
      ),
    );
  }
  await kies(0, 0);
  await page.keyboard.press("Control+k");
  const link = page.getByRole("dialog", { name: "Hyperlink", exact: true });
  await link
    .getByLabel("Address", { exact: true })
    .fill("https://example.com/a?q=1&b=2");
  await link.getByLabel("Text to display", { exact: true }).fill("Example");
  await link.getByRole("button", { name: "Apply", exact: true }).click();
  await link.waitFor({ state: "hidden" });
  let saved = new Pakket(await bytes());
  assert(
    saved
      .lees("xl/worksheets/_rels/sheet1.xml.rels")
      .includes("https://example.com/a?q=1&amp;b=2"),
  );
  await page.keyboard.press("Control+z");
  assert.equal(
    await page.evaluate(() => proefApis().rekenblad.handle.cell(0, 0, 0).input),
    "",
  );
  await page.keyboard.press("Control+y");
  assert.equal(
    await page.evaluate(() => proefApis().rekenblad.handle.cell(0, 0, 0).input),
    "Example",
  );
  stap(
    "Ctrl+K from Home creates hyperlink with native Undo/Redo and escaped relationship",
  );
  await kies(1, 0);
  await page.keyboard.press("Control+k");
  await link.getByLabel("Link to", { exact: true }).selectOption("cel");
  await link.getByLabel("Address", { exact: true }).fill("L20");
  await link.getByRole("button", { name: "Apply", exact: true }).click();
  await link.waitFor({ state: "hidden" });
  await writeFile(`${uit}/internal-link.xlsx`, await bytes());
  await page.keyboard.press("Control+k");
  assert.equal(
    await link.getByLabel("Address", { exact: true }).inputValue(),
    "L20",
  );
  await link.getByRole("button", { name: "Open link", exact: true }).click();
  await link.waitFor({ state: "hidden" });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="xlsx-name-box"]')?.value === "L20",
  );
  stap("Saved internal hyperlink reopens and navigates to its target cell");
  await kies(1, 0);
  await page.keyboard.press("Control+k");
  await link.getByLabel("Link to", { exact: true }).selectOption("bestand");
  await link
    .getByLabel("Address", { exact: true })
    .fill("../Linked report.xlsx");
  await link.getByRole("button", { name: "Open link", exact: true }).click();
  await link
    .getByRole("alert")
    .filter({ hasText: "Local file links open in the desktop app" })
    .waitFor();
  await link.getByRole("button", { name: "Apply", exact: true }).click();
  await link.waitFor({ state: "hidden" });
  assert(
    new Pakket(await bytes())
      .lees("xl/worksheets/_rels/sheet1.xml.rels")
      .includes("../Linked%20report.xlsx"),
  );
  stap(
    "File links retain encoded relative paths and show a clear browser-only open message",
  );
  const formuleDoelen = await page.evaluate(async () => {
    const api = proefApis().rekenblad;
    let queries = false;
    try {
      queries = Array.isArray(
        api.handle.readCells({
          ranges: [],
          formulaQueries: [
            {
              sheetId: api.handle.sheetInfo().sheetIds[0],
              origin: { row: 2, col: 0 },
              target: { row: 2, col: 0 },
              formula: '"probe"',
            },
          ],
        }).formulaResults,
      );
    } catch (error) {
      if (!/unknown field [`'"]formulaQueries/.test(error.message)) throw error;
    }
    const internalFormula = queries
      ? '=HYPERLINK(IF(ROW()=3,"#L20","#A1"),"Internal formula")'
      : '=HYPERLINK("#L20","Internal formula")';
    const r = await api.applyEdits({
      expectVersion: await api.version(),
      steps: [
        {
          op: "setCellInputs",
          target: {
            sheetId: api.handle.sheetInfo().sheetIds[0],
            range: { kind: "a1", a1: "A3:B7" },
          },
          inputs: [
            [internalFormula, ""],
            ['=HYPERLINK(B4,"File formula")', "../Linked formula.xlsx"],
            [
              queries
                ? '=HYPERLINK(LOWER(B5)&"/formula","Web formula")'
                : '=HYPERLINK(B5&"/formula","Web formula")',
              queries ? "HTTPS://EXAMPLE.COM" : "https://example.com",
            ],
            ['=HYPERLINK("javascript:alert(1)","Unsafe")', ""],
            ['=HYPERLINK(UNSUPPORTED_TARGET(1),"Unavailable target")', ""],
          ],
        },
      ],
    });
    if (!r.ok) throw new Error("Formula fixture edit failed");
    return { queries, internalFormula };
  });
  rapport.formulaQueries = formuleDoelen.queries;
  if (override)
    assert(
      formuleDoelen.queries,
      "Pinned query engine must expose read-only expressions",
    );
  async function ctrlKlik(row) {
    await kies(row, 0);
    const painted = await page.waitForFunction((row) => {
      const r = document
        .querySelector(
          '.office-tabpaneel:not([hidden]) [data-testid="xlsx-scroll"]',
        )
        .getBoundingClientRect();
      for (let y = 2; y < 180; y += 2)
        for (const x of [50, 60, 70, 80]) {
          const p = proefApis().rekenblad.getPositionAtPoint(
            r.left + x,
            r.top + y,
          );
          if (p?.row === row && p.col === 0)
            return { x: r.left + x, y: r.top + y };
        }
      return false;
    }, row);
    const point = await painted.jsonValue();
    await painted.dispose();
    await page.keyboard.down("Control");
    try {
      await page.mouse.click(point.x, point.y);
    } finally {
      await page.keyboard.up("Control");
    }
  }
  await ctrlKlik(2);
  await page.waitForFunction(
    () =>
      document.querySelector(
        '.office-tabpaneel:not([hidden]) [data-testid="xlsx-name-box"]',
      )?.value === "L20",
  );
  await ctrlKlik(3);
  await link
    .getByText(
      "Local file links open in the desktop app. Use File > Open in the browser.",
      { exact: true },
    )
    .waitFor();
  await link.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .context()
    .route("https://example.com/**", (route) =>
      route.fulfill({ body: "Hyperlink test target" }),
    );
  const popupWait = page.waitForEvent("popup");
  await ctrlKlik(4);
  const popup = await popupWait;
  await popup.waitForURL("https://example.com/formula");
  await popup.close();
  await ctrlKlik(5);
  await link
    .getByText("Enter a valid link or cell reference.", { exact: true })
    .waitFor();
  await link.getByRole("button", { name: "Close", exact: true }).click();
  assert.equal(
    await page.evaluate(() => proefApis().rekenblad.handle.cell(0, 2, 0).input),
    formuleDoelen.internalFormula,
  );
  await ctrlKlik(6);
  await link
    .getByText(
      "The link target of this formula could not be resolved. Check the formula or use an explicit hyperlink.",
      { exact: true },
    )
    .waitFor();
  await link.getByRole("button", { name: "Close", exact: true }).click();
  assert.equal(
    await page.evaluate(() => proefApis().rekenblad.handle.cell(0, 6, 0).input),
    '=HYPERLINK(UNSUPPORTED_TARGET(1),"Unavailable target")',
  );
  stap(
    "Ctrl-click follows literal/reference/concatenated HYPERLINK targets and rejects executable schemes without rewriting formulas",
  );
  await kies(0, 0);
  const image = page.getByRole("button", {
    name: "Image: Imported logo",
    exact: true,
  });
  await image.dblclick();
  let dialog = page.getByRole("dialog", { name: "Image", exact: true });
  await dialog.getByLabel("Anchor cell", { exact: true }).fill("E5");
  await dialog.getByLabel("Width (px)", { exact: true }).fill("240");
  await dialog.getByLabel("Height (px)", { exact: true }).fill("120");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await image.waitFor();
  let objects = leesTekenobjecten(await bytes());
  assert.deepEqual(objects[0].plek, {
    row: 4,
    col: 4,
    x: 5,
    y: 3,
    breedte: 240,
    hoogte: 120,
  });
  assert.deepEqual(objects[0].media, new Uint8Array(png));
  assert.equal(objects[1].tekst, "Original text");
  stap(
    "Image anchor and dimensions edited; original pixels and neighboring text box retained",
  );
  await page
    .getByRole("button", { name: "Shape: Imported label", exact: true })
    .dblclick();
  dialog = page.getByRole("dialog", { name: "Shape", exact: true });
  await dialog
    .getByLabel("Text", { exact: true })
    .fill("Changed < & >\nSecond line");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("Changed < & >", { exact: false }).first().waitFor();
  objects = leesTekenobjecten(await bytes());
  assert.equal(objects[1].tekst, "Changed < & >\nSecond line");
  stap(
    "Existing shape text edited with XML escaping and multiline persistence",
  );
  await page.getByRole("tab", { name: "Insert", exact: true }).click();
  await page.getByRole("button", { name: "Image", exact: true }).click();
  await page.getByLabel("Choose image", { exact: true }).setInputFiles({
    name: "Inserted.png",
    mimeType: "image/png",
    buffer: png,
  });
  dialog = page.getByRole("dialog", { name: "Image", exact: true });
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Image: Inserted.png", exact: true })
    .waitFor();
  objects = leesTekenobjecten(await bytes());
  assert.equal(objects.length, 3);
  stap(
    "Image insertion uses real file input and persists its native drawing relationship",
  );
  await kies(0, 0);
  // Werkelijke wijzergebaren stellen een nieuwe celpositie/afmeting voor.
  const old = await image.boundingBox();
  assert(old);
  await page.mouse.move(old.x + 30, old.y + 25);
  await page.mouse.down();
  await page.mouse.move(old.x + 105, old.y + 60, { steps: 8 });
  await page.mouse.up();
  dialog = page.getByRole("dialog", { name: "Image", exact: true });
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await image.waitFor();
  objects = leesTekenobjecten(await bytes());
  assert(objects[0].plek.col > 4 || objects[0].plek.x > 5);
  await image.focus();
  const grip = image.getByRole("button", {
      name: "Resize object",
      exact: true,
    }),
    g = await grip.boundingBox();
  assert(g);
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + 45, g.y + 25, { steps: 8 });
  await page.mouse.up();
  dialog = page.getByRole("dialog", { name: "Image", exact: true });
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  objects = leesTekenobjecten(await bytes());
  assert(objects[0].plek.breedte > 270);
  assert(objects[0].plek.hoogte > 130);
  stap(
    "Pointer dragging and resize handles update real cell anchors and dimensions",
  );
  await page.getByRole("tab", { name: "Insert", exact: true }).click();
  await page.getByRole("button", { name: "Text box", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Shape", exact: true });
  await dialog.getByLabel("Name", { exact: true }).fill("Inserted text box");
  await dialog.getByLabel("Text", { exact: true }).fill("New text box");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  const box = page.getByRole("button", {
    name: "Shape: Inserted text box",
    exact: true,
  });
  await box.waitFor();
  assert.equal(leesTekenobjecten(await bytes()).length, 4);
  await box.focus();
  await page.keyboard.press("Delete");
  dialog = page.getByRole("dialog", { name: "Shape", exact: true });
  await dialog
    .getByRole("button", { name: "Remove object", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await box.waitFor({ state: "hidden" });
  assert.equal(leesTekenobjecten(await bytes()).length, 3);
  stap(
    "Text box insertion and keyboard removal preserve the other three drawing objects",
  );
  await kies(0, 0);
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="xlsx-scroll"]')?.scrollTop === 0,
  );
  const beforeScroll = await image.boundingBox();
  await page.locator('[data-testid="xlsx-scroll"]').evaluate((el) => {
    el.scrollTop = 40;
  });
  await page.waitForFunction((before) => {
    const el = document.querySelector('[aria-label="Image: Imported logo"]');
    return el && Math.abs(el.getBoundingClientRect().top - (before - 40)) < 2;
  }, beforeScroll.y);
  await page.locator('[data-testid="xlsx-scroll"]').evaluate((el) => {
    el.scrollTop = 157;
  });
  await page.waitForFunction((before) => {
    const el = document.querySelector('[aria-label="Image: Imported logo"]');
    return (
      el &&
      getComputedStyle(el).visibility === "visible" &&
      Math.abs(el.getBoundingClientRect().top - (before - 157)) < 2
    );
  }, beforeScroll.y);
  await page.locator('[data-testid="xlsx-scroll"]').evaluate((el) => {
    el.scrollTop = 900;
  });
  await page.screenshot({ path: `${uit}/03-scrolled.png` });
  await page.locator('[data-testid="xlsx-scroll"]').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.waitForFunction((before) => {
    const el = document.querySelector('[aria-label="Image: Imported logo"]');
    return el && Math.abs(el.getBoundingClientRect().top - before) < 2;
  }, beforeScroll.y);
  stap(
    "Drawing positions follow scrolling and recover after their anchor leaves the viewport",
  );
  const final = await bytes();
  await writeFile(`${uit}/objects-saved.xlsx`, final);
  assert.deepEqual(
    new Pakket(final).bytes("custom/object-probe.bin"),
    new Uint8Array([7, 8, 9]),
  );
  await page.screenshot({ path: `${uit}/02-edited.png` });
  const far = voegTekenobjectToe(basis, 0, {
    naam: "Far logo",
    afbeelding: png,
    plek: { row: 250, col: 32, x: 5, y: 3, breedte: 100, hoogte: 60 },
  });
  await page
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name: "FarObjects.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(far),
    });
  await page
    .locator('.office-tabpaneel:not([hidden]) [aria-label="Image: Far logo"]')
    .waitFor({ state: "attached" });
  await page
    .locator(
      '.office-tabpaneel:not([hidden]) [data-testid="xlsx-object-extent"]',
    )
    .waitFor({ state: "attached" });
  await kies(250, 32);
  const farImage = page.getByRole("button", {
    name: "Image: Far logo",
    exact: true,
  });
  await farImage.waitFor({ state: "visible" });
  const farBox = await farImage.boundingBox(),
    gridBox = await page
      .locator('.office-tabpaneel:not([hidden]) [data-testid="xlsx-scroll"]')
      .boundingBox();
  assert(farBox.x >= gridBox.x && farBox.x < gridBox.x + gridBox.width);
  assert(farBox.y >= gridBox.y && farBox.y < gridBox.y + gridBox.height);
  assert.equal(
    await page.evaluate(
      () => proefApis().rekenblad.handle.cell(0, 250, 32).input,
    ),
    "",
  );
  await page.screenshot({ path: `${uit}/04-drawing-only-far.png` });
  stap(
    "A drawing-only worksheet scrolls to a distant image without adding cells",
  );
  for (const scale of [0.5, 2, 1]) {
    await page.evaluate(async (scale) => {
      const r = await proefApis().rekenblad.commands.execute("zoom", { scale });
      if (!r.ok) throw new Error("Zoom command refused");
    }, scale);
    await kies(250, 32);
    await page.waitForFunction((scale) => {
      const el = document.querySelector(
        '.office-tabpaneel:not([hidden]) [aria-label="Image: Far logo"]',
      );
      return (
        el &&
        getComputedStyle(el).visibility === "visible" &&
        Math.abs(el.getBoundingClientRect().width - 100 * scale) < 1
      );
    }, scale);
    const before = await farImage.boundingBox();
    const delta = await page
      .locator('.office-tabpaneel:not([hidden]) [data-testid="xlsx-scroll"]')
      .evaluate((el) => {
        const before = el.scrollTop;
        el.scrollTop -= 20;
        return el.scrollTop - before;
      });
    assert(delta < 0);
    (rapport.zoom ??= []).push({ scale, before, delta });
    await page.waitForFunction(
      ({ before, delta }) => {
        const el = document.querySelector(
          '.office-tabpaneel:not([hidden]) [aria-label="Image: Far logo"]',
        );
        return (
          el && Math.abs(el.getBoundingClientRect().top - (before - delta)) < 2
        );
      },
      { before: before.y, delta },
    );
  }
  stap(
    "Drawing size and scroll displacement remain correct at 50%, 100% and 200% zoom",
  );
  const frozen = new Pakket(
    voegTekenobjectToe(far, 0, {
      naam: "Frozen logo",
      afbeelding: png,
      plek: { row: 0, col: 0, x: 2, y: 2, breedte: 20, hoogte: 10 },
    }),
  );
  frozen.schrijf(
    "xl/worksheets/sheet1.xml",
    frozen
      .lees("xl/worksheets/sheet1.xml")
      .replace(
        /(<sheetView\b[^>]*>)/,
        '$1<pane xSplit="1" ySplit="1" topLeftCell="B2" state="frozen" activePane="bottomRight"/>',
      ),
  );
  await page
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name: "FrozenFarObjects.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(frozen.inpakken()),
    });
  const fixedImage = page.getByRole("button", {
    name: "Image: Frozen logo",
    exact: true,
  });
  await fixedImage.waitFor();
  await kies(250, 32);
  await farImage.waitFor();
  const fixedBefore = await fixedImage.boundingBox(),
    bodyBefore = await farImage.boundingBox();
  const scrollDelta = await page
    .locator('.office-tabpaneel:not([hidden]) [data-testid="xlsx-scroll"]')
    .evaluate((el) => {
      const x = el.scrollLeft,
        y = el.scrollTop;
      el.scrollLeft -= 40;
      el.scrollTop -= 40;
      return { x: el.scrollLeft - x, y: el.scrollTop - y };
    });
  assert(scrollDelta.x < 0 && scrollDelta.y < 0);
  await page.waitForFunction(
    ({ fixedBefore, bodyBefore, scrollDelta }) => {
      const root = document.querySelector(".office-tabpaneel:not([hidden])");
      const fixed = root
        .querySelector('[aria-label="Image: Frozen logo"]')
        ?.getBoundingClientRect();
      const body = root
        .querySelector('[aria-label="Image: Far logo"]')
        ?.getBoundingClientRect();
      return (
        fixed &&
        body &&
        Math.abs(fixed.x - fixedBefore.x) < 2 &&
        Math.abs(fixed.y - fixedBefore.y) < 2 &&
        Math.abs(body.x - (bodyBefore.x - scrollDelta.x)) < 2 &&
        Math.abs(body.y - (bodyBefore.y - scrollDelta.y)) < 2
      );
    },
    { fixedBefore, bodyBefore, scrollDelta },
  );
  stap(
    "Frozen-cell images stay fixed while body images follow both scroll axes",
  );
  const huge = new Uint8Array(png),
    header = new DataView(huge.buffer);
  header.setUint32(16, 20000);
  header.setUint32(20, 20000);
  const guarded = voegTekenobjectToe(basis, 0, {
    naam: "Oversized header",
    afbeelding: huge,
    plek: { row: 2, col: 2, x: 0, y: 0, breedte: 100, hoogte: 60 },
  });
  await page
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name: "GuardedImage.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(guarded),
    });
  const blocked = page.getByRole("button", {
    name: "Image: Oversized header",
    exact: true,
  });
  await blocked.waitFor();
  assert.equal(await blocked.locator("img").count(), 0);
  assert.deepEqual(leesTekenobjecten(await bytes())[0].media, huge);
  stap(
    "An embedded oversized image header gets a preserved placeholder before browser decoding",
  );
  const groupPng = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgcPkPAAGLAURM0jfCAAAAAElFTkSuQmCC",
      "base64",
    ),
  );
  const grouped = groepFixture(basis, groupPng);
  async function openGroep(bytes, name) {
    await page
      .locator(".office input[type=file]")
      .first()
      .setInputFiles({
        name,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from(bytes),
      });
    await page
      .getByRole("button", { name: "Shape: Nested group", exact: true })
      .waitFor();
  }
  await openGroep(grouped.bytes, "GroupedObjects.xlsx");
  let group = page.getByRole("button", {
    name: "Shape: Nested group",
    exact: true,
  });
  const picture = group.locator('img[alt="Grouped image"]');
  await picture.waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector(
        '.office-tabpaneel:not([hidden]) img[alt="Grouped image"]',
      )?.naturalWidth > 0,
  );
  let gb = await group.boundingBox(),
    pb = await picture.boundingBox();
  assert(Math.abs(pb.x - gb.x) < 1 && Math.abs(pb.y - gb.y) < 1);
  assert(Math.abs(pb.width - 80) < 1 && Math.abs(pb.height - 60) < 1);
  const rotated = await group.locator('[data-group-child="2"]').boundingBox();
  assert(
    rotated.y + rotated.height > gb.y + gb.height + 20,
    "Rotated descendants must remain visible beyond their group frame",
  );
  stap(
    "Nested groups render images and rotated text shapes in their own coordinate spaces",
  );
  await group.dblclick();
  dialog = page.getByRole("dialog", { name: "Shape", exact: true });
  await dialog
    .getByText("Grouped object. Move or resize the group as a whole.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await dialog.getByLabel("Text", { exact: true }).count(), 0);
  await dialog.getByLabel("Name", { exact: true }).fill("Moved group");
  await dialog.getByLabel("Anchor cell", { exact: true }).fill("E7");
  await dialog.getByLabel("Width (px)", { exact: true }).fill("400");
  await dialog.getByLabel("Height (px)", { exact: true }).fill("360");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  group = page.getByRole("button", { name: "Shape: Moved group", exact: true });
  await group.waitFor();
  const moved = await bytes(),
    mo = leesTekenobjecten(moved)[0],
    go = leesTekenobjecten(grouped.bytes)[0];
  assert.deepEqual(mo.groep, go.groep);
  assert.deepEqual(mo.plek, {
    row: 6,
    col: 4,
    x: 0,
    y: 0,
    breedte: 400,
    hoogte: 360,
  });
  const gx = new Pakket(moved).lees(grouped.pad);
  assert(
    gx.includes(grouped.shape) &&
      gx.includes(grouped.picture) &&
      gx.includes(grouped.extension),
  );
  assert.deepEqual(
    new Pakket(moved).bytes("custom/group-probe.bin"),
    new Uint8Array([2, 7, 1, 8]),
  );
  await writeFile(`${uit}/group-moved.xlsx`, moved);
  stap(
    "Moving/resizing a group preserves descendant XML, image bytes and unknown extensions",
  );
  for (const scale of [0.5, 2, 1]) {
    await page.evaluate(async (scale) => {
      const r = await proefApis().rekenblad.commands.execute("zoom", { scale });
      if (!r.ok) throw new Error("Zoom refused");
    }, scale);
    await page.waitForFunction((scale) => {
      const img = document.querySelector(
        '.office-tabpaneel:not([hidden]) img[alt="Grouped image"]',
      );
      return (
        img && Math.abs(img.getBoundingClientRect().width - 160 * scale) < 1
      );
    }, scale);
  }
  stap("Nested group scaling remains correct across 50%, 100% and 200% zoom");
  const mixed = groepFixture(basis, groupPng, { onbekend: true });
  await openGroep(mixed.bytes, "MixedGroup.xlsx");
  group = page.getByRole("button", {
    name: "Shape: Nested group",
    exact: true,
  });
  assert(
    (await group.locator('[data-group-child="302"]').textContent()).includes(
      "Unsupported star",
    ),
  );
  assert(new Pakket(await bytes()).lees(mixed.pad).includes('prst="star5"'));
  stap(
    "An unsupported child stays a named preserved placeholder within its visible group",
  );
  const mirrored = groepFixture(basis, groupPng, {
    rotatie: 30,
    flipX: true,
  });
  await openGroep(mirrored.bytes, "MirroredGroup.xlsx");
  group = page.getByRole("button", {
    name: "Shape: Nested group",
    exact: true,
  });
  await page.waitForFunction(
    () =>
      document.querySelector(
        '.office-tabpaneel:not([hidden]) img[alt="Grouped image"]',
      )?.naturalWidth > 0,
  );
  gb = await group.boundingBox();
  const point = {
    x:
      gb.x +
      gb.width / 2 +
      60 * Math.cos(Math.PI / 6) +
      60 * Math.sin(Math.PI / 6),
    y:
      gb.y +
      gb.height / 2 +
      60 * Math.sin(Math.PI / 6) -
      60 * Math.cos(Math.PI / 6),
  };
  const screenshot = await page.screenshot({
    path: `${uit}/05-mirrored-group.png`,
  });
  const pixel = await page.evaluate(
    async ({ bytes, point }) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 1;
        const ctx = c.getContext("2d");
        ctx.drawImage(image, point.x, point.y, 1, 1, 0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data);
      } finally {
        image.close();
      }
    },
    { bytes: Array.from(screenshot), point },
  );
  assert(
    pixel[0] < 20 && pixel[1] > 45 && pixel[1] < 95 && pixel[2] > 230,
    "The blue source image must occupy its independently transformed location",
  );
  stap(
    "A screenshot pixel confirms the combined group reflection and 30-degree rotation",
  );
  assert.deepEqual(rapport.fouten, []);
} catch (e) {
  await writeFile(
    `${uit}/error-state.json`,
    JSON.stringify(
      await page.evaluate(() => {
        const root = document.querySelector(".office-tabpaneel:not([hidden])");
        const scroll = root?.querySelector('[data-testid="xlsx-scroll"]');
        const image =
          root?.querySelector('[aria-label="Image: Far logo"]') ??
          root?.querySelector('[aria-label="Image: Imported logo"]');
        let f =
            image?.[
              Object.keys(image).find((k) => k.startsWith("__reactFiber$"))
            ],
          g;
        while (f) {
          if (f.memoizedProps?.geometry) {
            g = f.memoizedProps.geometry;
            break;
          }
          f = f.return;
        }
        const r = scroll?.getBoundingClientRect();
        const probes =
          g &&
          r &&
          [
            [70, 45],
            [70, 100],
            [300, 300],
          ].map(([x, y]) => {
            const p = g.getPositionAtPoint?.(r.left + x, r.top + y);
            return { p, rect: p && g.getCellRect(p) };
          });
        return {
          scrollTop: scroll?.scrollTop,
          scrollLeft: scroll?.scrollLeft,
          scrollHeight: scroll?.scrollHeight,
          scrollWidth: scroll?.scrollWidth,
          image: image?.getBoundingClientRect().toJSON(),
          style: image?.getAttribute("style"),
          layout: g?.layout,
          probes,
          ancestors: Array.from(
            (function* () {
              let p = image;
              while (p) {
                yield `${p.tagName}.${p.className}[${p.getAttribute("data-testid")}]`;
                p = p.parentElement;
              }
            })(),
          ),
        };
      }),
      null,
      2,
    ),
  );
  await page.screenshot({ path: `${uit}/error.png` });
  await writeFile(`${uit}/error.html`, await page.content());
  throw e;
} finally {
  await writeFile(`${uit}/rapport.json`, JSON.stringify(rapport, null, 2));
  await browser.close();
  await server.httpServer.close();
  await ssr.close();
}
