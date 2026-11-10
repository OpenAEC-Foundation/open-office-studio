import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { preview } from "vite";
import { createHash } from "node:crypto";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
const baseline = process.argv.includes("--baseline"),
  output = resolve(
    process.env.OFFICE_TEST_UIT ??
      `.local/writer-dark-${baseline ? "baseline" : "verified"}`,
  );
await mkdir(output, { recursive: true });
const parts = unzipSync(await readFile("public/templates/nieuw.docx"));
const xml = strFromU8(parts["word/document.xml"]);
const para = (text, pr = "") =>
  `<w:p><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="28"/>${pr}</w:rPr><w:t>${text}</w:t></w:r></w:p>`;
parts["word/document.xml"] = strToU8(
  xml.replace(
    "<w:p/>",
    para("Ordinary black text.") +
      para("Blue heading.", '<w:color w:val="2466AA"/><w:b/>') +
      para("Highlighted words.", '<w:highlight w:val="yellow"/>') +
      para("Last paragraph."),
  ),
);
const fixture = Buffer.from(zipSync(parts)),
  report = { baseline, cases: [], errors: [] };
const server = await preview({
    configFile: false,
    build: { outDir: process.env.OFFICE_TEST_DIST ?? ".local/dark-build" },
    preview: { host: "127.0.0.1", port: 0, open: false },
  }),
  url = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch(),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
