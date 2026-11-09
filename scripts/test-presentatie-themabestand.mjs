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
  process.env.OFFICE_TEST_UIT ?? ".local/proef-presentatie-themabestand",
);
await mkdir(output, { recursive: true });
const fixture = await readFile("public/templates/nieuw.pptx"),
  server = await preview({
    configFile: false,
    build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
    preview: { host: "127.0.0.1", port: 0, open: false },
  }),
  url = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch(),
  report = { cases: [], errors: [] };
let page, context;
const name = "AEC huisstijl 🧱";
async function setup(b, filename) {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    p = await context.newPage();
  p.on("pageerror", (e) => report.errors.push(String(e)));
  await p.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({
        taal: "en",
        thema: "forge",
        spelling: { controleren: false },
      }),
    ),
  );
  await p.goto(url);
  await p
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name: filename,
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: b,
    });
  await p.evaluate(() => {
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
  await p.waitForFunction(() => {
    try {
      return !!proefApi()?.handle.snapshot().slides.length;
    } catch {
      return false;
    }
  });
  return { context, page: p };
}
async function dialog() {
  await page
    .locator('button[role="tab"]:visible')
    .filter({ hasText: /^Slide$/ })
    .click();
  await page.getByRole("button", { name: "Themes", exact: true }).click();
  const d = page.getByRole("dialog", { name: "Themes", exact: true });
  await d.waitFor();
  return d;
}
async function choose(d, buffer, filename = "Imported.oos-theme") {
  const event = page.waitForEvent("filechooser");
  await d.getByRole("button", { name: "Import theme", exact: true }).click();
  await (
    await event
  ).setFiles({ name: filename, mimeType: "application/json", buffer });
}
async function run(title, test) {
  await test();
  report.cases.push(title);
  console.log(`OK: ${title}`);
}
function verifyPackage(b) {
  const p = unzipSync(b),
    themes = Object.entries(p)
      .filter(([n]) => /^ppt\/theme\/[^/]+\.xml$/.test(n))
      .map(([, v]) => strFromU8(v));
  assert.ok(
    themes.some(
      (s) => s.includes('val="12AB34"') && s.includes('typeface="Arial"'),
    ),
  );
  const slide = strFromU8(p["ppt/slides/slide1.xml"]);
  assert.ok(slide.includes('val="EFE4DC"'));
}
try {
  ({ context, page } = await setup(fixture, "Theme source.pptx"));
  let exported;
  await run(
    "Export a custom theme through a real download without changing the source presentation",
    async () => {
      const version = await page.evaluate(() => proefApi().handle.version()),
        d = await dialog();
      await d.getByRole("button", { name: "Ocean", exact: true }).click();
      await d.getByLabel("Name", { exact: true }).fill(name);
      await d.getByLabel("Accent 1", { exact: true }).fill("#12ab34");
      await d.getByLabel("Background", { exact: true }).fill("#efe4dc");
      const pending = page.waitForEvent("download");
      await d
        .getByRole("button", { name: "Export theme", exact: true })
        .click();
      const dl = await pending;
      assert.ok(dl.suggestedFilename().endsWith(".oos-theme"));
      const path = resolve(output, "custom.oos-theme");
      await dl.saveAs(path);
      exported = await readFile(path);
      const parsed = JSON.parse(exported.toString("utf8"));
      assert.equal(parsed.formaat, "OpenOfficeStudio.Theme");
      assert.equal(parsed.versie, 1);
      assert.equal(parsed.thema.naam, name);
      assert.equal(parsed.thema.kleuren[4], "#12AB34");
      assert.equal(parsed.thema.achtergrond, "#EFE4DC");
      assert.deepEqual(
        Object.keys(parsed.thema).sort(),
        ["naam", "kleuren", "kop", "tekst", "achtergrond"].sort(),
      );
      await d
        .getByRole("status")
        .filter({ hasText: "Theme exported." })
        .waitFor();
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(
        await page.evaluate(() => proefApi().handle.version()),
        version,
      );
      await context.close();
      ({ context, page } = await setup(fixture, "Theme receiver.pptx"));
    },
  );
  await run(
    "Reject malformed and oversized theme files without altering the preview or document",
    async () => {
      const d = await dialog(),
        version = await page.evaluate(() => proefApi().handle.version());
      await choose(d, Buffer.from('{"formaat":"other"}'));
      await d
        .getByRole("status")
        .filter({ hasText: "Choose a valid Open Office Studio theme file." })
        .waitFor();
      assert.equal(
        await d.getByLabel("Name", { exact: true }).inputValue(),
        "Paper",
      );
      await choose(d, Buffer.alloc(65537));
      await d
        .getByRole("status")
        .filter({ hasText: "Use a theme file up to 64 KB." })
        .waitFor();
      assert.equal(
        await d.getByLabel("Name", { exact: true }).inputValue(),
        "Paper",
      );
      assert.equal(
        await page.evaluate(() => proefApi().handle.version()),
        version,
      );
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
    },
  );
  await run(
    "Import on a fresh device, review the preview and persist the custom preset before applying",
    async () => {
      const d = await dialog(),
        version = await page.evaluate(() => proefApi().handle.version());
      await choose(d, exported);
      await d
        .getByRole("status")
        .filter({ hasText: "Theme imported." })
        .waitFor();
      assert.equal(
        await d.getByLabel("Name", { exact: true }).inputValue(),
        name,
      );
      assert.equal(
        await d.getByLabel("Accent 1", { exact: true }).inputValue(),
        "#12ab34",
      );
      assert.equal(
        await page.evaluate(() => proefApi().handle.version()),
        version,
      );
      await d
        .getByRole("button", { name: "Save custom theme", exact: true })
        .click();
      await d
        .getByRole("status")
        .filter({ hasText: "Theme saved on this device." })
        .waitFor();
      await d.screenshot({ path: resolve(output, "theme-imported.png") });
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
      const reopened = await dialog();
      await reopened.getByRole("button", { name, exact: true }).click();
      await page.evaluate(() => (window.beforeTheme = proefApi()));
      await reopened
        .getByRole("button", { name: "Apply", exact: true })
        .click();
      await reopened.waitFor({ state: "hidden" });
      await page.waitForFunction(() => {
        try {
          return proefApi() && proefApi() !== window.beforeTheme;
        } catch {
          return false;
        }
      });
      verifyPackage(
        new Uint8Array(
          await page.evaluate(() => Array.from(proefApi().handle.save())),
        ),
      );
    },
  );
  await run(
    "Save As and independent engine/app reopen retain the imported theme and background",
    async () => {
      await page.keyboard.press("Control+s");
      const save = page.getByRole("dialog", { name: "Save as", exact: true });
      await save.waitFor();
      const pending = page.waitForEvent("download");
      await save.getByRole("button", { name: "Save", exact: true }).click();
      const dl = await pending,
        path = resolve(output, "theme-saved.pptx");
      await dl.saveAs(path);
      const b = await readFile(path);
      verifyPackage(b);
      const h = openPresentation(b);
      assert.equal(h.snapshot().slides.length, 1);
      verifyPackage(h.save());
      h.dispose();
      await context.close();
      ({ context, page } = await setup(b, "Reopened.pptx"));
      verifyPackage(
        new Uint8Array(
          await page.evaluate(() => Array.from(proefApi().handle.save())),
        ),
      );
    },
  );
  assert.deepEqual(report.errors, []);
} catch (e) {
  await page?.screenshot({ path: resolve(output, "failure.png") });
  throw e;
} finally {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
