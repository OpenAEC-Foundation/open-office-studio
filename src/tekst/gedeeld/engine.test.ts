import { describe, expect, it, vi } from "vitest";
import { begin, bewerk, klaar, type Engine } from "./engine";

function proef() {
  let modus = "auto";
  const sessie = {
    beginUndoCapture: vi.fn(), addUndoBoundary: vi.fn(),
    undoCaptureMode: () => modus,
    setUndoCaptureMode: (nieuw: string) => { modus = nieuw; },
  };
  const weergave = { getYrsSession: () => sessie, syncYrsInputState: vi.fn(), relayout: vi.fn() };
  const ref = { getEditorRef: () => weergave };
  return { e: { ref, sessie, weergave } as unknown as Engine, sessie, weergave, ref, modus: () => modus };
}

describe("ongedaan-maakstap na een mislukte bewerking", () => {
  it.each(["syncYrsInputState", "relayout"] as const)("herstelt de opnamemodus als %s faalt", (methode) => {
    const p = proef();
    begin(p.e);
    p.weergave[methode].mockImplementationOnce(() => { throw new Error("weergave mislukt"); });
    expect(() => klaar(p.e)).toThrow("weergave mislukt");
    expect(p.modus()).toBe("auto");
    begin(p.e);
    klaar(p.e);
    expect(p.modus()).toBe("auto");
  });
  it("sluit de stap ook als de inhoudsbewerking zelf faalt", () => {
    const p = proef();
    expect(() => bewerk(p.ref as unknown as Engine["ref"], () => { throw new Error("bewerking mislukt"); })).toThrow("bewerking mislukt");
    expect(p.modus()).toBe("auto");
    expect(p.weergave.syncYrsInputState).not.toHaveBeenCalled();
  });
});
