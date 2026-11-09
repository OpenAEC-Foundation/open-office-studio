import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { initWasm, openPresentation } from "@betteroffice/pptx";
import { unzipSync, strFromU8 } from "fflate";
import { preview } from "vite";

const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
await initWasm(
  await readFile(
    "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
  ),
);
const output = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-presentatie-tabellen",
);
await mkdir(output, { recursive: true });
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch(),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    permissions: ["clipboard-read", "clipboard-write"],
  }),
  page = await context.newPage();
const report = { cases: [], errors: [] };
page.on("pageerror", (e) => report.errors.push(String(e)));
const ready = () =>
  page.waitForFunction(() => {
    try {
      return !!proefApi()?.handle.snapshot().slides.length;
    } catch {
      return false;
    }
  });
const bytes = async () =>
  new Uint8Array(
    await page.evaluate(() => Array.from(proefApi().handle.save())),
  );
const xml = async () =>
  strFromU8(unzipSync(await bytes())["ppt/slides/slide1.xml"]);
async function run(name, test) {
  await test();
  report.cases.push(name);
  console.log(`OK: ${name}`);
}
async function open(existing = true) {
  await ready();
  await page
    .locator('button[role="tab"]:visible')
    .filter({ hasText: /^Insert$/ })
    .click();
  await page.getByRole("button", { name: "Tables", exact: true }).click();
  const d = page.getByRole("dialog", { name: "Tables", exact: true });
  await d.waitFor();
  if (existing) {
    const val = await d
      .getByLabel("Choose table", { exact: true })
      .locator("option")
      .nth(1)
      .getAttribute("value");
    await d.getByLabel("Choose table", { exact: true }).selectOption(val);
  }
  return d;
}
const cell = (d, r, c) =>
  d.getByRole("textbox", { name: `Cell ${r}, ${c}`, exact: true });