page.setDefaultTimeout(30000);
async function open(p, initial = true) {
  p.on("pageerror", (e) => report.errors.push(String(e)));
  if (initial)
    await p.addInitScript(() => {
      if (!localStorage.getItem("openaec-office-instellingen"))
        localStorage.setItem(
          "openaec-office-instellingen",
          JSON.stringify({
            taal: "en",
            thema: "forge",
            spelling: { controleren: false },
          }),
        );
    });
  await p.goto(url + "?offscreenReplay=0");
  await p.locator(".office input[type=file]").first().setInputFiles({
    name: "Theme colours.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: fixture,
  });
  await p.evaluate(() => {
    window.proefApi = () => {
      const el = document.querySelector(
        ".office-tabpaneel:not([hidden]) .office-tekst",
      );
      if (!el) return null;
      for (
        let f = el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      ) {
        const value = f.memoizedProps?.value;
        if (value?.tekst && value?.herlaad) {
          return value.tekst();
        }
        for (let s = f.memoizedState, i = 0; s && i < 200; i++, s = s.next) {
          const v = s.memoizedState?.current;
          if (v?.getEditorRef && v.commands) return v;
        }
      }
      return null;
    };
    window.proefOpslag = () => {
      const el = document.querySelector(
        ".office-tabpaneel:not([hidden]) .office-tekst",
      );
      if (!el) return null;
      for (
        let f = el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      )
        if (f.memoizedProps?.value?.herlaad)
          return f.memoizedProps.value.herlaad;
      return null;
    };
  });
  await p.waitForFunction(
    () => proefApi()?.getEditorRef()?.getLayout()?.pages.length,
    null,
    { timeout: 60000 },
  );
  await p.locator(".office-tekst canvas").first().waitFor();
}
function luminance(rgb) {
  return rgb
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
  const alpha = a[3] ?? 1;
  const x = luminance(
      a.slice(0, 3).map((v, i) => v * alpha + b[i] * (1 - alpha)),
    ),
    y = luminance(b.slice(0, 3));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const parse = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
async function style(control) {
  return control.evaluate((el) => {
    const s = getComputedStyle(el),
      g = getComputedStyle(el.querySelector("svg")),
      sw = getComputedStyle(el.querySelector("i")),
      chain = [];
    for (let p = el; p; p = p.parentElement) chain.unshift(p);
    let bg = [255, 255, 255];
    for (const p of chain) {
      const c = (
          getComputedStyle(p).backgroundColor.match(/[\d.]+/g) ?? []
        ).map(Number),
        a = c[3] ?? 1;
      if (c.length >= 3) bg = bg.map((v, i) => c[i] * a + v * (1 - a));
    }
    return {
      glyph: g.color,
      background: `rgb(${bg.join(", ")})`,
      button: s.backgroundColor,
      swatch: sw.backgroundColor,
      border: s.borderColor,
      outline: s.outlineStyle,
    };
  });
}
async function saved() {
  return Buffer.from(
    await page.evaluate(async () => Array.from(await proefOpslag().bytes())),
  );
}
async function run(name, fn) {
  await fn();
  report.cases.push(name);
  console.log("OK:", name);
}
const editor = page.locator(".office-tabpaneel:not([hidden]) .office-tekst"),
  highlight = page.getByRole("button", {
    name: "Text Highlight Color",
    exact: true,
  });
try {
  await open(page);
  await page.evaluate(() => {
    proefApi().focus();
    proefApi().getEditorRef().setSelection(0, 8);
  });
  // The fixture's first run is black; select existing text before exercising colour commands.
  await page.waitForFunction(
    () => proefApi().commands.getState("highlightColor").enabled,
  );
  report.initialColorState = await page.evaluate(() => ({
    highlight: proefApi().commands.getState("highlightColor").value,
    text: proefApi().commands.getState("textColor").value,
  }));
  console.log("Colour states", JSON.stringify(report.initialColorState));
  report.normal = await style(highlight);
  await highlight.hover();
  report.hover = await style(highlight);
  report.hoverContrast = contrast(
    parse(report.hover.glyph),
    parse(report.hover.background),
  );
  report.page = await editor
    .locator(".canvas-page")
    .first()
    .evaluate((el) => ({
      filter: getComputedStyle(el).filter,
      background: getComputedStyle(el).backgroundColor,
      parent: getComputedStyle(
        el.closest(".docx-editor__scroll-container") ?? el.parentElement,
      ).backgroundColor,
    }));
  await page.screenshot({ path: resolve(output, "initial.png") });
  if (baseline) {
    assert.equal(report.page.filter, "none");
    assert.ok(report.hoverContrast < 3, JSON.stringify(report.hover));
    console.log(
      "CONFIRMED: light page and low-contrast highlighter hover",
      report.hoverContrast,
    );
    report.fontColor = await page.evaluate(async () => {
      await proefApi().commands.execute("textColor", {
        color: { rgb: "008844" },
      });
      return proefApi().commands.getState("textColor").value;
    });
    console.log("Font color state", JSON.stringify(report.fontColor));
  } else {
    await run(
      "Dark page follows Forge while raw pixels and the document remain unchanged",
      async () => {
        assert.ok(report.page.filter.includes("invert"));
        assert.ok(report.hoverContrast >= 4.5, JSON.stringify(report.hover));
        report.canvases = await editor
          .locator(".canvas-page canvas")
          .evaluateAll((es) =>
            es.map((el) => ({
              html: el.outerHTML.slice(0, 350),
              width: el.width,
              height: el.height,
            })),
          );
        report.rawCanvas = await editor
          .locator(".canvas-page canvas")
          .first()
          .evaluate(async (el) => {
            const pixels = el
              .getContext("2d")
              .getImageData(0, 0, el.width, el.height).data;
            const hash = Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", pixels)),
            )
              .map((v) => v.toString(16).padStart(2, "0"))
              .join("");
            return hash;
          });
        const before = await saved();
        await page.getByRole("tab", { name: "View", exact: true }).click();
        await page
          .getByRole("button", { name: "Dark page", exact: true })
          .click();
        await page.waitForFunction(
          () =>
            !document.querySelector(
              ".office-tabpaneel:not([hidden]) .office-tekst-donker",
            ),
        );
        const after = await saved();
        assert.equal(
          strFromU8(unzipSync(before)["word/document.xml"]),
          strFromU8(unzipSync(after)["word/document.xml"]),
        );
        assert.equal(await page.locator(".office-tab.is-gewijzigd").count(), 0);
        assert.equal(
          await editor
            .locator(".canvas-page")
            .first()
            .evaluate((el) => getComputedStyle(el).filter),
          "none",
        );
        await page.screenshot({ path: resolve(output, "white-paper.png") });
        await page
          .getByRole("button", { name: "Dark page", exact: true })
          .click();
        await page.waitForFunction(
          () => !!document.querySelector(".office-tekst-donker"),
        );
        await page.screenshot({ path: resolve(output, "dark-page.png") });
      },
    );
    await run(
      "View-only changes preserve raw canvas pixels and remove the effect for printing",
      async () => {
        const raw = await editor
          .locator(".canvas-page canvas")
          .first()
          .evaluate(async (el) => {
            const pixels = el
              .getContext("2d")
              .getImageData(0, 0, el.width, el.height).data;
            return Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", pixels)),
            )
              .map((v) => v.toString(16).padStart(2, "0"))
              .join("");
          });
        assert.equal(raw, report.rawCanvas);
        await page.emulateMedia({ media: "print" });
        assert.equal(
          await editor
            .locator(".canvas-page")
            .first()
            .evaluate((el) => getComputedStyle(el).filter),
          "none",
        );
        await page.emulateMedia({ media: "screen" });
        assert.ok(
          (
            await editor
              .locator(".canvas-page")
              .first()
              .evaluate((el) => getComputedStyle(el).filter)
          ).includes("invert"),
        );
      },
    );
    await run(
      "Print-preview pixels and exported PDF content are identical in dark and paper views",
      async () => {
        async function pdf(label) {
          await page.keyboard.press("Control+p");
          const d = page.getByRole("dialog", { name: /^Print preview/ });
          await d.waitFor();
          const img = d.locator(".afdruk-pagina img");
          await img.waitFor();
          await img.evaluate((el) => el.decode());
          const imageHash = await img.evaluate(async (el) =>
            Array.from(
              new Uint8Array(
                await crypto.subtle.digest(
                  "SHA-256",
                  await (await fetch(el.src)).arrayBuffer(),
                ),
              ),
            )
              .map((v) => v.toString(16).padStart(2, "0"))
              .join(""),
          );
          const download = page.waitForEvent("download");
          await d
            .getByRole("button", { name: "Save as PDF", exact: true })
            .click();
          const file = await download,
            path = resolve(output, `theme-${label}.pdf`);
          await file.saveAs(path);
          await d
            .getByRole("button", { name: "Close", exact: true })
            .first()
            .click();
          // Compare all content except export timestamps and their derived file ID.
          const normalized = (await readFile(path))
            .toString("latin1")
            .replace(/\/(CreationDate|ModDate) \(D:\d+Z\)/g, "/$1 (same)")
            .replace(/<xmp:(CreateDate|ModifyDate)>[^<]+</g, "<xmp:$1>same<")
            .replace(/\/ID \[<[0-9a-f]+> <[0-9a-f]+>\]/gi, "/ID [same]");
          return {
            imageHash,
            content: createHash("sha256")
              .update(normalized, "latin1")
              .digest("hex"),
          };
        }
        const dark = await pdf("dark");
        await page
          .getByRole("button", { name: "Dark page", exact: true })
          .click();
        const paper = await pdf("paper");
        assert.equal(paper.imageHash, dark.imageHash);
        assert.equal(paper.content, dark.content);
        report.previewHash = dark.imageHash;
        await page
          .getByRole("button", { name: "Dark page", exact: true })
          .click();
      },
    );
    await run(
      "Light/dark application themes keep the explicit page preference",
      async () => {
        await page
          .getByRole("button", { name: "Light theme", exact: true })
          .click();
        await page.waitForFunction(
          () =>
            document.querySelector(".office").dataset.officeThema === "light",
        );
        assert.ok(
          await editor.evaluate((el) =>
            el.classList.contains("office-tekst-donker"),
          ),
        );
        await page
          .getByRole("button", { name: "Forge theme", exact: true })
          .click();
        await page.waitForFunction(
          () =>
            document.querySelector(".office").dataset.officeThema === "forge",
        );
      },
    );
    await run(
      "Existing text gets the selected highlight; the swatch updates and remains readable",
      async () => {
        await page.getByRole("tab", { name: "Home", exact: true }).click();
        await page.evaluate(() => {
          proefApi().focus();
          proefApi().getEditorRef().setSelection(0, 8);
        });
        await highlight.hover();
        await page.mouse.down();
        report.pressed = await style(highlight);
        assert.ok(
          contrast(
            parse(report.pressed.glyph),
            parse(report.pressed.background),
          ) >= 4.5,
        );
        await page.mouse.up();
        const d = page.getByRole("dialog", {
          name: "Text Highlight Color",
          exact: true,
        });
        await d.waitFor();
        report.open = await style(highlight);
        assert.ok(
          contrast(parse(report.open.glyph), parse(report.open.background)) >=
            4.5,
        );
        await d
          .getByRole("textbox", { name: "RGB", exact: true })
          .fill("#e01b24");
        await d.getByRole("button", { name: "Apply", exact: true }).click();
        await page.waitForFunction(
          () =>
            getComputedStyle(document.querySelector("button.ribbon-kleur i"))
              .backgroundColor === "rgb(224, 27, 36)",
        );
        const highlightedXml = strFromU8(
          unzipSync(await saved())["word/document.xml"],
        );
        await writeFile(
          resolve(output, "highlighted-document.xml"),
          highlightedXml,
        );
        assert.ok(highlightedXml.toLowerCase().includes("e01b24"));
        report.applied = await style(highlight);
        await highlight.hover();
        const h = await style(highlight);
        assert.ok(contrast(parse(h.glyph), parse(h.background)) >= 4.5);
        await highlight.focus();
        report.focus = await style(highlight);
        assert.notEqual(report.focus.outline, "none");
        await page.screenshot({ path: resolve(output, "highlight-dark.png") });
      },
    );
    await run(
      "Light theme keeps the highlight glyph readable without changing its chosen colour",
      async () => {
        const before = await saved();
        await page
          .getByRole("button", { name: "Light theme", exact: true })
          .click();
        await highlight.hover();
        report.lightHover = await style(highlight);
        assert.ok(
          contrast(
            parse(report.lightHover.glyph),
            parse(report.lightHover.background),
          ) >= 4.5,
        );
        const after = await saved();
        assert.equal(
          strFromU8(unzipSync(before)["word/document.xml"]),
          strFromU8(unzipSync(after)["word/document.xml"]),
        );
        assert.equal(report.lightHover.swatch, "rgb(224, 27, 36)");
        await page.mouse.move(0, 0);
        report.lightNormal = await style(highlight);
        await highlight.focus();
        report.lightFocus = await style(highlight);
        assert.notEqual(report.lightFocus.outline, "none");
        await highlight.hover();
        await page.mouse.down();
        report.lightPressed = await style(highlight);
        await page.mouse.up();
        const d = page.getByRole("dialog", {
          name: "Text Highlight Color",
          exact: true,
        });
        await d.waitFor();
        report.lightOpen = await style(highlight);
        for (const s of [
          report.lightNormal,
          report.lightFocus,
          report.lightPressed,
          report.lightOpen,
        ])
          assert.ok(contrast(parse(s.glyph), parse(s.background)) >= 4.5);
        await d.getByRole("button", { name: "Cancel", exact: true }).click();
      },
    );
    await run(
      "The adjacent font-colour swatch follows the chosen text colour while its glyph keeps contrast",
      async () => {
        await page.evaluate(() => {
          proefApi().focus();
          proefApi().getEditorRef().setSelection(1, 8);
        });
        const result = await page.evaluate(
          async () =>
            await proefApi().commands.execute("textColor", {
              color: { rgb: "008844" },
            }),
        );
        assert.equal(result.ok, true);
        report.fontColor = await page.evaluate(
          () => proefApi().commands.getState("textColor").value,
        );
        const fontColor = page
          .getByLabel("Font Color", { exact: true })
          .locator("..");
        await page.waitForFunction(
          () =>
            getComputedStyle(
              document
                .querySelector('input[aria-label="Font Color"]')
                .parentElement.querySelector("i"),
            ).backgroundColor === "rgb(0, 136, 68)",
        );
        await fontColor.hover();
        report.fontColourControl = await style(fontColor);
        assert.ok(
          contrast(
            parse(report.fontColourControl.glyph),
            parse(report.fontColourControl.background),
          ) >= 4.5,
        );
      },
    );
    await run(
      "Document view is discoverable in settings; Cancel restores the preview and Save persists it",
      async () => {
        await page.keyboard.press("Control+,");
        const d = page.getByRole("dialog", { name: "Settings", exact: true });
        await d.waitFor();
        await d.getByRole("tab", { name: "Appearance", exact: true }).click();
        await page.screenshot({ path: resolve(output, "view-settings.png") });
        const select = d.getByRole("button", {
          name: /^Writer document view:/,
        });
        await select.click();
        await page
          .getByRole("option", { name: "White paper", exact: true })
          .click();
        await page.waitForFunction(
          () => !document.querySelector(".office-tekst-donker"),
        );
        await d.getByRole("button", { name: "Cancel", exact: true }).click();
        await page.waitForFunction(
          () => !!document.querySelector(".office-tekst-donker"),
        );
        await page.keyboard.press("Control+,");
        await d.waitFor();
        await d.getByRole("tab", { name: "Appearance", exact: true }).click();
        await d.getByRole("button", { name: /^Writer document view:/ }).click();
        await page
          .getByRole("option", { name: "Follow the theme", exact: true })
          .click();
        await d.getByRole("button", { name: "Save", exact: true }).click();
        await page.waitForFunction(
          () => !document.querySelector(".office-tekst-donker"),
        );
        await page
          .getByRole("button", { name: "Forge theme", exact: true })
          .click();
        await page.waitForFunction(
          () => !!document.querySelector(".office-tekst-donker"),
        );
        await open(page, false);
        assert.ok(
          await editor.evaluate((el) =>
            el.classList.contains("office-tekst-donker"),
          ),
        );
        assert.equal(
          await page.evaluate(
            () =>
              JSON.parse(localStorage.getItem("openaec-office-instellingen"))
                .tekst.documentWeergave,
          ),
          "thema",
        );
      },
    );
    await run(
      "A dark page retains mouse hit-testing, typing and native Undo",
      async () => {
        const before = strFromU8(unzipSync(await saved())["word/document.xml"]);
        await editor
          .locator(".canvas-page canvas")
          .first()
          .click({ position: { x: 165, y: 110 } });
        await page.keyboard.insertText("Z");
        const after = strFromU8(unzipSync(await saved())["word/document.xml"]);
        assert.notEqual(after, before);
        assert.ok(after.includes("Z"));
        await page.keyboard.press("Control+z");
        assert.equal(
          strFromU8(unzipSync(await saved())["word/document.xml"]),
          before,
        );
      },
    );
    await run(
      "Following the system theme updates the page; forced-colours keeps a readable native palette",
      async () => {
        await page.keyboard.press("Control+,");
        const d = page.getByRole("dialog", { name: "Settings", exact: true });
        await d.waitFor();
        await d.getByRole("tab", { name: "Appearance", exact: true }).click();
        await d.getByRole("button", { name: /^Theme:/ }).click();
        await page
          .getByRole("option", { name: "Follow the system", exact: true })
          .click();
        await d.getByRole("button", { name: "Save", exact: true }).click();
        await page.emulateMedia({ colorScheme: "light" });
        await page.waitForFunction(
          () => !document.querySelector(".office-tekst-donker"),
        );
        await page.emulateMedia({ colorScheme: "dark" });
        await page.waitForFunction(
          () => !!document.querySelector(".office-tekst-donker"),
        );
        await page.emulateMedia({ forcedColors: "active" });
        assert.equal(
          await editor
            .locator(".canvas-page")
            .first()
            .evaluate((el) => getComputedStyle(el).filter),
          "none",
        );
        await page.getByRole("tab", { name: "Home", exact: true }).click();
        await highlight.hover();
        const h = await style(highlight);
        assert.ok(contrast(parse(h.glyph), parse(h.background)) >= 4.5);
        report.forcedColours = h;
        await page.emulateMedia({ forcedColors: "none" });
      },
    );
    assert.deepEqual(report.errors, []);
  }
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
