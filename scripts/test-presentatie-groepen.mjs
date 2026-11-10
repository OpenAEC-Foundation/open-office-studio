import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { initWasm, openPresentation } from "@betteroffice/pptx";
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
  process.env.OFFICE_TEST_UIT ?? ".local/proef-presentatie-groepen",
);
await mkdir(output, { recursive: true });
const h = openPresentation(await readFile("public/templates/nieuw.pptx"));
for (let i = 0; i < 3; i++)
  h.addShape(h.snapshot().slides[0].id, {
    name: `Object ${i + 1}`,
    geometry: i === 1 ? "ellipse" : "rect",
    rect: {
      x: 1000000 + i * 2000000,
      y: 1000000 + i * 500000,
      width: 1000000,
      height: 500000,
    },
  });
const fixture = Buffer.from(h.save());
h.dispose();
const server = await preview({
    configFile: false,
    build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
    preview: { host: "127.0.0.1", port: 0, open: false },
  }),
  url = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch(),
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
  await p.locator(".office input[type=file]").first().setInputFiles({
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
const canvas = (p) =>
  p.locator(
    '.office-tabpaneel:not([hidden]) canvas[data-testid="pptx-slide-canvas"]',
  );
async function apply(d, p = page) {
  await p.evaluate(() => (window.beforeGroup = proefApi()));
  await d.getByRole("button", { name: "Apply", exact: true }).click();
  await d.waitFor({ state: "hidden" });
  await p.waitForFunction(() => {
    try {
      return proefApi() && proefApi() !== window.beforeGroup;
    } catch {
      return false;
    }
  });
}
async function tab(name, p = page) {
  await p
    .locator('button[role="tab"]:visible')
    .filter({ hasText: new RegExp(`^${name}$`) })
    .click();
}
async function groupDialog(p = page) {
  await tab("Arrange", p);
  await p.getByRole("button", { name: "Group objects", exact: true }).click();
  const d = p.getByRole("dialog", { name: "Group objects", exact: true });
  await d.waitFor();
  return d;
}
async function select(d) {
  await d.getByRole("checkbox", { name: "Object 1", exact: true }).check();
  await d.getByRole("checkbox", { name: "Object 2", exact: true }).check();
  await d.getByLabel("Group name", { exact: true }).fill("Browser group");
}
async function run(name, test) {
  await test();
  report.cases.push(name);
  console.log(`OK: ${name}`);
}
try {
  await setup(page, fixture, "Groups.pptx");
  await run(
    "Actual Ctrl+G opens the group chooser from Home, and groups only the selected shapes",
    async () => {
      await canvas(page).click({ position: { x: 25, y: 25 } });
      await page.keyboard.press("Control+g");
      const d = page.getByRole("dialog", {
        name: "Group objects",
        exact: true,
      });
      await d.waitFor();
      assert.equal(
        await d.getByRole("button", { name: "Apply", exact: true }).isEnabled(),
        false,
      );
      await select(d);
      await d.getByLabel("Group name", { exact: true }).focus();
      await page.keyboard.press("Control+g");
      assert.equal(await page.getByRole("dialog").count(), 1);
      await d.screenshot({ path: resolve(output, "groups.png") });
      await apply(d);
      const grouped = await page.evaluate(() =>
        proefApi()
          .handle.snapshot()
          .slides[0].shapes.find((s) => s.name === "Browser group"),
      );
      assert.deepEqual(
        grouped.children.map((s) => s.name),
        ["Object 1", "Object 2"],
      );
    },
  );
  await run(
    "The group moves and resizes as one object through the actual properties dialog",
    async () => {
      await tab("Arrange");
      await page
        .getByRole("button", { name: "Objects and position", exact: true })
        .click();
      const d = page.getByRole("dialog", {
        name: "Objects and position",
        exact: true,
      });
      await d
        .getByRole("checkbox", { name: "Browser group", exact: true })
        .check();
      await page.waitForFunction(() =>
        Array.from(
          document.querySelectorAll('[role="dialog"] input[type="number"]'),
        ).every((i) => i.value !== ""),
      );
      await d.getByLabel("X (cm)", { exact: true }).fill("2");
      await d.getByLabel("Y (cm)", { exact: true }).fill("3");
      await d.getByLabel("Width (cm)", { exact: true }).fill("12");
      await d.getByLabel("Height (cm)", { exact: true }).fill("3");
      await d.getByRole("button", { name: "Apply", exact: true }).click();
      await d
        .getByRole("status")
        .filter({ hasText: "Change applied." })
        .waitFor();
      await d
        .getByRole("button", { name: "Close", exact: true })
        .last()
        .click();
      const g = await page.evaluate(() =>
        proefApi()
          .handle.snapshot()
          .slides[0].shapes.find((s) => s.name === "Browser group"),
      );
      assert.equal(g.x, 720000);
      assert.equal(g.y, 1080000);
      assert.equal(g.width, 4320000);
    },
  );
  await run(
    "Actual Ctrl+Shift+G ungroups a moved and resized group without changing its visible bounds",
    async () => {
      const before = await page.evaluate(() =>
        proefApi()
          .handle.layoutSlide(0)
          .primitives.filter(
            (p) => p.name === "Object 1" || p.name === "Object 2",
          )
          .map(({ name, x, y, w, h }) => ({ name, x, y, w, h })),
      );
      await tab("Home");
      await canvas(page).click({ position: { x: 25, y: 25 } });
      await page.keyboard.press("Control+Shift+g");
      const d = page.getByRole("dialog", { name: "Ungroup", exact: true });
      await d.waitFor();
      await apply(d);
      assert.equal(
        await page.evaluate(() =>
          proefApi()
            .handle.snapshot()
            .slides[0].shapes.some((s) => s.name === "Browser group"),
        ),
        false,
      );
      const after = await page.evaluate(() =>
        proefApi()
          .handle.layoutSlide(0)
          .primitives.filter(
            (p) => p.name === "Object 1" || p.name === "Object 2",
          )
          .map(({ name, x, y, w, h }) => ({ name, x, y, w, h })),
      );
      for (let i = 0; i < before.length; i++)
        for (const k of ["x", "y", "w", "h"])
          assert.ok(
            Math.abs(before[i][k] - after[i][k]) < 0.001,
            `${k}: ${before[i][k]} -> ${after[i][k]}`,
          );
    },
  );
  await run(
    "Cancellation and stale grouping cannot overwrite a newer native edit",
    async () => {
      let d = await groupDialog(),
        v = await page.evaluate(() => proefApi().handle.version());
      await select(d);
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await page.evaluate(() => proefApi().handle.version()), v);
      d = await groupDialog();
      await select(d);
      await page.evaluate(() =>
        proefApi().handle.setSlideNotes(
          proefApi().handle.snapshot().slides[0].id,
          "Newest notes",
        ),
      );
      await d.getByRole("button", { name: "Apply", exact: true }).click();
      await d.getByRole("alert").waitFor();
      assert.equal(
        await page.evaluate(() => proefApi().handle.snapshot().slides[0].notes),
        "Newest notes",
      );
      await d.getByRole("button", { name: "Cancel", exact: true }).click();
    },
  );
  await run(
    "Save As, independent native/app reopen and ungroup retain the actual group and children",
    async () => {
      const d = await groupDialog();
      await select(d);
      await apply(d);
      await page.keyboard.press("Control+s");
      const save = page.getByRole("dialog", { name: "Save as", exact: true });
      await save.waitFor();
      const pending = page.waitForEvent("download");
      await save.getByRole("button", { name: "Save", exact: true }).click();
      const dl = await pending,
        path = resolve(output, "groups-saved.pptx");
      await dl.saveAs(path);
      const b = await readFile(path),
        h = openPresentation(b);
      assert.equal(
        h.snapshot().slides[0].shapes.find((s) => s.name === "Browser group")
          .children.length,
        2,
      );
      assert.equal(h.snapshot().slides[0].notes, "Newest notes");
      h.dispose();
      const freshContext = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
        }),
        fresh = await freshContext.newPage();
      await setup(fresh, b, "Reopened.pptx");
      await tab("Arrange", fresh);
      await fresh.getByRole("button", { name: "Ungroup", exact: true }).click();
      const u = fresh.getByRole("dialog", { name: "Ungroup", exact: true });
      await u.waitFor();
      await apply(u, fresh);
      assert.equal(
        await fresh.evaluate(
          () =>
            proefApi()
              .handle.snapshot()
              .slides[0].shapes.filter((s) => s.name.startsWith("Object"))
              .length,
        ),
        3,
      );
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
