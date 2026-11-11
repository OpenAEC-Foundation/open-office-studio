/** Actual production UI with a real native search exceeding its result limit. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { preview } from "vite";
import { initWasm, openPresentation } from "@betteroffice/pptx";
const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
const baseline = process.argv.includes("--baseline");
const output = resolve(
  process.env.OFFICE_TEST_UIT ??
    `.local/presentation-truncation-${baseline ? "baseline" : "fixed"}`,
);
await mkdir(output, { recursive: true });
await initWasm(
  await readFile(
    "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
  ),
);
const original = "katten ".repeat(10000) + "kat needle";
const handle = openPresentation(await readFile("public/templates/nieuw.pptx"));
handle.addTextBox(handle.snapshot().slides[0].id, {
  name: "Search limit fixture",
  rect: { x: 100000, y: 100000, width: 10000000, height: 100000 },
  text: original,
  style: { fontFamily: "Arial", fontSizePt: 1 },
});
const native = handle.findText({ text: "kat", limit: 10000 });
assert.equal(native.truncated, true);
assert.equal(native.matches.length, 10000);
const fixture = Buffer.from(handle.save());
handle.dispose();
const server = await preview({
  configFile: false,
  build: {
    outDir:
      process.env.OFFICE_TEST_DIST ??
      `.local/truncation-${baseline ? "baseline" : "fixed"}`,
  },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "en-GB",
});
let page = await context.newPage();
const report = {
  baseline,
  native: { returned: native.matches.length, truncated: native.truncated },
  cases: [],
  errors: [],
};
page.on("pageerror", (e) => report.errors.push(e.message));
async function open(language, name) {
  await page.addInitScript(
    (language) =>
      localStorage.setItem(
        "openaec-office-instellingen",
        JSON.stringify({ taal: language, spelling: { controleren: false } }),
      ),
    language,
  );
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page
    .locator(".office > input[type=file]")
    .setInputFiles({
      name,
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: fixture,
    });
  await page
    .getByRole("tab", {
      name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    })
    .waitFor();
  await page.waitForLoadState("networkidle");
}
async function status(text) {
  await page.waitForFunction(
    (text) => document.querySelector(".rekenblad-status")?.textContent === text,
    text,
  );
}
async function save(name) {
  await page.getByRole("button", { name: "Save as", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Save as", exact: true });
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  const bytes = await readFile(await (await download).path());
  await writeFile(resolve(output, name), bytes);
  return bytes;
}
function texts(bytes) {
  const h = openPresentation(bytes);
  try {
    return h.readContent().stories.map((s) => s.text);
  } finally {
    h.dispose();
  }
}
try {
  await open("en", "Truncation.pptx");
  await page
    .getByRole("button", { name: "Find and replace", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Find and replace",
    exact: true,
  });
  await dialog.getByLabel("Find what", { exact: true }).fill("kat");
  await dialog
    .getByRole("checkbox", { name: "Find whole words only", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  const warning =
    "Too many search matches. Refine your search; no replacements were made.";
  if (baseline) {
    await status("Search term not found.");
    report.cases.push(
      "Baseline falsely reports no whole word although the native result is truncated",
    );
  } else {
    await status(warning);
    report.cases.push(
      "Find reports incomplete search instead of a false no-match or count",
    );
    await dialog.getByLabel("Replace with", { exact: true }).fill("hond");
    await dialog
      .getByRole("checkbox", { name: "Find whole words only", exact: true })
      .uncheck();
    await dialog.getByRole("button", { name: "Replace", exact: true }).click();
    await status(warning);
    await dialog
      .getByRole("checkbox", { name: "Find whole words only", exact: true })
      .check();
    await dialog
      .getByRole("button", { name: "Replace all", exact: true })
      .click();
    await status(warning);
    assert.deepEqual(
      texts(await save("refused-replacements.pptx")),
      texts(fixture),
    );
    report.cases.push(
      "Replace current/all on incomplete results leave every story unchanged in actual download",
    );
    await dialog.getByLabel("Find what", { exact: true }).fill("needle");
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await status("Result 1 of 1 · slide 1");
    await dialog
      .getByRole("button", { name: "Replace all", exact: true })
      .click();
    await status("Replaced 1 times (one undo step).");
    const expected = texts(fixture).map((t) =>
      t === original ? original.replace("needle", "hond") : t,
    );
    assert.deepEqual(texts(await save("refined-query.pptx")), expected);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.deepEqual(texts(await save("undo-refined.pptx")), texts(fixture));
    report.cases.push(
      "Refining the query restores normal search/replace and one Undo",
    );
    await page.close();
    page = await context.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    await open("nl", "Nederlands.pptx");
    await page
      .getByRole("button", { name: "Zoeken en vervangen", exact: true })
      .click();
    dialog = page.getByRole("dialog", {
      name: "Zoeken en vervangen",
      exact: true,
    });
    await dialog.getByLabel("Zoeken naar", { exact: true }).fill("kat");
    await dialog
      .getByRole("checkbox", { name: "Alleen hele woorden", exact: true })
      .check();
    await dialog.getByRole("button", { name: "Volgende", exact: true }).click();
    await status(
      "Te veel zoekresultaten. Verfijn de zoekopdracht; er is niets vervangen.",
    );
    report.cases.push("Actual Dutch UI displays the localized limit warning");
  }
  report.status = await dialog.getByRole("status").innerText();
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log(JSON.stringify(report));
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
