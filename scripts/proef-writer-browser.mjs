/** Echte browserroute zonder meetbrug: openen, bewerken, downloaden en heropenen. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
import { preview } from "vite";

const outDir = process.argv[2] ?? "dist";
const label = process.argv[3] ?? "writer-browser";
if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw Error("Invalid label");
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href
    : "playwright"
);
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const fixture = ".local/performance-600.docx";
// Deze gecontroleerde fixture bevat uitsluitend gewone body-alinea's met w:t.
const paragraphs = (bytes) => {
  const xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
  const decode = (s) =>
    s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, x) =>
      x.startsWith("#")
        ? String.fromCodePoint(
            x[1] === "x" ? parseInt(x.slice(2), 16) : Number(x.slice(1)),
          )
        : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[x],
    );
  return [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(([p]) =>
    [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((m) => decode(m[1]))
      .join(""),
  );
};
const expected = paragraphs(fs.readFileSync(fixture));
assert.equal(expected.length, 600);
expected[599] += " Browser cache test 123";
const server = await preview({
  configFile: false,
  build: { outDir },
  preview: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
  });
  page.setDefaultTimeout(180000);
  const errors = [],
    checks = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({
        taal: "en",
        thema: "light",
        spelling: { controleren: true, autocorrectie: true },
      }),
    ),
  );
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  assert.deepEqual(
    await page.evaluate(() =>
      [
        "__writerApis",
        "__writerSpelling",
        "__writerRectCacheStats",
        "__appApis",
        "__appStatus",
        "__writerWarmup",
        "__writerLanguagePending",
        "__TAURI_INTERNALS__",
      ].filter((naam) => naam in window),
    ),
    [],
  );
  const panel = ".office-tabpaneel:not([hidden])";
  const ready = async (name) => {
    await page.waitForFunction((selector) => {
      const p = document.querySelector(selector);
      return (
        p?.querySelectorAll(".canvas-page").length === 79 &&
        Number(
          p.querySelector(".spelling-golflijnen")?.getAttribute("data-fouten"),
        ) > 0
      );
    }, panel);
    await page.evaluate(() => document.fonts.ready);
    checks.push(name);
  };
  await page.locator("input[type=file]").first().setInputFiles(fixture);
  await ready("600-alinea-document geopend met spelling");
  await page
    .locator(`${panel} .canvas-page canvas:visible`)
    .first()
    .click({ position: { x: 200, y: 100 } });
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Browser cache test 123", { delay: 50 });
  await page.mouse.move(1100, 550);
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(50);
  }
  await page.setViewportSize({ width: 1100, height: 740 });
  await ready("invoer, scrollen en vensterwijziging");
  await page.keyboard.press("Control+s");
  const dialog = page.getByRole("dialog", { name: "Save as", exact: true });
  await dialog.getByLabel(/File name/i).fill(`writer-browser-${label}`);
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.docx$/);
  const savedPath = `.local/${label}.docx`;
  await download.saveAs(savedPath);
  assert.deepEqual(paragraphs(fs.readFileSync(savedPath)), expected);
  checks.push(
    "productie-Ctrl+S / Opslaan als-download: alle 600 teksten exact",
  );
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: `writer-browser-reopened-${label}.docx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: fs.readFileSync(savedPath),
    });
  await ready("gedownloade DOCX heropend met spelling");
  assert.equal(await page.locator('.office-tab[data-soort="docx"]').count(), 2);
  assert.deepEqual(errors, []);
  const result = {
    platform: process.platform,
    source,
    outDir,
    browser: browser.version(),
    checks,
    contentExact: true,
    errors,
  };
  fs.writeFileSync(`.local/${label}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await new Promise((r, j) => server.httpServer.close((e) => (e ? j(e) : r())));
}
