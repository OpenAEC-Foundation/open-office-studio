/** Echte diavoorstelling: respecteer pauzeren na zwart/wit scherm. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { createServer as createModuleServer } from "vite";

const root = path.resolve(process.argv[2] ?? "dist"),
  source = path.resolve(
    process.argv[3] ?? ".local/presentatie-odf-volume/source-odp.pptx",
  ),
  out = path.resolve(".local/presentatie-media-pauze");
assert(
  fs.existsSync(path.join(root, "index.html")),
  "Build the production bundle before starting the browser probe",
);
fs.mkdirSync(out, { recursive: true });
const fonts = path.resolve("node_modules/@betteroffice/fonts/assets"),
  cjk = path.resolve("node_modules/@betteroffice/fonts-cjk/assets"),
  mime = {
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
  manualPause: [],
  resume: [],
  initialStarts: 0,
  reentryStarts: 0,
  completed: [],
  errors: [],
  pass: false,
};
try {
  const loader = await createModuleServer({
    configFile: false,
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  const fixtures = {};
  try {
    const { leesMedia, wijzigMedia } = await loader.ssrLoadModule(
        "/src/presentatie/media.ts",
      ),
      { schrijfOvergangen, GEEN_OVERGANG } = await loader.ssrLoadModule(
        "/src/presentatie/overgangen.ts",
      );
    for (const loop of [true, false]) {
      let bytes = new Uint8Array(fs.readFileSync(source));
      for (const m of leesMedia(bytes, 0))
        bytes = wijzigMedia(bytes, 0, m.id, {
          ...m,
          automatisch: true,
          herhalen: loop,
        });
      bytes = schrijfOvergangen(bytes, [0], {
        ...GEEN_OVERGANG,
        effect: "fade",
        duur: 800,
      });
      assert(
        leesMedia(bytes, 0).every((m) => m.automatisch && m.herhalen === loop),
      );
      fixtures[loop] = path.join(out, `auto-${loop ? "loop" : "once"}.pptx`);
      fs.writeFileSync(fixtures[loop], bytes);
    }
  } finally {
    await loader.close();
  }
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({
    locale: "nl-NL",
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  async function load(file) {
    await page
      .locator('input[type="file"][accept*=".docx"][accept*=".pptx"]')
      .setInputFiles(file);
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
  async function show() {
    await page
      .getByRole("tab", { name: "Diavoorstelling", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Vanaf eerste dia", exact: true })
      .click();
    await page
      .locator(".voorstelling .media-speler audio")
      .waitFor({ state: "attached" });
    await page
      .locator(".voorstelling .media-speler video")
      .waitFor({ state: "attached" });
  }
  function el(kind) {
    return page.locator(`.voorstelling .media-speler ${kind}`);
  }
  async function playing(kind) {
    await page.waitForFunction(
      (kind) => {
        const e = document.querySelector(`.voorstelling .media-speler ${kind}`);
        return (
          e &&
          !e.paused &&
          e.currentTime > 0.15 &&
          e.currentTime < e.duration - 0.2
        );
      },
      kind,
      { timeout: 10000 },
    );
  }
  async function blank(key) {
    await page.keyboard.press(key);
    await page
      .locator(`.voorstelling .diavlak-${key === "b" ? "zwart" : "wit"}`)
      .waitFor({ state: "visible" });
  }
  async function unblank(key) {
    await page.keyboard.press(key);
    await page
      .locator(`.voorstelling .diavlak-${key === "b" ? "zwart" : "wit"}`)
      .waitFor({ state: "detached" });
  }
  async function close() {
    await page.keyboard.press("Escape");
    await page.locator(".voorstelling").waitFor({ state: "detached" });
  }
  await load(fixtures.true);
  await show();
  for (const kind of ["audio", "video"]) {
    await playing(kind);
    report.initialStarts++;
    await el(kind).evaluate((e) => e.pause());
    for (const key of ["b", "w"]) {
      const c = {
        kind,
        key,
        pass: false,
        before: await el(kind).evaluate((e) => e.currentTime),
      };
      report.manualPause.push(c);
      await blank(key);
      assert(await el(kind).evaluate((e) => e.paused));
      await unblank(key);
      await page.waitForTimeout(300);
      c.after = await el(kind).evaluate((e) => ({
        time: e.currentTime,
        paused: e.paused,
      }));
      assert(
        c.after.paused && Math.abs(c.after.time - c.before) < 0.01,
        `${kind}/${key}: a manually paused autoplay clip must stay paused`,
      );
      c.pass = true;
    }
    await el(kind).evaluate((e) => e.play());
    for (const key of ["b", "w"]) {
      await playing(kind);
      await blank(key);
      assert(await el(kind).evaluate((e) => e.paused));
      await unblank(key);
      await playing(kind);
      report.resume.push({ kind, key, pass: true });
    }
  }
  await page.screenshot({ path: path.join(out, "show.png") });
  await close();
  await show();
  for (const kind of ["audio", "video"]) {
    await playing(kind);
    report.reentryStarts++;
  }
  await close();
  await load(fixtures.false);
  await show();
  for (const kind of ["audio", "video"]) await playing(kind);
  await page.waitForFunction(
    () => {
      const media = [
        ...document.querySelectorAll(
          ".voorstelling .media-speler audio,.voorstelling .media-speler video",
        ),
      ];
      return (
        media.length === 2 && media.every((e) => e.paused && e.currentTime > 1)
      );
    },
    undefined,
    { timeout: 10000 },
  );
  await blank("b");
  await unblank("b");
  await page.waitForTimeout(300);
  for (const kind of ["audio", "video"]) {
    const c = await el(kind).evaluate((e) => ({
      time: e.currentTime,
      paused: e.paused,
    }));
    assert(
      c.paused && c.time > 1,
      "a completed autoplay clip must not restart on unblank",
    );
    report.completed.push({ kind, pass: true });
  }
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
