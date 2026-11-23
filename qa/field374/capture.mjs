/** Wait for passive presentation; retain original screenshots without pixel edits. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { hash } from "./contract.mjs";

const signature = observation => JSON.stringify([
  observation.source, observation.title.context, observation.title.frame,
  observation.frame.map(run => run.seq),
]);

export async function capturePresentedStableFrame({ page, findObservation, root, name }) {
  // Two rAFs plus the actual screenshot already pace presentation. On Mac,
  // omit the extra100ms: the measured276ms cadence straddled the530ms DOM blink.
  const extraInterSampleDelayMs = process.platform === "darwin" ? 0 : 100;
  const samples = [], deadline = Date.now() + 15000;
  let previous, stableSince = 0, consecutive = 0, lastPng;
  while (Date.now() < deadline) {
    // Worker paint completion precedes presentation. Let the actual compositor
    // advance without changing focus, input, document data or the page canvas.
    await page.evaluate(() => new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const before = await findObservation();
    if (!before) { previous = undefined; consecutive = 0; await delay(100); continue; }
    const png = await page.screenshot({ animations: "allow", caret: "hide" });
    lastPng = png;
    if (!samples.length) await writeFile(join(root, name + "-capture-first.png"), png);
    const after = await findObservation(), now = Date.now();
    const current = after && signature(before) === signature(after)
      ? signature(after) + ":" + hash(png) : undefined;
    if (current && current === previous) consecutive++;
    else { consecutive = current ? 1 : 0; stableSince = now; }
    previous = current;
    samples.push({ at: new Date(now).toISOString(), pngSha256: hash(png),
      completePaintUnchangedDuringCapture: !!current, consecutive,
      stableForMs: now - stableSince, paintSignature: after ? signature(after) : null });
    if (consecutive >= 3 && now - stableSince >= 200) {
      await writeFile(join(root, name + ".png"), png);
      const evidence = { status: "stable-original-PNG-captured", doubleAnimationFramesPerSample: true,
        extraInterSampleDelayMs,
        requiredConsecutive: 3, requiredStableMs: 200, samples,
        acceptedPngSha256: hash(png), markerReview: "Review the original PNG; worker glyph records and pixel stability alone do not establish visible marker text." };
      await writeFile(join(root, name + "-capture.json"), JSON.stringify(evidence, null, 2));
      return { observation: after, evidence };
    }
    if (extraInterSampleDelayMs) await delay(extraInterSampleDelayMs);
  }
  if (lastPng) await writeFile(join(root, name + "-capture-last.png"), lastPng);
  await writeFile(join(root, name + "-capture.json"), JSON.stringify({ status: "driver-failure-no-stable-presented-capture", extraInterSampleDelayMs, samples }, null, 2));
  assert.fail(`${name}: stable original PNG after complete paint not acquired; driver failure, no visual pass`);
}
