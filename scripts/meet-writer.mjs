/** Full Writer browser benchmark. See docs/writer-performance.md. */
import fs from "node:fs";
import { preview } from "vite";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(
  modulePath ? pathToFileURL(resolve(modulePath)).href : "playwright"
);
const outDir = process.argv[2] ?? ".local/writer-performance",
  label = process.argv[3] ?? "kandidaat",
  rate = Number(process.argv[4] ?? 4),
  diagnostic = process.argv.includes("--diagnostic"),
  checkWarmup = process.argv.includes("--check-warmup"),
  nativeDiagnostic = process.argv.includes("--native-diagnostic"),
  viewportChecks = process.argv.includes("--viewport-checks");
if (!/^[a-zA-Z0-9_-]+$/.test(label) || !Number.isFinite(rate) || rate < 1)
  throw new Error("Invalid label or CPU rate");
fs.mkdirSync(".local", { recursive: true });
const server = await preview({
  configFile: false,
  build: { outDir },
  preview: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
  });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("Browser error:", e.message);
  });
  page.on("requestfailed", (r) =>
    console.error("Request failed:", r.url(), r.failure()?.errorText),
  );
  await page.addInitScript(
    ({ diagnostic }) => {
      localStorage.setItem(
        "openaec-office-instellingen",
        JSON.stringify({
          taal: "en",
          thema: "light",
          spelling: { controleren: true, autocorrectie: true },
        }),
      );
      window.__calls = {};
      const proxies = new WeakMap();
      const methods = new Set([
        "getDocument",
        "getSelectionInfo",
        "getEditorRef",
        "getYrsSession",
        "yrsBlocksForStory",
        "listRevisions",
        "readParagraphs",
        "paragraphs",
        "version",
        "storySegments",
        "paragraphSpans",
        "locateParagraph",
        "selectionContext",
        "selection",
        "onSelectionChange",
        "onContentChange",
      ]);
      function wrap(target) {
        if (!target) return target;
        if (proxies.has(target)) return proxies.get(target);
        const proxy = new Proxy(target, {
          get(t, k) {
            const value = Reflect.get(t, k, t);
            if (typeof value !== "function") return value;
            if (!methods.has(k)) return value.bind(t);
            return (...args) => {
              const start = performance.now();
              try {
                const result = value.apply(t, args);
                return k === "getEditorRef" || k === "getYrsSession"
                  ? wrap(result)
                  : result;
              } finally {
                const s = (window.__calls[k] ??= { count: 0, ms: 0 });
                s.count++;
                s.ms += performance.now() - start;
              }
            };
          },
        });
        proxies.set(target, proxy);
        return proxy;
      }
      window.__writerWrap = diagnostic ? wrap : (x) => x;
      window.__long = [];
      window.__keyPaint = [];
      document.addEventListener(
        "keydown",
        (e) => {
          if (!window.__measuring || Array.from(e.key).length !== 1) return;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              window.__keyPaint.push(performance.now() - e.timeStamp);
            }),
          );
        },
        true,
      );
      new PerformanceObserver((list) => {
        if (window.__measuring)
          window.__long.push(
            ...list
              .getEntries()
              .filter((x) => x.startTime >= window.__phaseStart)
              .map((x) => x.duration),
          );
      }).observe({ type: "longtask", buffered: false });
      window.__frames = [];
      let last = 0;
      function frame(t) {
        if (window.__measuring && last >= window.__phaseStart)
          window.__frames.push(t - last);
        last = t;
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    },
    { diagnostic },
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
  await page.goto(url);
  console.log("Opening", label, "CPU", rate, "diagnostic", diagnostic);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(".local/performance-600.docx");
  await page.waitForFunction(
    () =>
      window.__writerApis?.tekst()?.getEditorRef()?.getYrsSession() &&
      document.querySelector(".canvas-page canvas"),
    null,
    { timeout: 180000 },
  );
  await page.evaluate(async () => {
    await window.__writerApis.tekst().flushPendingInput();
  });
  await page.waitForFunction(
    () =>
      window.__writerSpelling?.aantal !== null &&
      window.__writerSpelling?.alineas?.length === 600 &&
      !window.__writerSpelling.probleem,
    null,
    { timeout: 180000 },
  );
  await page.evaluate(() => document.fonts.ready);
  if (checkWarmup) {
    await page.waitForFunction(() => window.__writerWarmup);
    await page.evaluate(() => window.__writerWarmup);
  }
  await page.waitForTimeout(2000);
  if (nativeDiagnostic) {
    await page.evaluate(() => {
      const s = window.__writerApis.tekst().getEditorRef().getYrsSession();
      for (const key of [
        "paragraphs",
        "storySegmentUnits",
        "paragraphSpans",
        "selectionText",
      ]) {
        const original = s[key].bind(s);
        s[key] = (...args) => {
          if (!window.__measuring) return original(...args);
          const start = performance.now();
          try {
            return original(...args);
          } finally {
            const stat = (window.__calls[`native.${key}`] ??= {
              count: 0,
              ms: 0,
            });
            stat.count++;
            stat.ms += performance.now() - start;
          }
        };
      }
    });
  }
  const before = await page.evaluate(() => {
    const ref = window.__writerApis.tekst(),
      s = ref.getEditorRef().getYrsSession();
    return {
      pages: ref.getEditorRef().getLayout().pages.length,
      paragraphs: s
        .paragraphs("body")
        .map((p) => ({ paraId: p.paraId, text: p.text })),
    };
  });
  console.log(
    "Ready",
    before.pages,
    "pages",
    before.paragraphs.length,
    "paragraphs",
  );
  if (diagnostic)
    fs.writeFileSync(
      ".local/performance-layout.json",
      JSON.stringify(
        await page.evaluate(() => {
          const e = window.__writerApis.tekst().getEditorRef(),
            s = e.getYrsSession(),
            p = e.getLayout().pages;
          return {
            first: p[0].fragments.slice(0, 2),
            last: p.at(-1).fragments.slice(-2),
            paragraphs: s.paragraphSpans("body").slice(0, 2),
            firstLoc: e.displayPositionToYrsLoc(p[0].fragments[0]?.pmStart),
          };
        }),
        null,
        2,
      ),
    );
  await page.evaluate(() => window.__writerApis.tekst().focus());
  await page.keyboard.press("Control+End");
  await page.evaluate(async () => {
    await window.__writerApis.tekst().flushPendingInput();
  });
  await page.waitForTimeout(2000);
  const result = {
    label,
    rate,
    diagnostic,
    nativeDiagnostic,
    pages: before.pages,
    paragraphs: before.paragraphs.length,
    spelling: await page.evaluate(() => ({
      errors: window.__writerSpelling.aantal,
      enabled: window.__writerSpelling.aan,
      overlay: document
        .querySelector(".spelling-golflijnen")
        ?.getAttribute("data-fouten"),
    })),
    phases: [],
    errors,
  };
  async function phase(name, fn) {
    await page.evaluate(() => {
      window.__calls = {};
      window.__long = [];
      window.__frames = [];
      window.__keyPaint = [];
      window.__phaseStart = performance.now();
      window.__measuring = true;
    });
    const start = performance.now();
    await fn();
    await page.evaluate(async () => {
      await window.__writerApis.tekst().flushPendingInput();
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
    });
    const wallMs = performance.now() - start;
    const data = await page.evaluate(() => {
      window.__measuring = false;
      return {
        calls: window.__calls,
        longTasks: window.__long,
        frames: window.__frames,
        keyPaint: window.__keyPaint,
      };
    });
    const sorted = [...data.frames].sort((a, b) => a - b),
      keys = [...data.keyPaint].sort((a, b) => a - b),
      summary = {
        name,
        wallMs,
        longTasks: data.longTasks.length,
        longTaskMs: data.longTasks.reduce((a, b) => a + b, 0),
        maxFrameMs: Math.max(0, ...sorted),
        p95FrameMs: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        keyPaintSamples: keys.length,
        p95KeyPaintMs: keys[Math.floor(keys.length * 0.95)] ?? null,
        calls: data.calls,
      };
    result.phases.push(summary);
    fs.writeFileSync(
      `.local/perf-${label}.json`,
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(summary));
  }
  if (diagnostic) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
  }
  await phase("typing", () =>
    page.keyboard.type(" Rustige testinvoer 123", { delay: 50 }),
  );
  const cursor = () =>
    page.evaluate(() =>
      window.__writerApis.tekst().getEditorRef().getYrsSession().selection(),
    );
  const cursorVoor = await cursor();
  await phase("caret", async () => {
    for (let i = 0; i < 30; i++) await page.keyboard.press("ArrowLeft");
  });
  const cursorNa = await cursor();
  const verwachtPunt = {
    ...cursorVoor.head,
    offset: cursorVoor.head.offset - 30,
  };
  result.caret = {
    before: cursorVoor,
    after: cursorNa,
    expected: verwachtPunt,
    equal:
      cursorNa &&
      [cursorNa.anchor, cursorNa.head].every(
        (p) =>
          p.story === verwachtPunt.story &&
          p.paraId === verwachtPunt.paraId &&
          p.offset === verwachtPunt.offset,
      ),
  };
  if (!result.caret.equal)
    throw Error(`Caret position differs: ${JSON.stringify(result.caret)}`);
  if (diagnostic) {
    const { profile } = await cdp.send("Profiler.stop");
    fs.writeFileSync(
      `.local/perf-${label}.cpuprofile`,
      JSON.stringify(profile),
    );
  }
  await phase("scroll", async () => {
    await page.mouse.move(1100, 550);
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(25);
    }
  });
  const after = await page.evaluate(() =>
    window.__writerApis
      .tekst()
      .getEditorRef()
      .getYrsSession()
      .paragraphs("body")
      .map((p) => p.text),
  );
  result.contentExact =
    after.length === before.paragraphs.length &&
    after.slice(0, -1).every((p, i) => p === before.paragraphs[i].text) &&
    after.at(-1) === before.paragraphs.at(-1).text + " Rustige testinvoer 123";

  await page.evaluate(async () => {
    await window.__writerSpelling.controleer();
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
  });
  const controleerOverlay = () =>
    page.evaluate(() => {
      const s = window.__writerSpelling,
        e = window.__writerApis.tekst().getEditorRef(),
        g = s.geometrie,
        layer = document.querySelector(".spelling-golflijnen"),
        viewport = layer.closest(
          ".docx-editor__scroll-container, .docx-editor__viewport",
        );
      const vr = viewport.getBoundingClientRect(),
        elements = viewport.querySelectorAll(".canvas-page");
      let from = Infinity,
        to = -Infinity;
      e.getLayout().pages.forEach((p, i) => {
        const r = elements[i].getBoundingClientRect();
        if (
          r.bottom < Math.max(vr.top, 0) - 400 ||
          r.top > Math.min(vr.bottom, innerHeight) + 400
        )
          return;
        for (const f of p.fragments) {
          if (typeof f.pmStart === "number") from = Math.min(from, f.pmStart);
          if (typeof f.pmEnd === "number") to = Math.max(to, f.pmEnd);
        }
      });
      const expected = [];
      const thick = Math.max(2, Math.round(3 * g.layout.zoom));
      for (const { alinea: a, fout: f } of s.zichtbareFouten()) {
        const start = e.yrsLocToDisplayPosition({
            story: a.story,
            paraId: a.paraId,
            offset: s.rauw(a, f.start),
          }),
          end = e.yrsLocToDisplayPosition({
            story: a.story,
            paraId: a.paraId,
            offset: s.rauw(a, f.eind, true),
          });
        if (
          start === null ||
          end === null ||
          end <= start ||
          (from <= to && (end < from || start > to))
        )
          continue;
        let rects;
        try {
          rects = g.dom.getRectsForRange(start, end);
        } catch {
          continue;
        }
        for (const rect of rects) {
          const r = g.toOverlayRect(rect);
          if (r && r.width > 0)
            expected.push([
              r.x,
              r.y + r.height - thick - Math.round(r.height * 0.06),
              r.width,
              thick,
            ]);
        }
      }
      const actual = [...layer.querySelectorAll(".spelling-golf")].map((x) =>
        ["left", "top", "width", "height"].map((k) => parseFloat(x.style[k])),
      );
      // CSSOM serialiseert grote paginaposities met minder decimalen. Vergelijk
      // via dezelfde browsernormalisatie als Reacts inline style-toewijzingen.
      const style = document.createElement("span").style;
      for (const r of expected) {
        ["left", "top", "width", "height"].forEach((k, j) => {
          style[k] = `${r[j]}px`;
          r[j] = parseFloat(style[k]);
        });
      }
      return {
        expected: expected.length,
        actual: actual.length,
        afwijkingen: expected
          .flatMap((r, i) =>
            actual[i] && r.some((v, j) => Math.abs(v - actual[i][j]) >= 0.02)
              ? [{ expected: r, actual: actual[i] }]
              : [],
          )
          .slice(0, 3),
        equal:
          expected.length > 0 &&
          expected.length === actual.length &&
          expected.every((r, i) =>
            r.every((v, j) => Math.abs(v - actual[i][j]) < 0.02),
          ),
      };
    });
  result.overlay = await controleerOverlay();
  if (viewportChecks) {
    result.viewportChecks = [];
    const controleer = async (naam) => {
      const start = performance.now();
      await page.waitForTimeout(600);
      let r = await controleerOverlay();
      while (!r.equal && performance.now() - start < 10000) {
        await page.waitForTimeout(200);
        r = await controleerOverlay();
      }
      result.viewportChecks.push({
        naam,
        ...r,
        settledMs: performance.now() - start,
      });
      if (!r.equal)
        throw Error(
          `Spelling overlay differs after ${naam}: ${JSON.stringify(r)}`,
        );
      return r;
    };
    await page.keyboard.press("Control+Home");
    await page.evaluate(() => window.__writerApis.tekst().flushPendingInput());
    await controleer("documentbegin");
    await page.evaluate(() => {
      const v = document
        .querySelector(".spelling-golflijnen")
        .closest(".docx-editor__scroll-container, .docx-editor__viewport");
      const tweede = v
        .querySelectorAll(".canvas-page")[1]
        .getBoundingClientRect();
      v.scrollTop += tweede.top - v.getBoundingClientRect().top - 600;
    });
    const ruim = await controleer("verschoven venster");
    const stijl = await page.evaluate(() => {
      const v = document
        .querySelector(".spelling-golflijnen")
        .closest(".docx-editor__scroll-container, .docx-editor__viewport");
      const oud = v.getAttribute("style");
      v.style.flex = "0 0 140px";
      v.style.height = "140px";
      v.style.maxHeight = "140px";
      return oud;
    });
    const smal = await controleer("editorhoogte zonder window.resize");
    if (ruim.expected === smal.expected)
      throw Error("Resize check did not change the visible page range");
    await page.evaluate((oud) => {
      const v = document
        .querySelector(".spelling-golflijnen")
        .closest(".docx-editor__scroll-container, .docx-editor__viewport");
      if (oud === null) v.removeAttribute("style");
      else v.setAttribute("style", oud);
    }, stijl);
    await controleer("herstelde editorhoogte");
    const zoom = await page.evaluate(() => ({
      value: window.__writerApis.tekst().getZoom(),
      scale: window.__writerSpelling.geometrie.layout.zoom,
    }));
    await page.evaluate(
      (z) => window.__writerApis.tekst().setZoom(z * 0.75),
      zoom.value,
    );
    await page.waitForFunction(
      (z) =>
        Math.abs(window.__writerSpelling.geometrie.layout.zoom - z) < 0.001,
      zoom.scale * 0.75,
    );
    await controleer("zoom 75 procent");
    await page.setViewportSize({ width: 1100, height: 740 });
    await controleer("browservenster");
    const verborgen = await page.evaluate(() => {
      const v = document
        .querySelector(".spelling-golflijnen")
        .closest(".docx-editor__scroll-container, .docx-editor__viewport");
      const oud = v.getAttribute("style");
      v.style.display = "none";
      return oud;
    });
    await page.waitForFunction(
      () => document.querySelectorAll(".spelling-golf").length === 0,
    );
    result.viewportChecks.push({
      naam: "verborgen vlak",
      actual: 0,
      equal: true,
    });
    await page.evaluate((oud) => {
      const v = document
        .querySelector(".spelling-golflijnen")
        .closest(".docx-editor__scroll-container, .docx-editor__viewport");
      if (oud === null) v.removeAttribute("style");
      else v.setAttribute("style", oud);
    }, verborgen);
    await controleer("opnieuw zichtbaar");
  }
  let saved;
  if (checkWarmup) await page.context().setOffline(true);
  try {
    saved = await page.evaluate(async () => {
      const b = await window.__writerApis.tekst().save();
      if (!b) throw Error("Save failed");
      return Array.from(new Uint8Array(b));
    });
    if (checkWarmup) result.offlineSaveAfterWarmup = true;
  } finally {
    if (checkWarmup) await page.context().setOffline(false);
  }
  await page.evaluate(() => {
    window.__previousSession = window.__writerApis
      .tekst()
      .getEditorRef()
      .getYrsSession();
  });
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "saved-performance.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from(saved),
    });
  await page.waitForFunction(
    () =>
      window.__writerApis?.tekst()?.getEditorRef()?.getYrsSession() !==
        window.__previousSession &&
      window.__writerApis
        ?.tekst()
        ?.getEditorRef()
        ?.getYrsSession()
        ?.paragraphs("body").length === 600,
  );
  const reopened = await page.evaluate(() =>
    window.__writerApis
      .tekst()
      .getEditorRef()
      .getYrsSession()
      .paragraphs("body")
      .map((p) => p.text),
  );
  result.savedExact = JSON.stringify(reopened) === JSON.stringify(after);
  fs.writeFileSync(
    `.local/perf-${label}.json`,
    JSON.stringify(result, null, 2),
  );
  console.log("Integrity", {
    contentExact: result.contentExact,
    savedExact: result.savedExact,
    overlay: result.overlay,
    errors,
  });
  if (
    !result.contentExact ||
    !result.savedExact ||
    !result.overlay.equal ||
    errors.length
  )
    process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((r, j) => server.httpServer.close((e) => (e ? j(e) : r())));
}
