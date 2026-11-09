import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { initWasm, openPresentation } from "@betteroffice/pptx";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
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
  process.env.OFFICE_TEST_UIT ?? ".local/proef-presentatie-hergebruik",
);
await mkdir(output, { recursive: true });
let source = await readFile("docs/voorbeelden/Ontwerpvisie.pptx"),
  target = await readFile("public/templates/nieuw.pptx");
const logo = await readFile("public/studio-icons/presentation.png");
const sourceDeck = openPresentation(source),
  sourceNotes = sourceDeck.snapshot().slides[0].notes;
sourceDeck.addPicture(sourceDeck.snapshot().slides[0].id, {
  name: "Reuse logo",
  rect: { x: 11000000, y: 6000000, width: 500000, height: 500000 },
  contentType: "image/png",
  mediaBase64: logo.toString("base64"),
});
source = Buffer.from(sourceDeck.save());
sourceDeck.dispose();
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch(),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  }),
  page = await context.newPage();
const report = { cases: [], errors: [] };
page.on("pageerror", (e) => report.errors.push(String(e)));
async function run(name, test) {
  await test();
  report.cases.push(name);
  console.log(`OK: ${name}`);
}
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
async function openFile(name, b) {
  await page.evaluate(() => (window.voorHergebruik = window.proefApi?.()));
  await page.locator(".office input[type=file]").first().setInputFiles({
    name,
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: b,
  });
  await page.waitForFunction(() => {
    try {
      return proefApi() && proefApi() !== window.voorHergebruik;
    } catch {
      return false;
    }
  });
}
async function bronKiezen(buffer = source) {
  await page
    .locator('button[role="tab"]:visible')
    .filter({ hasText: /^Slide$/ })
    .click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Reuse slides", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "Source.pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer,
  });
  const d = page.getByRole("dialog", { name: "Reuse slides", exact: true });
  await d.waitFor();
  return d;
}
async function apply(d) {
  await page.evaluate(() => (window.voorHergebruik = proefApi()));
  await d.getByRole("button", { name: "Insert slides", exact: true }).click();
  await d.waitFor({ state: "hidden" });
  await page.waitForFunction(() => {
    try {
      return proefApi() && proefApi() !== window.voorHergebruik;
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
    name: "Target.pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: target,
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
    "Reuse selected slides from a real PPTX file with source branding and notes",
    async () => {
      const d = await bronKiezen();
      await d
        .getByRole("checkbox", { name: "All slides", exact: true })
        .uncheck();
      await d.getByRole("checkbox", { name: /^Slide 1:/ }).check();
      await d.getByRole("checkbox", { name: /^Slide 3:/ }).check();
      await d.screenshot({ path: resolve(output, "reuse.png") });
      await apply(d);
      assert.equal(
        await page.evaluate(() => proefApi().handle.snapshot().slides.length),
        3,
      );
      assert.equal(
        await page.evaluate(() => proefApi().handle.snapshot().slides[1].notes),
        sourceNotes,
      );
      const b = await bytes(),
        p = unzipSync(b);
      assert.equal(
        Object.keys(p).filter((n) => /^ppt\/slideMasters\/[^/]+\.xml$/.test(n))
          .length,
        2,
      );
      assert.ok(Object.values(p).some((v) => Buffer.from(v).equals(logo)));
      assert.ok(
        await page.evaluate(
          () => proefApi().handle.layoutSlide(1).primitives.length > 0,
        ),
      );
    },
  );
  let payload;
  await run(
    "Actual sorter Ctrl+C copies two selected slides as an independent package",
    async () => {
      await page
        .locator('button[role="tab"]:visible')
        .filter({ hasText: /^View$/ })
        .click();
      await page
        .getByRole("toolbar", { name: "View", exact: true })
        .getByRole("button", { name: "Slide Sorter", exact: true })
        .click();
      const options = page.locator(
        '.sorteerder-raster:visible [role="option"]',
      );
      await options.nth(1).click();
      await options.nth(2).click({ modifiers: ["Control"] });
      await page.keyboard.press("Control+c");
      payload = await page.evaluate(() => navigator.clipboard.readText());
      assert.ok(/^OpenOfficeStudio.Slides\/1\r?\n/.test(payload));
      const clip = unzipSync(Buffer.from(payload.split("\n")[1], "base64"));
      assert.equal(
        Object.keys(clip).filter((n) => /^ppt\/slides\/[^/]+\.xml$/.test(n))
          .length,
        2,
      );
      await page.evaluate(() => {
        window.sourcePptx = proefApi();
        window.sourceVersion = proefApi().handle.version();
      });
    },
  );
  await openFile("Receiver.pptx", target);
  await run(
    "Actual Ctrl+V transfers the copied slides to another open presentation",
    async () => {
      await page
        .locator(
          '.office-tabpaneel:not([hidden]) canvas[data-testid="pptx-slide-canvas"]',
        )
        .click();
      await page.keyboard.press("Control+v");
      const d = page.getByRole("dialog", { name: "Reuse slides", exact: true });
      await d.waitFor();
      assert.equal(await d.count(), 1);
      await apply(d);
      assert.equal(
        await page.evaluate(() => proefApi().handle.snapshot().slides.length),
        3,
      );
      assert.equal(
        await page.evaluate(
          () => sourcePptx.handle.version() === sourceVersion,
        ),
        true,
      );
    },
  );
  await run(
    "Different slide size is refused and cancelling leaves the presentation unchanged",
    async () => {
      const p = unzipSync(source);
      p["ppt/presentation.xml"] = strToU8(
        strFromU8(p["ppt/presentation.xml"]).replace(
          /cx="12191695"/,
          'cx="9144000"',
        ),
      );
      const version = await page.evaluate(() => proefApi().handle.version());
      const d = await bronKiezen(Buffer.from(zipSync(p)));
      await d
        .getByRole("button", { name: "Insert slides", exact: true })
        .click();
      await d
        .getByRole("alert")
        .filter({ hasText: "different slide size" })
        .waitFor();
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(
        await page.evaluate(() => proefApi().handle.version()),
        version,
      );
      assert.equal(
        await page.evaluate(() => proefApi().handle.snapshot().slides.length),
        3,
      );
    },
  );
  await run(
    "Slide-copy button and paste button preview without changing the source",
    async () => {
      await page
        .getByRole("button", { name: "Copy slides", exact: true })
        .click();
      await page.waitForFunction(async () =>
        /^OpenOfficeStudio.Slides\/1\r?\n/.test(
          await navigator.clipboard.readText(),
        ),
      );
      await page
        .getByRole("button", { name: "Paste slides", exact: true })
        .click();
      const d = page.getByRole("dialog", { name: "Reuse slides", exact: true });
      await d.waitFor();
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(
        await page.evaluate(() => proefApi().handle.snapshot().slides.length),
        3,
      );
    },
  );
  await run(
    "Save As and engine/app reopen retain imported layouts, images and notes",
    async () => {
      await page.keyboard.press("Control+s");
      const save = page.getByRole("dialog", { name: "Save as", exact: true });
      await save.waitFor();
      const pending = page.waitForEvent("download");
      await save.getByRole("button", { name: "Save", exact: true }).click();
      const dl = await pending,
        path = resolve(output, "reuse-saved.pptx");
      await dl.saveAs(path);
      const b = await readFile(path),
        h = openPresentation(b);
      try {
        assert.equal(h.snapshot().slides.length, 3);
        assert.equal(h.snapshot().slides[1].notes, sourceNotes);
        assert.ok(h.snapshot().slides[1].layoutPartPath.includes("oosLayout"));
      } finally {
        h.dispose();
      }
      const freshContext = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        permissions: ["clipboard-read", "clipboard-write"],
      });
      const fresh = await freshContext.newPage();
      fresh.on("pageerror", (e) => report.errors.push(String(e)));
      await fresh.addInitScript(() =>
        localStorage.setItem(
          "openaec-office-instellingen",
          JSON.stringify({
            taal: "en",
            thema: "forge",
            spelling: { controleren: false },
          }),
        ),
      );
      await fresh.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
      await fresh
        .locator(".office input[type=file]")
        .first()
        .setInputFiles({
          name: "Reopened.pptx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          buffer: b,
        });
      await fresh.evaluate(() => {
        window.proefApi = () => {
          const el = document.querySelector(
            ".office-tabpaneel:not([hidden]) .office-presentatie",
          );
          if (!el) return null;
          for (
            let f =
              el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
            f;
            f = f.return
          )
            if (f.memoizedProps?.value?.presentatie)
              return f.memoizedProps.value.presentatie;
          return null;
        };
      });
      await fresh.waitForFunction(() => {
        try {
          return !!proefApi()?.handle.snapshot().slides.length;
        } catch {
          return false;
        }
      });
      assert.equal(
        await fresh.evaluate(() => proefApi().handle.snapshot().slides.length),
        3,
      );
      assert.equal(
        await fresh.evaluate(
          () => proefApi().handle.snapshot().slides[1].notes,
        ),
        sourceNotes,
      );
      await fresh.evaluate((s) => navigator.clipboard.writeText(s), payload);
      await fresh
        .locator(
          '.office-tabpaneel:not([hidden]) canvas[data-testid="pptx-slide-canvas"]',
        )
        .click();
      await fresh.keyboard.press("Control+v");
      const d = fresh.getByRole("dialog", {
        name: "Reuse slides",
        exact: true,
      });
      await d.waitFor();
      assert.equal(await d.count(), 1);
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
      await freshContext.close();
    },
  );
  assert.deepEqual(report.errors, []);
} catch (e) {
  await page.screenshot({ path: resolve(output, "failure.png") });
  throw e;
} finally {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
