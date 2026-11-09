/** #24: Tab order through real Settings dropdowns in a production build.
 * Requires Playwright/Chromium; OFFICE_PLAYWRIGHT_MODULE may name an installed module URL.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { preview } from "vite";
const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
const output = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-keuzelijst-tab",
);
await mkdir(output, { recursive: true });
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch();
const report = { cases: [], errors: [] };
const button = (dialog, prefix) =>
  dialog.getByRole("button", { name: new RegExp(`^${prefix}:`) });
const focused = async (element) =>
  assert.equal(
    await element.evaluate((el) => el === document.activeElement),
    true,
  );

async function run(name, test, tab = "General") {
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
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
    await page
      .getByRole("button", { name: "Settings", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
    if (tab !== "General")
      await dialog.getByRole("tab", { name: tab, exact: true }).click();
    await test(page, dialog);
    report.cases.push({ name, passed: true });
  } catch (error) {
    report.cases.push({
      name,
      passed: false,
      error: String(error),
      active: await page.evaluate(() => ({
        role: document.activeElement?.getAttribute("role"),
        name: document.activeElement?.getAttribute("aria-label"),
        text: document.activeElement?.textContent?.slice(0, 100),
      })),
    });
    await page.screenshot({
      path: resolve(output, `${report.cases.length}-failed.png`),
    });
  } finally {
    await context.close();
  }
}

async function traverse(page, dialog, name, key, target, filter) {
  const trigger = button(dialog, name);
  const previousValue = await trigger.getAttribute("aria-label");
  await trigger.click();
  if (filter !== undefined) await dialog.getByRole("combobox").fill(filter);
  await page.keyboard.press(key);
  assert.equal(await trigger.getAttribute("aria-expanded"), "false");
  assert.equal(await dialog.isVisible(), true);
  assert.equal(
    await trigger.getAttribute("aria-label"),
    previousValue,
    "Tab must not commit the highlighted option",
  );
  await focused(target);
}

try {
  for (const [from, previous] of [
    ["Text", "Language"],
    ["Spreadsheet", "Text"],
    ["Presentation", "Spreadsheet"],
  ]) {
    await run(
      `${from}: Shift+Tab skips the closed dropdown trigger`,
      async (page, dialog) =>
        traverse(page, dialog, from, "Shift+Tab", button(dialog, previous)),
    );
  }
  for (const [name, filter] of [
    ["unfiltered", undefined],
    ["filtered", "English"],
    ["empty results", "NoSuchLanguage123"],
  ]) {
    await run(
      `Language ${name}: Shift+Tab returns to General`,
      async (page, dialog) =>
        traverse(
          page,
          dialog,
          "Language",
          "Shift+Tab",
          dialog.getByRole("tab", { name: "General", exact: true }),
          filter,
        ),
    );
  }
  await run(
    "Theme: Shift+Tab returns to Appearance",
    async (page, dialog) =>
      traverse(
        page,
        dialog,
        "Theme",
        "Shift+Tab",
        dialog.getByRole("tab", { name: "Appearance", exact: true }),
      ),
    "Appearance",
  );
  await run(
    "Shortcut profile: Shift+Tab returns to Editing",
    async (page, dialog) =>
      traverse(
        page,
        dialog,
        "Keyboard shortcuts",
        "Shift+Tab",
        dialog.getByRole("tab", { name: "Editing", exact: true }),
      ),
    "Editing",
  );
  await run("Text: Tab advances to Spreadsheet", async (page, dialog) =>
    traverse(page, dialog, "Text", "Tab", button(dialog, "Spreadsheet")),
  );
  await run(
    "Presentation: Tab advances to recovery interval",
    async (page, dialog) =>
      traverse(
        page,
        dialog,
        "Presentation",
        "Tab",
        dialog.getByRole("spinbutton"),
      ),
  );
  await run("Language: Tab advances to Text", async (page, dialog) =>
    traverse(page, dialog, "Language", "Tab", button(dialog, "Text")),
  );
  await run(
    "Language empty results: Tab advances to Text",
    async (page, dialog) =>
      traverse(
        page,
        dialog,
        "Language",
        "Tab",
        button(dialog, "Text"),
        "NoSuchLanguage123",
      ),
  );
  await run(
    "Theme: Tab advances to Compact ribbon",
    async (page, dialog) =>
      traverse(
        page,
        dialog,
        "Theme",
        "Tab",
        dialog.getByRole("checkbox", { name: /^Compact ribbon:/ }),
      ),
    "Appearance",
  );
  await run(
    "Shortcut profile: Tab advances to Mini toolbar",
    async (page, dialog) =>
      traverse(
        page,
        dialog,
        "Keyboard shortcuts",
        "Tab",
        dialog.getByRole("checkbox").first(),
      ),
    "Editing",
  );
  await run(
    "Tab cancels a highlighted option instead of changing its value",
    async (page, dialog) => {
      await button(dialog, "Text").click();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Tab");
      await focused(button(dialog, "Spreadsheet"));
      assert.equal(
        await button(dialog, "Text").getAttribute("aria-label"),
        "Text: Word (.docx)",
      );
    },
  );
  await run(
    "Escape closes only the dropdown and restores its trigger",
    async (page, dialog) => {
      await button(dialog, "Language").click();
      await dialog.getByRole("combobox").fill("English");
      await page.keyboard.press("Escape");
      assert.equal(await dialog.isVisible(), true);
      assert.equal(
        await button(dialog, "Language").getAttribute("aria-expanded"),
        "false",
      );
      await focused(button(dialog, "Language"));
    },
  );
  await run(
    "Enter still selects the highlighted option",
    async (page, dialog) => {
      await button(dialog, "Text").click();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      assert.equal(
        await button(dialog, "Text").getAttribute("aria-label"),
        "Text: OpenDocument (.odt)",
      );
      await focused(button(dialog, "Text"));
    },
  );
  await run(
    "Closed dropdowns keep the existing reverse tab order",
    async (page, dialog) => {
      await button(dialog, "Text").focus();
      await page.keyboard.press("Shift+Tab");
      await focused(button(dialog, "Language"));
    },
  );
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
