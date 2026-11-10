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
const h = openPresentation(await readFile("public/templates/nieuw.pptx"));
const sid = h.snapshot().slides[0].id;
for (let i = 0; i < 3; i++)
  h.addShape(sid, {
    name: `Object ${"ABC"[i]}`,
    geometry: "rect",
    fill: ["#EE6666", "#55BB99", "#6699EE"][i],
    rect: {
      x: 100000 + i * 1200000,
      y: 200000 + i * 300000,
      width: 500000 + i * 100000,
      height: 300000,
    },
  });
const bytes = h.save();
h.dispose();
const output = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-presentatie-objecten",
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
const live = () =>
  window
    .proefApi()
    .handle.snapshot()
    .slides[0].shapes.filter((s) => s.name.startsWith("Object "))
    .map((s) => ({
      name: s.name,
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
    }));
async function run(name, test) {
  await test();
  report.cases.push(name);
  console.log(`OK: ${name}`);
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
      name: "Objects.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: Buffer.from(bytes),
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
  await page.waitForFunction(() => proefApi()?.handle.snapshot().slides.length);
  await page
    .locator('button[role="tab"]:visible')
    .filter({ hasText: /^Arrange$/ })
    .click();
  await page
    .getByRole("button", { name: "Objects and position", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Objects and position",
    exact: true,
  });
  await dialog.waitFor();
  for (const name of ["Object A", "Object B", "Object C"])
    await dialog.getByRole("checkbox", { name, exact: true }).check();
  await run("Multiple objects align in one document Undo step", async () => {
    await dialog.getByRole("button", { name: "Left", exact: true }).click();
    await page.waitForFunction(() =>
      proefApi()
        .handle.snapshot()
        .slides[0].shapes.filter((s) => s.name.startsWith("Object "))
        .every((s) => s.x === 100000),
    );
    await dialog
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click();
    await page.evaluate(() => {
      proefApi().handle.undo();
      proefApi().refresh();
    });
    assert.deepEqual(
      (await page.evaluate(live)).map((s) => s.x),
      [100000, 1300000, 2500000],
    );
  });
  await page
    .getByRole("button", { name: "Objects and position", exact: true })
    .click();
  for (const name of ["Object A", "Object B", "Object C"])
    await dialog.getByRole("checkbox", { name, exact: true }).check();
  await run("Three different widths receive equal spacing", async () => {
    await dialog
      .getByRole("button", { name: "Equal horizontal spacing", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        proefApi()
          .handle.snapshot()
          .slides[0].shapes.find((s) => s.name === "Object B").x === 1250000,
    );
  });
  await dialog
    .getByRole("checkbox", { name: "Object B", exact: true })
    .uncheck();
  await dialog
    .getByRole("checkbox", { name: "Object C", exact: true })
    .uncheck();
  await run(
    "Exact centimetre dimensions keep negative coordinates",
    async () => {
      for (const [name, value] of [
        ["X (cm)", "-0.5"],
        ["Y (cm)", "1.25"],
        ["Width (cm)", "2.5"],
        ["Height (cm)", "1.75"],
      ])
        await dialog.getByRole("spinbutton", { name, exact: true }).fill(value);
      await dialog.getByRole("button", { name: "Apply", exact: true }).click();
      await page.waitForFunction(
        () =>
          proefApi()
            .handle.snapshot()
            .slides[0].shapes.find((s) => s.name === "Object A").x === -180000,
      );
      assert.deepEqual((await page.evaluate(live))[0], {
        name: "Object A",
        x: -180000,
        y: 450000,
        width: 900000,
        height: 630000,
      });
    },
  );
  await run(
    "Invalid sizes are rejected without changing the document",
    async () => {
      const before = await page.evaluate(live);
      await dialog
        .getByRole("spinbutton", { name: "Width (cm)", exact: true })
        .fill("0");
      await dialog.getByRole("button", { name: "Apply", exact: true }).click();
      await dialog.getByRole("alert").waitFor();
      assert.deepEqual(await page.evaluate(live), before);
      await dialog.screenshot({ path: resolve(output, "objects.png") });
    },
  );
  await dialog
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  await run("Real Save As and PPTX reopen preserve the geometry", async () => {
    await page.keyboard.press("Control+s");
    const save = page.getByRole("dialog", { name: "Save as", exact: true });
    await save.waitFor();
    const download = page.waitForEvent("download");
    await save.getByRole("button", { name: "Save", exact: true }).click();
    const file = await download;
    const saved = await readFile(await file.path());
    const again = openPresentation(saved);
    const a = again
      .snapshot()
      .slides[0].shapes.find((s) => s.name === "Object A");
    assert.deepEqual(
      [a.x, a.y, a.width, a.height],
      [-180000, 450000, 900000, 630000],
    );
    again.dispose();
    await writeFile(resolve(output, "objects-saved.pptx"), saved);
  });
  assert.deepEqual(report.errors, []);
} catch (e) {
  await page.screenshot({ path: resolve(output, "failure.png") });
  throw e;
} finally {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
