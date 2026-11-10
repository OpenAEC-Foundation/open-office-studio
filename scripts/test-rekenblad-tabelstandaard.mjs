/** #324: custom DXFs through the production upload, preview, save and fresh-open routes. */
import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createServer, preview } from "vite";
import { initWasm } from "@betteroffice/xlsx";
import { chromium } from "playwright";

const out = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-tabelstandaard",
);
const dist = process.env.OFFICE_TEST_DIST ?? ".local/dist-324";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
await mkdir(out, { recursive: true });
// Same bundled fonts as the normal asset-preparation step, with no network dependency.
await cp("node_modules/@betteroffice/fonts/assets", `${dist}/fonts`, {
  recursive: true,
});
const wasm = await readFile("vendor/rekenbladengine/xlsx_wasm_bg.wasm");
await initWasm(wasm);
const ssr = await createServer({
  configFile: false,
  appType: "custom",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
});
const { tabelstandaardBron } = await ssr.ssrLoadModule(
  "/src/rekenblad/testdata/tabelstandaard.ts",
);
const { Pakket } = await ssr.ssrLoadModule("/src/grafieken/pakket.ts");
const server = await preview({
  configFile: false,
  build: { outDir: dist },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch({ headless: true });
const report = {
  codepoint: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  platform: process.platform,
  browser: await browser.version(),
  wasmSha256: sha(wasm),
  cases: [],
  errors: [],
};
const deadline = setTimeout(() => void browser.close(), 120000);
deadline.unref();

async function open(bytes, name) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({ taal: "en", spelling: false, autocorrectie: false }),
    ),
  );
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(bytes),
    });
  await page.evaluate(() => {
    window.tableProbe = () => {
      const el = document.querySelector(
        ".office-tabpaneel:not([hidden]) .office-rekenblad-host",
      );
      for (
        let f =
          el?.[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      ) {
        const value = f.memoizedProps?.value;
        if (value?.rekenblad?.handle && value.herlaad) return value.rekenblad;
      }
      return null;
    };
  });
  await page.waitForFunction(
    () => window.tableProbe?.()?.handle.sheetCount() === 1,
    null,
    { timeout: 30000 },
  );
  return { context, page };
}
async function inspect(page) {
  return page.evaluate(() => {
    const h = tableProbe().handle;
    const before = {
      version: h.version(),
      history: h.historyState(),
      saved: Array.from(h.save()),
    };
    const viewport = { x: 0, y: 0, width: 400, height: 150 };
    const metrics = {
      dpi: 96,
      maxDigitWidth: 7,
      defaultRowHeightPt: 15,
      fontSizePt: 11,
      fontFamily: "Calibri",
      fontAscent: 10,
      fontDescent: 3,
    };
    const frames = [
      h.displayList(viewport),
      h.displayListProfiled(viewport).displayList,
      h.printDisplayList(0, "A1:B3", metrics, false),
    ];
    return {
      sourceStyles: h.captureFormat(0, "A1:B3").sourceStyles,
      before,
      frames: frames.map((f) => ({
        header: f.commands.find((c) => c.op === "text" && c.text === "Item"),
        colors: f.commands
          .filter((c) => c.op === "fillRect")
          .map((c) => c.color.toLowerCase()),
      })),
      after: {
        version: h.version(),
        history: h.historyState(),
        saved: Array.from(h.save()),
      },
    };
  });
}
function check(result) {
  for (const frame of result.frames) {
    assert.equal(frame.header.bold, true);
    assert.equal(frame.header.color.toLowerCase(), "#ffffff");
    assert(frame.colors.includes("#365f91"));
    assert(frame.colors.includes("#dce6f1"));
  }
  assert.deepEqual(result.after, result.before);
}
try {
  for (const implicit of [false, true]) {
    const name = implicit ? "implicit" : "explicit",
      bytes = tabelstandaardBron(implicit);
    await writeFile(`${out}/${name}.xlsx`, bytes);
    const { page, context } = await open(bytes, `${name}.xlsx`);
    try {
      const result = await inspect(page);
      check(result);
      assert(
        result.sourceStyles.every((id) =>
          implicit ? id === null : id !== null,
        ),
      );
      await page.screenshot({ path: `${out}/${name}-screen.png` });
      await page.locator('[data-testid="xlsx-scroll"]').focus();
      await page.keyboard.press("Control+p");
      const image = page.locator(".afdruk-pagina img");
      await image.waitFor({ timeout: 30000 });
      await image.evaluate((img) => img.decode());
      const pixels = await image.evaluate((img) => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let blue = 0,
          band = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (
            Math.abs(data[i] - 54) < 2 &&
            Math.abs(data[i + 1] - 95) < 2 &&
            Math.abs(data[i + 2] - 145) < 2
          )
            blue++;
          if (
            Math.abs(data[i] - 220) < 2 &&
            Math.abs(data[i + 1] - 230) < 2 &&
            Math.abs(data[i + 2] - 241) < 2
          )
            band++;
        }
        return { blue, band };
      });
      assert(
        pixels.blue > 1000 && pixels.band > 1000,
        "Actual print-preview image must paint header and bands",
      );
      await image.screenshot({ path: `${out}/${name}-print.png` });
      await page
        .locator(".afdrukvoorbeeld")
        .getByRole("button", { name: "Close", exact: true })
        .last()
        .click();
      const afterPrint = await inspect(page);
      check(afterPrint);
      assert.deepEqual(
        afterPrint.before,
        result.before,
        "Preparing print must not edit the workbook",
      );
      await page.locator('[data-testid="xlsx-scroll"]').focus();
      await page.keyboard.press("Control+s");
      const save = page.getByRole("dialog", { name: "Save as", exact: true });
      await save.waitFor();
      const downloaded = page.waitForEvent("download");
      await save.getByRole("button", { name: "Save", exact: true }).click();
      await (await downloaded).saveAs(`${out}/${name}-saved.xlsx`);
      const saved = await readFile(`${out}/${name}-saved.xlsx`),
        originalPackage = new Pakket(bytes),
        savedPackage = new Pakket(saved);
      for (const path of [
        "xl/styles.xml",
        "xl/worksheets/sheet1.xml",
        "xl/tables/table1.xml",
      ])
        assert.equal(
          savedPackage.lees(path),
          originalPackage.lees(path),
          `Preserved source ${path}`,
        );
      const fresh = await open(saved, `${name}-saved.xlsx`);
      try {
        check(await inspect(fresh.page));
      } finally {
        await fresh.context.close();
      }
      report.cases.push({
        name,
        sourceSha256: sha(bytes),
        savedSha256: sha(saved),
        sourceStyles: result.sourceStyles,
        routes: result.frames,
        previewPixels: pixels,
        sourcePartsUnchanged: true,
        versionHistoryUnchanged: true,
        freshReopen: true,
      });
      console.log(
        `PASS ${name}: screen/profile/print, actual preview pixels, save and fresh reopen`,
      );
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(
    `${out}/rapport.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  clearTimeout(deadline);
  await browser.close();
  await server.httpServer.close();
  await ssr.close();
}
