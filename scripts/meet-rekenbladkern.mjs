/** Meet de echte productie-WASM geïsoleerd; dit is geen bewijs voor de GUI-workerroute. */
import assert from "node:assert/strict";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
const map = process.env.OOS_PRESTATIE_UIT ?? ".local/prestatie/rekenbladen";
const wasmPad = process.env.OOS_PRESTATIE_WASM ?? "vendor/rekenbladengine/xlsx_wasm_bg.wasm";
if (!isMainThread) {
  const { initWasm, openWorkbook } = await import("@betteroffice/xlsx");
  await initWasm(await readFile(wasmPad));
  const bytes = new Uint8Array(await readFile(`${map}/${workerData.bestand}`));
  const start = performance.now(); parentPort.postMessage({ stap: "open" });
  const h = openWorkbook(bytes), openMs = performance.now() - start;
  try {
    const begin = performance.now(); h.displayList({ x: 0, y: 0, width: 1200, height: 800 });
    const tekenMs = performance.now() - begin;
    assert.equal(h.cell(0, 0, 0).input, "1");
    if (!workerData.formules) {
      assert.equal(h.cell(0, workerData.rijen - 1, workerData.kolommen - 1).input,
        String((workerData.rijen + workerData.kolommen - 1) % 1000));
    }
    let editMs = null;
    if (workerData.formules) {
      parentPort.postMessage({ stap: "recalculate" });
      const edit = performance.now(); h.editCell(0, 0, 0, "2"); editMs = performance.now() - edit;
      const r = h.readCells({ ranges: [{ sheetId: h.sheetInfo().sheetIds[0], range: { kind: "a1", a1: "B50000" } }] });
      assert.equal(r.ok, true); assert.deepEqual(r.ranges[0].cells[0][0].value, { kind: "number", value: 50004 });
    }
    parentPort.postMessage({ resultaat: { naam: workerData.naam, openMs: Math.round(openMs), tekenMs: Math.round(tekenMs), herberekenMs: editMs === null ? null : Math.round(editMs), rssMiB: Math.round(process.memoryUsage().rss / 1048576) } });
  } finally { h.dispose(); }
} else {
  const rapport = [];
  const wasmSha256 = createHash("sha256").update(await readFile(wasmPad)).digest("hex");
  for (const fixture of JSON.parse(await readFile(`${map}/manifest.json`, "utf8"))) {
    if (process.env.OOS_PRESTATIE_GEVAL && fixture.naam !== process.env.OOS_PRESTATIE_GEVAL) continue;
    let timer, limiet;
    const gestart = performance.now();
    let fase = "initialisatie", piekRssMiB = process.memoryUsage().rss / 1048576;
    try {
      const resultaat = await new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: fixture, resourceLimits: { maxOldGenerationSizeMb: 1024 } });
        const maxMs = Number(process.env.OOS_OPEN_MAX_MS ?? 60000), maxMiB = Number(process.env.OOS_OPEN_MAX_MIB ?? 1800);
        timer = setTimeout(() => { void worker.terminate(); reject(new Error(`${maxMs}-ms benchmark limit`)); }, maxMs);
        limiet = setInterval(() => { const rss = process.memoryUsage().rss; piekRssMiB = Math.max(piekRssMiB, rss / 1048576); if (rss > maxMiB * 1048576) { void worker.terminate(); reject(new Error(`${maxMiB}-MiB benchmark process limit`)); } }, 100);
        worker.on("message", (m) => { if (m.resultaat) resolve(m.resultaat); else { fase = m.stap; console.log(`${fixture.naam}: ${m.stap}`); } });
        worker.on("error", reject);
        worker.on("exit", (code) => { if (code) reject(new Error(`worker exit ${code}`)); });
      });
      const gemeten = { ...resultaat, piekRssMiB: Math.round(piekRssMiB), wasmSha256 };
      rapport.push(gemeten); console.log(JSON.stringify(gemeten));
    } catch (e) { const gemeten = { naam: fixture.naam, fout: String(e), fase, verstrekenMs: Math.round(performance.now() - gestart), piekRssMiB: Math.round(piekRssMiB), wasmSha256 }; rapport.push(gemeten); console.log(JSON.stringify(gemeten)); }
    finally { clearTimeout(timer); clearInterval(limiet); await writeFile(`${map}/kern-rapport.json`, JSON.stringify(rapport, null, 2)); }
  }
  if (rapport.some((r) => r.fout)) process.exitCode = 1;
}
