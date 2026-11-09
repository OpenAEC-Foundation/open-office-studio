/** Real browser worker: independent 50k results, responsive heartbeat and clean cancellation. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";
const { chromium } = await import(
  process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright"
);
const server = await createServer({
  plugins: [
    {
      name: "adapter-probe",
      configureServer(server) {
        server.middlewares.use("/__adapter_probe", (_req, res) => {
          res.setHeader("Content-Type", "text/html");
          res.end("<!doctype html><title>Spreadsheet worker probe</title>");
        });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 0,
    strictPort: false,
    open: false,
    watch: null,
    hmr: false,
  },
});
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") console.log(m.text());
});
page.on("requestfailed", (r) =>
  console.log(`request failed: ${r.url()} ${r.failure()?.errorText}`),
);
try {
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/__adapter_probe`,
  );
  const bytes = Array.from(
    await readFile(
      ".local/prestatie/rekenbladen/50k-afhankelijke-formules.xlsx",
    ),
  );
  const result = await page.evaluate(async (source) => {
    const { openSpreadsheet } = await import(
      "/packages/rekenbladen/src/index.ts"
    );
    const wasm = await (
      await fetch("/vendor/rekenbladengine/xlsx_wasm_bg.wasm")
    ).arrayBuffer();
    let last = performance.now(),
      maxGap = 0,
      beats = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      maxGap = Math.max(maxGap, now - last);
      last = now;
      beats++;
    }, 10);
    const started = performance.now();
    const book = await openSpreadsheet(new Uint8Array(source), {
      mode: "worker",
      wasm,
      signal: AbortSignal.timeout(30000),
    });
    try {
      const opened = performance.now();
      const cells = await book.readCells({
        ranges: [{ sheetId: "sheet:0", range: { kind: "a1", a1: "B50000" } }],
      });
      const edited = await book.applyEdits({
        expectVersion: await book.version(),
        steps: [
          {
            op: "setCellInputs",
            target: { sheetId: "sheet:0", range: { kind: "a1", a1: "A1" } },
            inputs: [["2"]],
          },
        ],
      });
      const after = await book.readCells({
        ranges: [{ sheetId: "sheet:0", range: { kind: "a1", a1: "B50000" } }],
      });
      const saved = await book.save();
      return {
        openMs: Math.round(opened - started),
        beats,
        maxGap: Math.round(maxGap),
        before: cells,
        edited: edited.ok,
        after,
        savedBytes: saved.length,
      };
    } finally {
      clearInterval(timer);
      await book.dispose();
    }
  }, bytes);
  assert.equal(result.edited, true);
  assert.deepEqual(result.before.ranges[0].cells[0][0].value, {
    kind: "number",
    value: 50002,
  });
  assert.deepEqual(result.after.ranges[0].cells[0][0].value, {
    kind: "number",
    value: 50004,
  });
  assert(result.beats > 10);
  assert(result.maxGap < 500);
  assert(result.savedBytes > 0);
  assert.deepEqual(errors, []);
  await writeFile(
    ".local/prestatie/rekenbladen/adapter-worker.json",
    JSON.stringify(result, null, 2),
  );
  const aborted = await page.evaluate(async () => {
    const { openSpreadsheet } = await import(
      "/packages/rekenbladen/src/index.ts"
    );
    const controller = new AbortController();
    controller.abort();
    try {
      await openSpreadsheet(new Uint8Array([1, 2, 3]), {
        mode: "worker",
        signal: controller.signal,
      });
      return false;
    } catch (e) {
      return e.name === "AbortError";
    }
  });
  assert(aborted, "Aborted worker open must not start document processing");
  console.log(
    JSON.stringify({
      openMs: result.openMs,
      beats: result.beats,
      maxGap: result.maxGap,
      savedBytes: result.savedBytes,
      aborted,
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
