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
const bytes = await readFile("docs/voorbeelden/Ontwerpvisie.pptx");
const output = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-presentatie-ontwerp",
);
await mkdir(output, { recursive: true });
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const report = { cases: [], errors: [] };
page.on("pageerror", (e) => report.errors.push(String(e)));
const liveBytes = async () =>
  new Uint8Array(
    await page.evaluate(() => Array.from(proefApi().handle.save())),
  );
const part = (b, p) => strFromU8(unzipSync(b)[p]);
const rootSlide = "ppt/slides/slide1.xml";
async function run(name, test) {
  await test();
  report.cases.push(name);
  console.log(`OK: ${name}`);
}
const ready = () =>
  page.waitForFunction(() => {
    try {
      return !!window.proefApi()?.handle.snapshot().slides.length;
    } catch {
      return false;
    }
  });
async function open(name) {
  await ready();
  await page
    .locator('button[role="tab"]:visible')
    .filter({ hasText: /^Slide$/ })
    .click();
  await page.getByRole("button", { name, exact: true }).click();
  const d = page.getByRole("dialog", { name, exact: true });
  await d.waitFor();
  return d;
}
async function reload(d, button = "Apply") {
  await page.evaluate(() => (window.voorOntwerp = proefApi()));
  await d.getByRole("button", { name: button, exact: true }).click();
  await d.waitFor({ state: "hidden" });
  await page.waitForFunction(() => {
    try {
      return (
        proefApi() !== window.voorOntwerp &&
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
  await page.locator(".office input[type=file]").first().setInputFiles({
    name: "Design.pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: bytes,
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
  let layout;
  await run("Duplicate a layout and assign it only to slides 2–3", async () => {
    let d = await open("Masters and layouts");
    await d.getByLabel("Name", { exact: true }).fill("Studio layout");
    await reload(d, "Duplicate");
    d = await open("Masters and layouts");
    layout = await d
      .getByLabel("Master or layout", { exact: true })
      .locator("option")
      .filter({ hasText: "Studio layout" })
      .getAttribute("value");
    assert.ok(layout);
    await d
      .getByLabel("Master or layout", { exact: true })
      .selectOption(layout);
    await d.getByLabel("Apply to", { exact: true }).selectOption("range");
    await d.getByLabel("Slide range", { exact: true }).fill("2-3");
    await d.getByLabel("Reset placeholder positions", { exact: true }).check();
    await reload(d);
    const b = await liveBytes();
    for (const n of [2, 3])
      assert.ok(
        part(b, `ppt/slides/_rels/slide${n}.xml.rels`).includes(
          layout.split("/").pop(),
        ),
      );
    assert.ok(
      !part(b, "ppt/slides/_rels/slide1.xml.rels").includes(
        layout.split("/").pop(),
      ),
    );
    d = await open("Masters and layouts");
    await d
      .getByLabel("Master or layout", { exact: true })
      .selectOption(layout);
    assert.equal(
      await d.getByRole("button", { name: "Delete", exact: true }).isDisabled(),
      true,
    );
    await d.getByRole("button", { name: "Cancel", exact: true }).click();
  });
  await run("Invalid slide range leaves the document unchanged", async () => {
    const before = Buffer.from(await liveBytes());
    const d = await open("Themes");
    await d.getByLabel("Apply to", { exact: true }).selectOption("range");
    await d.getByLabel("Slide range", { exact: true }).fill("99-1");
    await d.getByRole("button", { name: "Apply", exact: true }).click();
    await d.getByRole("status").waitFor();
    assert.ok(before.equals(Buffer.from(await liveBytes())));
    await d.getByRole("button", { name: "Cancel", exact: true }).click();
  });
  await run(
    "Theme preview, custom colors/fonts and persistent custom preset",
    async () => {
      let d = await open("Themes");
      await d.getByRole("button", { name: "Ocean", exact: true }).click();
      await d.getByLabel("Name", { exact: true }).fill("Studio custom");
      await d.getByLabel("Heading font", { exact: true }).fill("Arial");
      await d.getByLabel("Accent 1", { exact: true }).fill("#cc3366");
      await d
        .getByRole("button", { name: "Save custom theme", exact: true })
        .click();
      await d.getByRole("status").filter({ hasText: "Theme saved" }).waitFor();
      await page.screenshot({ path: resolve(output, "themes.png") });
      await d.getByLabel("Apply to", { exact: true }).selectOption("range");
      await d.getByLabel("Slide range", { exact: true }).fill("3");
      const before = await liveBytes();
      await reload(d);
      const b = await liveBytes(),
        parts = unzipSync(b);
      assert.equal(
        part(b, "ppt/slides/_rels/slide2.xml.rels"),
        part(before, "ppt/slides/_rels/slide2.xml.rels"),
      );
      assert.ok(
        Object.entries(parts).some(
          ([p, v]) =>
            p.startsWith("ppt/theme/oosTheme") &&
            strFromU8(v).includes("CC3366"),
        ),
      );
      d = await open("Themes");
      await d
        .getByRole("button", { name: "Studio custom", exact: true })
        .click();
      assert.equal(
        await d.getByLabel("Accent 1", { exact: true }).inputValue(),
        "#cc3366",
      );
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
    },
  );
  await run(
    "Gradient and inherited master background are stored as genuine PPTX data",
    async () => {
      let d = await open("Background");
      await d.getByLabel("Fill", { exact: true }).selectOption("verloop");
      await d.getByLabel("Color", { exact: true }).fill("#123456");
      await d.getByLabel("Second color", { exact: true }).fill("#abcdef");
      await d.getByLabel("Angle (degrees)", { exact: true }).fill("45");
      await reload(d);
      assert.ok(part(await liveBytes(), rootSlide).includes('ang="2700000"'));
      d = await open("Background");
      await d
        .getByLabel("Change background for", { exact: true })
        .selectOption("master");
      await d.getByLabel("Color", { exact: true }).fill("#334455");
      await reload(d);
      const parts = unzipSync(await liveBytes());
      assert.ok(
        Object.entries(parts).some(
          ([p, v]) =>
            /slideMasters\/[^/]+\.xml$/.test(p) &&
            strFromU8(v).includes('val="334455"'),
        ),
      );
    },
  );
  await run(
    "PNG background survives actual Save As download and independent reopen",
    async () => {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
        "base64",
      );
      const d = await open("Background");
      await d.getByLabel("Fill", { exact: true }).selectOption("afbeelding");
      await d
        .getByLabel("Image (PNG or JPEG, up to 20 MB)", { exact: true })
        .setInputFiles({
          name: "Background.png",
          mimeType: "image/png",
          buffer: png,
        });
      await reload(d);
      await page.keyboard.press("Control+s");
      const save = page.getByRole("dialog", { name: "Save as", exact: true });
      await save.waitFor();
      const download = page.waitForEvent("download");
      await save.getByRole("button", { name: "Save", exact: true }).click();
      const dl = await download,
        path = resolve(output, "design-saved.pptx");
      await dl.saveAs(path);
      const b = await readFile(path),
        h = openPresentation(b);
      try {
        assert.ok(h.snapshot().slides.length > 1);
        assert.ok(part(h.save(), rootSlide).includes("blipFill"));
      } finally {
        h.dispose();
      }
      await page.evaluate(() => (window.voorOntwerp = proefApi()));
      await page
        .locator(".office input[type=file]")
        .first()
        .setInputFiles(path);
      await page.waitForFunction(() => {
        try {
          return (
            proefApi() !== window.voorOntwerp &&
            !!proefApi()?.handle.snapshot().slides.length
          );
        } catch {
          return false;
        }
      });
      assert.ok(part(await liveBytes(), rootSlide).includes("blipFill"));
    },
  );
  assert.deepEqual(report.errors, []);
} catch (e) {
  await page.screenshot({ path: resolve(output, "failure.png") });
  try {
    await writeFile(resolve(output, "failure.pptx"), await liveBytes());
  } catch {
    /* Houd de oorspronkelijke fout. */
  }
  await writeFile(
    resolve(output, "failure-options.json"),
    JSON.stringify(await page.locator("select option").allTextContents()),
  );
  throw e;
} finally {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
