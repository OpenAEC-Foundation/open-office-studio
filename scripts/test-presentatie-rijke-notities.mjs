import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { initWasm, openPresentation } from "@betteroffice/pptx";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { preview } from "vite";
const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
await initWasm(
  await readFile(
    "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
  ),
);
const output = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-presentatie-rijke-notities",
);
await mkdir(output, { recursive: true });
const h = openPresentation(await readFile("public/templates/nieuw.pptx"));
let slides = h.snapshot().slides;
h.setSlideNotes(slides[0].id, "Original notes\nSecond paragraph");
h.duplicateSlide(slides[0].id, 1);
h.setSlideNotes(h.snapshot().slides[1].id, "Other slide");
const raw = unzipSync(h.save());
h.dispose();
const notePath = Object.keys(raw).find((p) =>
  /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p),
);
raw[notePath] = strToU8(
  strFromU8(raw[notePath])
    .replace(
      "<a:r>",
      '<a:r><a:rPr b="1" i="1" sz="1800"><a:solidFill><a:srgbClr val="AA1122"/></a:solidFill><a:extLst><a:ext uri="keep"><x:data xmlns:x="urn:notes-test" value="retained"/></a:ext></a:extLst></a:rPr>',
    )
    .replace(
      "</p:spTree>",
      '<p:sp><p:nvSpPr><p:cNvPr id="99" name="Footer"/><p:cNvSpPr/><p:nvPr><p:ph type="ftr"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Keep footer</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>',
    ),
);
const fixture = Buffer.from(zipSync(raw)),
  report = { cases: [], errors: [] };
const server = await preview({
    configFile: false,
    build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
    preview: { host: "127.0.0.1", port: 0, open: false },
  }),
  url = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch(),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
async function setup(p, bytes, name) {
  p.on("pageerror", (e) => report.errors.push(String(e)));
  await p.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({
        taal: "en",
        thema: "forge",
        spelling: { controleren: false },
      }),
    ),
  );
  await p.goto(url);
  await p.locator(".office input[type=file]").first().setInputFiles({
    name,
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: bytes,
  });
  await p.evaluate(() => {
    window.proefApi = () => {
      const el = document.querySelector(
        ".office-tabpaneel:not([hidden]) .office-presentatie",
      );
      if (!el) return null;
      for (
        let f = el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      )
        if (f.memoizedProps?.value?.presentatie)
          return f.memoizedProps.value.presentatie;
      return null;
    };
  });
  await p.getByTestId("rich-notes-editor").waitFor();
}
const pane = page.getByTestId("rich-notes-pane"),
  editor = page.getByTestId("rich-notes-editor");
