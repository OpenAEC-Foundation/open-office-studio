import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build, preview } from "vite";
const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
const baseline = process.argv.includes("--baseline"),
  dir = resolve(
    process.env.OFFICE_TEST_DIST ??
      `.local/pdf-font-cache-${baseline ? "baseline" : "fixed"}`,
  );
await mkdir(dir, { recursive: true });
if (!process.argv.includes("--no-build"))
  await build({
    configFile: false,
    logLevel: "error",
    build: {
      outDir: dir,
      rollupOptions: { input: "scripts/proeven/pdf-font-cache.html" },
    },
  });
const server = await preview({
    configFile: false,
    build: { outDir: dir },
    preview: { host: "127.0.0.1", port: 0, open: false },
  }),
  browser = await chromium.launch(),
  context = await browser.newContext(),
  page = await context.newPage(),
  report = { baseline, cases: [], errors: [] };
page.on("pageerror", (e) => report.errors.push(String(e)));
await page.addInitScript(() => {
  window.testLocalFontAccess = false;
  window.testFontBlobCalls = 0;
  window.testFontQueries = 0;
  window.queryLocalFonts = async () => {
    window.testFontQueries++;
    if (!window.testLocalFontAccess)
      throw new DOMException("Denied", "NotAllowedError");
    return [
      {
        family: "OOS Permission Font",
        style: "Regular",
        fullName: "OOS Permission Font Regular",
        file: "LiberationSans-Regular.ttf",
      },
      {
        family: "Arial",
        style: "Regular",
        fullName: "Arial Regular",
        file: "SourceSans3-Regular.ttf",
      },
    ].map((f) => ({
      ...f,
      blob: async () => {
        window.testFontBlobCalls++;
        return (await fetch("/fonts/" + f.file)).blob();
      },
    }));
  };
});
async function run(name, fn) {
  await fn();
  report.cases.push(name);
  console.log("OK:", name);
}
try {
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/scripts/proeven/pdf-font-cache.html`,
  );
  await page.waitForFunction(
    () => document.querySelector("#state")?.textContent === "Ready",
  );
  const before = await page.evaluate(async () => {
    const a = pdfFontCacheProbe.load(),
      b = pdfFontCacheProbe.load();
    window.oldFontPromise = a;
    const alias = await pdfFontCacheProbe.load("Arial");
    window.oldAlias = alias;
    return {
      samePromise: a === b,
      available: !!(await a),
      aliasFont: alias?.font.postscriptNaam,
      queries: window.testFontQueries,
    };
  });
  report.before = before;
  assert.equal(before.available, false);
  assert.equal(before.samePromise, true);
  assert.equal(before.queries, 0);
  assert.equal(before.aliasFont, "LiberationSans");
  await run(
    "The unavailable result is cached and no font permission is requested automatically",
    async () => {
      assert.equal(
        await page.evaluate(
          () => pdfFontCacheProbe.load() === window.oldFontPromise,
        ),
        true,
      );
    },
  );
  const beforePdf = Buffer.from(
    await page.evaluate(async () => Array.from(await pdfFontCacheProbe.pdf())),
  );
  await writeFile(resolve(dir, "before-access.pdf"), beforePdf);
  assert.equal(beforePdf.toString("latin1").includes("/FontFile2"), false);
  await page
    .getByRole("button", { name: "Allow test local fonts", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector("#state").textContent === "Granted",
  );
  const after = await page.evaluate(async () => {
    const a = pdfFontCacheProbe.load(),
      b = pdfFontCacheProbe.load(),
      loaded = await a,
      alias = await pdfFontCacheProbe.load("Arial");
    return {
      samePromise: a === b,
      changedPromise: a !== window.oldFontPromise,
      available: !!loaded,
      font: loaded?.font.postscriptNaam,
      aliasFont: alias?.font.postscriptNaam,
      aliasChanged: alias !== window.oldAlias,
      queries: window.testFontQueries,
      blobs: window.testFontBlobCalls,
    };
  });
  report.after = after;
  if (baseline) {
    assert.equal(after.available, false);
    assert.equal(after.changedPromise, false);
    assert.equal(after.aliasChanged, false);
    report.cases.push(
      "Baseline retains null and the old fallback after the catalogue becomes available",
    );
  } else {
    await run(
      "A later availability grant invalidates the null and earlier fallback",
      async () => {
        assert.equal(after.available, true);
        assert.equal(after.font, "LiberationSans");
        assert.equal(after.changedPromise, true);
        assert.equal(after.samePromise, true);
        assert.equal(after.aliasChanged, true);
        assert.notEqual(after.aliasFont, before.aliasFont);
        assert.equal(after.aliasFont, "SourceSans3-Roman");
        assert.equal(after.queries, 1);
      },
    );
    await run(
      "Subsequent lookups reuse loaded fonts without duplicate OS font reads",
      async () => {
        const calls = await page.evaluate(async () => {
          const a = await pdfFontCacheProbe.load(),
            b = await pdfFontCacheProbe.load();
          return { same: a === b, blobs: window.testFontBlobCalls };
        });
        assert.equal(calls.same, true);
        assert.equal(calls.blobs, after.blobs);
      },
    );
  }
  const afterPdf = Buffer.from(
    await page.evaluate(async () => Array.from(await pdfFontCacheProbe.pdf())),
  );
  await writeFile(resolve(dir, "after-access.pdf"), afterPdf);
  await run(
    baseline
      ? "Baseline PDF still lacks the newly available TrueType font"
      : "Actual PDF export embeds the newly available TrueType font",
    async () => {
      assert.equal(
        afterPdf.toString("latin1").includes("/FontFile2"),
        !baseline,
      );
      report.embeddedBefore = false;
      report.embeddedAfter = !baseline;
    },
  );
  assert.deepEqual(report.errors, []);
} catch (e) {
  report.failure = String(e.stack ?? e);
  throw e;
} finally {
  await writeFile(resolve(dir, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
