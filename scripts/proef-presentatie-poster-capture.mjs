/** Echte mediadialoog: koppel asynchrone postercaptures aan de juiste selectie. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { createServer as createModuleServer } from "vite";

const root = path.resolve(process.argv[2] ?? "dist"),
  source = path.resolve(
    process.argv[3] ?? ".local/presentatie-odf-volume/source-odp.pptx",
  ),
  out = path.resolve(".local/presentatie-poster-capture");
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
let loader;
const report = {
  codepoint: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  worktreeDirty: !!execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim(),
  platform: process.platform,
  cases: [],
  saveReopen: false,
  errors: [],
  pass: false,
};
try {
  loader = await createModuleServer({
    configFile: false,
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  const { leesMedia } = await loader.ssrLoadModule("/src/presentatie/media.ts"),
    media = leesMedia(new Uint8Array(fs.readFileSync(source)), 0),
    audio = media.find((m) => m.soort === "audio"),
    video = media.find((m) => m.soort === "video");
  assert(audio && video);
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({
    locale: "nl-NL",
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    window.__posterProbe = { original, queue: [], armed: false };
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      const state = window.__posterProbe;
      if (state.armed) {
        state.armed = false;
        state.queue.push({ canvas: this, callback, args });
        return;
      }
      return original.call(this, callback, ...args);
    };
  });
  const input = page.locator(
      'input[type="file"][accept*=".docx"][accept*=".pptx"]',
    ),
    dialog = page.getByRole("dialog", { name: "Video en audio", exact: true });
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
  async function choose(kind) {
    await dialog
      .getByRole("combobox", { name: "Media op deze dia", exact: true })
      .selectOption(String(kind === "video" ? video.id : audio.id));
    if (kind === "video")
      await page.waitForFunction(() => {
        const e = document.querySelector(".media-dialoog video");
        return e && e.readyState >= 2 && e.videoWidth > 0;
      });
  }
  async function open() {
    await page.getByRole("tab", { name: "Invoegen", exact: true }).click();
    await page
      .getByRole("button", { name: "Video en audio", exact: true })
      .click();
    await dialog.waitFor();
    await choose("video");
    await dialog
      .getByRole("button", {
        name: "Huidig videobeeld als poster",
        exact: true,
      })
      .evaluate((button) => {
        button.addEventListener(
          "click",
          () => {
            window.__posterProbe.armed = true;
          },
          { capture: true },
        );
      });
  }
  async function close() {
    await dialog
      .getByRole("button", { name: "Annuleren", exact: true })
      .click();
    await dialog.waitFor({ state: "detached" });
  }
  async function capture(time) {
    await dialog.locator("video").evaluate((e, time) => {
      e.currentTime = time;
    }, time);
    await page.waitForFunction((time) => {
      const e = document.querySelector(".media-dialoog video");
      return (
        e &&
        !e.seeking &&
        e.readyState >= 2 &&
        Math.abs(e.currentTime - time) < 0.05
      );
    }, time);
    const index = await page.evaluate(() => window.__posterProbe.queue.length);
    await dialog
      .getByRole("button", {
        name: "Huidig videobeeld als poster",
        exact: true,
      })
      .click();
    assert.equal(
      await page.evaluate(() => window.__posterProbe.queue.length),
      index + 1,
    );
    return index;
  }
  async function release(index, fail = false) {
    const hash = await page.evaluate(
      async ({ index, fail }) => {
        const state = window.__posterProbe,
          job = state.queue[index];
        if (fail) {
          job.callback(null);
          return null;
        }
        return new Promise((resolve) => {
          state.original.call(
            job.canvas,
            async (blob) => {
              const digest = await crypto.subtle.digest(
                "SHA-256",
                await blob.arrayBuffer(),
              );
              const hash = [...new Uint8Array(digest)]
                .map((x) => x.toString(16).padStart(2, "0"))
                .join("");
              job.callback(blob);
              resolve(hash);
            },
            ...job.args,
          );
        });
      },
      { index, fail },
    );
    await page.waitForTimeout(100);
    return hash;
  }
  await load(source);
  for (const fail of [false, true]) {
    await open();
    const index = await capture(0.4);
    await choose("audio");
    await release(index, fail);
    const c = {
      name: fail
        ? "stale failure after selection change"
        : "stale success after selection change",
      posterReady: await dialog
        .getByText("Poster gereed", { exact: true })
        .count(),
      alerts: await dialog.getByRole("alert").count(),
      pass: false,
    };
    report.cases.push(c);
    assert.equal(
      c.posterReady,
      0,
      "a stale capture must not supply a poster to another medium",
    );
    assert.equal(
      c.alerts,
      0,
      "a stale failure must not contaminate the new selection",
    );
    c.pass = true;
    await close();
  }
  await open();
  const failed = await capture(0.4);
  await release(failed, true);
  await dialog.getByRole("alert").waitFor();
  assert.equal(
    await dialog.getByRole("alert").innerText(),
    "Het videobeeld kon niet worden vastgelegd.",
  );
  report.cases.push({
    name: "current capture failure remains visible",
    pass: true,
  });
  await close();
  await open();
  const older = await capture(0.25),
    newer = await capture(1.1),
    newerHash = await release(newer),
    olderHash = await release(older);
  assert.notEqual(olderHash, newerHash, "fixture frames must differ");
  await dialog.getByText("Poster gereed", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(out, "latest.png") });
  await dialog.getByRole("button", { name: "Toepassen", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  await open();
  const liveHash = await dialog.locator("video").evaluate(async (e) => {
    const blob = await (await fetch(e.poster)).arrayBuffer();
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", blob))]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  });
  assert.equal(
    liveHash,
    newerHash,
    "the latest requested frame must win, regardless of encoding completion order",
  );
  await close();
  await page.keyboard.press("Control+s");
  const save = page.getByRole("dialog", { name: "Opslaan als", exact: true });
  await save.waitFor();
  const download = page.waitForEvent("download"),
    saved = path.join(out, "saved-poster.pptx");
  await save.getByRole("button", { name: "Opslaan", exact: true }).click();
  await (await download).saveAs(saved);
  await save.waitFor({ state: "detached" });
  const after = leesMedia(new Uint8Array(fs.readFileSync(saved)), 0),
    hash = (b) => createHash("sha256").update(b).digest("hex");
  assert.equal(hash(after.find((m) => m.id === video.id).poster), newerHash);
  assert.equal(
    hash(after.find((m) => m.id === audio.id).poster),
    hash(audio.poster),
  );
  for (const before of media)
    assert.equal(
      hash(after.find((m) => m.id === before.id).bytes),
      hash(before.bytes),
    );
  await load(saved);
  await open();
  const reopenedHash = await dialog.locator("video").evaluate(async (e) => {
    const blob = await (await fetch(e.poster)).arrayBuffer();
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", blob))]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  });
  assert.equal(
    reopenedHash,
    newerHash,
    "the reopened player must use the saved winning poster",
  );
  await close();
  report.cases.push({
    name: "latest requested capture wins and survives real save/reopen",
    pass: true,
    posterSha256: newerHash,
  });
  report.saveReopen = true;
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
  await loader?.close();
  await new Promise((r) => server.close(r));
}
