/** Real Mac keyboard placement, checked against rendered title/caret geometry. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { hash } from "./contract.mjs";

export async function moveMacCaretToCachedFieldEnd({ page, root }) {
  const paint = JSON.parse(await readFile(join(root, "unmodified-control-paint.json"), "utf8"));
  assert.equal(paint.title.text, "REPORT TITLE");
  // In pinned YrsInput, Home/End receive metaKey||ctrlKey as wholeDocument;
  // Meta+ArrowUp/Right are not a reliable document-start/field-end contract.
  // The unchanged first paragraph contains exactly the original atomic field.
  await page.keyboard.press("Meta+Home");
  await page.keyboard.press("End");
  let placement;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    placement = await page.evaluate(title => {
      const canvas = document.querySelector(".canvas-page canvas"), r = canvas?.getBoundingClientRect();
      const input = document.activeElement;
      const focused = !!input?.matches('[data-testid="yrs-input"][data-yrs-story="body"]');
      if (!r || !r.width || !r.height) return { ready: false, reason: "No rendered page canvas" };
      const sx = r.width / title.canvasWidth, sy = r.height / title.canvasHeight;
      const inkRight = r.left + title.inkRight * sx, baseline = r.top + title.y * sy;
      const fontPx = Number(/([\d.]+)px/.exec(title.font)?.[1]);
      const carets = [...document.querySelectorAll('[data-testid="caret"]')].map(el => {
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      }).filter(b => b.width > 0 && b.height > 0);
      // Source has one atomic field and no adjacent text: the rendered caret
      // must be just past its ink, on that same line, with the input focused.
      const atEnd = carets.find(b => b.x >= inkRight - 1 && b.x <= inkRight + fontPx * sx / 2
        && b.y <= baseline && b.y + b.height >= baseline - 2);
      return { ready: !!atEnd && focused, focused,
        expectedInkRight: inkRight, expectedBaseline: baseline, maxRightGap: fontPx * sx / 2, carets, atEnd };
    }, paint.title);
    if (placement.ready) break;
    await delay(100);
  }
  const report = { method: "Actual Meta+Home then End; read-only DOM caret versus original observed title ink",
    helperSha256: hash(await readFile(new URL("mac-field-caret.mjs", import.meta.url))),
    sourcePaintSha256: hash(await readFile(join(root, "unmodified-control-paint.json"))),
    ...placement, scope: "Driver preflight only; no model or selection setter, no document mutation" };
  await writeFile(join(root, "mac-caret-preflight.json"), JSON.stringify(report, null, 2));
  assert(placement?.ready, "Mac caret is not at the original cached-field end; driver failure before typing");
  await page.screenshot({ path: join(root, "mac-caret-preflight.png"), animations: "allow" });
  return report;
}
