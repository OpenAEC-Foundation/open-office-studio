import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

const label = process.argv[2] ?? "361-baseline";
const fixed = process.argv.includes("--fixed");
const leftCoreOnly = process.argv.includes("--left-core-only");
const route = process.env.OFFICE_TEST_BASE ?? "/";
const outDir = process.env.OFFICE_TEST_DIR ?? "dist";
const output = ".local/" + label;
fs.mkdirSync(output, { recursive: true });
const p = unzipSync(fs.readFileSync("public/templates/nieuw.docx"));
const x = strFromU8(p["word/document.xml"]);
const cell = (t) =>
  `<w:tc><w:tcPr><w:tcW w:w="2880" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
const rows = [
  ["alpha", "beta", ""],
  ["", "", "omega"],
  ["delta", "", ""],
];
const table = `<w:tbl><w:tblPr><w:tblW w:w="8640" w:type="dxa"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2880"/>'.repeat(3)}</w:tblGrid>${rows.map((r) => "<w:tr>" + r.map(cell).join("") + "</w:tr>").join("")}</w:tbl><w:p/>`;
p["word/document.xml"] = strToU8(
  x.replace(/(<w:body>)[\s\S]*?(<w:sectPr)/, `$1${table}$2`),
);
const fixture = Buffer.from(zipSync(p));
const report = {
  harness: {
    commit: execFileSync(
      "git",
      [
        "-C",
        fileURLToPath(new URL("../", import.meta.url)),
        "rev-parse",
        "HEAD",
      ],
      { encoding: "utf8" },
    ).trim(),
    sha256: createHash("sha256")
      .update(fs.readFileSync(fileURLToPath(import.meta.url)))
      .digest("hex"),
  },
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirty: execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim(),
  route,
  sourceHashes: Object.fromEntries(
    [
      "src/lint/gedeeld.tsx",
      "src/lint/tekst-kolomfocus.ts",
      "scripts/proef-writer-kolom-undo.mjs",
    ].map((p) => [
      p,
      createHash("sha256").update(fs.readFileSync(p)).digest("hex"),
    ]),
  ),
  scope: leftCoreOnly
    ? "Left-column insert/Undo/Redo/second Undo only"
    : "Full27-check column regression",
  checks: [],
  errors: [],
  status: "running",
  acceptance: false,
  cleanupErrors: [],
};
let server, browser, page, failure;
try {
  assert.ok(
    process.env.OFFICE_TEST_BUILD_RECEIPT,
    "OFFICE_TEST_BUILD_RECEIPT is required",
  );
  const { verifyBuildReceipt } = await import("./writer-proefbuild.mjs");
  report.buildReceipt = await verifyBuildReceipt({
    outDir,
    route,
    receiptPath: process.env.OFFICE_TEST_BUILD_RECEIPT,
  });
  fs.writeFileSync(
    output + "/build-receipt.json",
    JSON.stringify(report.buildReceipt, null, 2),
  );
  server = await preview({
    configFile: false,
    base: route,
    build: { outDir },
    preview: { host: "127.0.0.1", port: 0 },
  });
  report.serverUrl = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true, timeout: 30_000 });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  await context.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({
        taal: "en",
        thema: "forge",
        spelling: { controleren: false, autocorrectie: false },
      }),
    ),
  );
  await context.addInitScript(() => {
    // Passive evidence only: never prevent, replay or modify a keyboard event.
    window.__writer361KeyboardEvidence = [];
    for (const type of ["keydown", "keyup"]) {
      document.addEventListener(
        type,
        (event) => {
          const entries = window.__writer361KeyboardEvidence;
          if (entries.length >= 200) return;
          const target = event.target;
          const entry = {
            type,
            at: performance.now(),
            key: event.key,
            code: event.code,
            meta: event.metaKey,
            control: event.ctrlKey,
            shift: event.shiftKey,
            trusted: event.isTrusted,
            targetTag: target?.tagName,
            targetName: target?.getAttribute?.("aria-label"),
            activeTag: document.activeElement?.tagName,
            activeName: document.activeElement?.getAttribute?.("aria-label"),
          };
          entries.push(entry);
          queueMicrotask(() => {
            entry.defaultPrevented = event.defaultPrevented;
            entry.activeAfterDispatch = document.activeElement?.tagName;
            entry.activeNameAfterDispatch =
              document.activeElement?.getAttribute?.("aria-label");
          });
        },
        { capture: true, passive: true },
      );
    }
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  const browserPlatform = await page.evaluate(() => navigator.platform);
  const apple = /Mac|iPod|iPhone|iPad/.test(browserPlatform);
  const keys = {
    undo: apple ? "Meta+z" : "Control+z",
    redo: apple ? "Meta+Shift+z" : "Control+y",
    documentHome: apple ? "Meta+ArrowUp" : "Control+Home",
    // Home is the SDK's explicit line-start key on both platforms.
    lineHome: "Home",
    // Command+H hides a native macOS app; this test only needs the Find input.
    findReplace: apple ? "Home ribbon -> Replace button" : "Control+h",
  };
  report.keyboardContext = {
    hostPlatform: process.platform,
    browserPlatform,
    synthetic: apple !== (process.platform === "darwin"),
    keys,
  };
  await page.locator("input[type=file]").first().setInputFiles({
    name: "table-undo.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: fixture,
  });
  const canvas = page.locator(".canvas-page canvas").first();
  await canvas.waitFor();
  await page.evaluate(() => document.fonts.ready);
  await canvas.click({ position: { x: 150, y: 110 } });
  await page.keyboard.press(keys.documentHome);
  await page.getByRole("tab", { name: "Table Design", exact: true }).waitFor();
  const state = async () =>
    page.evaluate(() => ({
      focus: {
        tag: document.activeElement?.tagName,
        role: document.activeElement?.getAttribute("role"),
        name: document.activeElement?.getAttribute("aria-label"),
        id: document.activeElement?.id,
      },
      tables: [...document.querySelectorAll("[role=table]")]
        .filter((t) => !t.closest("[hidden], [inert]"))
        .map((t) => ({
          rows: Number(t.getAttribute("aria-rowcount")),
          columns: Number(t.getAttribute("aria-colcount")),
          text: [...t.querySelectorAll("[role=cell]")].map(
            (c) => c.textContent,
          ),
        })),
    }));
  const check = async (name, columns) => {
    const started = Date.now();
    const samples = [];
    // Preserve the old observation time, then only observe; never repeat Undo.
    await page.waitForTimeout(250);
    let s = await state();
    samples.push({ elapsedMs: Date.now() - started, ...s });
    const oldObservationMatched =
      s.tables.length === 1 && s.tables[0].columns === columns;
    while (
      name === "left second Undo" &&
      !(s.tables.length === 1 && s.tables[0].columns === columns) &&
      Date.now() - started < 5000
    ) {
      const frame = await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(resolve)),
      );
      await page.waitForTimeout(50);
      s = await state();
      samples.push({ elapsedMs: Date.now() - started, frame, ...s });
    }
    report.transitions ??= [];
    report.transitions.push({
      name,
      expectedColumns: columns,
      oldObservationMatched,
      elapsedMs: Date.now() - started,
      samples,
    });
    report.checks.push({ name, ...s });
    assert.equal(s.tables.length, 1, name + " visible table count");
    assert.equal(s.tables[0].columns, columns, name);
    return s;
  };
  await page.getByRole("tab", { name: "Table Design", exact: true }).click();
  report.checks.push({ name: "after ribbon tab", ...(await state()) });
  await page
    .getByRole("button", { name: "Insert Column Left", exact: true })
    .click();
  await page.waitForTimeout(500);
  report.checks.push({ name: "after insert", ...(await state()) });
  await page.keyboard.press(keys.undo);
  await page.waitForTimeout(500);
  report.checks.push({ name: "after immediate undo", ...(await state()) });
  assert.equal(report.checks.at(-1).tables[0].columns, fixed ? 3 : 4);
  await page.screenshot({ path: output + "/after-undo.png" });
  if (fixed) {
    await page.keyboard.press(keys.redo);
    await check("left Redo", 4);
    await page.keyboard.press(keys.undo);
    await check("left second Undo", 3);
    if (!leftCoreOnly) {
      await page.getByRole("tab", { name: "Home", exact: true }).click();
      await page
        .getByRole("tab", { name: "Table Design", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Insert Column Right", exact: true })
        .click();
      await check("right insert", 4);
      await page.keyboard.press(keys.undo);
      await check("right Undo", 3);
      await page.keyboard.press(keys.redo);
      await check("right Redo", 4);
      await page.keyboard.press(keys.undo);
      await check("right reset", 3);
      await canvas.click({ position: { x: 600, y: 180 } });
      await page.keyboard.press("Tab");
      await page.keyboard.type("newrow");
      const added = await check("last-cell Tab and typing", 3);
      assert.equal(added.tables[0].rows, 4);
      assert.equal(added.tables[0].text[9], "newrow");
      await page.keyboard.press(keys.undo);
      await page.keyboard.press(keys.undo);
      const rowUndo = await check("Tab row Undo", 3);
      assert.equal(rowUndo.tables[0].rows, 3);
      await canvas.click({ position: { x: 145, y: 110 } });
      await page.keyboard.press(keys.lineHome);
      await page.keyboard.type("X");
      assert.equal(
        (await check("ordinary typing", 3)).tables[0].text[0],
        "Xalpha",
      );
      await page.keyboard.press(keys.undo);
      assert.equal((await check("typing Undo", 3)).tables[0].text[0], "alpha");
      await page.keyboard.press(keys.redo);
      assert.equal((await check("typing Redo", 3)).tables[0].text[0], "Xalpha");
      await page.keyboard.press(keys.undo);
      await page
        .getByRole("tab", { name: "Table Design", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Insert Column Right", exact: true })
        .click();
      await check("before search input", 4);
      if (apple) {
        await page.getByRole("tab", { name: "Home", exact: true }).click();
        await page
          .getByRole("button", { name: "Replace", exact: true })
          .click();
      } else {
        await page.keyboard.press(keys.findReplace);
      }
      const search = page.getByLabel("Find what", { exact: true });
      await search.click();
      await page.keyboard.type("abc");
      await page.keyboard.press(keys.undo);
      assert.equal(await search.inputValue(), "");
      await check("search input owns Undo", 4);
      await page
        .getByRole("search")
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await page.waitForFunction(() =>
        document.activeElement?.matches(".paged-editor__yrs-input"),
      );
      await page.keyboard.press(keys.undo);
      assert.deepEqual(
        (await check("search close and document Undo", 3)).tables[0].text,
        rows.flat(),
      );
      await page.locator("input[type=file]").first().setInputFiles({
        name: "table-other.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: fixture,
      });
      const otherCanvas = page.locator(".canvas-page canvas:visible").first();
      await otherCanvas.waitFor();
      await otherCanvas.click({ position: { x: 150, y: 110 } });
      await page.keyboard.press(keys.documentHome);
      await page
        .getByRole("tab", { name: "Table Design", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Insert Column Right", exact: true })
        .click();
      await check("other document insert", 4);
      await page.keyboard.press(keys.undo);
      await check("other document Undo", 3);
      await page.getByRole("tab", { name: /^table-undo\.docx/ }).click();
      await check("original tab isolated", 3);
      await page.keyboard.press(keys.redo);
      await check("original tab Redo", 4);
      await page.getByRole("tab", { name: /^table-other\.docx/ }).click();
      await check("other tab still isolated", 3);
      await page.keyboard.press(keys.redo);
      await check("other tab Redo", 4);
      await page.keyboard.press(keys.undo);
      await check("other tab reset", 3);
      await page.getByRole("tab", { name: /^table-undo\.docx/ }).click();
      await check("original tab retains its own edit", 4);
      await page.keyboard.press(keys.undo);
      await check("original tab final reset", 3);
    }
  } else {
    await canvas.click({ position: { x: 150, y: 110 } });
    await page.keyboard.press(keys.undo);
    await page.waitForTimeout(500);
  }
  report.checks.push({
    name: fixed ? "final table state" : "after body focus undo",
    ...(await state()),
  });
  await page.screenshot({ path: output + "/after-control.png" });
  assert.deepEqual(report.errors, []);
  report.status = "passed";
  report.acceptance = fixed && !report.keyboardContext.synthetic;
} catch (e) {
  report.status = "failed";
  report.error = String(e);
  failure = e;
} finally {
  if (page && !page.isClosed()) {
    try {
      report.keyboardEvidence = await page.evaluate(
        () => window.__writer361KeyboardEvidence ?? [],
      );
      report.finalObservedAt = new Date().toISOString();
    } catch (error) {
      report.keyboardEvidenceUnavailable = String(error);
    }
  }
  for (const [name, resource] of [
    ["browser", browser],
    ["server", server],
  ]) {
    try {
      await resource?.close();
    } catch (e) {
      report.cleanupErrors.push({ resource: name, error: String(e) });
      failure ??= e;
    }
  }
  if (report.cleanupErrors.length) {
    report.status = "failed";
    report.acceptance = false;
  }
  fs.writeFileSync(output + "/report.json", JSON.stringify(report, null, 2));
}
if (failure) throw failure;
console.log(
  JSON.stringify({
    source: report.source,
    checks: report.checks.map((c) => ({
      name: c.name,
      focus: c.focus,
      tables: c.tables,
    })),
    errors: report.errors,
  }),
);