async function select(start, end = start, p = page) {
  await p.getByTestId("rich-notes-editor").evaluate(
    (el, { start, end }) => {
      el.focus();
      const paras = [...el.children];
      function find(n) {
        for (const para of paras) {
          const len = para.textContent.length;
          if (n <= len) {
            const w = document.createTreeWalker(para, NodeFilter.SHOW_TEXT);
            let t;
            while ((t = w.nextNode())) {
              if (n <= t.length) return [t, n];
              n -= t.length;
            }
            return [para, 0];
          }
          n -= len + 1;
        }
        return [el, el.childNodes.length];
      }
      const [a, ao] = find(start),
        [b, bo] = find(end),
        r = document.createRange();
      r.setStart(a, ao);
      r.setEnd(b, bo);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      document.dispatchEvent(new Event("selectionchange"));
    },
    { start, end },
  );
}
async function run(name, fn) {
  await fn();
  report.cases.push(name);
  console.log(`OK: ${name}`);
}
async function save(p = page) {
  const pending = p.waitForEvent("download");
  await p.keyboard.press("Control+s");
  const d = p.getByRole("dialog", { name: "Save as", exact: true });
  if (await d.isVisible().catch(() => false))
    await d.getByRole("button", { name: "Save", exact: true }).click();
  else {
    await Promise.race([
      d
        .waitFor({ timeout: 3000 })
        .then(() =>
          d.getByRole("button", { name: "Save", exact: true }).click(),
        ),
      pending,
    ]);
  }
  const download = await pending;
  const path = resolve(output, "rich-notes-saved.pptx");
  await download.saveAs(path);
  return readFile(path);
}
try {
  await setup(page, fixture, "Rich notes.pptx");
  await run(
    "Existing rich notes render below the slide; original metadata and footer survive",
    async () => {
      assert.equal(
        await editor.locator("p").first().textContent(),
        "Original notes",
      );
      const style = await editor
        .locator("p span")
        .first()
        .evaluate((e) => ({
          weight: getComputedStyle(e).fontWeight,
          color: getComputedStyle(e).color,
          size: getComputedStyle(e).fontSize,
        }));
      assert.equal(style.weight, "700");
      assert.equal(style.color, "rgb(170, 17, 34)");
      assert.equal(style.size, "24px");
      const box = await editor.boundingBox(),
        canvas = await page
          .locator('canvas[data-testid="pptx-slide-canvas"]')
          .first()
          .boundingBox();
      assert.ok(box && canvas && box.y > canvas.y + canvas.height - 1);
      await page.screenshot({ path: resolve(output, "rich-notes-editor.png") });
    },
  );
  await run(
    "Unicode typing, paragraphs and notes undo/redo use the real keyboard",
    async () => {
      await select(14);
      await page.keyboard.insertText(" 🧱");
      await page.keyboard.press("Enter");
      await page.keyboard.insertText("New paragraph");
      assert.equal(
        await editor.locator("p").nth(1).textContent(),
        "New paragraph",
      );
      await page.keyboard.press("Control+z");
      assert.equal(await editor.locator("p").nth(1).textContent(), "");
      await page.keyboard.press("Control+y");
      assert.equal(
        await editor.locator("p").nth(1).textContent(),
        "New paragraph",
      );
    },
  );
  await run(
    "Toolbar formats selected runs and paragraphs without changing text",
    async () => {
      await select(18, 31);
      await pane
        .getByRole("button", { name: "Underline", exact: true })
        .click();
      await pane.getByLabel("Size", { exact: true }).selectOption("24");
      await pane.getByRole("button", { name: "Bullets", exact: true }).click();
      await pane.getByRole("button", { name: "Centre", exact: true }).click();
      const p = editor.locator("p").nth(1);
      assert.equal(await p.getAttribute("data-list"), "bullet");
      assert.equal(await p.evaluate((e) => e.style.textAlign), "center");
      assert.equal(
        await p
          .locator("span")
          .first()
          .evaluate((e) => e.style.textDecoration),
        "underline",
      );
    },
  );
  await run(
    "Rich HTML paste keeps supported formatting and drops executable content",
    async () => {
      await select(31);
      await editor.evaluate((el) => {
        const d = new DataTransfer();
        d.setData(
          "text/html",
          '<p><b> Pasted</b><i style="color:#0055aa;font-size:16pt"> safe</i><script>window.notesAttack=true</script><img src="x" onerror="window.notesAttack=true"></p>',
        );
        el.dispatchEvent(
          new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: d,
          }),
        );
      });
      assert.ok((await editor.textContent()).includes(" Pasted safe"));
      assert.equal(await page.evaluate(() => !!window.notesAttack), false);
      assert.equal(await editor.locator("script,img").count(), 0);
    },
  );
  await run(
    "Switching slides retains independent drafts; Save exports the last focused draft",
    async () => {
      const buttons = page.locator(".office-presentatie aside > button");
      await buttons.nth(1).click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="rich-notes-editor"]')
            .textContent === "Other slide",
      );
      await select(11);
      await page.keyboard.insertText(" draft two");
      await buttons.first().click();
      await page.waitForFunction(() =>
        document
          .querySelector('[data-testid="rich-notes-editor"]')
          .textContent.includes("Pasted safe"),
      );
      await select(0);
      await page.keyboard.insertText("Last ");
      const saved = await save(),
        parts = unzipSync(saved),
        xml = strFromU8(parts[notePath]);
      assert.ok(xml.includes("Last "));
      assert.ok(xml.includes("urn:notes-test"));
      assert.ok(xml.includes("Keep footer"));
      assert.ok(xml.includes('u="sng"'));
      const native = openPresentation(saved);
      assert.ok(native.snapshot().slides[0].notes.includes("Last "));
      assert.ok(native.snapshot().slides[1].notes.includes("draft two"));
      native.dispose();
      const fresh = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
        }),
        reopened = await fresh.newPage();
      await setup(reopened, saved, "Saved notes.pptx");
      assert.ok(
        (
          await reopened.getByTestId("rich-notes-editor").textContent()
        ).startsWith("Last "),
      );
      assert.ok(
        await reopened
          .getByTestId("rich-notes-editor")
          .locator("span")
          .evaluateAll((es) =>
            es.some((e) => e.style.textDecoration === "underline"),
          ),
      );
      await fresh.close();
    },
  );
  await run(
    "Presenter view displays pending formatted notes and retains navigation",
    async () => {
      await page.keyboard.press("Alt+F5");
      await page.locator(".presentator-notitietekst").waitFor();
      assert.ok(
        (
          await page.locator(".presentator-notitietekst").textContent()
        ).includes("Pasted safe"),
      );
      assert.ok(
        await page
          .locator(".presentator-notitietekst span")
          .evaluateAll((es) =>
            es.some((e) => e.style.textDecoration === "underline"),
          ),
      );
      await page.screenshot({
        path: resolve(output, "rich-notes-presenter.png"),
      });
      await page.locator(".presentator-notitietekst").focus();
      await page.keyboard.press("PageDown");
      await page.waitForFunction(() =>
        document
          .querySelector(".presentator-notitietekst")
          .textContent.includes("draft two"),
      );
      await page.keyboard.press("PageUp");
      await page.waitForFunction(() =>
        document
          .querySelector(".presentator-notitietekst")
          .textContent.includes("Pasted safe"),
      );
      await page.keyboard.press("Escape");
    },
  );
  await run(
    "Apply reloads the native document while retaining rich notes",
    async () => {
      await page.evaluate(() => (window.previousNotesApi = proefApi()));
      await pane
        .getByRole("button", { name: "Apply notes", exact: true })
        .click();
      await page.waitForFunction(
        () => proefApi() && proefApi() !== window.previousNotesApi,
      );
      await editor.waitFor();
      assert.ok((await editor.textContent()).startsWith("Last "));
      assert.equal(
        await pane
          .getByRole("button", { name: "Apply notes", exact: true })
          .isDisabled(),
        true,
      );
    },
  );
  await run(
    "Notes visibility follows View controls and narrow layout stays within the window",
    async () => {
      await page.getByRole("tab", { name: "View", exact: true }).click();
      await page.getByRole("button", { name: "Notes", exact: true }).click();
      assert.equal(await pane.isVisible(), false);
      await page.getByRole("button", { name: "Notes", exact: true }).click();
      await pane.waitFor();
      const color = await pane
        .getByRole("button", { name: "Bold", exact: true })
        .evaluate((e) => getComputedStyle(e).color);
      assert.notEqual(color, "rgb(0, 0, 0)");
      await page.setViewportSize({ width: 640, height: 800 });
      const box = await pane.boundingBox();
      report.narrow = await pane.evaluate((el) => {
        const result = [];
        for (let e = el; e; e = e.parentElement) {
          const s = getComputedStyle(e);
          result.push({
            tag: e.tagName,
            cls: e.className,
            height: s.height,
            min: s.minHeight,
            flex: s.flex,
            box: e.getBoundingClientRect().toJSON(),
          });
        }
        return result;
      });
      assert.ok(
        box &&
          box.x >= 0 &&
          box.x + box.width <= 641 &&
          box.y + box.height <= 801,
      );
      await page.screenshot({ path: resolve(output, "rich-notes-narrow.png") });
      await page.setViewportSize({ width: 1440, height: 1000 });
    },
  );
  await run(
    "Duplicating a slide through the sorter includes its pending rich notes",
    async () => {
      await select(0);
      await page.keyboard.insertText("Duplicated draft ");
      await page.getByRole("tab", { name: "View", exact: true }).click();
      await page
        .getByRole("button", { name: "Slide Sorter", exact: true })
        .first()
        .click();
      await page.locator(".sorteerder").waitFor();
      assert.equal(await pane.isVisible(), false);
      await page.evaluate(() => (window.previousNotesApi = proefApi()));
      await page
        .locator(".sorteerder")
        .getByRole("button", { name: "Duplicate", exact: true })
        .click();
      await page.waitForFunction(
        () => proefApi() && proefApi() !== window.previousNotesApi,
      );
      assert.equal(
        await page.evaluate(() => proefApi().handle.snapshot().slides.length),
        3,
      );
      await page
        .getByRole("button", { name: "Normal", exact: true })
        .first()
        .click();
      await editor.waitFor();
      await page.waitForFunction(() =>
        document
          .querySelector('[data-testid="rich-notes-editor"]')
          .textContent.startsWith("Duplicated draft "),
      );
      assert.ok(
        await editor
          .locator("span")
          .evaluateAll((es) =>
            es.some((e) => e.style.textDecoration === "underline"),
          ),
      );
    },
  );
  await run(
    "A concurrent native notes change refuses Apply and retains the draft until discard",
    async () => {
      await select(0);
      await page.keyboard.insertText("Conflict draft ");
      await page.evaluate(() => {
        const api = proefApi();
        const root = document.querySelector(".office-presentatie"),
          buttons = [...root.querySelectorAll("aside > button")],
          i = buttons.findIndex(
            (b) => b.getAttribute("aria-current") === "page",
          );
        api.handle.setSlideNotes(
          api.handle.snapshot().slides[Math.max(0, i)].id,
          "Native concurrent notes",
        );
      });
      await pane
        .getByRole("button", { name: "Apply notes", exact: true })
        .click();
      await pane
        .getByRole("alert")
        .filter({ hasText: "changed elsewhere" })
        .waitFor();
      assert.ok((await editor.textContent()).startsWith("Conflict draft "));
      await pane
        .getByRole("button", { name: "Discard draft", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="rich-notes-editor"]')
            .textContent === "Native concurrent notes",
      );
    },
  );
  assert.deepEqual(report.errors, []);
} catch (e) {
  report.failure = String(e.stack ?? e);
  await page
    .screenshot({ path: resolve(output, "failure.png") })
    .catch(() => {});
  throw e;
} finally {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
