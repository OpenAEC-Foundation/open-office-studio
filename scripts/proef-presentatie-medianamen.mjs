/** Echte browserroute: media kiezen, afspelen, bewaren en opnieuw openen. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

const root = path.resolve(process.argv[2] ?? "dist"),
  matrix = path.resolve(
    process.env.OOS_PRESENTATIE_ODF_UIT ?? ".local/presentatie-odf-volume",
  ),
  out = path.resolve(".local/presentatie-medianamen-browser");
fs.mkdirSync(out, { recursive: true });
const fonts = path.resolve("node_modules/@betteroffice/fonts/assets"),
  cjk = path.resolve("node_modules/@betteroffice/fonts-cjk/assets");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};
const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
  } catch {
    res.writeHead(400).end();
    return;
  }
  let base = root,
    relative = pathname === "/" ? "/index.html" : pathname;
  if (pathname.startsWith("/fonts/")) {
    base = fs.existsSync(path.join(fonts, path.basename(pathname)))
      ? fonts
      : cjk;
    relative = "/" + path.basename(pathname);
  }
  const file = path.resolve(base, "." + relative);
  if (
    !file.startsWith(base + path.sep) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  ) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    "Content-Type",
    mime[path.extname(file)] ?? "application/octet-stream",
  );
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser, page;
const report = {
  codepoint: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  worktreeDirty: !!execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim(),
  platform: process.platform,
  restoredNameChecks: 0,
  fallbackChecks: 0,
  playbacks: 0,
  saveReopen: false,
  pass: false,
  errors: [],
};
function blankNames(bytes) {
  const z = unzipSync(bytes);
  for (const file of Object.keys(z).filter((n) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(n),
  ))
    z[file] = strToU8(
      strFromU8(z[file]).replace(/<p:pic\b[\s\S]*?<\/p:pic>/g, (pic) =>
        /(?:audioFile|videoFile|:media)\b/.test(pic)
          ? pic.replace(/(<p:cNvPr\b[^>]*\bname=)(?:"[^"]*"|'[^']*')/, '$1""')
          : pic,
      ),
    );
  return zipSync(z);
}
function storedNames(bytes) {
  const z = unzipSync(bytes);
  return Object.keys(z)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .flatMap((file) =>
      [...strFromU8(z[file]).matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)]
        .filter((m) => /(?:audioFile|videoFile|:media)\b/.test(m[0]))
        .map((m) => m[0].match(/<p:cNvPr\b[^>]*\bname="([^"]*)"/)?.[1]),
    );
}
try {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({
    locale: "nl-NL",
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const input = page.locator(
      'input[type="file"][accept*=".docx"][accept*=".pptx"]',
    ),
    dialog = page.getByRole("dialog", { name: "Video en audio", exact: true }),
    expected = JSON.parse(
      fs.readFileSync(path.join(matrix, "expected.json"), "utf8"),
    );
  async function load(file) {
    await input.setInputFiles(file);
    await page.waitForFunction(
      (n) =>
        document
          .querySelector('.office-tabbalk [role="tab"][aria-selected="true"]')
          ?.textContent?.includes(n),
      path.basename(file),
      { timeout: 60000 },
    );
    await page
      .locator('[data-testid="pptx-slide-canvas"]:visible')
      .waitFor({ timeout: 60000 });
  }
  async function open(index) {
    await page
      .locator(".office-presentatie:visible aside > button")
      .nth(index)
      .click();
    await page.getByRole("tab", { name: "Invoegen", exact: true }).click();
    await page
      .getByRole("button", { name: "Video en audio", exact: true })
      .click();
    await dialog.waitFor();
  }
  async function close() {
    await dialog
      .getByRole("button", { name: "Annuleren", exact: true })
      .click();
    await dialog.waitFor({ state: "detached" });
  }
  async function save(file) {
    await page.keyboard.press("Control+s");
    const d = page.getByRole("dialog", { name: "Opslaan als", exact: true });
    await d.waitFor();
    const download = page.waitForEvent("download");
    await d.getByRole("button", { name: "Opslaan", exact: true }).click();
    await (await download).saveAs(file);
    await d.waitFor({ state: "detached" });
  }
  async function checkNames(index, fallback = false, play = false) {
    await open(index);
    const select = dialog.getByRole("combobox", {
        name: "Media op deze dia",
        exact: true,
      }),
      options = await select
        .locator("option")
        .evaluateAll((es) =>
          es.map((e) => ({ value: e.value, label: e.textContent.trim() })),
        );
    assert.equal(options.length, 2);
    assert.notEqual(options[0].label, options[1].label);
    for (const option of options) {
      await select.selectOption(option.value);
      const element = dialog.locator(".media-speler audio,.media-speler video");
      await element.waitFor();
      const kind = await element.evaluate((e) =>
          e.tagName === "AUDIO" ? "audio" : "video",
        ),
        label = fallback
          ? `${kind === "audio" ? "Audio" : "Video"} ${option.value}`
          : expected.names[kind];
      assert.equal(option.label, label);
      assert.equal(await dialog.locator("h3").innerText(), label);
      assert.equal(await element.getAttribute("aria-label"), label);
      if (fallback) report.fallbackChecks++;
      else report.restoredNameChecks++;
      if (play) {
        await element.evaluate((e) => e.play());
        await page.waitForFunction(() => {
          const m = document.querySelector(
            ".media-dialoog .media-speler audio,.media-dialoog .media-speler video",
          );
          return m && !m.paused && m.currentTime > 0.1;
        });
        await element.evaluate((e) => e.pause());
        report.playbacks++;
      }
    }
  }
  for (const ext of ["odp", "otp"]) {
    await load(path.join(matrix, `engine-${ext}.pptx`));
    for (let i = 0; i < 4; i++) {
      await checkNames(i, false, true);
      if (ext === "odp" && i === 0) {
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(out, "restored.png") });
      }
      await close();
    }
  }
  const saved = path.join(out, "named-saved.pptx");
  await save(saved);
  await load(saved);
  await checkNames(0);
  await close();
  report.saveReopen = true;
  const unnamed = path.join(out, "genuinely-unnamed.pptx");
  fs.writeFileSync(
    unnamed,
    blankNames(fs.readFileSync(path.join(matrix, "engine-odp.pptx"))),
  );
  assert(storedNames(fs.readFileSync(unnamed)).every((n) => n === ""));
  await load(unnamed);
  await checkNames(0, true, true);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, "fallback.png") });
  await close();
  const unnamedSaved = path.join(out, "unnamed-saved.pptx");
  await save(unnamedSaved);
  assert(
    storedNames(fs.readFileSync(unnamedSaved)).every((n) => n === ""),
    "display fallbacks must not be persisted as original names",
  );
  await load(unnamedSaved);
  await checkNames(0, true);
  await close();
  assert.deepEqual(report.errors, []);
  report.pass = true;
  console.log(JSON.stringify(report));
} catch (error) {
  report.error = String(error);
  if (page) await page.screenshot({ path: path.join(out, "error.png") });
  throw error;
} finally {
  fs.writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser?.close();
  await new Promise((r) => server.close(r));
}
