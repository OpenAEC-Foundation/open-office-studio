import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createContext, runInContext } from "node:vm";
import { instrumentSdkSource, runtimePrelude, SDK_PARTS, readObserver, stopObserver, requestWorkerTrace, writer359DiagnosticPlugin } from "./writer359-observer.mjs";

const sdk = resolve(process.env.OOS359_SDK_ROOT || "node_modules/@betteroffice");

test("disabled overlay is byte-identical; enabled overlay rejects wrong source", () => {
  assert.equal(instrumentSdkSource("unknown", "unchanged"), "unchanged");
  assert.throws(() => instrumentSdkSource("unknown", "x", { enabled: true }), /unknown/);
  for (const part of Object.keys(SDK_PARTS))
    assert.throws(() => instrumentSdkSource(part, "x", { enabled: true }), /hash changed/);
});

test("all four actual pinned SDK parts transform and parse, without modifying dependencies", () => {
  for (const part of Object.keys(SDK_PARTS)) {
    const path = resolve(sdk, part), original = readFileSync(path, "utf8");
    const changed = instrumentSdkSource(part, original, { enabled: true });
    assert.notEqual(changed, original);
    const result = spawnSync(process.execPath, ["--input-type=module", "--check"], { input: changed, encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 0, `${part}: ${result.stderr}`);
    assert.equal(readFileSync(path, "utf8"), original);
  }
});

test("plugin factory is inert by default and only matches pinned SDK files", () => {
  const part = "docx-react/dist/index.mjs", source = readFileSync(resolve(sdk, part), "utf8");
  const id = "C:\\isolated\\node_modules\\@betteroffice\\docx-react\\dist\\index.mjs?test";
  assert.equal(writer359DiagnosticPlugin().transform(source, id), undefined);
  assert.equal(writer359DiagnosticPlugin({ enabled: true }).transform(source, "src/editors.tsx"), undefined);
  assert.match(writer359DiagnosticPlugin({ enabled: true }).transform(source, id).code, /oos359Trace/);
});

test("bounded metadata cannot retain document strings; snapshot and stop isolate state", () => {
  const realm = createContext({ performance: { timeOrigin: 1000, now: () => 12 } });
  runInContext(runtimePrelude(), realm);
  runInContext('oos359Trace("glyph-run-enter",{glyphs:3,fontId:2,text:"PRIVATE",fontFamily:"PRIVATE",bytes:Infinity});oos359Trace("PRIVATE",{});', realm);
  const first = readObserver(realm);
  assert.equal(first.records.length, 1);
  assert.equal(first.records[0].atMs, 1012);
  assert.equal(first.records[0].glyphs, 3);
  assert.equal(JSON.stringify(first).includes("PRIVATE"), false);
  assert.equal("bytes" in first.records[0], false);
  first.records[0].glyphs = 999;
  assert.equal(readObserver(realm).records[0].glyphs, 3);
  runInContext('for(let i=0;i<600;i++)oos359Trace("frame-published",{pages:1});', realm);
  assert.equal(readObserver(realm).records.length, 512);
  assert.equal(readObserver(realm).dropped, 89);
  stopObserver(realm);
  runInContext('oos359Trace("font-loaded");', realm);
  assert.equal(readObserver(realm).active, false);
  assert.equal(readObserver(realm).records.length, 512);
});

test("actual frame publication keeps listener payload and order", () => {
  const part = "docx-react/dist/chunk-LZ2DPBZ6.mjs";
  const source = instrumentSdkSource(part, readFileSync(resolve(sdk, part), "utf8"), { enabled: true });
  const start = source.indexOf("function Pi("), end = source.indexOf("function d8(", start);
  assert(start > 0 && end > start);
  const calls = [], host = {}, frame = { pages: [1] }, options = { worker: true };
  const realm = createContext({ hs: new WeakMap(), ps: new Set([(value, opt) => calls.push([value, opt])]), host, frame, options });
  runInContext(runtimePrelude() + source.slice(start, end) + ";Pi(host,frame,options);", realm);
  assert.equal(realm.hs.get(host), frame);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], frame);
  assert.equal(calls[0][1], options);
  assert.equal(readObserver(realm).records[0].kind, "frame-published");
});

test("worker collector uses only its namespace and closes its response port; stop removes listener", () => {
  let listener, removed = false, closed = false, response;
  const realm = createContext({ postMessage() {}, addEventListener(name, fn) { assert.equal(name, "message"); listener = fn; }, removeEventListener(name, fn, capture) { removed = name === "message" && fn === listener && capture; } });
  runInContext(runtimePrelude() + 'oos359Trace("font-loaded");', realm);
  listener({ data: { openaec: "ordinary-sdk-message" }, ports: [], stopImmediatePropagation() { assert.fail("intercepted SDK message"); } });
  let intercepted = false;
  listener({ data: { openaec: "writer359-trace-v1", stop: true }, ports: [{ postMessage(value) { response = value; }, close() { closed = true; } }], stopImmediatePropagation() { intercepted = true; } });
  assert(intercepted && closed);
  assert.equal(response.snapshot.records[0].realm, "worker");
  assert.equal(response.stopped, true);
  assert.equal(readObserver(realm).active, false);
  stopObserver(realm);
  assert(removed);
});

test("requester succeeds, rejects malformed/failed requests, and has a bounded timeout", async () => {
  const snapshot = { version: 1, records: [], active: true, dropped: 0 };
  const worker = { postMessage(message, [port]) { assert.equal(message.openaec, "writer359-trace-v1"); assert.equal(message.stop, true); port.postMessage({ version: 1, snapshot, stopped: true }); port.close(); } };
  assert.deepEqual(await requestWorkerTrace(worker), snapshot);
  await assert.rejects(requestWorkerTrace({ postMessage(message, [port]) { port.postMessage({ version: 9 }); port.close(); } }), /invalid worker trace/);
  await assert.rejects(requestWorkerTrace({ postMessage() { throw new Error("test transport failed"); } }), /transport failed/);
  await assert.rejects(requestWorkerTrace({ postMessage() {} }, { timeoutMs: 10 }), /timed out/);
  assert.throws(() => requestWorkerTrace(worker, { timeoutMs: 5001 }), /bounded/);
});
