// Start an isolated dev/preview server and pass its URL; requires Chromium.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const errors = [],
  results = [];
const output = ".local/formaatfouten-browser";
await mkdir(output, { recursive: true });
try {
  const context = await browser.newContext({ locale: "nl-NL" });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({ taal: "nl", spelling: { controleren: false } }),
    ),
  );
  await page.goto(process.argv[2] || "http://127.0.0.1:1436/");
  // Keep an existing valid document open while each unsupported import fails.
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Bestaand.docx",
      mimeType: "application/octet-stream",
      buffer: await readFile("public/templates/nieuw.docx"),
    });
  await page
    .locator(".office-tabnaam")
    .filter({ hasText: "Bestaand.docx" })
    .waitFor();
  const before = await page.locator(".office-tabnaam").allTextContents();
  for (const [ext, alternative] of [
    ["wpd", "DOCX"],
    ["numbers", "XLSX"],
    ["key", "PPTX"],
  ]) {
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles({
        name: `Archief.${ext.toUpperCase()}`,
        mimeType: "application/octet-stream",
        buffer: Buffer.from([1, 2, 3]),
      });
    const alert = page
      .locator('.office-melding[data-toon="fout"]')
      .filter({ hasText: ext.toUpperCase() });
    await alert.waitFor();
    const text = await alert.innerText();
    assert.match(text, /desktop/i);
    assert(text.includes(alternative));
    if (ext === "numbers") assert.match(text, /CSV.*één blad/s);
    assert.deepEqual(
      await page.locator(".office-tabnaam").allTextContents(),
      before,
    );
    results.push({
      ext,
      alternative,
      existingTabsPreserved: true,
      message: text,
    });
    await alert.locator(".office-melding-sluiten").click();
  }
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${output}/bestaand-document.png` });
  await writeFile(
    `${output}/resultaat.json`,
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(
    `${results.length} format errors show desktop requirement and alternative; existing document preserved`,
  );
} finally {
  await browser.close();
}
