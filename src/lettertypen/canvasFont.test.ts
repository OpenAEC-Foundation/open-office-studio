import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Bootst de browser na: geweigerde fontopgaven houden de vorige waarde. */
function context() {
  const geschreven: unknown[] = [];
  let waarde = "10px sans-serif";
  class CanvasContext {}
  Object.defineProperty(CanvasContext.prototype, "font", {
    configurable: true,
    get() { return waarde; },
    set(nieuw: unknown) {
      geschreven.push(nieuw);
      if (typeof nieuw !== "string" || !/\d+px /.test(nieuw) || /px Source Serif 4/.test(nieuw)) return;
      waarde = nieuw.replaceAll('"Carlito"', "Carlito");
    },
  });
  return { CanvasContext, geschreven, maak: () => new CanvasContext() as CanvasRenderingContext2D };
}

beforeEach(() => { vi.resetModules();vi.stubGlobal("window", {}); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("canvaslettertypen zonder dubbele native instellingen", () => {
  it("stelt een herhaald geldig lettertype eenmaal per opgave in", async () => {
    const p = context();
    vi.stubGlobal("CanvasRenderingContext2D", p.CanvasContext);
    vi.stubGlobal("OffscreenCanvasRenderingContext2D", undefined);
    const { installeerFontCitering } = await import("./canvasFont");
    installeerFontCitering();
    const c = p.maak();
    c.font = "16px Carlito";
    c.font = "16px Carlito";
    expect(c.font).toBe("16px Carlito");
    expect(p.geschreven).toEqual(["16px Carlito", "16px Carlito"]);
  });

  it("herstelt een familie met een los getal vóór de eerste native instelling", async () => {
    const p = context();
    vi.stubGlobal("CanvasRenderingContext2D", p.CanvasContext);
    vi.stubGlobal("OffscreenCanvasRenderingContext2D", undefined);
    const { installeerFontCitering } = await import("./canvasFont");
    installeerFontCitering();
    const c = p.maak();
    c.font = "bold 30px Source Serif 4, serif";
    expect(c.font).toBe('bold 30px "Source Serif 4", serif');
    expect(p.geschreven).toEqual(['bold 30px "Source Serif 4", serif']);
  });

  it("behoudt aangehaalde familienamen en ongeldige invoer, ook op een offscreencontext", async () => {
    const p = context(), buiten = context();
    vi.stubGlobal("CanvasRenderingContext2D", p.CanvasContext);
    vi.stubGlobal("OffscreenCanvasRenderingContext2D", buiten.CanvasContext);
    const { installeerFontCitering } = await import("./canvasFont");
    installeerFontCitering();
    const c = buiten.maak();
    c.font = '16px "Familie, variant", serif';
    c.font = "ongeldig";
    expect(c.font).toBe('16px "Familie, variant", serif');
    expect(buiten.geschreven).toEqual(['16px "Familie, variant", serif', "ongeldig"]);
    expect(p.geschreven).toHaveLength(0);
  });
});
