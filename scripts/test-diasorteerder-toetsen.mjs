/** #76: native controls and slide shortcuts in the real production sorter.
 * Requires Playwright/Chromium. OFFICE_PLAYWRIGHT_MODULE can name an installed module URL.
 * Build first; OFFICE_TEST_DIST selects a baseline or candidate production build.
 */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { preview } from "vite";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
const output = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-diasorteerder-toetsen",
);
await mkdir(output, { recursive: true });
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const baseUrl = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch();
const report = { cases: [], errors: [] };
const parts = unzipSync(await readFile("docs/voorbeelden/Ontwerpvisie.pptx"));
const pres = strFromU8(parts["ppt/presentation.xml"]);
const ids = [...pres.matchAll(/<p:sldId id="(\d+)"/g)].map((m) => m[1]);
assert.equal(ids.length, 3);
const sections = `<p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"><p14:sectionLst xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p14:section name="First section" id="{11111111-1111-4111-8111-111111111111}"><p14:sldIdLst>${ids
  .slice(0, 2)
  .map((id) => `<p14:sldId id="${id}"/>`)
  .join(
    "",
  )}</p14:sldIdLst></p14:section><p14:section name="Second section" id="{22222222-2222-4222-8222-222222222222}"><p14:sldIdLst><p14:sldId id="${ids[2]}"/></p14:sldIdLst></p14:section></p14:sectionLst></p:ext></p:extLst>`;
parts["ppt/presentation.xml"] = strToU8(
  pres.replace("</p:presentation>", `${sections}</p:presentation>`),
);
const fixture = {
  name: "Sorter-keyboard.pptx",
  mimeType:
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  buffer: Buffer.from(zipSync(parts)),
};

async function run(name, test) {
  console.log(name);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) =>
    report.errors.push({ name, error: String(error) }),
  );
  try {
    await page.addInitScript(() =>
      localStorage.setItem(
        "openaec-office-instellingen",
        JSON.stringify({ taal: "en", spelling: { controleren: false } }),
      ),
    );
    await page.goto(baseUrl);
    await page
      .locator(".office input[type=file]")
      .first()
      .setInputFiles(fixture);
    const sorterButton = page
      .locator(".statusbalk-weergave")
      .getByRole("button", { name: "Slide Sorter", exact: true });
    await sorterButton.click();
    const sorter = page.locator(".sorteerder");
    await sorter.getByRole("option").nth(2).waitFor();
    await sorter.locator(".sorteerder-sectie-knop").nth(1).waitFor();
    await test(page, sorter);
    report.cases.push({ name, passed: true });
  } catch (error) {
    report.cases.push({ name, passed: false, error: String(error) });
    await page.screenshot({
      path: resolve(output, `${report.cases.length}-failed.png`),
    });
  } finally {
    await context.close();
  }
}
const pause = (page) => page.waitForTimeout(450);
const selected = (sorter) =>
  sorter
    .locator('[data-dia][aria-selected="true"]')
    .evaluateAll((items) => items.map((el) => el.dataset.dia));
try {
  await run(
    "Enter activates New slide and keeps sorter open",
    async (page, sorter) => {
      await sorter
        .getByRole("button", { name: "New slide", exact: true })
        .press("Enter");
      await pause(page);
      assert.equal(await sorter.isVisible(), true);
      assert.equal(await sorter.getByRole("option").count(), 4);
    },
  );
  await run("Enter opens the New section name field", async (page, sorter) => {
    await sorter
      .getByRole("button", { name: "New section", exact: true })
      .press("Enter");
    await pause(page);
    assert.equal(
      await sorter.locator(".sorteerder-naam input").isVisible(),
      true,
    );
  });
  await run("Enter collapses and expands a section", async (page, sorter) => {
    const section = sorter.locator(".sorteerder-sectie-knop").first();
    await section.press("Enter");
    await pause(page);
    assert.equal(await sorter.isVisible(), true);
    assert.equal(await section.getAttribute("aria-expanded"), "false");
    assert.equal(await sorter.getByRole("option").count(), 1);
    await section.press("Enter");
    await pause(page);
    assert.equal(await section.getAttribute("aria-expanded"), "true");
    assert.equal(await sorter.getByRole("option").count(), 3);
  });
  await run(
    "ArrowRight changes thumbnail size without selecting a slide",
    async (page, sorter) => {
      const zoom = sorter.getByRole("slider", { name: "Thumbnail size" });
      const before = Number(await zoom.inputValue());
      const selection = await selected(sorter);
      await zoom.press("ArrowRight");
      await pause(page);
      assert.equal(Number(await zoom.inputValue()), before + 1);
      assert.deepEqual(await selected(sorter), selection);
      assert.equal(
        await zoom.evaluate((el) => el === document.activeElement),
        true,
      );
    },
  );
  await run(
    "End changes thumbnail size without selecting the last slide",
    async (page, sorter) => {
      const zoom = sorter.getByRole("slider", { name: "Thumbnail size" });
      const selection = await selected(sorter);
      await zoom.press("End");
      await pause(page);
      assert.equal(Number(await zoom.inputValue()), 100);
      assert.deepEqual(await selected(sorter), selection);
    },
  );
  await run(
    "Delete on a toolbar button does not delete a slide",
    async (page, sorter) => {
      await sorter
        .getByRole("button", { name: "New slide", exact: true })
        .press("Delete");
      await pause(page);
      assert.equal(await sorter.getByRole("option").count(), 3);
    },
  );
  await run(
    "Backspace on the zoom slider does not delete a slide",
    async (page, sorter) => {
      await sorter
        .getByRole("slider", { name: "Thumbnail size" })
        .press("Backspace");
      await pause(page);
      assert.equal(await sorter.getByRole("option").count(), 3);
    },
  );
  await run(
    "Grid arrows and Delete/Undo retain slide shortcuts",
    async (page, sorter) => {
      await sorter.getByRole("option").first().press("ArrowRight");
      await pause(page);
      assert.deepEqual(await selected(sorter), ["1"]);
      await sorter.getByRole("option").nth(1).press("Delete");
      await pause(page);
      assert.equal(await sorter.getByRole("option").count(), 2);
      await sorter.locator('[data-dia][tabindex="0"]').press("Control+z");
      await pause(page);
      assert.equal(await sorter.getByRole("option").count(), 3);
    },
  );
  await run(
    "Enter on a thumbnail still opens that slide",
    async (page, sorter) => {
      await sorter.getByRole("option").first().press("Enter");
      await pause(page);
      assert.equal(await sorter.isVisible(), false);
    },
  );
  await run(
    "Escape from a toolbar control still closes the sorter",
    async (page, sorter) => {
      await sorter
        .getByRole("slider", { name: "Thumbnail size" })
        .press("Escape");
      await pause(page);
      assert.equal(await sorter.isVisible(), false);
    },
  );
  await run("Space still activates a toolbar button", async (page, sorter) => {
    await sorter
      .getByRole("button", { name: "New slide", exact: true })
      .press("Space");
    await pause(page);
    assert.equal(await sorter.isVisible(), true);
    assert.equal(await sorter.getByRole("option").count(), 4);
  });
} finally {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise((done) => server.httpServer.close(done));
}
if (report.cases.some((test) => !test.passed) || report.errors.length)
  process.exitCode = 1;
