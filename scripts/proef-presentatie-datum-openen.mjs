/** Echte normale/hosted openingsroute met gecontroleerde klok; alleen Linux CI. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { createServer, preview } from "vite";

assert.equal(process.platform, "linux");
assert.equal(process.env.GITHUB_ACTIONS, "true");
const out = path.resolve(".local/presentation-87-date-open");
await fs.mkdir(out, { recursive: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const loader = await createServer({
  configFile: false,
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, watch: null },
});
let browser;
const report = {
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirtyWorktree: !!execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim(),
  platform: process.platform,
  routes: [],
  errors: [],
  pass: false,
  nativeGui: false,
  captureStarted: false,
};
try {
  const { schrijfVoetteksten, leesVoetteksten } = await loader.ssrLoadModule(
    "/src/presentatie/voetteksten.ts",
  );
  const { Pakket } = await loader.ssrLoadModule("/src/grafieken/pakket.ts");
  const raw = new Uint8Array(
    await fs.readFile("docs/voorbeelden/Ontwerpvisie.pptx"),
  );
  const opts = {
    datum: true,
    automatisch: true,
    datumTekst: "",
    dianummer: true,
    voettekst: true,
    tekst: "Date QA",
    nietOpTitel: false,
  };
  let source = schrijfVoetteksten(
    raw,
    [0],
    opts,
    new Date("2020-01-02T12:00:00Z"),
    "en-US",
  );
  source = schrijfVoetteksten(source, [1], {
    ...opts,
    automatisch: false,
    datumTekst: "Fixed 2020-01-02",
  });
  const pkg = new Pakket(source),
    slide = "ppt/slides/slide1.xml";
  pkg.schrijf(
    slide,
    pkg
      .lees(slide)
      .replace(
        /(<a:fld\b[^>]*type="datetime1"[^>]*>\s*<a:rPr)([^>]*?)(\/?\>)/,
        (_all, begin, attrs, end) =>
          begin + attrs.replace(/\s+lang="[^"]*"/g, "") + ' lang="en-US"' + end,
      ),
  );
  source = pkg.inpakken();
  const sourceSha = hash(source);
  await fs.writeFile(path.join(out, "source.pptx"), source);
  assert.equal(leesVoetteksten(source, 0).datumTekst, "01/02/2020");
  report.fixtureSha256 = sourceSha;
  browser = await chromium.launch({ headless: true });
  async function setup(url, bytes, name, day) {
    const context = await browser.newContext({
      locale: "en-US",
      timezoneId: "UTC",
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.on("pageerror", (error) => report.errors.push(String(error)));
    await page.clock.install({ time: new Date(`2026-11-${day}T12:00:00Z`) });
    await page.addInitScript(() =>
      localStorage.setItem(
        "openaec-office-instellingen",
        JSON.stringify({
          taal: "en",
          thema: "forge",
          spelling: { controleren: false },
        }),
      ),
    );
    await page.goto(url);
    assert.equal(
      await page.evaluate(() => typeof window.__TAURI_INTERNALS__),
      "undefined",
    );
    await page
      .locator('input[type="file"][accept*=".docx"][accept*=".pptx"]')
      .setInputFiles({
        name,
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        buffer: Buffer.from(bytes),
      });
    await page.waitForFunction(
      (n) =>
        document
          .querySelector('.office-tabbalk [role="tab"][aria-selected="true"]')
          ?.textContent.includes(n),
      name,
    );
    await page
      .locator('[data-testid="pptx-slide-canvas"]:visible')
      .waitFor({ timeout: 90_000 });
    await page.getByTestId("rich-notes-editor").waitFor({ timeout: 90_000 });
    return { context, page };
  }
  async function dateValue(page) {
    await page.getByRole("tab", { name: "Insert", exact: true }).click();
    await page
      .getByRole("button", { name: "Slide numbers and footer", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Slide numbers and footer",
      exact: true,
    });
    await dialog.waitFor();
    const value = await dialog
      .getByRole("textbox", { name: "Date text", exact: true })
      .inputValue();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    return value;
  }
  const dirty = (page) =>
    page
      .locator('.office-tabbalk [role="tab"][aria-selected="true"]')
      .evaluate((el) => el.classList.contains("is-gewijzigd"));
  for (const [label, dir, base] of [
    ["normal", "dist", "/"],
    ["hosted", "dist-hosted", "/office/"],
  ]) {
    const server = await preview({
      configFile: false,
      base,
      build: { outDir: dir },
      preview: { host: "127.0.0.1", port: 0, open: false },
    });
    const url = `http://127.0.0.1:${server.httpServer.address().port}${base}`;
    const contexts = [];
    const result = { route: base, bundle: dir, checks: [] };
    report.routes.push(result);
    try {
      const first = await setup(url, source, `Date-${label}.pptx`, "23");
      contexts.push(first.context);
      assert.equal(new URL(first.page.url()).pathname, base);
      assert.equal(await dateValue(first.page), "11/23/2026");
      assert.equal(await dirty(first.page), true);
      assert.equal(
        hash(await fs.readFile(path.join(out, "source.pptx"))),
        sourceSha,
      );
      result.checks.push(
        "correct source/document/canvas/input route; refreshed cache and dirty status; source not overwritten",
      );
      // Focus preflight and real keyboard edit, then ordinary ribbon rerenders.
      const notes = first.page.getByTestId("rich-notes-editor");
      await notes.focus();
      assert.equal(
        await notes.evaluate((el) => el === document.activeElement),
        true,
      );
      await first.page.keyboard.press("Control+End");
      await first.page.keyboard.insertText("Date open QA edit");
      assert.ok((await notes.textContent()).includes("Date open QA edit"));
      await first.page.clock.setSystemTime(new Date("2026-11-24T12:00:00Z"));
      assert.equal(await dateValue(first.page), "11/23/2026");
      result.checks.push(
        "real focused keyboard edit; next-day rerender does not refresh or reset editor",
      );
      const download = first.page.waitForEvent("download");
      await notes.focus();
      await first.page.keyboard.press("Control+s");
      const save = first.page.getByRole("dialog", {
        name: "Save as",
        exact: true,
      });
      await save.waitFor();
      await save.getByRole("button", { name: "Save", exact: true }).click();
      const savedPath = path.join(out, `${label}-saved.pptx`);
      await (await download).saveAs(savedPath);
      const saved = new Uint8Array(await fs.readFile(savedPath));
      assert.equal(leesVoetteksten(saved, 0).datumTekst, "11/23/2026");
      assert.equal(leesVoetteksten(saved, 1).datumTekst, "Fixed 2020-01-02");
      result.savedSha256 = hash(saved);
      const fresh = await setup(url, saved, `Saved-${label}.pptx`, "23");
      contexts.push(fresh.context);
      assert.equal(await dateValue(fresh.page), "11/23/2026");
      assert.equal(await dirty(fresh.page), false);
      assert.ok(
        (
          await fresh.page.getByTestId("rich-notes-editor").textContent()
        ).includes("Date open QA edit"),
      );
      result.checks.push(
        "real download/fresh same-day reopen retains edit/date/fixed date and stays clean",
      );
      const tomorrow = await setup(url, saved, `Tomorrow-${label}.pptx`, "24");
      contexts.push(tomorrow.context);
      assert.equal(await dateValue(tomorrow.page), "11/24/2026");
      assert.equal(await dirty(tomorrow.page), true);
      assert.equal(hash(await fs.readFile(savedPath)), result.savedSha256);
      result.checks.push(
        "fresh next-day open refreshes once and marks dirty without rewriting saved source",
      );
      result.pass = true;
    } finally {
      for (const context of contexts) await context.close();
      await server.close();
    }
  }
  assert.deepEqual(report.errors, []);
  report.pass = true;
} finally {
  await browser?.close();
  await loader.close();
  await fs.writeFile(
    path.join(out, "browser-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(JSON.stringify(report));
