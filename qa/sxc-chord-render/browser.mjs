/** Real browser XLSX interaction plus separately labeled production canvas checks. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
import { unzipSync } from "fflate";

assert.equal(
  process.env.GITHUB_ACTIONS,
  "true",
  "Own disposable CI only; no local browser",
);
assert.equal(process.platform, "linux");
const out = resolve(process.argv[2]);
await mkdir(out);
const source = await readFile(
  "qa/sxc-chord-render/fixtures/calcshapes-converted.xlsx",
);
const hash = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(
  hash(source),
  "7b3410fa3b5cb0897bf6a4caf61390e65199aa5e9f5c1f95f3025c49932c1196",
);
const sourceHash = hash(
  await readFile("qa/sxc-chord-render/fixtures/calcshapes.sxc"),
);
assert.equal(
  sourceHash,
  "9a367d8e849001453b7d5684401f769abd63a621165ea3878da9d64b6fe2de2d",
);
const report = {
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  sourceTree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
    encoding: "utf8",
  }).trim(),
  scope:
    "Linux Chromium actual browser / and /office/ XLSX edit/save/fresh context reopen; separate production print-canvas component checks. Not native acceptance or SXC browser import.",
  routes: [],
  cleanup: {},
  status: "failed",
};
let browser, server, context, page;
function objectParts(bytes) {
  return Object.fromEntries(
    Object.entries(unzipSync(bytes))
      .filter(([n]) =>
        /^(xl\/(drawings|ctrlProps|media)\/|xl\/comments)/.test(n),
      )
      .map(([n, b]) => [n, hash(b)]),
  );
}
const objects = objectParts(source);
async function fresh(route, errors) {
  context = await browser.newContext({
    acceptDownloads: true,
    locale: "en-US",
    viewport: { width: 1400, height: 1000 },
  });
  await context.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({
        taal: "en",
        thema: "light",
        spelling: { controleren: false, autocorrectie: false },
      }),
    ),
  );
  page = await context.newPage();
  page.setDefaultTimeout(45000);
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}${route}`,
  );
  assert.equal(new URL(page.url()).pathname, route);
  assert.equal(
    await page.evaluate(() => typeof window.__TAURI_INTERNALS__),
    "undefined",
  );
}
async function open(bytes, name) {
  await page
    .locator(".office > input[type=file]")
    .setInputFiles({
      name,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: bytes,
    });
  await page.locator('[data-testid="xlsx-formula-input"]:visible').waitFor();
}
async function cell(address) {
  const box = page.locator(".rekenblad-naamvak");
  await box.click();
  await box.fill(address);
  await box.press("Enter");
  return page.locator('[data-testid="xlsx-formula-input"]:visible');
}
async function visible(stage) {
  const c13 = await cell("C13");
  assert.equal(await c13.inputValue(), "Note attached");
  const o = page.locator('.rekenblad-tekenobject[data-object-id="3"]');
  await o.waitFor();
  assert(!(await o.getAttribute("class")).includes("is-onbekend"));
  const path = o.locator("svg path");
  await path.waitFor({ state: "visible" });
  const geometry = await path.evaluate((el) => ({
    d: el.getAttribute("d"),
    fill: el.getAttribute("fill"),
    stroke: el.getAttribute("stroke"),
    viewBox: el.ownerSVGElement.getAttribute("viewBox"),
    length: el.getTotalLength(),
  }));
  assert.equal(geometry.fill, "#99CCFF");
  assert(geometry.length > 50);
  const [, , w, h] = geometry.viewBox.split(" ").map(Number);
  const ray = (a) => {
    const t = (a * Math.PI) / 10800000,
      rx = w / 2,
      ry = h / 2,
      r = (rx * ry) / Math.hypot(ry * Math.cos(t), rx * Math.sin(t));
    return [rx + r * Math.cos(t), ry + r * Math.sin(t)];
  };
  const values = geometry.d
    .match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)
    .map(Number);
  const start = ray(7798761),
    end = ray(347606);
  assert.equal(values.length, 9);
  assert.equal(values[5], 1);
  assert.equal(values[6], 1);
  for (const [a, b] of [
    [values[0], start[0]],
    [values[1], start[1]],
    [values[7], end[0]],
    [values[8], end[1]],
  ])
    assert(Math.abs(a - b) < 1e-8);
  await cell("A1");
  await page.screenshot({ path: `${out}/${stage}.png` });
  return geometry;
}
async function save(name) {
  await page
    .locator('[data-testid="xlsx-scroll"]')
    .click({ position: { x: 700, y: 25 } });
  await page.keyboard.press("Control+Shift+s");
  const dialog = page.getByRole("dialog", { name: "Save as", exact: true });
  await dialog.waitFor();
  assert.equal(
    await dialog.locator("input[type=radio]:checked").inputValue(),
    "xlsx",
  );
  await dialog.locator("input").first().fill(name);
  const pending = page.waitForEvent("download");
  void pending.catch(() => {});
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  const download = await pending;
  await download.saveAs(`${out}/${name}`);
  const saved = await readFile(`${out}/${name}`);
  assert.deepEqual(objectParts(saved), objects);
  return saved;
}
async function edit(address, value) {
  const input = await cell(address);
  await input.click();
  assert(await input.evaluate((e) => e === document.activeElement));
  await input.fill(value);
  await input.press("Enter");
}
async function marker(wanted) {
  const input = await cell("H1");
  assert.equal(await input.inputValue(), wanted);
  const formula = await cell("I1");
  assert.equal(await formula.inputValue(), "=40+2");
  assert.match(
    await page
      .locator(
        '[data-oos-rastercel][aria-colindextext="I"][aria-rowindextext="1"]',
      )
      .getAttribute("aria-label"),
    /42/,
  );
}
async function history(key) {
  await cell("H1");
  const o = page.locator(
    '[data-oos-rastercel][aria-colindextext="H"][aria-rowindextext="1"]',
  );
  const r = await o.boundingBox();
  assert(r && r.width && r.height);
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  assert(
    await page.evaluate(() => {
      const e = document.activeElement,
        g = document.querySelector('[data-testid="xlsx-scroll"]');
      return !!g && (e === g || g.contains(e));
    }),
  );
  await page.keyboard.press(key);
}
try {
  browser = await chromium.launch({ headless: true });
  for (const [index, route] of ["/", "/office/"].entries()) {
    server = await createServer({
      base: route,
      cacheDir: `.local/chord-vite-${index}`,
      server: {
        host: "127.0.0.1",
        port: 0,
        open: false,
        hmr: false,
        watch: null,
      },
    });
    await server.listen();
    const result = { route, errors: [], status: "failed" };
    report.routes.push(result);
    await fresh(route, result.errors);
    await open(source, "calcshapes-converted.xlsx");
    result.originalGeometry = await visible(`route${index}-original`);
    const baseline = await save(`route${index}-preflight.xlsx`);
    await context.close();
    context = undefined;
    await fresh(route, result.errors);
    await open(baseline, `route${index}-preflight.xlsx`);
    await visible(`route${index}-preflight-reopened`);
    result.shortPreflight = {
      focus: true,
      platformKeys: "Linux Control",
      actualSaveDownload: true,
      closedContextAndFreshReopen: true,
    };
    await edit("I1", "=40+2");
    await edit("H1", "QA_CHORD_380");
    await marker("QA_CHORD_380");
    await history("Control+z");
    await marker("");
    await history("Control+y");
    await marker("QA_CHORD_380");
    const saved = await save(`route${index}-edited.xlsx`);
    await context.close();
    context = undefined;
    await fresh(route, result.errors);
    await open(saved, `route${index}-edited.xlsx`);
    await marker("QA_CHORD_380");
    result.reopenedGeometry = await visible(`route${index}-edited-reopened`);
    const again = await save(`route${index}-reopened.xlsx`);
    result.outputHashes = {
      preflight: hash(baseline),
      edited: hash(saved),
      reopened: hash(again),
    };
    assert.deepEqual(objectParts(again), objects);
    // Separate component test: real production print renderer, real canvas,
    // synthetic transform/minor/full-turn copies of the genuine parsed shape.
    if (index === 0) {
      report.canvas = await page.evaluate(
        async (sourceBytes) => {
          const { leesTekenobjecten } = await import(
            "/src/rekenblad/tekenobjecten.ts"
          );
          const { tekenObjectenOpCanvas } = await import(
            "/src/rekenblad/tekenobjectCanvas.ts"
          );
          const original = leesTekenobjecten(Uint8Array.from(sourceBytes)).find(
            (o) => o.vorm === "chord",
          );
          const cases = [
            {
              name: "source-major",
              w: 200,
              h: 100,
              rotation: 0,
              x: false,
              y: false,
              begin: 7798761,
              einde: 347606,
            },
            {
              name: "minor-flip",
              w: 100,
              h: 200,
              rotation: 30,
              x: true,
              y: false,
              begin: 0,
              einde: 5400000,
            },
            {
              name: "major-rotated",
              w: 200,
              h: 100,
              rotation: 270,
              x: false,
              y: true,
              begin: 2700000,
              einde: 16200000,
            },
            {
              name: "full-turn",
              w: 200,
              h: 100,
              rotation: 0,
              x: false,
              y: false,
              begin: 0,
              einde: 0,
            },
          ];
          const result = [];
          for (const v of cases) {
            const canvas = document.createElement("canvas");
            canvas.width = 400;
            canvas.height = 400;
            const c = canvas.getContext("2d");
            const o = {
              ...original,
              plek: { row: 0, col: 0, x: 80, y: 80, breedte: v.w, hoogte: v.h },
              einde: undefined,
              rotatie: v.rotation,
              spiegelX: v.x,
              spiegelY: v.y,
              chord: { begin: v.begin, einde: v.einde },
            };
            await tekenObjectenOpCanvas(
              c,
              { cellPosition: () => ({ x: 0, y: 0 }) },
              [o],
              { rij1: 0, kol1: 0 },
              400,
              400,
              0,
              0,
              1,
            );
            const image = c.getImageData(0, 0, 400, 400),
              rx = v.w / 2,
              ry = v.h / 2;
            const ray = (a) => {
              const t = (a * Math.PI) / 10800000,
                r = (rx * ry) / Math.hypot(ry * Math.cos(t), rx * Math.sin(t));
              return { x: rx + r * Math.cos(t), y: ry + r * Math.sin(t) };
            };
            const s = ray(v.begin),
              e = ray(v.einde),
              dx = e.x - s.x,
              dy = e.y - s.y,
              len = Math.hypot(dx, dy),
              angle = (v.rotation * Math.PI) / 180,
              cos = Math.cos(angle),
              sin = Math.sin(angle);
            let checked = 0,
              inside = 0;
            const mismatches = [];
            // A quarter ellipse has a small chord segment. Sample every2px,
            // keeping the original minimum interior coverage and zero mismatches.
            for (let y = 1; y < 400; y += 2)
              for (let x = 1; x < 400; x += 2) {
                const xx = x + 0.5 - (80 + rx),
                  yy = y + 0.5 - (80 + ry);
                let px = cos * xx + sin * yy,
                  py = -sin * xx + cos * yy;
                if (v.x) px = -px;
                if (v.y) py = -py;
                px += rx;
                py += ry;
                const ellipse = ((px - rx) / rx) ** 2 + ((py - ry) / ry) ** 2,
                  cross = dx * (py - s.y) - dy * (px - s.x);
                if (
                  Math.abs(ellipse - 1) < 0.06 ||
                  (len > 1e-8 && Math.abs(cross) / len < 2)
                )
                  continue;
                const filled =
                    ellipse < 1 && (v.begin === v.einde || cross < 0),
                  i = (y * 400 + x) * 4;
                const actual =
                  image.data[i + 3] > 200 &&
                  image.data[i] === 153 &&
                  image.data[i + 1] === 204 &&
                  image.data[i + 2] === 255;
                checked++;
                if (filled) inside++;
                if (actual !== filled && mismatches.length < 12)
                  mismatches.push({
                    x,
                    y,
                    filled,
                    pixel: [...image.data.slice(i, i + 4)],
                  });
              }
            result.push({
              case: v.name,
              checked,
              inside,
              mismatches,
              png: canvas.toDataURL("image/png"),
            });
          }
          return result;
        },
        [...source],
      );
      for (const c of report.canvas) {
        await writeFile(
          `${out}/canvas-${c.case}.png`,
          Buffer.from(c.png.split(",")[1], "base64"),
        );
        delete c.png;
      }
      for (const c of report.canvas) {
        assert(c.checked > 1500 && c.inside > 100);
        assert.deepEqual(c.mismatches, []);
      }
    }
    assert.deepEqual(result.errors, []);
    result.status = "passed-browser-source-edit-undo-redo-save-fresh-reopen";
    await context.close();
    context = undefined;
    await server.close();
    server = undefined;
  }
  assert.equal(
    hash(await readFile("qa/sxc-chord-render/fixtures/calcshapes.sxc")),
    sourceHash,
  );
  assert.equal(
    hash(
      await readFile("qa/sxc-chord-render/fixtures/calcshapes-converted.xlsx"),
    ),
    hash(source),
  );
  report.sourceUnchanged = true;
  report.status = "passed-scoped-browser-and-canvas";
} catch (error) {
  report.error = String(error.stack || error);
  try {
    await page?.screenshot({ path: `${out}/failure.png` });
    report.failureBody = await page?.locator("body").innerText();
  } catch {}
  throw error;
} finally {
  await context?.close();
  await browser?.close();
  await server?.close();
  report.cleanup = {
    ownContextsClosed: true,
    ownBrowserClosed: true,
    ownServerClosed: true,
    noLocalGuiOrRecording: true,
  };
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + "\n");
}
