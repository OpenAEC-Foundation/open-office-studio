/** Real resident + standalone SDK regression; no GUI or conversion runtime. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { fixture, prepareOracle, auditDocx, MARKER, hash } from "./contract.mjs";
// A nested QA checkout must load the tested application's actual production
// kernel helpers/vendor, not the harness checkout's own copy.
const { openProductieTekstkern } = await import(pathToFileURL(resolve("scripts/tekstkern-productieproef.mjs")));

const [applicationCommit, output] = process.argv.slice(2); assert.match(applicationCommit || "", /^[a-f0-9]{40}$/);
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), applicationCommit);
const root = resolve(output); await mkdir(root, { recursive: true });
const sourceOracle = await prepareOracle(root), font = await readFile("node_modules/@betteroffice/fonts/assets/LiberationSans-Regular.ttf");
assert.equal(hash(font), "76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8");
const report = { applicationCommit, node: process.version, platform: process.platform, status: "failed", checks: [], stages: [], limits: ["Headless SDK only; no native app acceptance"] };
report.harnessSha256 = hash(await readFile(new URL("sdk.mjs", import.meta.url)));
report.contractSha256 = hash(await readFile(new URL("contract.mjs", import.meta.url)));
const check = (name, passed, facts) => report.checks.push({ name, passed: !!passed, facts });
const close = (a, b) => Math.abs(a - b) < 0.01;
const plainRun = field => ({ ...field, kind: "text", text: field.fallback.toUpperCase(), allCaps: false, smallCaps: false,
  fontSlots: undefined, complexScript: false, boldCs: undefined, italicCs: undefined, fontSizeCs: undefined, language: undefined, letterSpacing: 0 });
let kernel, session, reopened;
try {
  kernel = await openProductieTekstkern(join(root, "vite")); report.kernels = kernel.kernen;
  const layout = await import(pathToFileURL(resolve("node_modules/@betteroffice/docx/dist/wasm-layout.mjs")));
  await layout.preloadLayoutWasm(await readFile(process.env.OOS_NOOT_LAYOUT_WASM || "vendor/tekstengine/docx_layout_bg.wasm"));
  const layoutId = layout.registerMeasureFont(font);
  session = await kernel.sdk.createYrsSession(); session.openDocx(await fixture("converted.docx"), true);
  const editId = session.registerFont(font);
  const request = (runs, maxWidth, id) => JSON.stringify({ block: { kind: "paragraph", id: "field374-metrics", runs }, maxWidth,
    fontChains: { "liberation sans|0|0": [id] }, defaults: { fontFamily: "Liberation Sans", fontSize: 32 }, authoritativeShaping: true });
  const engines = [{ name: "resident edit WASM", id: editId, measure: input => JSON.parse(session.measureParagraphJson(input)) },
    { name: "standalone layout WASM", id: layoutId, measure: input => JSON.parse(layout.measureParagraphJson(input)) }];
  for (const engine of engines) {
    for (const [cached, displayed, tracking] of [["Report Title", "REPORT TITLE", 16 / 3], ["straße", "STRASSE", 2.25], ["iki", "IKI", 0]]) {
      const field = { kind: "field", fallback: cached, allCaps: true, letterSpacing: tracking, language: { latin: "tr-TR" } };
      const before = JSON.stringify(field), actual = engine.measure(request([field], 2000, engine.id));
      const base = engine.measure(request([{ kind: "text", text: displayed }], 2000, engine.id)).lines[0].width;
      const expected = base + tracking * ([...displayed].length - 1);
      check(`${engine.name}: displayed field advance ${cached}`, close(actual.lines[0].width, expected), { actual: actual.lines[0].width, expected, tracking });
      check(`${engine.name}: one field unit and unchanged cache ${cached}`, actual.lines[0].tailChar === 1 && JSON.stringify(field) === before);
    }
    const baseline = JSON.parse(await readFile(new URL("p2-noncaps-baseline.json", import.meta.url), "utf8"));
    for (const [text, width] of Object.entries(baseline.nonCaps)) {
      const measured = engine.measure(request([{ kind: "field", fallback: text, allCaps: false }], 2000, engine.id)).lines[0].width;
      check(`${engine.name}: unchanged ordinary P2 field ${text}`, close(measured, width), { actual: measured, p2: width });
    }
    const field = { kind: "field", fallback: "Report Title", allCaps: true, letterSpacing: 16 / 3 };
    const painted = engine.measure(request([{ kind: "text", text: "REPORT TITLE" }], 2000, engine.id)).lines[0].width + (16 / 3) * 11;
    const suffix = { kind: "text", text: " NEXT" }, suffixWidth = engine.measure(request([suffix], 2000, engine.id)).lines[0].width;
    const wrapped = engine.measure(request([field, suffix], painted + suffixWidth - 1, engine.id));
    check(`${engine.name}: adjacent text wraps after full painted field`, wrapped.lines.length === 2 && wrapped.lines[1].headRun === 1, { lines: wrapped.lines });
    const primary = engine.measure(request([{ kind: "field", fallback: "Report Title", allCaps: true,
      fontSlots: { ascii: "Not registered", cs: "Not registered" }, complexScript: true, boldCs: true, fontSizeCs: 8 }], 2000, engine.id));
    const ordinaryTextWidth = engine.measure(request([{ kind: "text", text: "REPORT TITLE" }], 2000, engine.id)).lines[0].width;
    check(`${engine.name}: resolved primary field font policy retained`, close(primary.lines[0].width, ordinaryTextWidth), { actual: primary.lines[0].width, expected: ordinaryTextWidth });
    const scaled = engine.measure(request([{ ...field, horizontalScale: 150 }], 2000, engine.id));
    check(`${engine.name}: field visual scale includes tracking once`, close(scaled.lines[0].width, painted * 1.5),
      { actual: scaled.lines[0].width, expected: painted * 1.5, scalePercent: 150, tracking: 16 / 3 });
  }
  // Both private stores are registered above; this font id stays stable across
  // edit/Undo/Redo/layout, so a new font registration cannot mask stale geometry.
  function frame(s, id, marker, phase) {
    const query = { bodyStory: "body", renderEnv: {}, options: { pageGap: 24 }, regions: { sections: [{ properties: {} }] } };
    const fonts = JSON.parse(s.layoutFontRequirementsJson(JSON.stringify(query)));
    const data = s.layoutDocumentWithRegionsJson(JSON.stringify({ ...query, measurement: {
      fontChains: Object.fromEntries(fonts.map(f => [f.key, [id]])), defaults: { fontFamily: "Liberation Sans", fontSize: 11 }, authoritativeShaping: true } }));
    const display = JSON.parse(s.buildDisplayListJson(data));
    const parts = display.pages.flatMap(p => p.primitives).filter(p => p.blockKey === "body:p0" && p.kind === "text");
    const title = parts.find(p => p.field?.type === "DOCVARIABLE" && p.field.instruction === "DOCVARIABLE Report");
    assert(title); check(`${phase}: original field, cache and tracking`, title.text === "Report Title" && title.allCaps && title.docEnd - title.docStart === 1 && close(title.letterSpacing, 16 / 3));
    const block = s.yrsBlocksForStory("body")[0], field = block.runs.find(r => r.kind === "field");
    const reference = { ...block, runs: [plainRun(field)] };
    const fontChains = Object.fromEntries(fonts.map(f => [f.key, [id]]));
    const base = JSON.parse(s.measureParagraphJson(JSON.stringify({ block: reference, maxWidth: 2000, fontChains,
      defaults: { fontFamily: "Liberation Sans", fontSize: 32 }, authoritativeShaping: true }))).lines[0].width;
    const expected = base + field.letterSpacing * ([...field.fallback.toUpperCase()].length - 1);
    check(`${phase}: real source field reserves painted width`, close(title.width, expected), { actual: title.width, expected });
    const neighbors = parts.filter(p => !p.field && p.docStart >= title.docEnd && Math.abs(p.baselineY - title.baselineY) < 0.02 && p.text.trim());
    check(`${phase}: next run starts outside field`, neighbors.every(p => p.x >= title.x + expected - 0.02), { titleX: title.x, expectedRight: title.x + expected, neighbors });
    const text = parts.sort((a, b) => a.docStart - b.docStart).map(p => p.text).join("");
    check(`${phase}: full source and ordinary suffix painted`, text === "Report Title" + marker, { text, expected: "Report Title" + marker });
    report.stages.push({ phase, title, neighbors, text }); return display;
  }
  await writeFile(join(root, "before-display.json"), JSON.stringify(frame(session, editId, "", "before edit"), null, 2));
  const at = { story: "body", paraId: session.paragraphs("body")[0].paraId, offset: 1 };
  session.setSelection(at); session.beginUndoCapture("body"); session.addUndoBoundary();
  session.insertText(at, MARKER); session.addUndoBoundary(); frame(session, editId, MARKER, "after edit");
  session.undo(); frame(session, editId, "", "after Undo"); session.redo(); frame(session, editId, MARKER, "after Redo");
  const saved = (await kernel.sdk.saveYrsDocx(session)).bytes;
  report.saved = await auditDocx(saved, root, "saved", sourceOracle, MARKER);
  session.destroy(); session = undefined;
  reopened = await kernel.sdk.createYrsSession(); reopened.openDocx(saved, true); const againId = reopened.registerFont(font);
  await writeFile(join(root, "reopened-display.json"), JSON.stringify(frame(reopened, againId, MARKER, "fresh session reopen"), null, 2));
  const again = (await kernel.sdk.saveYrsDocx(reopened)).bytes;
  report.reopened = await auditDocx(again, root, "reopened", sourceOracle, MARKER);
  report.status = report.checks.every(c => c.passed) ? "passed" : "failed-regression";
  if (report.status !== "passed") process.exitCode = 1;
} catch (error) { report.error = String(error.stack || error); process.exitCode = 1; }
finally {
  session?.destroy(); reopened?.destroy(); await kernel?.sluit();
  report.cleanup = { sessionsDestroyed: true, privateKernelClosed: !!kernel, guiStarted: false };
  await writeFile(join(root, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failed: report.checks.filter(c => !c.passed).map(c => c.name), error: report.error }));
}
