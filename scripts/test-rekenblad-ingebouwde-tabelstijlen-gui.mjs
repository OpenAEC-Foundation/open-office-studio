import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, preview } from "vite";
import { chromium } from "playwright";

const out =
  process.env.OFFICE_TEST_UIT ?? ".local/proef-ingebouwde-tabelstijlen";
await mkdir(out, { recursive: true });
const ssr = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
const { Pakket } = await ssr.ssrLoadModule("/src/grafieken/pakket.ts");
const original = new Uint8Array(
  await readFile("src/rekenblad/testdata/tabelstijl-medium2.xlsx"),
);
function variant(name, theme, flags = "") {
  const p = new Pakket(original);
  p.schrijf(
    "xl/tables/table1.xml",
    p
      .lees("xl/tables/table1.xml")
      .replace('name="TableStyleMedium2"', `name="${name}"`)
      .replace('showRowStripes="1"', flags || 'showRowStripes="1"'),
  );
  if (theme)
    p.schrijf(
      "xl/theme/theme1.xml",
      p
        .lees("xl/theme/theme1.xml")
        .replace(
          /<a:accent1>[\s\S]*?<\/a:accent1>/,
          `<a:accent1><a:srgbClr val="${theme}"/></a:accent1>`,
        ),
    );
  return p.inpakken();
}
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? ".local/dist-builtin" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch(),
  page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    locale: "en-GB",
  });
const report = { steps: [], errors: [] };
page.on("pageerror", (e) => report.errors.push(String(e)));
const step = (s) => {
  report.steps.push(s);
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
  async function open(bytes, name) {
    await page.evaluate(() => (window.oud = proefApi()?.handle));
    await page
      .locator(".office input[type=file]")
      .first()
      .setInputFiles({
        name,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from(bytes),
      });
    await page.waitForFunction(
      () => {
        try {
          return (
            proefApi()?.handle &&
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
    await page
      .locator(
        '.office-tabpaneel:not([hidden]) .rekenblad-tabelpijl[data-kolom="1"]',
      )
      .waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
    });
  }
  async function frame() {
    return page.evaluate(() => {
      const h = proefApi().handle,
        v = h.version(),
        history = h.historyState(),
        f = h.displayList({ x: 0, y: 0, width: 800, height: 300 });
      const result = {
        header: f.commands.find((c) => c.op === "text" && c.text === "Item"),
        fills: [
          ...new Set(
            f.commands.filter((c) => c.op === "fillRect").map((c) => c.color),
          ),
        ],
      };
      if (
        h.version() !== v ||
        JSON.stringify(h.historyState()) !== JSON.stringify(history)
      )
        throw Error("Rendering mutated workbook history");
      return result;
    });
  }
  async function screenshot(name, expected) {
    const box = await page
      .locator(
        '.office-tabpaneel:not([hidden]) .rekenblad-tabelpijl[data-kolom="1"]',
      )
      .boundingBox();
    const png = await page.screenshot({
      path: `${out}/${name}.png`,
      fullPage: true,
    });
    const actual = await page.evaluate(
      async ({ png, x, y }) => {
        const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0)),
          image = await createImageBitmap(
            new Blob([bytes], { type: "image/png" }),
          );
        const canvas = new OffscreenCanvas(image.width, image.height),
          ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        const rgb = [
          ...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data,
        ].slice(0, 3);
        image.close();
        return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
      },
      { png: png.toString("base64"), x: box.x - 20, y: box.y + box.height / 2 },
    );
    assert.equal(actual, expected, `${name}: visible header pixel`);
  }
  await open(original, "Builtin Medium2.xlsx");
  let f = await frame();
  assert.deepEqual([f.header.color, f.header.bold], ["#ffffff", true]);
  assert.ok(f.fills.includes("#dce6f2"));
  await screenshot("medium2", "#4f81bd");
  step(
    "Built-in Medium2 visibly renders its header and row bands without custom DXFs",
  );
  await page.evaluate(() => {
    proefApi().selectCells(0, {
      anchor: { row: 1, col: 1 },
      focus: { row: 1, col: 1 },
    });
    proefApi().focus();
  });
  await page.waitForFunction(() => {
    const c = proefContext()?.rekenbladLaag?.selectie()?.cells?.focus;
    return c?.row === 1 && c.col === 1;
  });
  await page.keyboard.type("6");
  await page.keyboard.press("Enter");
  const download = page.waitForEvent("download"),
    dialog = page.getByRole("dialog", { name: /^Save as$/i });
  const route = Promise.race([
    download.then(() => "download"),
    dialog.waitFor().then(() => "dialog"),
  ]);
  await page.keyboard.press("Control+s");
  if ((await route) === "dialog")
    await dialog.getByRole("button", { name: /^Save$/i }).click();
  const saved = new Uint8Array(await readFile(await (await download).path())),
    before = new Pakket(original),
    after = new Pakket(saved);
  assert.equal(
    after.lees("xl/tables/table1.xml"),
    before.lees("xl/tables/table1.xml"),
  );
  assert.equal(after.lees("xl/styles.xml"), before.lees("xl/styles.xml"));
  await writeFile(`${out}/saved.xlsx`, saved);
  await open(saved, "Reopened Medium2.xlsx");
  assert.deepEqual(
    await page.evaluate(() => {
      const h = proefApi().handle,
        result = h.readCells({
          ranges: [
            {
              sheetId: h.sheetInfo().sheetIds[0],
              range: { kind: "a1", a1: "B2" },
            },
          ],
        });
      if (!result.ok) throw Error(result.failure.message);
      return result.ranges[0].cells[0][0].value;
    }),
    { kind: "number", value: 6 },
  );
  f = await frame();
  assert.equal(f.header.color, "#ffffff");
  await screenshot("reopened", "#4f81bd");
  step(
    "Ordinary cell editing, Ctrl+S download and reopening preserve the table/style parts",
  );
  await open(variant("TableStyleMedium2", "112233"), "Theme.xlsx");
  await screenshot("theme", "#112233");
  step("The visible header follows the workbook accent color");
  for (const [name, color, pixel] of [
    ["TableStyleLight2", "#376092", "#ffffff"],
    ["TableStyleDark2", "#ffffff", "#000000"],
  ]) {
    await open(variant(name), `${name}.xlsx`);
    f = await frame();
    assert.equal(f.header.color, color);
    await screenshot(name, pixel);
  }
  step("Light and Dark presets render their actual font/fill facets");
  await open(
    variant("TableStyleMedium2", null, 'showRowStripes="0"'),
    "No bands.xlsx",
  );
  f = await frame();
  assert.equal(f.fills.includes("#dce6f2"), false);
  await screenshot("no-bands", "#4f81bd");
  step("Disabling row bands removes their fill while retaining the header");
  await open(variant("VendorKeepStyle"), "Unknown style.xlsx");
  f = await frame();
  assert.equal(f.header.color, "#000000");
  await screenshot("unknown", "#ffffff");
  step("An unknown style name remains preserved without an invented fallback");
  assert.deepEqual(report.errors, []);
} catch (e) {
  report.failure = String(e);
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true });
  await writeFile(`${out}/failure.txt`, await page.locator("body").innerText());
  throw e;
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
  await ssr.close();
}
