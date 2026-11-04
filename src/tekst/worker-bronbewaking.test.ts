import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const bron = readFileSync("scripts/gui/worker_bron.js", "utf8");
function proef() {
  const post = vi.fn();
  class Worker { postMessage = post; }
  Worker.prototype.postMessage = post;
  const window: Record<string, any> = {};
  const sessie = { clientId: 42, version: () => "begin", encodeStateAsUpdate: () => new Uint8Array([1, 2]) };
  new Function("window", "Worker", "proefApi", bron)(window, Worker, () => ({ getEditorRef: () => ({ getYrsSession: () => sessie }) }));
  // De proef gebruikt de werkelijke prototypehaak, zoals de browser.
  const worker = Object.create(Worker.prototype) as Worker;
  return { post, Worker, window, worker, bewaking: window._officeWorkerBron };
}

describe("bronbewaking van de eigen workerproef", () => {
  it("bewaart bytes vóór overdracht, inclusief deelweergaven en hun volgorde", () => {
    const p = proef(), geheel = new Uint8Array([99, 3, 4, 88]), update = geheel.subarray(1, 3);
    const b = { id: 7, type: "applyUpdate", update }, overdracht = [geheel.buffer];
    p.worker.postMessage(b, overdracht);
    geheel.fill(0);
    p.worker.postMessage({ id: 8, type: "sync", snapshot: { state: new Uint8Array([5]), clientId: 42 } });
    const r = p.bewaking.exporteer();
    expect(r).toMatchObject({ volledig: true, begin: [1, 2], bytes: 5 });
    expect(r.berichten).toMatchObject([{ worker: 1, type: "applyUpdate", update: [3, 4] }, { worker: 1, type: "sync", state: [5] }]);
    expect(p.post.mock.calls[0]).toEqual([b, overdracht]);
    expect(p.post.mock.contexts[0]).toBe(p.worker);
  });
  it("maakt een overschreden bytegrens expliciet zonder de verzending te veranderen", () => {
    const p = proef(), update = new Uint8Array(2 * 1024 * 1024);
    p.worker.postMessage({ type: "applyUpdate", update });
    expect(p.bewaking.exporteer()).toMatchObject({ volledig: false, bytes: 2, berichten: [{ update: null }] });
    expect(p.post).toHaveBeenCalledOnce();
  });
  it("begrenst aantallen, onderscheidt workers en herstelt de oorspronkelijke haak", () => {
    const p = proef(), tweede = Object.create(p.Worker.prototype);
    p.worker.postMessage({ type: "destroy" }); tweede.postMessage({ type: "destroy" });
    for (let i = 0; i < 255; i++) p.worker.postMessage({ type: "destroy" });
    const r = p.bewaking.exporteer();
    expect(r.volledig).toBe(false); expect(r.berichten).toHaveLength(256);
    expect(r.berichten.slice(0, 2).map((b: { worker: number }) => b.worker)).toEqual([1, 2]);
    p.bewaking.stop(); expect(p.Worker.prototype.postMessage).toBe(p.post);
    expect(() => p.bewaking.stop()).toThrow("omwikkeld");
  });
});
