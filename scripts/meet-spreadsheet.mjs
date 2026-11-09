import fs from "node:fs";
import { preview } from "vite";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { controleerWerkmap } from "./spreadsheet-proef-prestaties.mjs";
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(
  modulePath ? pathToFileURL(resolve(modulePath)).href : "playwright"
);
const [out = ".local/performance-baseline", label = "before", rate = "4"] =
  process.argv.slice(2);
if (
  !/^[a-zA-Z0-9_-]+$/.test(label) ||
  !Number.isFinite(Number(rate)) ||
  Number(rate) < 1
)
  throw Error("Invalid label/CPU rate");
fs.mkdirSync(".local", { recursive: true });
const server = await preview({
  configFile: false,
  build: { outDir: out },
  preview: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
  });
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(rate) });
  await page.addInitScript(() => {
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({ taal: "en", thema: "light" }),
    );
    window.__calls = {};
    window.__long = [];
    window.__frames = [];
    window.__measuring = false;
    new PerformanceObserver((l) => {
      if (window.__measuring)
        window.__long.push(
          ...l
            .getEntries()
            .filter((e) => e.startTime >= window.__phaseStart)
            .map((e) => e.duration),
        );
    }).observe({ type: "longtask", buffered: false });
    let last;
    function tick(t) {
      if (window.__measuring && last >= window.__phaseStart)
        window.__frames.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(".local/performance.xlsx");
  await page.waitForFunction(
    () =>
      window.__appApis?.rekenblad?.handle &&
      document.querySelector('[data-testid="xlsx-scroll"]'),
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const h = window.__appApis.rekenblad.handle;
    for (const name of [
      "readCells",
      "exportStructured",
      "displayList",
      "sheetInfo",
      "version",
    ]) {
      const original = h[name].bind(h);
      h[name] = (...args) => {
        if (!window.__measuring) return original(...args);
        const start = performance.now();
        try {
          return original(...args);
        } finally {
          const s = (window.__calls[name] ??= {
            count: 0,
            ms: 0,
            maxMs: 0,
            maxCells: 0,
          });
          s.count++;
          const ms = performance.now() - start;
          s.ms += ms;
          s.maxMs = Math.max(s.maxMs, ms);
          if (name === "readCells") {
            for (const range of args[0].ranges) {
              const r = range.range;
              if (r.kind === "rowCol")
                s.maxCells = Math.max(
                  s.maxCells,
                  (r.end.row - r.start.row + 1) * (r.end.col - r.start.col + 1),
                );
            }
          }
        }
      };
    }
  });
  const result = { label, rate: Number(rate), errors, phases: [] };
  async function controleerKoppen() {
    await page.waitForFunction(() => {
      const api = window.__appApis.rekenblad;
      const scroll = document.querySelector('[data-testid="xlsx-scroll"]');
      const zoom = api.commands.getState("zoom").value ?? 1;
      const grid = api.handle.displayListProfiled({
        x: scroll.scrollLeft / zoom,
        y: scroll.scrollTop / zoom,
        width: scroll.clientWidth / zoom,
        height: scroll.clientHeight / zoom,
      }).displayList.grid;
      if (!grid) return false;
      return [
        [
          "kolom",
          grid.colOffsets,
          grid.startCol,
          grid.colIndices,
          "left",
          "width",
        ],
        [
          "rij",
          grid.rowOffsets,
          grid.startRow,
          grid.rowIndices,
          "top",
          "height",
        ],
      ].every(([soort, offsets, start, indices, positie, maat]) => {
        const nodes = [
          ...document.querySelectorAll(
            `.rekenblad-koppen [data-soort="${soort}"]`,
          ),
        ];
        return (
          nodes.length === offsets.length - 1 &&
          nodes.every(
            (n, i) =>
              Number(n.dataset.spoor) === (indices?.[i] ?? start + i) &&
              Math.abs(parseFloat(n.style[positie]) - offsets[i] * zoom) <
                0.02 &&
              Math.abs(
                parseFloat(n.style[maat]) -
                  (offsets[i + 1] - offsets[i]) * zoom,
              ) < 0.02,
          )
        );
      });
    });
  }
  async function phase(name, fn) {
    await page.evaluate(() => {
      window.__calls = {};
      window.__long = [];
      window.__frames = [];
      window.__phaseStart = performance.now();
      window.__measuring = true;
    });
    const start = performance.now();
    await fn();
    await page.waitForTimeout(300);
    const data = await page.evaluate(() => {
      window.__measuring = false;
      return {
        calls: window.__calls,
        long: window.__long,
        frames: window.__frames,
        status: window.__appStatus(),
      };
    });
    const frames = data.frames.sort((a, b) => a - b);
    const r = {
      name,
      wallMs: performance.now() - start,
      calls: data.calls,
      longTasks: data.long.length,
      longTaskMs: data.long.reduce((a, b) => a + b, 0),
      maxFrameMs: Math.max(0, ...frames),
      p95FrameMs: frames[Math.floor(frames.length * 0.95)],
      status: data.status,
    };
    result.phases.push(r);
    fs.writeFileSync(
      `.local/xlsx-${label}.json`,
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(r));
    await controleerKoppen();
  }
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.start");
  await phase("selection", async () => {
    await page.evaluate(() =>
      window.__appApis.rekenblad.selectCells(0, {
        anchor: { row: 0, col: 0 },
        focus: { row: 9999, col: 9 },
      }),
    );
    await page.waitForFunction(
      () => window.__appStatus()?.statistiek?.aantal === 100000,
    );
  });
  await phase("scroll", async () => {
    for (let i = 0; i < 12; i++) {
      await page.locator('[data-testid="xlsx-scroll"]').evaluate((e, i) => {
        e.scrollTop -= i % 2 ? 120 : -120;
      }, i);
      await page.waitForTimeout(180);
    }
  });
  await phase("edit", async () => {
    await page.evaluate(() =>
      window.__appApis.rekenblad.handle.editCell(0, 0, 0, "999"),
    );
    await page.waitForFunction(
      () => window.__appStatus()?.statistiek?.som === 500500998,
    );
  });
  const { profile } = await cdp.send("Profiler.stop");
  fs.writeFileSync(`.local/xlsx-${label}.cpuprofile`, JSON.stringify(profile));
  await page.evaluate(async () => {
    const api = window.__appApis.rekenblad;
    await api.commands.execute("zoom", 1.25);
    api.handle.applyOps([
      { type: "setColWidth", sheet: 0, col: 0, width: 24 },
      { type: "setRowHeight", sheet: 0, row: 0, height: 0 },
    ]);
  });
  await controleerKoppen();
  await page.evaluate(() => window.__appApis.rekenblad.handle.undo());
  await controleerKoppen();
  await page.evaluate(() => window.__appApis.rekenblad.handle.redo());
  await controleerKoppen();
  result.headersExact = true;
  const saved = await page.evaluate(async () =>
    Array.from(await window.__appApis.rekenblad.save()),
  );
  fs.writeFileSync(`.local/xlsx-${label}.xlsx`, new Uint8Array(saved));
  result.verifiedCells = await controleerWerkmap(`.local/xlsx-${label}.xlsx`);
  fs.writeFileSync(
    `.local/xlsx-${label}.json`,
    JSON.stringify(result, null, 2),
  );
  if (errors.length) throw Error(errors.join("\n"));
} finally {
  await browser?.close();
  await new Promise((r, j) => server.httpServer.close((e) => (e ? j(e) : r())));
}
