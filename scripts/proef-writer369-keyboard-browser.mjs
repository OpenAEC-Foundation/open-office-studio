import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = process.cwd();
const label = process.argv[2] ?? "writer369-keyboard-browser";
assert.match(label, /^[a-z0-9-]+$/);
const output = resolve(".local", label);
await mkdir(output, { recursive: false });
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const files = {};
for (const path of ["src/openaec-lint/Lint.tsx", "src/openaec-lint/focus.ts"]) {
  const actual = (await readFile(path, "utf8")).replaceAll("\r\n", "\n");
  const committed = execFileSync("git", ["show", source + ":" + path], {
    encoding: "utf8",
  });
  assert.equal(
    actual,
    committed,
    "Executed component must match committed source",
  );
  files[path] = createHash("sha256").update(actual).digest("hex");
}
await writeFile(
  resolve(output, "entry.tsx"),
  `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Lint, LintGroep, LintActie} from '/src/openaec-lint/Lint.tsx';
import '/src/stijl/openaec-office.css';
const Icon=()=> <svg width="16" height="16"><path d="M2 2L14 14"/></svg>;
createRoot(document.querySelector('#root')).render(<div className="office" data-module="docx" data-office-thema="light"><Lint tabs={[
 {id:'insert',naam:'Insert',inhoud:<><LintGroep naam="Text"><LintActie naam="Special Character" icoon={Icon}/><LintActie naam="Date" icoon={Icon}/></LintGroep><LintGroep naam="Delete"><LintActie naam="Delete Row" icoon={Icon}/><LintActie naam="Delete Column" icoon={Icon}/></LintGroep></>},
 {id:'other',naam:'Other',inhoud:<LintGroep naam="Other commands"><LintActie naam="Other command" icoon={Icon}/></LintGroep>}
]}/></div>);
`,
);
const report = {
  issue: 369,
  source,
  files,
  harnessSha256: createHash("sha256")
    .update(await readFile(new URL(import.meta.url)))
    .digest("hex"),
  kind: "actual ribbon component / headless Chromium; not native Office acceptance",
  cases: [],
  errors: [],
  cleanup: [],
};
let browser, server;
try {
  server = await createServer({
    root,
    configFile: false,
    cacheDir: resolve(output, "vite-cache"),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "bounded-ribbon-fixture",
        configureServer(s) {
          s.middlewares.use((req, res, next) => {
            if (req.url !== "/__writer369") return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              '<!doctype html><div id="root"></div><script type="module" src="/.local/' +
                label +
                '/entry.tsx"></script>',
            );
          });
        },
      },
    ],
  });
  await server.listen();
  const port = server.httpServer.address().port;
  report.port = port;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 923, height: 952 } });
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (e) => report.errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/__writer369`);
  await page.getByRole("tab", { name: "Insert", exact: true }).waitFor();
  const measure = async (phase, expected, visible) => {
    await page.waitForFunction(
      ({ expected, visible }) => {
        const e = document.activeElement;
        return (
          (e?.getAttribute("aria-label") ?? e?.textContent?.trim()) ===
            expected && e.matches(":focus-visible") === visible
        );
      },
      { expected, visible },
    );
    const data = await page.evaluate(() => {
      const e = document.activeElement,
        css = getComputedStyle(e);
      return {
        label: e.getAttribute("aria-label") ?? e.textContent.trim(),
        focusVisible: e.matches(":focus-visible"),
        outlineWidth: css.outlineWidth,
        outlineOffset: css.outlineOffset,
      };
    });
    report.cases.push({ phase, ...data });
    return data;
  };
  for (const theme of ["light", "forge"]) {
    // Fixture theme selection only; no focus, CSS or modality injection.
    await page.locator(".office").evaluate((e, theme) => {
      e.dataset.officeThema = theme;
    }, theme);
    await page.getByRole("tab", { name: "Other", exact: true }).click();
    await page.getByRole("tab", { name: "Insert", exact: true }).click();
    await measure(theme + "/pointer", "Insert", false);
    await page.keyboard.press("ArrowDown");
    await measure(theme + "/down", "Special Character", true);
    await page.keyboard.press("ArrowRight");
    await measure(theme + "/right", "Date", true);
    await page.keyboard.press("End");
    await measure(theme + "/end", "Delete Column", true);
    await page.keyboard.press("Home");
    await measure(theme + "/home", "Special Character", true);
    await page.keyboard.press("ArrowUp");
    await measure(theme + "/up", "Insert", true);
    await page.keyboard.press("ArrowRight");
    await measure(theme + "/tab-right", "Other", true);
    await page.keyboard.press("ArrowLeft");
    await measure(theme + "/tab-left", "Insert", true);
    await page.screenshot({ path: resolve(output, theme + "-keyboard.png") });
  }
  assert.deepEqual(report.errors, []);
  report.status = "passed bounded component keyboard routes";
} catch (error) {
  report.status = "failed";
  report.error = String(error);
  throw error;
} finally {
  if (browser) {
    await browser.close();
    report.cleanup.push("own browser closed");
  }
  if (server) {
    await server.close();
    report.cleanup.push("own Vite server closed");
  }
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    source,
  );
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
