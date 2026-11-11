import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { initWasm, openPresentation } from "@betteroffice/pptx";
import { unzipSync } from "fflate";
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
  process.env.OFFICE_TEST_UIT ?? ".local/proef-presentatie-opmaak-kopie",
);
await mkdir(output, { recursive: true });
const logo = await readFile("public/studio-icons/presentation.png"),
  h = openPresentation(await readFile("public/templates/nieuw.pptx")),
  slide = h.snapshot().slides[0];
for (const [n, text, size, color] of [
  ["Source", "Source text", 22, "#AA1122"],
  ["Target", "Target 🧱\nSecond paragraph", 10, "#123456"],
  ["Other", "Other text", 16, "#0000FF"],
])
  h.addTextBox(slide.id, {
    name: n,
    rect: {
      x: n === "Source" ? 1000000 : 5000000,
      y: n === "Other" ? 4000000 : 1000000,
      width: 3000000,
      height: 1500000,
    },
    text,
    style: {
      fontFamily: "Arial",
      fontSizePt: size,
      color,
      bold: n === "Source",
      italic: n === "Source",
      underline: n === "Source" ? "dbl" : "none",
    },
  });
const source = h.snapshot().slides[0].shapes.find((s) => s.name === "Source");
h.setShapeFill(slide.id, source.id, "#FFAA00");
h.setShapeStroke(slide.id, source.id, { color: "#112233", widthPt: 3 });
h.setParagraphAlignment(
  source.textStories[0].id,
  0,
  source.textStories[0].length,
  "ctr",
);
h.addPicture(slide.id, {
  name: "Picture",
  rect: { x: 7000000, y: 5000000, width: 1000000, height: 500000 },
  contentType: "image/png",
  mediaBase64: logo.toString("base64"),
});
const fixture = Buffer.from(h.save());
h.dispose();
const server = await preview({
    configFile: false,
    build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
    preview: { host: "127.0.0.1", port: 0, open: false },
  }),
  url = `http://127.0.0.1:${server.httpServer.address().port}/`,
  browser = await chromium.launch(),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage(),
  report = { cases: [], errors: [] };
async function setup(p, b, name) {
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
      name,
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
}
async function dialog() {
  await page
    .locator('button[role="tab"]:visible')
    .filter({ hasText: /^Arrange$/ })
    .click();
  await page
    .getByRole("button", { name: "Copy formatting", exact: true })
    .click();
  const d = page.getByRole("dialog", { name: "Copy formatting", exact: true });
  await d.waitFor();
  return d;
}
async function apply(d) {
  await page.evaluate(() => (window.beforeFormat = proefApi()));
  await d.getByRole("button", { name: "Copy formatting", exact: true }).click();
  await d.waitFor({ state: "hidden" });
  await page.waitForFunction(() => {
    try {
      return proefApi() && proefApi() !== window.beforeFormat;
    } catch {
      return false;
    }
  });
}
const snapshot = async (p = page) =>
  p.evaluate(() => proefApi().handle.snapshot());
const shape = (d, n) => d.slides[0].shapes.find((s) => s.name === n);
const geometry = (s) => [
  s.sourceId,
  s.x,
  s.y,
  s.width,
  s.height,
  s.rotationDeg,
  s.flipH,
  s.flipV,
  s.geometry,
];
const text = (s) =>
  s.textStories.map((s) =>
    s.paragraphs.map((p) => p.runs.map((r) => r.text).join("")),
  );
