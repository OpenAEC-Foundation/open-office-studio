import { describe, expect, it, vi } from "vitest";
import { AlineaBereiken } from "./bereiken";
import type { Alinea } from "./sessie";

const alinea = (
  paraId: string,
  story = "body",
  tekst = "foute woorden",
): Alinea => ({ paraId, story, tekst, taal: "nl", fouten: [] });

describe("zichtbare spellingalinea's", () => {
  it("projecteert eenmaal per alinea en hergebruikt die grenzen bij scrollen", () => {
    const cache = new AlineaBereiken(),
      bron = {},
      lees = vi.fn(
        (a: Alinea, eind: boolean) => Number(a.paraId) * 100 + (eind ? 80 : 0),
      );
    const alineas = Array.from({ length: 600 }, (_, i) => alinea(String(i)));
    expect(alineas.filter(cache.filter(bron, "1", [100, 180], lees))).toEqual([
      alineas[1],
    ]);
    expect(lees).toHaveBeenCalledTimes(1200);
    expect(alineas.filter(cache.filter(bron, "1", [200, 280], lees))).toEqual([
      alineas[2],
    ]);
    expect(lees).toHaveBeenCalledTimes(1200);
  });
  it("leest opnieuw na een edit, Undo, nieuwe sessie of nieuwe spellingtekst", () => {
    const cache = new AlineaBereiken(),
      bron = {},
      lees = vi.fn(() => 0),
      a = alinea("p");
    for (const versie of ["1", "2", "1"])
      cache.filter(bron, versie, [0, 10], lees)(a);
    cache.filter({}, "1", [0, 10], lees)(a);
    const nieuw = {};
    cache.filter(nieuw, "1", [0, 10], lees)(a);
    cache.filter(nieuw, "1", [0, 10], lees)(alinea("p", "body", "gewijzigd"));
    expect(lees).toHaveBeenCalledTimes(12);
  });
  it("behoudt randgevallen en onbekende geometrie en scheidt verhalen", () => {
    const cache = new AlineaBereiken(),
      lees = vi.fn((a: Alinea, eind: boolean) =>
        a.story === "cell" ? null : eind ? 20 : 10,
      );
    const filter = cache.filter({}, "1", [20, 30], lees);
    expect(filter(alinea("p"))).toBe(true);
    expect(filter(alinea("p", "cell"))).toBe(true);
    expect(lees).toHaveBeenCalledTimes(4);
    expect(cache.filter({}, "1", null, lees)(alinea("x"))).toBe(true);
    expect(lees).toHaveBeenCalledTimes(4);
  });
});
