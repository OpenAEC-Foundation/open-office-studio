/** Actual production browser route: DOCX open → PDF download → existing font
 * permission button → second PDF download. Only queryLocalFonts is controlled.
 */
import assert from "node:assert/strict";
import { preview } from "vite";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
const output = resolve(process.env.OFFICE_TEST_UIT ?? ".local/pdf-font-app");
await mkdir(output, { recursive: true });
const server = await preview({
  configFile: false,
  build: { outDir: process.argv[2] ?? ".local/font-cache-app-build" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1400, height: 1000 },
  locale: "en-GB",
});
const page = await context.newPage();
const report = { errors: [] };
page.on("pageerror", (e) => report.errors.push(e.message));
await page.addInitScript(() => {
  localStorage.setItem(
    "openaec-office-instellingen",
    JSON.stringify({ taal: "en", spelling: { controleren: false } }),
  );
  window.testFontQueries = 0;
  window.queryLocalFonts = async () => {
    window.testFontQueries++;
    return [
      {
        family: "OOS Permission Font",
        fullName: "OOS Permission Font Regular",
        style: "Regular",
        blob: async () =>
          (await fetch("/fonts/SourceSans3-Regular.ttf")).blob(),
      },
    ];
  };
});
async function pdf(name) {
  await page.getByRole("button", { name: "Save as", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Save as", exact: true });
  await dialog
    .getByRole("radio", { name: "PDF document (.pdf)", exact: true })
    .check();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  const bytes = await readFile(await (await download).path());
  await writeFile(resolve(output, `${name}.pdf`), bytes);
  assert.match(bytes.toString("latin1"), /^%PDF-/);
  return bytes.toString("latin1").match(/\/BaseFont\s*\/[\w+-]+/g) ?? [];
}
try {
  const zip = unzipSync(await readFile("public/templates/nieuw.docx"));
  zip["word/document.xml"] = strToU8(
    strFromU8(zip["word/document.xml"]).replace(
      /(<w:body>)[\s\S]*?(<w:sectPr)/,
      '$1<w:p><w:r><w:rPr><w:rFonts w:ascii="OOS Permission Font" w:hAnsi="OOS Permission Font"/><w:sz w:val="28"/></w:rPr><w:t>Font availability browser route.</w:t></w:r></w:p>$2',
    ),
  );
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.locator(".office > input[type=file]").setInputFiles({
    name: "Font.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(zipSync(zip)),
  });
  await page.locator("[data-testid=yrs-input]:visible").waitFor();
  await page.waitForLoadState("networkidle");
  report.beforeFonts = await pdf("before-access");
  assert.equal(await page.evaluate(() => window.testFontQueries), 0);
  assert.ok(report.beforeFonts.some((f) => f.includes("LiberationSans")));
  assert.ok(report.beforeFonts.every((f) => !f.includes("SourceSans3")));
  await page
    .getByRole("button", { name: "Font: OOS Permission Font", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show all fonts", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show fonts on this computer…", exact: true })
    .click();
  await page.waitForFunction(() => window.testFontQueries === 1);
  await page
    .getByRole("dialog")
    .getByRole("option", { name: "OOS Permission Font", exact: true })
    .first()
    .waitFor();
  await page.keyboard.press("Escape");
  report.afterFonts = await pdf("after-access");
  assert.ok(report.afterFonts.some((f) => f.includes("SourceSans3-Roman")));
  report.localFontQueries = await page.evaluate(() => window.testFontQueries);
  assert.equal(report.localFontQueries, 1);
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log(
    "OK: Actual Writer browser open/font-picker/PDF-download route",
    JSON.stringify(report),
  );
} catch (e) {
  report.failure = String(e.stack ?? e);
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
