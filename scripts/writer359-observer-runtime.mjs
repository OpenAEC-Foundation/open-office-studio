/** Browser/worker-safe diagnostic collection; no imports, network, or polling. */
const KEY = "__OOS359_DIAGNOSTICS_V1__";

/** Self-contained: stringified into a separately built diagnostic realm. */
function installRuntime() {
  const key = "__OOS359_DIAGNOSTICS_V1__";
  if (globalThis[key]) return globalThis[key];
  const allowed = new Set(["font-bytes-start", "font-bytes-ready", "font-registered", "font-loaded", "font-failed", "font-loadingdone-dispatch", "worker-attach-start", "worker-attach-return", "frame-published", "first-page-callback", "glyph-run-enter", "glyph-outlines-return", "glyph-fallback"]);
  const fields = new Set(["bytes", "alreadyLoaded", "count", "surfaces", "pages", "dpr", "zoom", "worker", "accepted", "glyphs", "cache", "fontId"]);
  const records = [];
  let active = true, dropped = 0, sequence = 0;
  const worker = typeof globalThis.document === "undefined" && typeof globalThis.postMessage === "function";
  const state = {
    record(kind, details = {}) {
      try {
        if (!active || !allowed.has(kind)) return;
        if (records.length >= 512) { dropped = Math.min(Number.MAX_SAFE_INTEGER, dropped + 1); return; }
        const data = {};
        for (const [name, value] of Object.entries(details))
          if (fields.has(name) && (typeof value === "boolean" || typeof value === "number" && Number.isFinite(value))) data[name] = value;
        const now = globalThis.performance?.now?.() ?? 0;
        records.push({ sequence: ++sequence, kind, realm: worker ? "worker" : "window", relativeMs: now,
          atMs: (globalThis.performance?.timeOrigin ?? Date.now()) + now, ...data });
      } catch { /* Diagnostics must not change an engine outcome. */ }
    },
    snapshot() { return { version: 1, active, dropped, records: records.map(r => ({ ...r })) }; },
    stop() {
      active = false;
      if (worker) globalThis.removeEventListener("message", read, true);
    },
  };
  function read(event) {
    if (!active || event.data?.openaec !== "writer359-trace-v1" || event.ports?.length !== 1) return;
    event.stopImmediatePropagation();
    const port = event.ports[0];
    const snapshot = state.snapshot();
    if (event.data.stop === true) state.stop();
    try { port.postMessage({ version: 1, snapshot, stopped: !active }); }
    finally { port.close(); }
  }
  if (worker) globalThis.addEventListener("message", read, true);
  Object.defineProperty(globalThis, key, { value: state, configurable: true });
  return state;
}

export function runtimePrelude() {
  return `const oos359Trace=(${installRuntime.toString()})().record;\n`;
}

export function readObserver(target = globalThis) {
  return target[KEY]?.snapshot() ?? null;
}

export function stopObserver(target = globalThis) {
  target[KEY]?.stop();
}

/** Request only AFTER untouched native first/reopened captures are preserved. */
export function requestWorkerTrace(worker, { timeoutMs = 1000, stop = true } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) throw new Error("#359 bounded timeout required");
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = (error, value) => {
      clearTimeout(timer);
      channel.port1.onmessage = channel.port1.onmessageerror = null;
      channel.port1.close(); channel.port2.close();
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("#359 worker trace timed out")), timeoutMs);
    channel.port1.onmessageerror = () => finish(new Error("#359 invalid worker message"));
    channel.port1.onmessage = event => {
      const snapshot = event.data?.snapshot;
      if (event.data?.version !== 1 || snapshot?.version !== 1 || !Array.isArray(snapshot.records) || snapshot.records.length > 512 || stop && event.data.stopped !== true)
        finish(new Error("#359 invalid worker trace"));
      else finish(null, snapshot);
    };
    try { worker.postMessage({ openaec: "writer359-trace-v1", stop }, [channel.port2]); }
    catch (error) { finish(error); }
  });
}
