/** Rendered Writer ribbon geometry: no editor bridge or native app control. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

const outDir = process.argv[2] ?? ".local/ribbon-build";
const label = process.argv[3] ?? "ribbon-height";
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const baseline = process.argv.includes("--baseline");
// Preparation only: an old build may exercise the harness, never certify source.
const smoke = process.argv.includes("--harness-smoke");
const collapsedFocusOnly = process.argv.includes("--collapsed-focus");
const route = process.env.OFFICE_TEST_BASE ?? "/";
const dir = `.local/${label}`;
fs.mkdirSync(dir, { recursive: true });
const parts = unzipSync(fs.readFileSync("public/templates/nieuw.docx"));
const xml = strFromU8(parts["word/document.xml"]);
const cell = (text) =>
  `<w:tc><w:tcPr><w:tcW w:w="2880" w:type="dxa"/><w:vAlign w:val="bottom"/></w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
const table = `<w:tbl><w:tblPr><w:tblW w:w="8640" w:type="dxa"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2880"/>'.repeat(3)}</w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${["Alpha", "Beta", "Gamma"].map(cell).join("")}</w:tr><w:tr><w:trPr><w:tblHeader/></w:trPr>${["One", "Two", "Three"].map(cell).join("")}</w:tr></w:tbl><w:p/>`;
parts["word/document.xml"] = strToU8(
  xml.replace(/(<w:body>)[\s\S]*?(<w:sectPr)/, `$1${table}$2`),
);
const fixture = Buffer.from(zipSync(parts));
const harnessPath = fileURLToPath(import.meta.url);
const harnessCommit =
  process.env.OFFICE_TEST_HARNESS_COMMIT ??
  execFileSync("git", ["-C", dirname(harnessPath), "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
assert.match(harnessCommit, /^[a-f0-9]{40}$/);
const harnessBytes = fs.readFileSync(harnessPath);
const harnessGitBlob = execFileSync("git", [
  "show",
  `${harnessCommit}:scripts/proef-writer-linthoogte.mjs`,
]);
assert.equal(
  harnessBytes.toString().replaceAll("\r\n", "\n"),
  harnessGitBlob.toString().replaceAll("\r\n", "\n"),
  "Executed harness must match its recorded commit",
);
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirty: execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim(),
  sourceFiles: Object.fromEntries(
    [
      "src/lint/tekst.tsx",
      "src/stijl/openaec-office.css",
      "scripts/proef-writer-linthoogte.mjs",
    ].map((p) => [
      p,
      createHash("sha256").update(fs.readFileSync(p)).digest("hex"),
    ]),
  ),
  sourceTree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
    encoding: "utf8",
  }).trim(),
  harness: {
    commit: harnessCommit,
    path: harnessPath,
    sha256: createHash("sha256").update(harnessBytes).digest("hex"),
    gitBlobSha256: createHash("sha256").update(harnessGitBlob).digest("hex"),
  },
  baseline,
  acceptance: false,
  smoke,
  collapsedFocusOnly,
  status: "running",
  startedAt: new Date().toISOString(),
  route,
  platform: process.platform,
  browser: null,
  cases: [],
  groupButtonCases: [],
  errors: [],
  limits: [
    "Rendered browser geometry, not native Windows/Linux/macOS UI acceptance",
    "DOM-disabled styling checks do not prove engine-disabled command behavior",
    "#362 acceptance checks vertical clipping. Horizontal group-trigger clipping is recorded separately; the existing narrow horizontal scroll route is outside this issue's scope.",
  ],
};
let server, browser;
const deadline = setTimeout(() => {
  report.errors.push("Whole probe exceeded its 240s deadline");
  void browser?.close().catch((error) => report.errors.push(String(error)));
  void server?.close().catch((error) => report.errors.push(String(error)));
}, 240_000);
try {
  if (!smoke) {
    assert.ok(
      process.env.OFFICE_TEST_BUILD_RECEIPT,
      "A pinned build receipt is required",
    );
    // The app source/build remain in cwd when this committed probe is external.
    const { verifyBuildReceipt } = await import(
      pathToFileURL(resolve("scripts/writer-proefbuild.mjs")).href
    );
    report.buildReceipt = await verifyBuildReceipt({
      outDir,
      route,
      receiptPath: process.env.OFFICE_TEST_BUILD_RECEIPT,
    });
  }
  server = await preview({
    configFile: false,
    base: route,
    build: { outDir },
    preview: { host: "127.0.0.1", port: 0 },
  });
  report.serverUrl = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true, timeout: 30_000 });
  report.browser = browser.version();
  for (const theme of smoke && !collapsedFocusOnly
    ? ["light"]
    : ["light", "forge"]) {
    for (const width of collapsedFocusOnly
      ? [923]
      : smoke
        ? [1600, 800]
        : [1600, 1280, 923, 800]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
      });
      await context.addInitScript(
        (theme) =>
          localStorage.setItem(
            "openaec-office-instellingen",
            JSON.stringify({
              taal: "en",
              thema: theme,
              spelling: { controleren: false, autocorrectie: false },
            }),
          ),
        theme,
      );
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      page.setDefaultNavigationTimeout(30_000);
      page.on("pageerror", (e) => report.errors.push(e.message));
      await page.goto(server.resolvedUrls.local[0]);
      await page.locator("input[type=file]").first().setInputFiles({
        name: "ribbon-table.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: fixture,
      });
      await page.locator(".canvas-page canvas").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page
        .locator(".canvas-page canvas")
        .first()
        .click({ position: { x: 150, y: 110 } });
      await page.keyboard.press("Control+Home");
      await page
        .getByRole("tab", { name: "Table Design", exact: true })
        .waitFor();
      for (const tab of ["Insert", "Table Design"]) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        const groups =
          tab === "Insert" ? ["Text"] : ["Alignment", "Data", "Delete"];
        const tabButton = page.getByRole("tab", { name: tab, exact: true });
        // Enter at the selected tab, then use real toolbar arrow navigation.
        async function walkKeyboardTo(target, expectedNames = []) {
          const visited = new Set();
          for (let step = 0; step < 100; step++) {
            visited.add(
              await page.evaluate(() =>
                document.activeElement?.getAttribute("aria-label"),
              ),
            );
            if (
              (await target.evaluate((e) => document.activeElement === e)) &&
              expectedNames.every((name) => visited.has(name))
            )
              return [...visited].filter(Boolean);
            await page.keyboard.press("ArrowRight");
          }
          assert.fail("Ribbon command is not reachable with toolbar keys");
        }
        async function keyboardTo(target, expectedNames = [], end = false) {
          await tabButton.focus();
          await tabButton.press("ArrowDown");
          // Lint enters the toolbar on its next animation frame. Until then
          // ArrowRight still belongs to the tab row and switches tabs.
          await page.waitForFunction(() =>
            Boolean(document.activeElement?.closest(".ribbon-baan")),
          );
          if (end) await page.keyboard.press("End");
          return walkKeyboardTo(target, expectedNames);
        }
        for (const groupName of groups) {
          const group = page.getByRole("group", {
            name: groupName,
            exact: true,
          });
          await group.waitFor();
          const collapsed = (await group.getAttribute("data-niveau")) === "2";
          const groupButton = group.locator(":scope > .ribbon-groep-knop");
          async function measureGroupButton(phase) {
            const data = await groupButton.evaluate((button) => {
              const rect = button.getBoundingClientRect(),
                css = getComputedStyle(button);
              const focusVisible = button.matches(":focus-visible");
              const ring =
                focusVisible && css.outlineStyle !== "none"
                  ? Math.max(
                      0,
                      parseFloat(css.outlineWidth) +
                        parseFloat(css.outlineOffset),
                    )
                  : 0;
              const outline = {
                top: rect.top - ring,
                bottom: rect.bottom + ring,
                left: rect.left - ring,
                right: rect.right + ring,
              };
              const clippingAncestors = [];
              for (
                let parent = button.parentElement;
                parent;
                parent = parent.parentElement
              ) {
                const style = getComputedStyle(parent),
                  bounds = parent.getBoundingClientRect();
                const clipX = ["auto", "scroll", "hidden", "clip"].includes(
                    style.overflowX,
                  ),
                  clipY = ["auto", "scroll", "hidden", "clip"].includes(
                    style.overflowY,
                  );
                if (!clipX && !clipY) continue;
                const clip = {
                  top: bounds.top + parent.clientTop,
                  left: bounds.left + parent.clientLeft,
                };
                clip.bottom = clip.top + parent.clientHeight;
                clip.right = clip.left + parent.clientWidth;
                const clippedY =
                  clipY &&
                  (outline.top < clip.top - 0.5 ||
                    outline.bottom > clip.bottom + 0.5);
                const clippedX =
                  clipX &&
                  (outline.left < clip.left - 0.5 ||
                    outline.right > clip.right + 0.5);
                clippingAncestors.push({
                  className: parent.className,
                  clip,
                  clipX,
                  clipY,
                  clippedX,
                  clippedY,
                  clipped: clippedX || clippedY,
                });
              }
              return {
                focusVisible,
                focused: document.activeElement === button,
                ring,
                outline,
                clippingAncestors,
                clippedX: clippingAncestors.some((a) => a.clippedX),
                clippedY: clippingAncestors.some((a) => a.clippedY),
                clipped: clippingAncestors.some((a) => a.clipped),
              };
            });
            report.groupButtonCases.push({
              theme,
              width,
              tab,
              group: groupName,
              phase,
              navigation:
                groupName === "Delete"
                  ? "ArrowDown → End"
                  : "ArrowDown → ArrowRight",
              ...data,
            });
            assert.ok(
              data.focused && data.focusVisible,
              "Collapsed group must retain real keyboard focus",
            );
            assert.equal(
              data.ring,
              4,
              "Collapsed group retains its full focus outline and offset",
            );
            assert.ok(
              data.clippingAncestors.some((a) =>
                String(a.className).includes("ribbon-baan"),
              ),
              "Measure against the actual clipping track",
            );
            await page.locator(".ribbon-inhoud").screenshot({
              path: `${dir}/${theme}-${width}-${groupName}-${phase}.png`,
            });
            if (!baseline)
              assert.equal(
                data.clippedY,
                false,
                `${theme}/${width}/${groupName}: collapsed group focus vertically exceeds clipping ancestor`,
              );
          }
          if (collapsed) {
            await keyboardTo(groupButton, [], groupName === "Delete");
            await measureGroupButton("keyboard-group-focus");
            await groupButton.press("Enter");
          }
          async function measure(phase) {
            const data = await group.evaluate((g) => {
              const content = g.querySelector(":scope > .ribbon-groep-inhoud");
              const bounds = content.getBoundingClientRect();
              const horizontal = content.hasAttribute("data-open")
                ? bounds
                : g.getBoundingClientRect();
              const caption = g
                .querySelector(":scope > .ribbon-groep-naam")
                .getBoundingClientRect();
              const visible = (e) =>
                !!e?.getClientRects().length &&
                getComputedStyle(e).visibility !== "hidden";
              return {
                level: g.dataset.niveau ?? "0",
                content: {
                  top: bounds.top,
                  bottom: bounds.bottom,
                  height: bounds.height,
                  left: horizontal.left,
                  right: horizontal.right,
                },
                caption: { top: caption.top, bottom: caption.bottom },
                buttons: [...content.querySelectorAll("button.ribbon-actie")]
                  .filter(visible)
                  .map((b) => {
                    const r = b.getBoundingClientRect(),
                      css = getComputedStyle(b);
                    const label = b.querySelector("span"),
                      icon = b.querySelector("svg");
                    const insideButton = (e) => {
                      if (!visible(e)) return false;
                      const child = e.getBoundingClientRect();
                      return (
                        child.top >= r.top - 0.5 &&
                        child.bottom <= r.bottom + 0.5 &&
                        child.left >= r.left - 0.5 &&
                        child.right <= r.right + 0.5 &&
                        e.scrollWidth <= e.clientWidth + 1
                      );
                    };
                    const focusVisible = b.matches(":focus-visible"),
                      ring =
                        focusVisible && css.outlineStyle !== "none"
                          ? Math.max(
                              0,
                              parseFloat(css.outlineWidth) +
                                parseFloat(css.outlineOffset),
                            )
                          : 0;
                    return {
                      name: b.getAttribute("aria-label"),
                      top: r.top,
                      bottom: r.bottom,
                      height: r.height,
                      left: r.left,
                      right: r.right,
                      disabled: b.disabled,
                      active: b.getAttribute("aria-pressed") === "true",
                      focusVisible,
                      hovered: b.matches(":hover"),
                      borderColor: css.borderColor,
                      borderWidth: css.borderWidth,
                      focusOutside: ring,
                      labelVisible: visible(label),
                      labelFits: insideButton(label),
                      iconFits: insideButton(icon),
                      clipped:
                        r.top - ring < bounds.top - 0.5 ||
                        r.bottom + ring > bounds.bottom + 0.5 ||
                        r.left - ring < horizontal.left - 0.5 ||
                        r.right + ring > horizontal.right + 0.5,
                    };
                  }),
              };
            });
            report.cases.push({
              theme,
              width,
              tab,
              group: groupName,
              phase,
              ...data,
            });
            if (!baseline)
              assert.deepEqual(
                data.buttons.filter((b) => b.clipped),
                [],
                `${theme}/${width}/${groupName}: controls exceed group content`,
              );
            assert.ok(
              data.buttons.length,
              `${groupName}: all commands must remain reachable`,
            );
            if (!baseline)
              assert.ok(
                data.buttons.every((b) => b.iconFits),
                `${groupName}: icons fit inside their controls`,
              );
            if (!collapsed && !baseline)
              assert.ok(
                data.content.bottom <= data.caption.top + 0.5,
                `${groupName}: keep caption outside control region`,
              );
            if (!baseline && groupName === "Delete")
              for (const name of ["Delete Row", "Delete Column"])
                for (const key of ["labelVisible", "labelFits", "iconFits"])
                  assert.equal(
                    data.buttons.find((b) => b.name === name)?.[key],
                    true,
                    `${name}: ${key} must remain true without a tooltip`,
                  );
            return data;
          }
          const normal = await measure("normal");
          const commands = {
            Text: [
              "Special Character",
              "Date",
              "Time",
              "Date & Time",
              "Insert field…",
              "Update fields",
            ],
            Alignment: [
              "Top",
              "Center",
              "Bottom",
              "Cell Margins",
              "Text Direction",
            ],
            Data: [
              "Formula",
              "Sort",
              "Repeat Header Rows",
              "Convert to Text",
              "Split Table",
            ],
            Delete: ["Delete Row", "Delete Column", "Delete Table"],
          }[groupName];
          assert.deepEqual(
            normal.buttons.map((b) => b.name).sort(),
            [...commands].sort(),
            `${groupName}: keep every command reachable`,
          );
          const focusName = {
            Text: "Update fields",
            Alignment: "Bottom",
            Data: "Repeat Header Rows",
            Delete: "Delete Row",
          }[groupName];
          const target = group.getByRole("button", {
            name: focusName,
            exact: true,
          });
          await target.hover();
          const hovered = await measure("hover");
          assert.equal(
            hovered.buttons.find((b) => b.name === focusName)?.hovered,
            true,
          );
          await page.mouse.move(0, 0);
          if (groupName === "Alignment" || groupName === "Data") {
            // The real DOCX fixture imports bottom alignment and repeated
            // header rows. Measure their actual active state without changing
            // the selection through unrelated table editing commands.
            await target
              .locator('xpath=self::*[@aria-pressed="true"]')
              .waitFor({ state: "attached" });
            const active = await measure("active");
            assert.equal(
              active.buttons.find((b) => b.name === focusName)?.active,
              true,
            );
          }
          const enabledCommands = normal.buttons
            .filter((b) => !b.disabled)
            .map((b) => b.name);
          const keyboardVisited = collapsed
            ? await walkKeyboardTo(target, enabledCommands)
            : await keyboardTo(target, enabledCommands);
          assert.equal(
            await target.evaluate((e) => document.activeElement === e),
            true,
          );
          const focused = await measure("keyboard-focus");
          report.cases.at(-1).keyboardVisited = keyboardVisited;
          assert.equal(
            focused.buttons.find((b) => b.name === focusName)?.focusVisible,
            true,
          );
          assert.equal(
            focused.buttons.find((b) => b.name === focusName)?.focusOutside,
            4,
          );
          await (
            collapsed ? group.locator(":scope > .ribbon-groep-inhoud") : group
          ).screenshot({
            path: `${dir}/${theme}-${width}-${groupName}.png`,
          });
          if (groupName === "Delete") {
            // Explicitly limited CSS state coverage: the imported table's real
            // commands are enabled. Never represent this as engine acceptance.
            const controls = group.locator("button.ribbon-actie");
            const disabledBefore = await controls.evaluateAll((buttons) => {
              const states = buttons.map((b) => b.disabled);
              buttons.forEach((b) => {
                b.blur();
                b.disabled = true;
              });
              return states;
            });
            try {
              const disabled = await measure("dom-disabled-styling");
              report.cases.at(-1).syntheticState = true;
              assert.ok(disabled.buttons.every((b) => b.disabled));
              await (
                collapsed
                  ? group.locator(":scope > .ribbon-groep-inhoud")
                  : group
              ).screenshot({
                path: `${dir}/${theme}-${width}-${groupName}-disabled-styling.png`,
              });
            } finally {
              await controls.evaluateAll((buttons, states) => {
                buttons.forEach((b, i) => {
                  b.disabled = states[i];
                });
              }, disabledBefore);
              // Restore the pre-check keyboard position before testing Escape.
              await target.focus();
            }
          }
          if (collapsed) {
            await page.keyboard.press("Escape");
            assert.equal(
              await groupButton.evaluate((b) => document.activeElement === b),
              true,
              "Escape returns focus to the collapsed group button",
            );
            await measureGroupButton("keyboard-group-after-escape");
          }
        }
      }
      await context.close();
    }
  }
  assert.deepEqual(report.errors, []);
  report.status = "passed";
  report.acceptance = !smoke && !baseline;
} catch (error) {
  report.status = "failed";
  report.failure = String(error.stack ?? error);
  throw error;
} finally {
  clearTimeout(deadline);
  const cleanup = await Promise.allSettled([browser?.close(), server?.close()]);
  report.cleanup = cleanup.map((r) => ({
    status: r.status,
    error: r.status === "rejected" ? String(r.reason) : undefined,
  }));
  report.completedAt = new Date().toISOString();
  fs.writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2));
}
console.log(
  JSON.stringify({
    source: report.source,
    acceptance: report.acceptance,
    cases: report.cases.length,
    groupButtonCases: report.groupButtonCases.length,
    verticallyClippedGroupButtons: report.groupButtonCases.filter(
      (c) => c.clippedY,
    ).length,
    horizontallyClippedGroupButtons: report.groupButtonCases.filter(
      (c) => c.clippedX,
    ).length,
    clippedGroupButtons: report.groupButtonCases.filter((c) => c.clipped)
      .length,
    clipped: report.cases.reduce(
      (n, c) => n + c.buttons.filter((b) => b.clipped).length,
      0,
    ),
    errors: report.errors,
    report: `${dir}/report.json`,
  }),
);
