/** #340: real shell-tab clicks must return Undo/Redo to the selected document. */
import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";
import { unzipSync, strFromU8 } from "fflate";
import { createHash } from "node:crypto";

const out = resolve(process.env.OOS_TEST_UIT ?? ".local/proef-office-tab-undo");
await mkdir(out, { recursive: true });
const dist = process.env.OOS_TEST_DIST ?? "dist";
const route = process.env.OOS_TEST_ROUTE ?? "/";
await cp("node_modules/@betteroffice/fonts/assets", `${dist}/fonts`, {
  recursive: true,
});
const server = await preview({
  configFile: false,
  base: route,
  build: { outDir: dist },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch();
const report = {
  codepoint: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirty: !!execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { encoding: "utf8" },
  ).trim(),
  sourceHashes: Object.fromEntries(
    await Promise.all(
      [
        "src/OfficeStudio.tsx",
        "src/TabBalk.tsx",
        "src/export/koppeling.ts",
        "src/export/editorKoppeling.ts",
      ].map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(file))
          .digest("hex"),
      ]),
    ),
  ),
  platform: process.platform,
  browser: browser.version(),
  route,
  cases: [],
  errors: [],
};
const tabs = (page) => page.locator(".office-tabbalk [role=tab]");
async function upload(page, kind, name) {
  await page
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name,
      mimeType: "application/octet-stream",
      buffer: await readFile(`public/templates/nieuw.${kind}`),
    });
  await page.waitForFunction(
    (name) =>
      document
        .querySelector(".office-tabbalk [aria-selected=true]")
        ?.textContent.includes(name),
    name,
  );
  await page.waitForFunction((kind) => {
    const a = probe();
    return kind === "docx"
      ? a?.tekst()?.getEditorRef()?.getLayout()?.pages.length
      : kind === "pptx"
        ? a?.presentatie?.handle.snapshot().slides.length
        : a?.rekenblad?.handle.sheetCount();
  }, kind);
}
async function text(page) {
  return page.evaluate(async () =>
    (
      await probe().tekst().readParagraphs({ view: "accepted", story: "body" })
    ).paragraphs
      .map((p) => p.text)
      .join(""),
  );
}
async function slides(page) {
  return page.evaluate(
    () => probe().presentatie.handle.snapshot().slides.length,
  );
}
async function sheet(page) {
  const bytes = await page.evaluate(() =>
    Array.from(probe().rekenblad.handle.save()),
  );
  return strFromU8(
    unzipSync(new Uint8Array(bytes))["xl/worksheets/sheet1.xml"],
  );
}
async function run(name, test) {
  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  try {
    await page.addInitScript(() => {
      localStorage.setItem(
        "openaec-office-instellingen",
        JSON.stringify({
          taal: "en",
          spelling: { controleren: false },
          autocorrectie: false,
        }),
      );
      window.probe = () => {
        const el = document.querySelector(
          ".office-tabpaneel:not([hidden]) .office-tekst, .office-tabpaneel:not([hidden]) .office-presentatie, .office-tabpaneel:not([hidden]) .office-rekenblad-host",
        );
        for (
          let f =
            el?.[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
          f;
          f = f.return
        ) {
          const v = f.memoizedProps?.value;
          if (v?.herlaad && (v.tekst || v.presentatie || v.rekenblad)) return v;
        }
        return null;
      };
    });
    await page.goto(
      `http://127.0.0.1:${server.httpServer.address().port}${route}`,
    );
    assert(new URL(page.url()).pathname.startsWith(route));
    assert.equal(
      await page.evaluate(() => typeof window.__TAURI_INTERNALS__),
      "undefined",
      "Real browser route without native IPC stubs",
    );
    await test(page);
    report.cases.push({ name, passed: true });
    console.log(`OK: ${name}`);
  } catch (error) {
    report.cases.push({
      name,
      passed: false,
      error: String(error),
      focus: await page.evaluate(() =>
        document.activeElement?.outerHTML.slice(0, 400),
      ),
    });
    await page.screenshot({
      path: resolve(out, `failed-${report.cases.length}.png`),
    });
    console.error(`FAIL: ${name}: ${error.message}`);
  } finally {
    await context.close();
  }
}
async function writer(page) {
  await upload(page, "docx", "Writer.docx");
  await page.evaluate(() => probe().tekst().focus());
  await page.keyboard.type("TABPROEF WRITER ALFA 135.");
  await page.waitForFunction(async () =>
    (
      await probe().tekst().readParagraphs({ view: "accepted", story: "body" })
    ).paragraphs.some((p) => p.text.includes("TABPROEF")),
  );
  return text(page);
}
async function writerCheck(page, expected) {
  await page.waitForFunction(
    async (expected) =>
      (
        await probe()
          .tekst()
          .readParagraphs({ view: "accepted", story: "body" })
      ).paragraphs
        .map((p) => p.text)
        .join("") === expected,
    expected,
    { timeout: 3000 },
  );
}
try {
  await run(
    "Writer: mouse tab → Undo/Redo, same active tab, independent histories",
    async (page) => {
      const changed = await writer(page);
      await upload(page, "pptx", "Presentation.pptx");
      await page.evaluate(() => probe().presentatie.focus());
      await page.keyboard.press("Control+m");
      await page.waitForFunction(
        () => probe().presentatie.handle.snapshot().slides.length === 2,
      );
      await tabs(page).filter({ hasText: "Writer.docx" }).click();
      await page.keyboard.press("Control+z");
      await writerCheck(page, "");
      await page.keyboard.press("Control+y");
      await writerCheck(page, changed);
      await tabs(page).filter({ hasText: "Writer.docx" }).click();
      await page.keyboard.press("Control+z");
      await writerCheck(page, "");
      await page.keyboard.press("Control+y");
      await writerCheck(page, changed);
      await tabs(page).filter({ hasText: "Presentation.pptx" }).click();
      assert.equal(await slides(page), 2);
      await page.keyboard.press("Control+z");
      assert.equal(await slides(page), 1);
      await page.keyboard.press("Control+y");
      assert.equal(await slides(page), 2);
      await tabs(page).filter({ hasText: "Writer.docx" }).click();
      await writerCheck(page, changed);
    },
  );
  await run(
    "Writer controls: keyboard activation, ribbon Undo and canvas focus",
    async (page) => {
      const changed = await writer(page);
      await upload(page, "pptx", "Other.pptx");
      await page.keyboard.press("Control+Shift+Tab");
      await page.keyboard.press("Control+z");
      await writerCheck(page, "");
      await page.keyboard.press("Control+y");
      await writerCheck(page, changed);
      await tabs(page).filter({ hasText: "Other.pptx" }).click();
      await tabs(page).filter({ hasText: "Writer.docx" }).click();
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await writerCheck(page, "");
      await page.getByRole("button", { name: "Redo", exact: true }).click();
      await writerCheck(page, changed);
      await page.evaluate(() => probe().tekst().focus());
      await page.keyboard.press("Control+z");
      await writerCheck(page, "");
    },
  );
  await run(
    "Spreadsheet: mouse activation preserves cell history",
    async (page) => {
      await upload(page, "xlsx", "Sheet.xlsx");
      await page.evaluate(() => {
        const a = probe().rekenblad;
        a.selectCells(0, {
          anchor: { row: 0, col: 0 },
          focus: { row: 0, col: 0 },
        });
        a.focus();
      });
      await page.keyboard.type("TABPROEF123");
      await page.keyboard.press("Enter");
      assert.match(await sheet(page), /TABPROEF123/);
      await upload(page, "docx", "Other.docx");
      await tabs(page).filter({ hasText: "Sheet.xlsx" }).click();
      await page.keyboard.press("Control+z");
      assert.doesNotMatch(await sheet(page), /TABPROEF123/);
      await page.keyboard.press("Control+y");
      assert.match(await sheet(page), /TABPROEF123/);
    },
  );
  await run(
    "Writer: tab switches preserve the caret and do not create history",
    async (page) => {
      const changed = await writer(page);
      await page.keyboard.press("Control+Home");
      await page.keyboard.press("ArrowRight");
      const before = await page.evaluate(() =>
        JSON.stringify(
          probe().tekst().getEditorRef().getYrsSession().selection(),
        ),
      );
      await upload(page, "xlsx", "Other.xlsx");
      await tabs(page).filter({ hasText: "Writer.docx" }).click();
      assert.equal(
        await page.evaluate(() =>
          JSON.stringify(
            probe().tekst().getEditorRef().getYrsSession().selection(),
          ),
        ),
        before,
      );
      await writerCheck(page, changed);
      await page.keyboard.press("Control+z");
      await writerCheck(page, "");
      await page.keyboard.press("Control+y");
      await writerCheck(page, changed);
    },
  );
  await run(
    "Search input retains focus and local Undo after a mouse tab switch",
    async (page) => {
      const changed = await writer(page);
      await upload(page, "pptx", "Other.pptx");
      await tabs(page).filter({ hasText: "Writer.docx" }).click();
      await page.keyboard.press("Control+f");
      const search = page
        .getByRole("search", { name: "Find and Replace", exact: true })
        .getByRole("searchbox", { name: "Find what", exact: true });
      await search.click();
      await search.pressSequentially("queryX");
      await tabs(page).filter({ hasText: "Writer.docx" }).click();
      assert(await search.evaluate((e) => e === document.activeElement));
      assert.equal(await search.inputValue(), "queryX");
      await page.keyboard.press("Control+z");
      assert.equal(await search.inputValue(), "");
      await writerCheck(page, changed);
      await search.click();
      await page.keyboard.press("End");
      await search.pressSequentially("Y");
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      assert(
        await search.evaluate((e) => e === document.activeElement),
        "No delayed document-focus override",
      );
    },
  );
  await run(
    "Formula input keeps its existing Undo behavior and committed cell",
    async (page) => {
      await upload(page, "xlsx", "Sheet.xlsx");
      await page.evaluate(() => probe().rekenblad.focus());
      await page.keyboard.type("123");
      await page.keyboard.press("Enter");
      const before = await sheet(page);
      await upload(page, "docx", "Other.docx");
      await tabs(page).filter({ hasText: "Sheet.xlsx" }).click();
      const formula = page.locator('[data-testid="xlsx-formula-input"]');
      await formula.click();
      await formula.pressSequentially("=12");
      await page.keyboard.press("Control+z");
      const localUndo = await formula.inputValue();
      assert.equal(
        await sheet(page),
        before,
        "Control: input Undo does not reach document history",
      );
      await tabs(page).filter({ hasText: "Sheet.xlsx" }).click();
      assert(await formula.evaluate((e) => e === document.activeElement));
      assert.equal(await formula.inputValue(), localUndo);
      await page.keyboard.press("Control+z");
      assert.equal(await formula.inputValue(), localUndo);
      assert.equal(await sheet(page), before);
    },
  );
  await run(
    "Presentation: ribbon slide insertion then mouse activation and notes-local Undo",
    async (page) => {
      await upload(page, "pptx", "Presentation.pptx");
      await page
        .getByRole("button", { name: "New Slide", exact: true })
        .click();
      await page.waitForFunction(
        () => probe().presentatie.handle.snapshot().slides.length === 2,
      );
      await upload(page, "docx", "Other.docx");
      await tabs(page).filter({ hasText: "Presentation.pptx" }).click();
      await page.keyboard.press("Control+z");
      assert.equal(await slides(page), 1);
      await page.keyboard.press("Control+y");
      assert.equal(await slides(page), 2);
      const note = page.getByTestId("rich-notes-editor");
      await note.click();
      await page.keyboard.type("NOTES LOCAL");
      assert.match(await note.textContent(), /NOTES LOCAL/);
      await tabs(page).filter({ hasText: "Presentation.pptx" }).click();
      assert(await note.evaluate((e) => e === document.activeElement));
      await page.keyboard.press("Control+z");
      assert.doesNotMatch(await note.textContent(), /NOTES LOCAL/);
      assert.equal(await slides(page), 2);
    },
  );
  await run(
    "Modal input keeps local Undo; document history remains untouched",
    async (page) => {
      const changed = await writer(page);
      await upload(page, "pptx", "Other.pptx");
      await tabs(page).filter({ hasText: "Writer.docx" }).click();
      await page.keyboard.press("F1");
      const dialog = page.getByRole("dialog");
      const input = dialog.getByRole("searchbox");
      await input.fill("query");
      await input.press("End");
      await input.pressSequentially("X");
      await page.keyboard.press("Control+z");
      assert.equal(await input.inputValue(), "query");
      assert(await input.evaluate((e) => e === document.activeElement));
      await writerCheck(page, changed);
      await page.keyboard.press("Escape");
    },
  );
  await run(
    "Ctrl+Tab, Shift+Tab and F6 retain document focus; arrows retain tab focus",
    async (page) => {
      await writer(page);
      await upload(page, "pptx", "Other.pptx");
      await page.evaluate(() => probe().presentatie.focus());
      for (const key of [
        "Control+Shift+Tab",
        "Control+Tab",
        "Control+Shift+F6",
        "Control+F6",
      ]) {
        await page.keyboard.press(key);
        assert(
          !(await page.evaluate(() =>
            document.activeElement?.closest(".office-tabbalk"),
          )),
          key,
        );
      }
      const tab = tabs(page).filter({ hasText: "Other.pptx" });
      await tab.focus();
      await page.keyboard.press("ArrowLeft");
      await page.waitForFunction(
        () =>
          document.activeElement?.getAttribute("role") === "tab" &&
          document.activeElement?.textContent.includes("Writer.docx"),
      );
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(
        () =>
          document.activeElement?.getAttribute("role") === "tab" &&
          document.activeElement?.textContent.includes("Other.pptx"),
      );
    },
  );
} finally {
  await writeFile(
    resolve(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
assert(
  report.cases.every((c) => c.passed) && !report.errors.length,
  "Office tab Undo regression failed",
);