async function select(d, range) {
  await d.getByLabel("Cell range", { exact: true }).fill(range);
  await d.getByRole("button", { name: "Select", exact: true }).click();
}
async function apply(d, name = "Apply") {
  await page.evaluate(() => (window.voorTabel = proefApi()));
  await d.getByRole("button", { name, exact: true }).click();
  await d.waitFor({ state: "hidden" });
  await page.waitForFunction(() => {
    try {
      return (
        proefApi() !== window.voorTabel &&
        !!proefApi()?.handle.snapshot().slides.length
      );
    } catch {
      return false;
    }
  });
}
try {
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({
        taal: "en",
        thema: "forge",
        spelling: { controleren: false },
      }),
    ),
  );
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name: "Tables.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: await readFile("public/templates/nieuw.pptx"),
    });
  await page.evaluate(() => {
    window.proefApi = () => {
      const el = document.querySelector(
        ".office-tabpaneel:not([hidden]) .office-presentatie",
      );
      if (!el) return null;
      for (
        let f = el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      )
        if (f.memoizedProps?.value?.presentatie)
          return f.memoizedProps.value.presentatie;
      return null;
    };
  });
  await ready();
  await run(
    "Insert a styled 4×3 table with a genuine rectangular merge",
    async () => {
      const d = await open(false);
      await d.getByLabel("Rows", { exact: true }).fill("4");
      await d
        .getByRole("button", { name: "Apply dimensions", exact: true })
        .click();
      for (const [r, c, text] of [
        [1, 1, "A"],
        [1, 2, "B"],
        [2, 1, "C"],
        [2, 2, "D"],
        [3, 3, "Preserved"],
      ])
        await cell(d, r, c).fill(text);
      await d.getByLabel("Table style", { exact: true }).selectOption("blue");
      await select(d, "A1:B2");
      await d.getByRole("button", { name: "Merge cells", exact: true }).click();
      assert.equal(await cell(d, 1, 1).inputValue(), "A\nB\nC\nD");
      await apply(d, "Insert");
      assert.ok((await xml()).includes('gridSpan="2"'));
      assert.ok((await xml()).includes('rowSpan="2"'));
      assert.ok((await xml()).includes("DDEAFF"));
      assert.ok(
        await page.evaluate(() =>
          proefApi()
            .handle.layoutSlide(0)
            .primitives.some((p) => p.kind === "table"),
        ),
      );
    },
  );
  await run(
    "Edit an existing table, split cells and insert/delete rows and columns",
    async () => {
      const d = await open();
      await d.getByRole("button", { name: "Split cell", exact: true }).click();
      await d.getByRole("button", { name: "Insert row", exact: true }).click();
      await d.getByRole("button", { name: "Delete row", exact: true }).click();
      await d
        .getByRole("button", { name: "Insert column", exact: true })
        .click();
      await d
        .getByRole("button", { name: "Delete column", exact: true })
        .click();
      assert.equal(
        await d.getByLabel("Rows", { exact: true }).inputValue(),
        "4",
      );
      assert.equal(
        await d.getByLabel("Columns", { exact: true }).inputValue(),
        "3",
      );
      assert.equal(await cell(d, 3, 3).inputValue(), "Preserved");
      await cell(d, 2, 2).fill("Changed");
      await apply(d);
      assert.ok((await xml()).includes("Changed"));
      assert.ok(!(await xml()).includes('rowSpan="2"'));
    },
  );
  await run(
    "Format selected cells with fill, borders, alignment and margins",
    async () => {
      const d = await open();
      await select(d, "B2:C3");
      await d.getByLabel("Cell fill", { exact: true }).fill("#ffeecc");
      await d.getByLabel("Border color", { exact: true }).fill("#345678");
      await d.getByLabel("Border (pt)", { exact: true }).fill("2");
      await d.getByLabel("Alignment", { exact: true }).selectOption("ctr");
      await d.getByLabel("Vertical", { exact: true }).selectOption("ctr");
      await d.getByLabel("Cell margin (cm)", { exact: true }).fill("0.3");
      await d
        .getByRole("button", { name: "Format selection", exact: true })
        .click();
      await d.screenshot({ path: resolve(output, "tables.png") });
      await apply(d);
      const x = await xml();
      assert.ok(x.includes('val="FFEECC"'));
      assert.ok(x.includes('marL="108000"'));
      assert.ok(x.includes('w="25400"'));
      assert.ok(x.includes('algn="ctr"'));
    },
  );
  await run(
    "Partial merge and invalid dimensions are refused without changing the document",
    async () => {
      const before = await xml(),
        d = await open();
      await select(d, "A1:B2");
      await d.getByRole("button", { name: "Merge cells", exact: true }).click();
      await select(d, "B2:C3");
      await d.getByRole("button", { name: "Merge cells", exact: true }).click();
      await d.getByRole("alert").filter({ hasText: "cuts through" }).waitFor();
      assert.equal(await cell(d, 1, 1).count(), 1);
      await d.getByLabel("Rows", { exact: true }).fill("0");
      await d
        .getByRole("button", { name: "Apply dimensions", exact: true })
        .click();
      await d.getByRole("alert").waitFor();
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await xml(), before);
    },
  );
  await run(
    "Actual Ctrl+V accepts spreadsheet TSV and a merged text-document HTML table",
    async () => {
      let d = await open();
      await cell(d, 1, 1).focus();
      await page.evaluate(() =>
        navigator.clipboard.writeText("From sheet\t12\nRow 2\t=1+2"),
      );
      await page.keyboard.press("Control+v");
      await cell(d, 2, 2).filter({ visible: true }).waitFor();
      assert.equal(await cell(d, 2, 2).inputValue(), "=1+2");
      await apply(d);
      d = await open();
      await cell(d, 1, 1).focus();
      await page.evaluate(async () => {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob(
              [
                '<table><tr><td colspan="2"><p>From Writer<br/>Second line</p></td></tr><tr><td>Left</td><td>Right</td></tr></table>',
              ],
              { type: "text/html" },
            ),
            "text/plain": new Blob(["From Writer\t\nLeft\tRight"], {
              type: "text/plain",
            }),
          }),
        ]);
      });
      await page.keyboard.press("Control+v");
      await page.waitForFunction(() =>
        document.querySelector('.tabel-rooster td[colspan="2"]'),
      );
      assert.equal(
        await cell(d, 1, 1).inputValue(),
        "From Writer\nSecond line",
      );
      await apply(d);
      const x = await xml();
      assert.ok(x.includes("From Writer"));
      assert.ok(x.includes('gridSpan="2"'));
      assert.ok(x.includes("Preserved"));
    },
  );
  await run(
    "Actual Save As download and independent reopen retain editable tables",
    async () => {
      await page.keyboard.press("Control+s");
      const save = page.getByRole("dialog", { name: "Save as", exact: true });
      await save.waitFor();
      const download = page.waitForEvent("download");
      await save.getByRole("button", { name: "Save", exact: true }).click();
      const file = await download,
        path = resolve(output, "tables-saved.pptx");
      await file.saveAs(path);
      const b = await readFile(path),
        h = openPresentation(b);
      try {
        h.registerFont({
          family: "Arial",
          bytes: await readFile(
            "node_modules/@betteroffice/fonts/assets/LiberationSans-Regular.ttf",
          ),
        });
        assert.ok(h.layoutSlide(0).primitives.some((p) => p.kind === "table"));
        assert.ok(
          strFromU8(unzipSync(h.save())["ppt/slides/slide1.xml"]).includes(
            "From Writer",
          ),
        );
      } finally {
        h.dispose();
      }
      await page.evaluate(() => (window.voorTabel = proefApi()));
      await page
        .locator(".office input[type=file]")
        .first()
        .setInputFiles(path);
      await page.waitForFunction(() => {
        try {
          return (
            proefApi() !== window.voorTabel &&
            !!proefApi()?.handle.snapshot().slides.length
          );
        } catch {
          return false;
        }
      });
      const d = await open();
      assert.equal(
        await cell(d, 1, 1).inputValue(),
        "From Writer\nSecond line",
      );
      assert.equal(await cell(d, 3, 3).inputValue(), "Preserved");
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
    },
  );
  assert.deepEqual(report.errors, []);
} catch (e) {
  await page.screenshot({ path: resolve(output, "failure.png") });
  try {
    await writeFile(resolve(output, "failure.pptx"), await bytes());
  } catch {}
  throw e;
} finally {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
