/** Read the existing, verified build; no build or editor bridge in this probe. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { preview } from "vite";
import { chromium } from "playwright";
import { withWriter363Resources } from "./writer-363-resources.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inside = (parent, child) => {
  const rel = relative(parent, child);
  return (
    rel === "" ||
    (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + sep))
  );
};
// Resolve existing ancestors too: an output alias must not enter shared assets.
async function destination(path) {
  let current = resolve(path);
  const parts = [];
  while (true) {
    try {
      return resolve(await realpath(current), ...parts.reverse());
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      parts.push(basename(current));
      current = parent;
    }
  }
}
export async function assertWriter363Output(outDir, output, receiptPath) {
  const dist = await destination(outDir),
    out = await destination(output),
    receipt = receiptPath ? await destination(receiptPath) : null;
  assert(
    !inside(dist, out),
    "Writer363 output must not be inside the verified build",
  );
  // Protect the known output files from existing symlink aliases as well.
  const names = [
    "report.json",
    ...["en", "nl", "lo"].flatMap((l) => [`${l}.png`, `${l}-failure.png`]),
  ];
  for (const name of names) {
    const target = await destination(resolve(output, name));
    assert(
      !inside(dist, target),
      `Writer363 ${name} aliases the verified build`,
    );
    assert(target !== receipt, `Writer363 ${name} aliases the build receipt`);
  }
}
const errorInfo = (error) => ({
  name: error?.name ?? "Error",
  message: String(error?.message ?? error),
  ...(error instanceof AggregateError
    ? { errors: error.errors.map(errorInfo) }
    : {}),
});
function harnessCommit() {
  return execFileSync(
    "git",
    ["-C", dirname(fileURLToPath(import.meta.url)), "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
}
async function verifySharedBuild(options) {
  // The integration coordinator owns this single shared producer/verifier.
  const { verifyBuildReceipt } = await import(
    pathToFileURL(resolve("scripts/writer-proefbuild.mjs")).href
  );
  return verifyBuildReceipt(options);
}
async function stopPreview(server) {
  await new Promise((done, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : done())),
  );
}

async function exerciseLabels({
  browser,
  server,
  fixture,
  outDir,
  results,
  captureFailures,
}) {
  for (const language of ["en", "nl", "lo"]) {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
    });
    let page;
    const errors = [];
    const failures = [];
    try {
      page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(
        (language) =>
          localStorage.setItem(
            "openaec-office-instellingen",
            JSON.stringify({
              taal: language,
              spelling: { controleren: false },
            }),
          ),
        language,
      );
      await page.goto(
        `http://127.0.0.1:${server.httpServer.address().port}${fixture.route}`,
      );
      await page.waitForFunction(
        (language) => document.documentElement.lang === language,
        language,
      );
      await page.locator("input[type=file]").first().setInputFiles({
        name: "363 label check.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: fixture.bytes,
      });
      await page.getByRole("tab", { name: /363 label check.docx/ }).waitFor();
      const nl = language === "nl",
        tab = nl ? "Stijlen" : "Styles",
        pane = nl ? "Stijlenvenster" : "Styles pane";
      await page.getByRole("tab", { name: tab, exact: true }).click();
      const paneButton = page.getByRole("button", {
        name: pane,
        exact: true,
        includeHidden: true,
      });
      const group = page.locator(".ribbon-groep").filter({ has: paneButton });
      await group.waitFor({ state: "attached" });
      if (!(await paneButton.isVisible()))
        await group.locator(".ribbon-groep-knop").click();
      await paneButton.waitFor();
      const modify = nl ? "Stijl wijzigen: Standaard" : "Modify Style: Normal";
      await group.getByRole("button", { name: modify, exact: true }).waitFor();
      const buttons = await group
        .locator("button.ribbon-actie")
        .evaluateAll((nodes) =>
          nodes.map((n) => ({
            text: n.textContent.trim(),
            name: n.getAttribute("aria-label"),
            title: n.getAttribute("title"),
            disabled: n.disabled,
          })),
        );
      assert.equal(buttons.length, 5);
      assert(!JSON.stringify(buttons).includes("styles.manage."));
      assert(buttons.every((b) => b.name?.trim() && b.title?.trim()));
      assert.equal(await group.getAttribute("aria-label"), tab);
      assert(
        buttons.some((b) => b.name === (nl ? "Nieuwe stijl…" : "New Style…")),
      );
      assert(buttons.some((b) => b.name === (nl ? "Stijlset…" : "Style Set…")));
      assert(buttons.some((b) => b.name === modify));
      assert.deepEqual(errors, []);
      const png = `${language}.png`;
      await page.screenshot({ path: resolve(outDir, png) });
      results.push({
        language,
        expectedFallback: language === "lo" ? "en" : null,
        group: await group.getAttribute("aria-label"),
        buttons,
        errors,
        screenshot: {
          name: png,
          sha256: digest(await readFile(resolve(outDir, png))),
        },
      });
    } catch (error) {
      failures.push(error);
      if (page)
        try {
          await page.screenshot({
            path: resolve(outDir, `${language}-failure.png`),
          });
        } catch (captureError) {
          captureFailures.push({ language, ...errorInfo(captureError) });
        }
    } finally {
      try {
        await context.close();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length)
      throw new AggregateError(
        failures,
        `Writer363 ${language} exercise/cleanup failed`,
      );
  }
}

/** Dependencies are injectable only for focused lifecycle/contract tests. */
export async function runWriter363Labels(options = {}, dependencies = {}) {
  const dist = options.dist ?? "dist",
    route = options.route ?? "/";
  const out =
    options.out ??
    process.env.WRITER363_OUT ??
    `.local/writer363-labels/${route === "/" ? "normal" : "hosted"}`;
  const receiptPath =
    options.receiptPath ?? process.env.OFFICE_TEST_BUILD_RECEIPT;
  // This check intentionally precedes mkdir and every resource factory.
  await assertWriter363Output(dist, out, receiptPath);
  await mkdir(out, { recursive: true });
  const cleanup = {},
    report = {
      schemaVersion: 2,
      source: null,
      tree: null,
      harnessCommit: harnessCommit(),
      host: process.platform,
      route,
      dist,
      status: "failed",
      results: [],
      captureFailures: [],
      cleanup,
      limits: [
        "Production browser labels only; no native Windows/Linux/macOS claim",
        "No ribbon clipping/CSS or style-command behavior change",
      ],
    };
  const verify = dependencies.verifyBuildReceipt ?? verifySharedBuild;
  let firstReceipt, receiptHash;
  try {
    await withWriter363Resources(
      {
        loadFixture: async () => {
          assert(receiptPath, "OFFICE_TEST_BUILD_RECEIPT is required");
          firstReceipt = structuredClone(
            await verify({ outDir: dist, route, receiptPath }),
          );
          assert.equal(
            firstReceipt.schemaVersion,
            1,
            "Unknown shared build receipt schema",
          );
          assert.match(
            firstReceipt.source,
            /^[0-9a-f]{40}$/,
            "Receipt needs a full application SHA",
          );
          report.source = firstReceipt.source;
          report.tree = firstReceipt.tree;
          receiptHash = digest(await readFile(receiptPath));
          report.buildReceipt = firstReceipt;
          report.buildReceiptFile = { receiptPath, sha256: receiptHash };
          const bytes = await readFile(resolve(dist, "templates/nieuw.docx"));
          assert.equal(
            digest(bytes),
            firstReceipt.files["templates/nieuw.docx"],
            "Fixture must come from the verified build",
          );
          report.fixtureSha256 = digest(bytes);
          return { bytes, route };
        },
        startServer: () =>
          (dependencies.startServer ?? preview)({
            configFile: false,
            base: route,
            build: { outDir: dist },
            preview: { host: "127.0.0.1", port: 0 },
          }),
        launchBrowser: () =>
          (dependencies.launchBrowser ?? (() => chromium.launch()))(),
        stopServer: dependencies.stopServer ?? stopPreview,
        exercise: async ({ browser, server, fixture }) => {
          report.browser = browser.version();
          await (dependencies.exercise ?? exerciseLabels)({
            browser,
            server,
            fixture,
            outDir: out,
            results: report.results,
            captureFailures: report.captureFailures,
          });
          assert.deepEqual(
            report.results.map((result) => result.language),
            ["en", "nl", "lo"],
            "Writer363 proof requires all three language results exactly once",
          );
          const after = await verify({ outDir: dist, route, receiptPath });
          assert.deepEqual(
            after,
            firstReceipt,
            "Build receipt changed during the UI proof",
          );
          assert.equal(
            digest(await readFile(receiptPath)),
            receiptHash,
            "Build receipt bytes changed during the UI proof",
          );
          report.buildVerifiedAfter = true;
        },
      },
      cleanup,
    );
    report.status = "passed";
    report.documentNotEdited = true;
  } catch (error) {
    report.error = errorInfo(error);
  }
  // Write only after cleanup; a failure never becomes a success report.
  try {
    await assertWriter363Output(dist, out, receiptPath);
    await writeFile(
      resolve(out, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
      "utf8",
    );
  } catch (error) {
    report.status = "failed";
    report.outputError = errorInfo(error);
    error.probeReport = report;
    throw error;
  }
  return report;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const report = await runWriter363Labels({
      dist: process.argv[2],
      route: process.argv[3],
    });
    console.log(
      JSON.stringify({
        source: report.source,
        harnessCommit: report.harnessCommit,
        route: report.route,
        status: report.status,
        passed: report.results.length,
        cleanup: report.cleanup,
        error: report.error,
      }),
    );
    if (report.status !== "passed") process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        status: "failed",
        error: errorInfo(error),
        ...(error.probeReport ? { report: error.probeReport } : {}),
        note: "No report was safely written; only recorded cleanup facts apply",
      }),
    );
    process.exitCode = 1;
  }
}
