import fs from "node:fs";
import { preview } from "vite";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { controleerCanvasFonts } from "./canvasfont-proef.mjs";
import { controleerPresentatie } from "./presentation-proef-prestaties.mjs";
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
const checksOnly = process.argv.includes("--checks-only");
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
    window.__nativeFonts = {};
    for (const name of [
      "CanvasRenderingContext2D",
      "OffscreenCanvasRenderingContext2D",
    ]) {
      const proto = globalThis[name]?.prototype;
      if (!proto) continue;
      const d = Object.getOwnPropertyDescriptor(proto, "font");
      if (!d?.get || !d.set) continue;
      window.__nativeFonts[name] = d;
      Object.defineProperty(proto, "font", {
        ...d,
        get() {
          if (window.__measuring) {
            const s = (window.__calls.nativeFontGet ??= { count: 0 });
            s.count++;
          }
          return d.get.call(this);
        },
        set(value) {
          if (window.__measuring) {
            const s = (window.__calls.nativeFontSet ??= { count: 0 });
            s.count++;
          }
          d.set.call(this, value);
        },
      });
    }
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({ taal: "en", thema: "light" }),
    );
    window.__calls = {};
    window.__long = [];
    window.__frames = [];
    window.__keyPaint = [];
    window.__measuring = false;
    window.addEventListener(
      "keydown",
      (e) => {
        if (!window.__measuring) return;
        const start = e.timeStamp;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (window.__measuring)
              window.__keyPaint.push(performance.now() - start);
          }),
        );
      },
      true,
    );
    new PerformanceObserver((l) => {
      if (window.__measuring)
        window.__long.push(...l.getEntries().map((e) => e.duration));
    }).observe({ type: "longtask", buffered: false });
    let last;
    function tick(t) {
      if (window.__measuring && last) window.__frames.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(".local/performance.pptx");
  await page.waitForFunction(
    () =>
      window.__appApis?.presentatie?.handle &&
      document.querySelector(
        '.office-presentatie aside > button[aria-current="page"]',
      ),
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1800);
  // De nieuwe engine maakt miniaturen op de achtergrond. Vergelijk daarna
  // dezelfde, volledig getekende pixelbasis; dit valt buiten de invoermeting.
  await page.waitForFunction(() => {
    const canvassen = [
      ...document.querySelectorAll(".office-presentatie aside > button canvas"),
    ];
    return (
      canvassen.length === 100 &&
      canvassen.every(
        (c) =>
          c.width >= 127 &&
          c.getContext("2d").getImageData(0, 0, 1, 1).data[3] > 0,
      )
    );
  });
  const thumbnailsBefore = await page.evaluate(() =>
    [
      ...document.querySelectorAll(".office-presentatie aside > button canvas"),
    ].map((c) => c.toDataURL()),
  );
  const initial = await page.evaluate(() => {
    const h = window.__appApis.presentatie.handle;
    window.__initialDeck = h.snapshot();
    for (const name of [
      "snapshot",
      "version",
      "layoutSlide",
      "story",
      "readContent",
      "readCommandContent",
    ])
      if (typeof h[name] === "function") {
        const original = h[name].bind(h);
        h[name] = (...args) => {
          if (!window.__measuring) return original(...args);
          const start = performance.now();
          try {
            return original(...args);
          } finally {
            const s = (window.__calls[name] ??= { count: 0, ms: 0, maxMs: 0 });
            s.count++;
            const ms = performance.now() - start;
            s.ms += ms;
            s.maxMs = Math.max(s.maxMs, ms);
          }
        };
      }
    return {
      slides: window.__initialDeck.slides.length,
      shapes: window.__initialDeck.slides.reduce(
        (n, s) => n + s.shapes.length,
        0,
      ),
    };
  });
  console.log("Ready", initial);
  const result = { label, rate: Number(rate), ...initial, errors, phases: [] };
  async function phase(name, fn) {
    await page.evaluate(() => {
      window.__calls = {};
      window.__long = [];
      window.__frames = [];
      window.__keyPaint = [];
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
        keyPaint: window.__keyPaint,
        status: window.__appStatus(),
      };
    });
    const f = data.frames.sort((a, b) => a - b);
    const keys = data.keyPaint.sort((a, b) => a - b);
    const r = {
      name,
      wallMs: performance.now() - start,
      calls: data.calls,
      longTasks: data.long.length,
      longTaskMs: data.long.reduce((a, b) => a + b, 0),
      maxFrameMs: Math.max(0, ...f),
      p95FrameMs: f[Math.floor(f.length * 0.95)],
      keyPaintSamples: keys.length,
      p95KeyPaintMs: keys[Math.floor(keys.length * 0.95)] ?? null,
      status: data.status,
    };
    result.phases.push(r);
    fs.writeFileSync(
      `.local/pptx-${label}.json`,
      JSON.stringify({ ...result, completed: false }, null, 2),
    );
    console.log(JSON.stringify(r));
  }
  if (!checksOnly) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
  }
  if (!checksOnly)
    await phase("navigation", async () => {
      for (let slide = 2; slide <= 16; slide++) {
        await page.evaluate(
          (slide) => window.__appApis.presentatie.goToSlide(slide),
          slide,
        );
        await page.waitForFunction(
          (slide) => window.__appStatus()?.dia === slide,
          slide,
        );
        await page.waitForTimeout(100);
      }
    });
  await page.evaluate(() => {
    const slide = window.__initialDeck.slides[15],
      shape = slide.shapes.find((s) =>
        s.textStories.some((t) =>
          t.paragraphs.some((p) => p.runs.some((r) => r.text)),
        ),
      );
    const story = shape.textStories[0];
    const text = story.paragraphs
      .map((p) => p.runs.map((r) => r.text).join(""))
      .join("\n");
    window.__editTarget = {
      slide: 16,
      shapeId: shape.id,
      storyId: story.id,
      start: text.length,
      end: text.length,
    };
    if (!window.__appApis.presentatie.selectText(window.__editTarget))
      throw Error("SelectText refused");
  });
  await page.waitForTimeout(500);
  if (checksOnly) {
    await page.keyboard.type(" Performance 123", { delay: 0 });
    await page.evaluate(() => window.__appApis.presentatie.flushPendingInput());
  } else
    await phase("typing", async () => {
      await page.keyboard.type(" Performance 123", { delay: 70 });
      await page.evaluate(() =>
        window.__appApis.presentatie.flushPendingInput(),
      );
    });
  if (!checksOnly) {
    const { profile } = await cdp.send("Profiler.stop");
    fs.writeFileSync(
      `.local/pptx-${label}.cpuprofile`,
      JSON.stringify(profile),
    );
  }
  const content = await page.evaluate(() => {
    const current = window.__appApis.presentatie.handle.snapshot();
    const texts = (d) =>
      d.slides.map((s) =>
        s.shapes.map((x) =>
          x.textStories.map((t) =>
            t.paragraphs
              .map((p) => p.runs.map((r) => r.text).join(""))
              .join("\n"),
          ),
        ),
      );
    const before = texts(window.__initialDeck),
      after = texts(current);
    let changed = 0;
    for (let i = 0; i < before.length; i++)
      for (let j = 0; j < before[i].length; j++)
        for (let k = 0; k < before[i][j].length; k++) {
          if (before[i][j][k] !== after[i][j][k]) {
            if (after[i][j][k] !== before[i][j][k] + " Performance 123")
              throw Error("Wrong typed content");
            changed++;
          }
        }
    if (changed !== 1)
      throw Error("Expected one changed text story, got " + changed);
    return { before, after };
  });
  await page.evaluate(async () => {
    const r = await window.__appApis.presentatie.commands.execute("undo", null);
    if (!r.ok) throw Error("Undo refused");
  });
  await page.evaluate(() => window.__appApis.presentatie.flushPendingInput());
  await page.evaluate(async () => {
    const r = await window.__appApis.presentatie.commands.execute("redo", null);
    if (!r.ok) throw Error("Redo refused");
  });
  const history = await page.evaluate(async () => {
    const api = window.__appApis.presentatie;
    const before = api.handle.snapshot();
    const text = (d) =>
      JSON.stringify(
        d.slides.map((s) =>
          s.shapes.map((x) =>
            x.textStories.map((t) =>
              t.paragraphs
                .map((p) => p.runs.map((r) => r.text).join(""))
                .join("\n"),
            ),
          ),
        ),
      );
    const r = await api.commands.execute("undo", null);
    if (!r.ok || text(api.handle.snapshot()) === text(before))
      throw Error("Undo did not change typed text");
    const redo = await api.commands.execute("redo", null);
    if (!redo.ok || text(api.handle.snapshot()) !== text(before))
      throw Error("Redo did not restore typed text");
    return true;
  });
  result.history = history;
  const inserted = await page.evaluate(() =>
    window.__appApis.presentatie.handle.insertSlide(100),
  );
  await page.waitForFunction(() => window.__appStatus()?.dias === 101);
  await page.evaluate(
    (id) => window.__appApis.presentatie.handle.deleteSlide(id),
    inserted.slideId,
  );
  await page.waitForFunction(() => window.__appStatus()?.dias === 100);
  result.slideCounting = true;
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  const thumbnailsAfter = await page.evaluate(() =>
    [
      ...document.querySelectorAll(".office-presentatie aside > button canvas"),
    ].map((c) => c.toDataURL()),
  );
  const changedThumbnails = thumbnailsAfter.flatMap((png, i) =>
    png !== thumbnailsBefore[i] ? [i + 1] : [],
  );
  if (
    thumbnailsBefore.length !== 100 ||
    thumbnailsAfter.length !== 100 ||
    JSON.stringify(changedThumbnails) !== "[16]"
  )
    throw Error(
      `Unexpected thumbnail changes: ${JSON.stringify(changedThumbnails)}`,
    );
  result.changedThumbnails = changedThumbnails;
  const saved = await page.evaluate(() =>
    Array.from(window.__appApis.presentatie.save()),
  );
  fs.writeFileSync(`.local/pptx-${label}.pptx`, new Uint8Array(saved));
  fs.writeFileSync(
    `.local/pptx-${label}-content.json`,
    JSON.stringify(content),
  );
  result.verified = await controleerPresentatie(
    `.local/pptx-${label}.pptx`,
    content.after,
  );
  result.fontChecks = await controleerCanvasFonts(page);
  result.contentExact = true;
  result.completed = true;
  console.log("Integrity", {
    verified: result.verified,
    fontChecks: result.fontChecks.length,
    history: result.history,
    slideCounting: result.slideCounting,
  });
  fs.writeFileSync(
    `.local/pptx-${label}.json`,
    JSON.stringify(result, null, 2),
  );
  if (errors.length) throw Error(errors.join("\n"));
} finally {
  await browser?.close();
  await new Promise((r, j) => server.httpServer.close((e) => (e ? j(e) : r())));
}
