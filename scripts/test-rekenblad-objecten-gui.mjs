/** #75: zichtbare objectbediening plus onafhankelijke inspectie van opgeslagen OOXML. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer, preview } from "vite";
const { chromium } = await import(
  process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright"
);
const uit = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-rekenblad-objecten",
);
await mkdir(uit, { recursive: true });
const ssr = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
  appType: "custom",
});
const { voegTekenobjectToe, leesTekenobjecten } = await ssr.ssrLoadModule(
  "/src/rekenblad/tekenobjecten.ts",
);
const { Pakket } = await ssr.ssrLoadModule("/src/grafieken/pakket.ts");
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
  await page
    .getByLabel("Choose image", { exact: true })
    .setInputFiles({
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
  const final = await bytes();
  await writeFile(`${uit}/objects-saved.xlsx`, final);
  assert.deepEqual(
    new Pakket(final).bytes("custom/object-probe.bin"),
    new Uint8Array([7, 8, 9]),
  );
  await page.screenshot({ path: `${uit}/02-edited.png` });
  assert.deepEqual(rapport.fouten, []);
} catch (e) {
  await page.screenshot({ path: `${uit}/error.png` });
  await writeFile(`${uit}/error.html`, await page.content());
  throw e;
} finally {
  await writeFile(`${uit}/rapport.json`, JSON.stringify(rapport, null, 2));
  await browser.close();
  await server.httpServer.close();
  await ssr.close();
}
