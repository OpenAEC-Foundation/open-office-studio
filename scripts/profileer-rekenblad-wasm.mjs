/** Diagnostic CPU samples, bounded independently of the acceptance benchmark. */
import assert from "node:assert/strict";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";

if (!isMainThread) {
  const { initWasm, openWorkbook } = await import("@betteroffice/xlsx");
  await initWasm(await readFile(workerData.wasm));
  const bytes = new Uint8Array(await readFile(workerData.file));
  parentPort.on("message", (message) => {
    if (message !== "start") return;
    const start = performance.now();
    const handle = openWorkbook(bytes);
    parentPort.postMessage({ done: true, openMs: performance.now() - start });
    handle.dispose();
  });
  parentPort.postMessage({ ready: true });
} else {
  const out = process.env.OOS_PROFILE_OUT ?? ".local/openprofiel-cpu";
  await mkdir(out, { recursive: true });
  const wasm =
    process.env.OOS_PROFILE_WASM ??
    ".local/open-kandidaat/xlsx_wasm_profile.wasm";
  const file =
    process.env.OOS_PROFILE_FILE ??
    ".local/prestatie/rekenbladen/100k-rijen-30-kolommen.xlsx";
  const duration = Math.min(
    20000,
    Math.max(100, Number(process.env.OOS_PROFILE_MS ?? 20000)),
  );
  const delay = Math.min(
    35000,
    Math.max(0, Number(process.env.OOS_PROFILE_DELAY_MS ?? 0)),
  );
  const worker = new Worker(new URL(import.meta.url), {
    workerData: { wasm, file },
    resourceLimits: { maxOldGenerationSizeMb: 512 },
  });
  let peakRssMiB = process.memoryUsage().rss / 1048576;
  let fail, ready, finish;
  const errors = new Promise((_, reject) => {
    fail = reject;
  });
  const prepared = new Promise((resolve) => {
    ready = resolve;
  });
  const completed = new Promise((resolve) => {
    finish = resolve;
  });
  worker.on("message", (message) => {
    if (message.ready) ready();
    if (message.done) finish({ reason: "completed", openMs: message.openMs });
  });
  worker.on("error", fail);
  const memory = setInterval(() => {
    peakRssMiB = Math.max(peakRssMiB, process.memoryUsage().rss / 1048576);
    if (peakRssMiB > 1800) {
      fail(new Error("1800MiB diagnostic memory guard"));
      void worker.terminate();
    }
  }, 100);
  const initialization = setTimeout(
    () => fail(new Error("10s profile initialization guard")),
    10000,
  );
  let timer, stopping, delaying, starting;
  try {
    await Promise.race([prepared, errors]);
    clearTimeout(initialization);
    if (delay) {
      worker.postMessage("start");
      await Promise.race([
        completed,
        errors,
        new Promise((resolve) => {
          delaying = setTimeout(resolve, delay);
        }),
      ]);
    }
    const handle = await Promise.race([
      worker.startCpuProfile(),
      errors,
      new Promise((_, reject) => {
        starting = setTimeout(
          () => reject(new Error("5s profile-start guard")),
          5000,
        );
      }),
    ]);
    clearTimeout(starting);
    if (!delay) worker.postMessage("start");
    const result = await Promise.race([
      completed,
      errors,
      new Promise((resolve) => {
        timer = setTimeout(
          () => resolve({ reason: "sample-window" }),
          duration,
        );
      }),
    ]);
    const raw = await Promise.race([
      handle.stop(),
      errors,
      new Promise((_, reject) => {
        stopping = setTimeout(
          () => reject(new Error("5s profile-stop guard")),
          5000,
        );
      }),
    ]);
    const profile = typeof raw === "string" ? JSON.parse(raw) : raw;
    assert(Array.isArray(profile.nodes), "Missing CPU profile nodes");
    await writeFile(`${out}/open.cpuprofile`, JSON.stringify(profile));
    const counts = new Map();
    for (const id of profile.samples ?? [])
      counts.set(id, (counts.get(id) ?? 0) + 1);
    const top = profile.nodes
      .map((node) => ({
        name: node.callFrame.functionName,
        hits: counts.get(node.id) ?? 0,
      }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 30);
    const report = {
      diagnostic: true,
      node: process.version,
      durationMs: duration,
      delayMs: delay,
      peakRssMiB: Math.round(peakRssMiB),
      ...result,
      top,
    };
    await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    clearTimeout(initialization);
    clearTimeout(timer);
    clearTimeout(stopping);
    clearTimeout(delaying);
    clearTimeout(starting);
    clearInterval(memory);
    await worker.terminate();
  }
}
