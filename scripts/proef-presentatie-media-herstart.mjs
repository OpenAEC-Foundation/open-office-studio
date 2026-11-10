/** Echte browserroute: opnieuw afspelen na het volledige of ingekorte einde. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(process.argv[2] ?? "dist"),
  source = path.resolve(
    process.argv[3] ?? ".local/presentatie-odf-volume/source-odp.pptx",
  ),
  out = path.resolve(".local/presentatie-media-herstart");
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
  cases: [],
  loops: [],
  errors: [],
  pass: false,
};
try {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({
    locale: "nl-NL",
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page
    .locator('input[type="file"][accept*=".docx"][accept*=".pptx"]')
    .setInputFiles(source);
  await page
    .locator('[data-testid="pptx-slide-canvas"]:visible')
    .waitFor({ timeout: 60000 });
  const dialog = page.getByRole("dialog", {
      name: "Video en audio",
      exact: true,
    }),
    selector =
      ".media-dialoog .media-speler audio,.media-dialoog .media-speler video";
  async function open(kind, trimmed) {
    await page.getByRole("tab", { name: "Invoegen", exact: true }).click();
    await page
      .getByRole("button", { name: "Video en audio", exact: true })
      .click();
    await dialog.waitFor();
    const select = dialog.getByRole("combobox", {
        name: "Media op deze dia",
        exact: true,
      }),
      values = await select
        .locator("option")
        .evaluateAll((es) => es.map((e) => e.value));
    let el;
    for (const value of values) {
      await select.selectOption(value);
      el = dialog.locator(`.media-speler ${kind}`);
      if (await el.count()) break;
    }
    await el.waitFor();
    await page.waitForFunction((s) => {
      const e = document.querySelector(s);
      return (
        e && e.readyState >= 1 && Number.isFinite(e.duration) && e.duration > 1
      );
    }, selector);
    await dialog
      .getByLabel("Begin bij (seconden)", { exact: true })
      .fill(trimmed ? "0.2" : "0");
    await dialog
      .getByLabel("Van einde afhalen (seconden)", { exact: true })
      .fill(trimmed ? "0.2" : "0");
    return el;
  }
  async function close() {
    await dialog
      .getByRole("button", { name: "Annuleren", exact: true })
      .click();
    await dialog.waitFor({ state: "detached" });
  }
  async function play(el) {
    return el.evaluate(async (e) => {
      try {
        await e.play();
        return { error: null, time: e.currentTime };
      } catch (error) {
        return { error: String(error), time: e.currentTime };
      }
    });
  }
  async function stopAtEnd() {
    await page.waitForFunction(
      (s) => {
        const e = document.querySelector(s);
        return e && e.paused && e.currentTime > 0.6;
      },
      selector,
      { timeout: 7000 },
    );
  }
  for (const kind of ["audio", "video"])
    for (const trimmed of [false, true]) {
      const c = { kind, trimmed, pass: false };
      report.cases.push(c);
      const el = await open(kind, trimmed),
        begin = trimmed ? 0.2 : 0;
      assert.equal((await play(el)).error, null);
      await stopAtEnd();
      c.firstStop = await el.evaluate((e) => ({
        time: e.currentTime,
        duration: e.duration,
      }));
      c.replayAttempt = await play(el);
      try {
        await page.waitForFunction(
          ({ selector, begin, stop }) => {
            const e = document.querySelector(selector);
            return (
              e &&
              !e.paused &&
              e.currentTime >= begin + 0.1 &&
              e.currentTime < stop - 0.1
            );
          },
          { selector, begin, stop: c.firstStop.time },
          { timeout: 5000 },
        );
      } finally {
        c.replay = await el.evaluate((e) => ({
          time: e.currentTime,
          paused: e.paused,
        }));
      }
      assert.equal(
        c.replayAttempt.error,
        null,
        `${kind}/${trimmed}: Play after end must succeed`,
      );
      assert(
        !c.replay.paused &&
          c.replay.time >= begin + 0.1 &&
          c.replay.time < c.firstStop.time - 0.1,
        `${kind}/${trimmed}: replay must advance from the configured beginning`,
      );
      await el.evaluate((e) => e.pause());
      const paused = await el.evaluate((e) => e.currentTime);
      await play(el);
      c.resume = await el.evaluate((e) => e.currentTime);
      assert(
        c.resume >= paused - 0.01,
        "a normal pause must resume without restarting",
      );
      await stopAtEnd();
      if (trimmed) {
        const stopped = await el.evaluate((e) => e.currentTime);
        await dialog
          .getByLabel("Van einde afhalen (seconden)", { exact: true })
          .fill("0");
        const continued = await play(el);
        assert.equal(continued.error, null);
        assert(
          continued.time >= stopped - 0.01,
          "extending the end must allow continuing from the old stop",
        );
        await el.evaluate((e) => e.pause());
      }
      await el.evaluate((e, position) => {
        e.currentTime = position;
      }, begin + 0.25);
      const seeked = await play(el);
      assert.equal(seeked.error, null);
      assert(
        seeked.time >= begin + 0.24,
        "seeking back after the end must not reset to the beginning",
      );
      await el.evaluate((e) => e.pause());
      c.pass = true;
      if (kind === "video" && trimmed)
        await page.screenshot({ path: path.join(out, "replay.png") });
      await close();
    }
  for (const kind of ["audio", "video"]) {
    const el = await open(kind, true);
    await dialog.getByLabel("Herhalen", { exact: true }).check();
    await el.evaluate((e) => {
      e.__replayProbe = { wraps: 0, last: e.currentTime };
      e.addEventListener("timeupdate", () => {
        const p = e.__replayProbe;
        if (e.currentTime < p.last - 0.2) p.wraps++;
        p.last = e.currentTime;
      });
    });
    assert.equal((await play(el)).error, null);
    await page.waitForFunction(
      (s) => {
        const e = document.querySelector(s);
        return e && !e.paused && e.__replayProbe?.wraps >= 2;
      },
      selector,
      { timeout: 10000 },
    );
    report.loops.push({
      kind,
      wraps: await el.evaluate((e) => e.__replayProbe.wraps),
      pass: true,
    });
    await el.evaluate((e) => e.pause());
    await close();
  }
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
