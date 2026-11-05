import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { herstelWorkerStart } from "../../../scripts/tekstengine-compatibiliteit";
import { TekstWorker } from "./workerStart";

class ProefWorker extends EventTarget {
  terminate = vi.fn();
  constructor(readonly url: string, readonly opties?: WorkerOptions) { super(); }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("tekstworker met gedeelde modulecache (#135)", () => {
  it("bewaakt de vastgezette bron en laat de worker-URL herkenbaar voor Vite", () => {
    const bron = readFileSync("node_modules/@betteroffice/docx/dist/chunk-6ZKYZDSZ.mjs", "utf8");
    const uit = herstelWorkerStart(bron);
    expect(uit).toBe('import { TekstWorker as Worker } from "openaec-tekst-workerstart";\n' + bron);
    expect(() => herstelWorkerStart("andere engine")).toThrow("workerstart");
    expect(() => herstelWorkerStart(bron + bron)).toThrow("workerstart");
  });
  it("importeert de engine als gewone module en geeft de echte worker terug", async () => {
    vi.stubGlobal("Worker", ProefWorker);
    const maak = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:proef");
    const opruimen = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const url = new URL("https://example.invalid/assets/engine.js");
    const worker = new TekstWorker(url, { type: "module", name: "tekst" });
    expect(worker).toBeInstanceOf(ProefWorker);
    expect((worker as unknown as ProefWorker).opties).toEqual({ type: "module", name: "tekst" });
    const start = maak.mock.calls[0][0] as Blob;
    expect(await start.text()).toBe('import "https://example.invalid/assets/engine.js";');
    expect(opruimen).not.toHaveBeenCalled();
    worker.dispatchEvent(new Event("message"));
    expect(opruimen).toHaveBeenCalledWith("blob:proef");
  });
  it("ruimt een nog niet gestarte worker op bij vroegtijdig sluiten", () => {
    vi.stubGlobal("Worker", ProefWorker);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:proef");
    const opruimen = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const worker = new TekstWorker("https://example.invalid/engine.js");
    worker.terminate();
    expect(opruimen).toHaveBeenCalledWith("blob:proef");
  });
  it("ruimt het startscript op na een laadfout", () => {
    vi.stubGlobal("Worker", ProefWorker);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:proef");
    const opruimen = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const worker = new TekstWorker("https://example.invalid/engine.js");
    worker.dispatchEvent(new Event("error"));
    expect(opruimen).toHaveBeenCalledWith("blob:proef");
  });
  it("behoudt een constructiefout en laat geen startscript achter", () => {
    vi.stubGlobal("Worker", class { constructor() { throw new Error("geen worker"); } });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:proef");
    const opruimen = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    expect(() => new TekstWorker("https://example.invalid/engine.js")).toThrow("geen worker");
    expect(opruimen).toHaveBeenCalledWith("blob:proef");
  });
});
