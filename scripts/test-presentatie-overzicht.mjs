/** Production browser check for the editable slide outline (#76). */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { preview } from "vite";
import { strFromU8, unzipSync } from "fflate";

const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
const output = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-presentatie-overzicht",
);
await mkdir(output, { recursive: true });
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch();
const page = await browser.newPage({
  locale: "en-US",
  viewport: { width: 1440, height: 1000 },
});
const report = { cases: [], errors: [] };
page.on("pageerror", (e) => report.errors.push(String(e)));
async function run(name, test) {
  await test();
  report.cases.push(name);
  console.log(`OK: ${name}`);
}
try {
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({ taal: "en", spelling: { controleren: false } }),
    ),
  );
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name: "Outline.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: await readFile("docs/voorbeelden/Ontwerpvisie.pptx"),
    });
  const view = page
    .locator('button[role="tab"]:visible')
    .filter({ hasText: /^View$/ });
  const openOutline = page
    .locator("button:visible")
    .filter({ hasText: /^Outline$/ });
  await view.click();
  await openOutline.click();
  const outline = page.locator(".dia-overzicht:visible");
  await outline.waitFor();
  const first = outline.getByRole("textbox").first();
  const original = await first.inputValue();
  await run("All slides and text are in the editable outline", async () => {
    assert.equal(await outline.locator("article").count(), 3);
    assert((await outline.getByRole("textbox").count()) >= 3);
  });
  await run("Typing and immediate Ctrl+S save the current text", async () => {
    await first.fill("Outline update 😀");
    await page.keyboard.press("Control+s");
    const saveDialog = page.getByRole("dialog", {
      name: "Save as",
      exact: true,
    });
    await saveDialog.waitFor();
    const download = page.waitForEvent("download", { timeout: 10000 });
    await saveDialog.getByRole("button", { name: "Save", exact: true }).click();
    const saved = await download;
    const bytes = await readFile(await saved.path());
    const parts = unzipSync(bytes);
    assert(
      Object.entries(parts).some(
        ([name, data]) =>
          /^ppt\/slides\/slide\d+\.xml$/.test(name) &&
          strFromU8(data).includes("Outline update 😀"),
      ),
    );
    await writeFile(resolve(output, "outline-saved.pptx"), bytes);
  });
  await run("Undo and Redo use document history", async () => {
    await outline.getByRole("button", { name: "Undo", exact: true }).click();
    await page.waitForFunction(
      (value) =>
        document.querySelector(".dia-overzicht textarea")?.value === value,
      original,
    );
    await outline.getByRole("button", { name: "Redo", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector(".dia-overzicht textarea")?.value ===
        "Outline update 😀",
    );
  });
  await run(
    "Enter creates a paragraph and keeps typing in the new paragraph",
    async () => {
      const before = await outline.getByRole("textbox").count();
      await first.focus();
      await first.press("End");
      await first.press("Enter");
      await page.waitForFunction(
        () =>
          document.querySelectorAll(".dia-overzicht textarea")[1] ===
          document.activeElement,
      );
      assert.equal(await outline.getByRole("textbox").count(), before + 1);
      await page.keyboard.type("New paragraph");
      assert.equal(
        await outline.getByRole("textbox").nth(1).inputValue(),
        "New paragraph",
      );
    },
  );
  await run("A slide heading navigates back to the normal view", async () => {
    await outline.getByRole("button", { name: "Slide 3", exact: true }).click();
    assert.equal(await outline.count(), 0);
    await openOutline.click();
    await outline.waitFor();
    assert.equal(await first.inputValue(), "Outline update 😀");
  });
  await run("The downloaded PPTX reopens with the edited outline", async () => {
    await page.keyboard.press("Escape");
    await page
      .locator(".office input[type=file]")
      .first()
      .setInputFiles({
        name: "Reopened-outline.pptx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        buffer: await readFile(resolve(output, "outline-saved.pptx")),
      });
    await view.click();
    await openOutline.click();
    await outline.waitFor();
    assert.equal(await first.inputValue(), "Outline update 😀");
    await outline.screenshot({ path: resolve(output, "outline.png") });
  });
  assert.deepEqual(report.errors, []);
} catch (e) {
  await page.screenshot({ path: resolve(output, "failure.png") });
  console.error((await page.locator("body").innerText()).slice(-3500));
  throw e;
} finally {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
