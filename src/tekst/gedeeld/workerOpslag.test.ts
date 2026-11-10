import { afterEach, expect, it, vi } from "vitest";
const workers: TestWorker[] = [];
const ports: MessagePort[] = [];
class TestWorker extends EventTarget {
  response: boolean | null = true;
  requests: unknown[] = [];
  constructor() { super(); workers.push(this); }
  postMessage(data: unknown, transfer: Transferable[]) {
    this.requests.push(data);
    const port = transfer[0] as MessagePort;
    ports.push(port);
    if (this.response !== null) queueMicrotask(() => port.postMessage({ ok: this.response, fout: "tijdelijk" }));
  }
  terminate() {}
}
afterEach(() => {
  for (const worker of workers.splice(0)) worker.terminate();
  for (const port of ports.splice(0)) port.close();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules();
});
async function setup() {
  vi.stubGlobal("Worker", TestWorker);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  return import("./workerStart");
}
it("keeps viewers lazy and shares a single acknowledged preparation per live worker", async () => {
  const api = await setup(), worker = new api.TekstWorker("https://example.invalid/worker.js") as unknown as TestWorker;
  expect(worker.requests).toEqual([]);
  await Promise.all([api.bereidTekstWerkersOpslagVoor(), api.bereidTekstWerkersOpslagVoor()]);
  expect(worker.requests).toHaveLength(1);
  await api.bereidTekstWerkersOpslagVoor();
  expect(worker.requests).toHaveLength(1);
});
it("prepares a later document worker without keeping terminated workers alive", async () => {
  const api = await setup();
  await api.bereidTekstWerkersOpslagVoor();
  const worker = new api.TekstWorker("https://example.invalid/worker.js") as unknown as TestWorker;
  await api.bereidTekstWerkersOpslagVoor();
  expect(worker.requests).toHaveLength(1);
  worker.terminate();
  await api.bereidTekstWerkersOpslagVoor();
  expect(worker.requests).toHaveLength(1);
});
it("retries a refused preparation and rejects promptly if the worker is closed", async () => {
  const api = await setup(), worker = new api.TekstWorker("https://example.invalid/worker.js") as unknown as TestWorker;
  worker.response = false;
  await expect(api.bereidTekstWerkersOpslagVoor()).rejects.toThrow("tijdelijk");
  worker.response = true;
  await api.bereidTekstWerkersOpslagVoor();
  expect(worker.requests).toHaveLength(2);
  const next = new api.TekstWorker("https://example.invalid/second.js") as unknown as TestWorker;
  next.response = null;
  const pending = api.bereidTekstWerkersOpslagVoor();
  const refused = expect(pending).rejects.toThrow("gesloten");
  next.terminate();
  await refused;
});
