import { describe, expect, it, vi } from "vitest";
import { meldWriterEngineFout, type WriterFoutDoel } from "./engineFouten";

describe("oorspronkelijke Writer-enginefout vóór de tekstmelding", () => {
  it("bewaart de oorspronkelijke Wasm-stack en geeft hetzelfde foutobject eenmaal door", () => {
    const doel: WriterFoutDoel = {}, meld = vi.fn(), fout = new WebAssembly.RuntimeError("Out of bounds memory access");
    meldWriterEngineFout(fout, meld, doel);
    expect(meld).toHaveBeenCalledExactlyOnceWith(fout);
    expect(doel._openaecWriterFouten?.[0]).toMatchObject({ naam: "RuntimeError", bericht: fout.message, stack: fout.stack });
    expect(Object.isFrozen(doel._openaecWriterFouten)).toBe(true);
    expect(Object.values(doel._openaecWriterFouten![0]).every(v => typeof v === "string" || typeof v === "number")).toBe(true);
  });

  it("bewaart de eerste vier begrensde stacks zonder sessies of latere fouten vast te houden", () => {
    const doel: WriterFoutDoel = {}, meld = vi.fn();
    for (let i = 0; i < 20; i++) {
      const fout = new Error("Document worker trapped " + i + "x".repeat(5000));
      fout.stack = "stack-" + i + "x".repeat(100000);
      meldWriterEngineFout(fout, meld, doel);
    }
    expect(meld).toHaveBeenCalledTimes(20);
    expect(doel._openaecWriterFouten).toHaveLength(4);
    expect(doel._openaecWriterFouten![0].stack).toMatch(/^stack-0/);
    for (const e of doel._openaecWriterFouten!) {
      expect(e.bericht.length).toBeLessThanOrEqual(2048);
      expect(e.stack.length).toBeLessThanOrEqual(32768);
    }
  });

  it("houdt gewone foutmeldingen ongewijzigd zonder engineopname", () => {
    const doel: WriterFoutDoel = {}, meld = vi.fn(), fout = new Error("Bestand kan niet worden geopend");
    meldWriterEngineFout(fout, meld, doel);
    expect(meld).toHaveBeenCalledExactlyOnceWith(fout);
    expect(doel._openaecWriterFouten).toBeUndefined();
  });

  it("blijft de oorspronkelijke fout doorgeven als de diagnoseopslag zelf weigert", () => {
    const doel = Object.freeze({}), meld = vi.fn(), fout = new WebAssembly.RuntimeError("unreachable");
    meldWriterEngineFout(fout, meld, doel);
    expect(meld).toHaveBeenCalledExactlyOnceWith(fout);
  });
});
