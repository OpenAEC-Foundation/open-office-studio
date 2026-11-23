/** Real Mac keyboard placement, checked against rendered title/caret geometry. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { hash } from "./contract.mjs";
import { queryAtomicFieldEndProjection } from "./field-caret-projection.mjs";

export async function moveMacCaretToCachedFieldEnd({ page, root }) {
  const paint = JSON.parse(await readFile(join(root, "unmodified-control-paint.json"), "utf8"));
  assert.equal(paint.title.text, "REPORT TITLE");
  // The atomic cached-field end projects after its first cached grapheme in
  // this pinned query implementation. Derive that coordinate from retained
  // immutable SDK output using the actual current WASM, not an ink-edge guess.
  const oracle = await readFile(new URL("./evidence/p4-mac-caret-projection/original-mac-sdk-display.json", import.meta.url));
  assert.equal(hash(oracle), "b21b029956c60102c693a30a0b1c0924067edb47ace85a218874c1b76faa0f10");
  const projection = await queryAtomicFieldEndProjection(oracle);
  assert.equal(paint.title.font, projection.field.font.replace(/^400 /, ""));
  assert(Math.abs(paint.title.x - projection.field.x) < 0.001, "Unmodified title must match the bound projection fixture");
  const font = await readFile(resolve("node_modules/@betteroffice/fonts/assets/LiberationSans-Regular.ttf"));
  assert.equal(hash(font), "76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8");
  const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  assert(paint.title.transform && Object.entries(identity).every(([key, expected]) =>
    Number.isFinite(paint.title.transform[key]) && Math.abs(paint.title.transform[key] - expected) <= 1e-9),
    "Require the fixture's actual identity Canvas transform");
  const projectedOffset = projection.queriedCaretEdge - projection.field.x;
  // In pinned YrsInput, Home/End receive metaKey||ctrlKey as wholeDocument;
  // Meta+ArrowUp/Right are not a reliable document-start/field-end contract.
  // The unchanged first paragraph contains exactly the original atomic field.
  await page.keyboard.press("Meta+Home");
  await page.keyboard.press("End");
  let placement;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    placement = await page.evaluate(({ title, projectedOffset }) => {
      const canvas = document.querySelector(".canvas-page canvas"), r = canvas?.getBoundingClientRect();
      const input = document.activeElement;
      const focused = !!input?.matches('[data-testid="yrs-input"][data-yrs-story="body"]');
      if (!r || !r.width || !r.height) return { ready: false, reason: "No rendered page canvas" };
      const sx = r.width / title.canvasWidth, sy = r.height / title.canvasHeight;
      if (Math.abs(sx - 1) > 1e-6 || Math.abs(sy - 1) > 1e-6)
        return { ready: false, reason: "Projection fixture requires the source-bound 1:1 CSS/backing-canvas transform", sx, sy };
      const inkRight = r.left + title.inkRight * sx, baseline = r.top + title.y * sy;
      const projectedEnd = r.left + (title.x + projectedOffset) * sx;
      const carets = [...document.querySelectorAll('[data-testid="caret"]')].map(el => {
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      }).filter(b => b.width > 0 && b.height > 0);
      // Match the source-proven projection of model docEnd2. This does not
      // assert that the visual blink caret sits at the full cached ink edge.
      const atEnd = carets.find(b => Math.abs(b.x - projectedEnd) <= 0.25
        && b.y <= baseline && b.y + b.height >= baseline - 2);
      return { ready: !!atEnd && focused, focused,
        expectedInkRight: inkRight, expectedBaseline: baseline, expectedProjectedModelEnd: projectedEnd,
        projectionToleranceCssPx: 0.25, carets, atEnd,
        fullInkEdgeMatched: !!atEnd && Math.abs(atEnd.x - inkRight) <= 1 };
    }, { title: paint.title, projectedOffset });
    if (placement.ready) break;
    await delay(100);
  }
  const report = { method: "Actual Meta+Home then End; read-only DOM caret versus current-WASM projection of original atomic model end",
    helperSha256: hash(await readFile(new URL("mac-field-caret.mjs", import.meta.url))),
    sourcePaintSha256: hash(await readFile(join(root, "unmodified-control-paint.json"))),
    projectionOracle: projection,
    fontBinding: { packageFontSha256: hash(font), canvasFont: paint.title.font },
    canvasTransform: paint.title.transform,
    ...placement, scope: "Driver preflight only; no model or selection setter, no document mutation" };
  await writeFile(join(root, "mac-caret-preflight.json"), JSON.stringify(report, null, 2));
  assert(placement?.ready, "Mac caret is not at the original cached-field end; driver failure before typing");
  await page.screenshot({ path: join(root, "mac-caret-preflight.png"), animations: "allow" });
  return report;
}
