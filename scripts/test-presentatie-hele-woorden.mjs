/** Actual production UI: literal whole-word find/replace and PPTX round trips. */
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
    `.local/presentation-whole-word-${baseline ? "baseline" : "fixed"}`,
);
await mkdir(output, { recursive: true });
await initWasm(
  await readFile(
    "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
  ),
);
const original = [
  "🧱 kat katten Kat katapult _kat kat_ kat2 ékat katé kat́ 𐐀kat kat𐐀 (kat)",
  "kat Kat",
];
const handle = openPresentation(await readFile("public/templates/nieuw.pptx"));
const first = handle.snapshot().slides[0];
handle.duplicateSlide(first.id, 1);
handle.snapshot().slides.forEach((slide, i) =>
  handle.addTextBox(slide.id, {
    name: "Whole-word fixture",
    rect: { x: 400000, y: 700000, width: 10000000, height: 3000000 },
    text: original[i],
    style: { fontFamily: "Arial", fontSizePt: 20 },
  }),
);
const fixture = Buffer.from(handle.save());
handle.dispose();
await writeFile(resolve(output, "fixture.pptx"), fixture);
const server = await preview({
  configFile: false,
  build: {
    outDir:
      process.env.OFFICE_TEST_DIST ??
      `.local/whole-word-${baseline ? "baseline" : "fixed"}`,
  },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "en-GB",
});
let page = await context.newPage();
const report = { baseline, cases: [], errors: [] };
page.on("pageerror", (e) => report.errors.push(e.message));
await page.addInitScript(() =>
  localStorage.setItem(
    "openaec-office-instellingen",
    JSON.stringify({ taal: "en", spelling: { controleren: false } }),
  ),
);
async function status(pattern) {
  await page.waitForFunction(
    (source) =>
      [...document.querySelectorAll('[role="dialog"] [role="status"]')].some(
        (e) => new RegExp(source).test(e.textContent),
      ),
    pattern,
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
    const shapes = h
      .snapshot()
      .slides.flatMap((s) =>
        s.shapes.filter((x) => x.name === "Whole-word fixture"),
      );
    for (const shape of shapes) {
      assert.deepEqual(
        [shape.x, shape.y, shape.width, shape.height],
        [400000, 700000, 10000000, 3000000],
      );
      for (const story of shape.textStories)
        for (const paragraph of story.paragraphs)
          for (const run of paragraph.runs) {
            assert.equal(run.style.fontFamily, "Arial");
            assert.equal(run.style.fontSizePt, 20);
          }
    }
    const ids = new Set(shapes.flatMap((x) => x.textStories.map((t) => t.id)));
    const stories = h.readContent().stories;
    assert.deepEqual(
      stories.filter((s) => !ids.has(s.storyId)).map((s) => s.text),
      [
        "Titel van de presentatie",
        "Voeg een ondertitel toe",
        "Titel van de presentatie",
        "Voeg een ondertitel toe",
      ],
    );
    return stories.filter((s) => ids.has(s.storyId)).map((s) => s.text);
  } finally {
    h.dispose();
  }
}
async function openFind() {
  await page
    .getByRole("button", { name: "Find and replace", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Find and replace", exact: true });
}
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.locator(".office > input[type=file]").setInputFiles({
    name: "Whole-words.pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: fixture,
  });
  await page.getByRole("tab", { name: /Whole-words\.pptx/ }).waitFor();
  await page.waitForLoadState("networkidle");
  let dialog = await openFind();
  await dialog.getByLabel("Find what", { exact: true }).fill("kat");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="dialog"] [role="status"]')].some(
      (e) => /Result \d+ of 15/.test(e.textContent),
    ),
  );
  report.defaultStatus = await dialog.getByRole("status").innerText();
  const whole = dialog.getByRole("checkbox", {
    name: "Find whole words only",
    exact: true,
  });
  if (baseline) {
    assert.equal(await whole.count(), 0);
    assert.equal(await dialog.getByRole("checkbox").count(), 1);
    report.cases.push(
      "Baseline lacks the whole-word option and finds 15 full/partial matches",
    );
  } else {
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await status("^Result 2 of 15");
    await dialog.getByLabel("Replace with", { exact: true }).fill("hond");
    await whole.check();
    assert.equal(await dialog.getByRole("status").innerText(), "");
    // The old partial match must only be reselected, never replaced after toggling.
    await dialog.getByRole("button", { name: "Replace", exact: true }).click();
    await status("^Result 1 of 5");
    assert.deepEqual(texts(await save("toggle-selection-only.pptx")), original);
    report.cases.push(
      "Toggling clears stale partial selection/status before Replace can modify text",
    );
    report.wholeStatus = await dialog.getByRole("status").innerText();
    report.cases.push(
      "Whole-word search excludes prefixes/suffixes, marks, Unicode letters, digits and underscore",
    );
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await status("^Result 2 of 5");
    await dialog.getByRole("button", { name: "Previous", exact: true }).click();
    await status("^Result 1 of 5");
    await dialog.getByLabel("Find what", { exact: true }).press("Shift+Enter");
    await status("^Result 5 of 5.*slide 2");
    await dialog
      .getByRole("checkbox", { name: "Match case", exact: true })
      .check();
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await status("of 3");
    report.caseStatus = await dialog.getByRole("status").innerText();
    await dialog
      .getByRole("checkbox", { name: "Match case", exact: true })
      .uncheck();
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await status("of 5");
    let current = Number(
      (await dialog.getByRole("status").innerText()).match(/Result (\d+)/)[1],
    );
    while (current !== 1) {
      current = (current % 5) + 1;
      await dialog.getByRole("button", { name: "Next", exact: true }).click();
      await status(`^Result ${current} of 5`);
    }
    report.cases.push(
      "Next, previous, Shift+Enter wrapping and match-case filtering across two slides",
    );
    await dialog.getByLabel("Replace with", { exact: true }).fill("hond");
    await dialog.getByRole("button", { name: "Replace", exact: true }).click();
    await status("^Replaced\\.");
    const one = await save("replace-one.pptx");
    assert.deepEqual(texts(one), [
      original[0].replace("kat", "hond"),
      original[1],
    ]);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.deepEqual(texts(await save("undo-one.pptx")), original);
    report.cases.push(
      "Replace current changes only the selected whole word at its native UTF-16 range",
    );
    dialog = await openFind();
    assert.equal(
      await dialog
        .getByRole("checkbox", { name: "Find whole words only", exact: true })
        .isChecked(),
      false,
    );
    await dialog.getByLabel("Find what", { exact: true }).fill("kat");
    await dialog.getByLabel("Replace with", { exact: true }).fill("hond");
    await dialog
      .getByRole("checkbox", { name: "Find whole words only", exact: true })
      .check();
    await dialog
      .getByRole("button", { name: "Replace all", exact: true })
      .click();
    await status("^Replaced 5 times");
    const expected = [
      "🧱 hond katten hond katapult _kat kat_ kat2 ékat katé kat́ 𐐀kat kat𐐀 (hond)",
      "hond hond",
    ];
    assert.deepEqual(texts(await save("replace-all.pptx")), expected);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.deepEqual(texts(await save("undo-all.pptx")), original);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    const redone = await save("redo-all.pptx");
    assert.deepEqual(texts(redone), expected);
    report.cases.push(
      "Replace all changes five whole words; one Undo and one Redo restore the entire transaction",
    );
    await page.close();
    page = await context.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    await page.locator(".office > input[type=file]").setInputFiles({
      name: "Reopened.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: redone,
    });
    await page.getByRole("tab", { name: /Reopened\.pptx/ }).waitFor();
    await page.waitForLoadState("networkidle");
    dialog = await openFind();
    await dialog.getByLabel("Find what", { exact: true }).fill("kat");
    await dialog
      .getByRole("checkbox", { name: "Find whole words only", exact: true })
      .check();
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await status("^Search term not found\\.");
    report.cases.push(
      "Actual downloaded PPTX reopens in a fresh browser page with partial words preserved",
    );
    await page.close();
    page = await context.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    await page.addInitScript(() =>
      localStorage.setItem(
        "openaec-office-instellingen",
        JSON.stringify({ taal: "nl", spelling: { controleren: false } }),
      ),
    );
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    await page.locator(".office > input[type=file]").setInputFiles({
      name: "Nederlands.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: fixture,
    });
    await page.getByRole("tab", { name: /Nederlands\.pptx/ }).waitFor();
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("button", { name: "Zoeken en vervangen", exact: true })
      .click();
    const dutch = page.getByRole("checkbox", {
      name: "Alleen hele woorden",
      exact: true,
    });
    assert.equal(await dutch.isChecked(), false);
    await dutch.focus();
    await page.keyboard.press("Space");
    assert.equal(await dutch.isChecked(), true);
    report.cases.push(
      "Existing Dutch label is localized and the checkbox works through keyboard Space",
    );
  }
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