async function run(name, test) {
  await test();
  report.cases.push(name);
  console.log(`OK: ${name}`);
}
try {
  await setup(page, fixture, "Format.pptx");
  await run(
    "Copy source fill, border and text formatting to two objects through the real dialog",
    async () => {
      const before = await snapshot(),
        d = await dialog();
      await d
        .getByLabel("Source object", { exact: true })
        .selectOption({ label: "Source" });
      await d.getByRole("checkbox", { name: "Target", exact: true }).check();
      await d.getByRole("checkbox", { name: "Other", exact: true }).check();
      assert.equal(
        await d.getByRole("checkbox", { name: /^Picture/ }).isDisabled(),
        true,
      );
      await d.screenshot({ path: resolve(output, "format-copy.png") });
      await apply(d);
      const after = await snapshot();
      for (const n of ["Target", "Other"]) {
        const s = shape(after, n);
        assert.equal(s.fill.color.rgb, "FFAA00");
        assert.equal(s.outline.width, 38100);
        assert.deepEqual(text(s), text(shape(before, n)));
        assert.deepEqual(geometry(s), geometry(shape(before, n)));
        assert.ok(
          s.textStories[0].paragraphs.every(
            (p) =>
              p.alignment === "ctr" &&
              p.runs.every(
                (r) =>
                  r.style.fontSizePt === 22 && r.style.bold && r.style.italic,
              ),
          ),
        );
      }
      assert.deepEqual(shape(after, "Source"), shape(before, "Source"));
    },
  );
  await run(
    "Copy inherited title typography without changing the target fill or border",
    async () => {
      const before = shape(await snapshot(), "Target"),
        d = await dialog();
      await d
        .getByLabel("Source object", { exact: true })
        .selectOption({ label: "Title 1" });
      await d
        .getByRole("checkbox", {
          name: "Fill, border and effects",
          exact: true,
        })
        .uncheck();
      await d.getByRole("checkbox", { name: "Target", exact: true }).check();
      await apply(d);
      const after = shape(await snapshot(), "Target");
      assert.equal(
        after.textStories[0].paragraphs[0].runs[0].style.fontSizePt,
        44,
      );
      assert.deepEqual(after.fill, before.fill);
      assert.deepEqual(after.outline, before.outline);
      assert.deepEqual(text(after), text(before));
    },
  );
  await run(
    "Copy a border onto a picture while preserving media and geometry",
    async () => {
      const before = shape(await snapshot(), "Picture"),
        d = await dialog();
      await d
        .getByLabel("Source object", { exact: true })
        .selectOption({ label: "Source" });
      await d
        .getByRole("checkbox", { name: "Text formatting", exact: true })
        .uncheck();
      await d.getByRole("checkbox", { name: "Picture", exact: true }).check();
      await apply(d);
      const after = shape(await snapshot(), "Picture");
      assert.equal(after.outline.width, 38100);
      assert.deepEqual(geometry(after), geometry(before));
      const bytes = new Uint8Array(
          await page.evaluate(() => Array.from(proefApi().handle.save())),
        ),
        p = unzipSync(bytes);
      assert.ok(Object.values(p).some((b) => Buffer.from(b).equals(logo)));
    },
  );
  await run(
    "Invalid selection and cancellation never change the document",
    async () => {
      const version = await page.evaluate(() => proefApi().handle.version()),
        d = await dialog();
      assert.equal(
        await d
          .getByRole("button", { name: "Copy formatting", exact: true })
          .isDisabled(),
        true,
      );
      await d
        .getByLabel("Source object", { exact: true })
        .selectOption({ label: "Source" });
      await d.getByRole("checkbox", { name: "Target", exact: true }).check();
      await d
        .getByLabel("Source object", { exact: true })
        .selectOption({ label: "Target" });
      await page.waitForFunction(() =>
        [...document.querySelectorAll('[role="dialog"] button')].some(
          (b) => b.textContent === "Copy formatting" && b.disabled,
        ),
      );
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(
        await page.evaluate(() => proefApi().handle.version()),
        version,
      );
    },
  );
  await run(
    "A stale formatting operation cannot overwrite a newer note edit",
    async () => {
      const d = await dialog();
      await d
        .getByLabel("Source object", { exact: true })
        .selectOption({ label: "Source" });
      await d.getByRole("checkbox", { name: "Target", exact: true }).check();
      await page.evaluate(() =>
        proefApi().handle.setSlideNotes(
          proefApi().handle.snapshot().slides[0].id,
          "Newer notes",
        ),
      );
      await d
        .getByRole("button", { name: "Copy formatting", exact: true })
        .click();
      await d.getByRole("alert").waitFor();
      assert.equal((await snapshot()).slides[0].notes, "Newer notes");
      assert.equal(
        shape(await snapshot(), "Target").textStories[0].paragraphs[0].runs[0]
          .style.fontSizePt,
        44,
      );
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
    },
  );
  await run(
    "Actual Save As and independent native/app reopen retain copied styles and original text",
    async () => {
      const before = await snapshot();
      await page.keyboard.press("Control+s");
      const save = page.getByRole("dialog", { name: "Save as", exact: true });
      await save.waitFor();
      const pending = page.waitForEvent("download");
      await save.getByRole("button", { name: "Save", exact: true }).click();
      const dl = await pending,
        path = resolve(output, "format-saved.pptx");
      await dl.saveAs(path);
      const b = await readFile(path),
        h = openPresentation(b);
      for (const n of ["Target", "Other", "Picture"]) {
        assert.deepEqual(
          geometry(shape(h.snapshot(), n)),
          geometry(shape(before, n)),
        );
        assert.deepEqual(text(shape(h.snapshot(), n)), text(shape(before, n)));
      }
      assert.equal(
        shape(h.snapshot(), "Other").textStories[0].paragraphs[0].runs[0].style
          .fontSizePt,
        22,
      );
      h.dispose();
      const freshContext = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
        }),
        fresh = await freshContext.newPage();
      await setup(fresh, b, "Reopened.pptx");
      const reopened = await snapshot(fresh);
      assert.equal(
        shape(reopened, "Target").textStories[0].paragraphs[0].runs[0].style
          .fontSizePt,
        44,
      );
      assert.equal(shape(reopened, "Other").fill.color.rgb, "FFAA00");
      assert.equal(shape(reopened, "Picture").outline.width, 38100);
      assert.equal(reopened.slides[0].notes, "Newer notes");
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
