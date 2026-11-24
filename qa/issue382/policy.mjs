/** Actual production filename policy only; no ETT/DPT content or save proof. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [expectedCommit, output, mode = "node"] = process.argv.slice(2);
assert(/^[a-f0-9]{40}$/.test(expectedCommit || "") && output);
assert(["node", "browser"].includes(mode));
const cwd = process.cwd(), out = resolve(output);
await mkdir(out, { recursive: true });
const hash = b => createHash("sha256").update(b).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const require = createRequire(resolve(cwd, "package.json"));
const cases = [
  ...["Begroting.ett", "Begroting.ETT", "Begroting.eTt",
    "Presentatie.dpt", "Presentatie.DPT", "Presentatie.dPt"]
    .map(filename => ({ filename, expected: true, role: "issue382" })),
  ..."dotx dotm dot ott stw xltx xltm xlt ots stc potx potm pot otp sti"
    .split(" ").flatMap(ext => [ext, ext.toUpperCase()]
      .map(e => ({ filename: "Existing." + e, expected: true, role: "existing-template" }))),
  ..."et dps docx docm xlsx xlsm pptx pptm ppsx ifcx odt ods odp"
    .split(" ").flatMap(ext => [ext, ext.toUpperCase()]
      .map(e => ({ filename: "Ordinary." + e, expected: false, role: "ordinary-document" }))),
];
const report = {
  kind: "actual-production-filename-policy-only", status: "failed", mode,
  source: { commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}") },
  qaHead: process.env.GITHUB_SHA || null,
  run: process.env.GITHUB_RUN_ID || null, attempt: process.env.GITHUB_RUN_ATTEMPT || null,
  node: process.version, platform: process.platform, arch: process.arch,
  harnessSha256: hash(await readFile(new URL(import.meta.url))),
  productionModule: "src/import/sjabloon.ts",
  productionModuleSha256: hash(await readFile("src/import/sjabloon.ts")),
  adapters: {}, cleanup: { browser: "not-started", server: "not-started" },
  limits: [
    "Filenames only, using the actual production function in Vite SSR and optionally a real browser module.",
    "No qualified original ETT/DPT fixture, content import, conversion, engine, new-document/save or source-overwrite acceptance.",
    "Existing template/document cases are filename controls, not file-format certifications.",
    "No native application, full application build, Office runtime or model injection.",
  ],
};
let server, browser;
try {
  assert.equal(report.source.commit, expectedCommit, "Exact product commit");
  assert.equal(git("status", "--porcelain", "--untracked-files=no"), "", "Tracked source clean");
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  server = await createServer({
    root: cwd, configFile: resolve("vite.config.ts"), mode: "test",
    cacheDir: resolve(out, "vite-cache"),
    server: { host: "127.0.0.1", port: 0, strictPort: false },
    plugins: [{
      name: "issue382-isolated-module-page",
      configureServer(vite) {
        vite.middlewares.use("/__issue382_probe.html", (_req, res) => {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end("<!doctype html><meta charset=utf-8><title>Filename policy probe</title>");
        });
      },
    }],
  });
  report.cleanup.server = "open";
  const actual = await server.ssrLoadModule("/src/import/sjabloon.ts");
  report.adapters.ssr = cases.map(c => ({ ...c, actual: actual.isSjabloon(c.filename) }));
  assert(report.adapters.ssr.every(c => c.actual === c.expected), "Production SSR filename policy");
  if (mode === "browser") {
    assert(process.env.ISSUE382_BROWSER_EXECUTABLE, "Explicit existing CI browser required");
    await server.listen();
    const { chromium } = await import(pathToFileURL(require.resolve("playwright")).href);
    browser = await chromium.launch({ executablePath: process.env.ISSUE382_BROWSER_EXECUTABLE, headless: true });
    report.cleanup.browser = "open";
    report.browser = { executable: process.env.ISSUE382_BROWSER_EXECUTABLE, version: browser.version() };
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    const port = server.httpServer.address().port;
    await page.goto("http://127.0.0.1:" + port + "/__issue382_probe.html");
    report.adapters.browser = await page.evaluate(async inputs => {
      const production = await import("/src/import/sjabloon.ts");
      return inputs.map(c => ({ ...c, actual: production.isSjabloon(c.filename) }));
    }, cases);
    report.pageErrors = errors;
    assert.deepEqual(errors, [], "No browser-module initialization error");
    assert(report.adapters.browser.every(c => c.actual === c.expected), "Actual browser filename policy");
  }
  report.status = "passed";
} catch (error) {
  report.error = String(error.stack || error);
  process.exitCode = 1;
} finally {
  for (const [name, resource] of [["browser", browser], ["server", server]]) {
    if (!resource) continue;
    try { await resource.close(); report.cleanup[name] = "closed"; }
    catch (error) { report.cleanup[name] = String(error); report.status = "failed"; process.exitCode = 1; }
  }
}
await writeFile(resolve(out, "module-policy.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  status: report.status, source: report.source, platform: report.platform,
  casesPerAdapter: cases.length, adapters: Object.keys(report.adapters),
  cleanup: report.cleanup, error: report.error,
}));
