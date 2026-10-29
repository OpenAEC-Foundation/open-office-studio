import { describe, expect, it } from "vitest";
import { zetTaal } from "../i18n/config";
import {
  afmetingTekst,
  afmetingUitleg,
  begrens,
  binnen,
  celOnderPunt,
  RASTER,
  verplaats,
} from "./raster";

describe("tabelraster", () => {
  it("is 10 kolommen bij 8 rijen", () => {
    expect(RASTER).toEqual({ kolommen: 10, rijen: 8 });
  });

  it("begint met pijltjes bij 1 × 1 en blijft binnen het raster", () => {
    expect(verplaats(null, "ArrowDown")).toEqual({ rijen: 1, kolommen: 1 });
    let g = { rijen: 1, kolommen: 1 };
    for (let i = 0; i < 20; i++) g = verplaats(g, "ArrowRight")!;
    expect(g).toEqual({ rijen: 1, kolommen: 10 });
    for (let i = 0; i < 20; i++) g = verplaats(g, "ArrowDown")!;
    expect(g).toEqual({ rijen: 8, kolommen: 10 });
    expect(verplaats({ rijen: 1, kolommen: 1 }, "ArrowUp")).toEqual({ rijen: 1, kolommen: 1 });
    expect(verplaats({ rijen: 3, kolommen: 4 }, "ArrowLeft")).toEqual({ rijen: 3, kolommen: 3 });
    expect(verplaats({ rijen: 3, kolommen: 4 }, "Home")).toEqual({ rijen: 3, kolommen: 1 });
    expect(verplaats({ rijen: 3, kolommen: 4 }, "End")).toEqual({ rijen: 3, kolommen: 10 });
    expect(verplaats({ rijen: 3, kolommen: 4 }, "a")).toBeNull();
  });

  it("vindt de cel onder de muis", () => {
    // cellen van 16 px met 3 px tussenruimte: stap 19
    expect(celOnderPunt(0, 0, 16, 3)).toEqual({ rijen: 1, kolommen: 1 });
    expect(celOnderPunt(19 * 3 + 5, 19 + 2, 16, 3)).toEqual({ rijen: 2, kolommen: 4 });
    expect(celOnderPunt(19 * 10, 0, 16, 3)).toBeNull();
    expect(celOnderPunt(0, 19 * 8, 16, 3)).toBeNull();
    expect(celOnderPunt(-1, 4, 16, 3)).toBeNull();
  });

  it("markeert de cellen binnen de keuze", () => {
    const g = { rijen: 2, kolommen: 3 };
    expect(binnen(g, 2, 3)).toBe(true);
    expect(binnen(g, 3, 1)).toBe(false);
    expect(binnen(null, 1, 1)).toBe(false);
  });

  it("toont en verwoordt de afmeting", () => {
    expect(afmetingTekst({ rijen: 4, kolommen: 3 })).toBe("3 × 4");
    expect(afmetingTekst(null)).toBe("");
    expect(afmetingUitleg({ rijen: 1, kolommen: 2 })).toBe("2 kolommen bij 1 rij");
  });

  it("verwoordt de afmeting in de interfacetaal", async () => {
    await zetTaal("en");
    try {
      expect(afmetingUitleg({ rijen: 1, kolommen: 2 })).toBe("2 columns by 1 row");
      expect(afmetingUitleg(null)).toBe("Choose a table size");
    } finally {
      await zetTaal("nl");
    }
    expect(afmetingUitleg({ rijen: 3, kolommen: 1 })).toBe("1 kolom bij 3 rijen");
  });

  it("begrenst getallen uit de dialoog", () => {
    expect(begrens({ rijen: 0, kolommen: 99 })).toEqual({ rijen: 1, kolommen: 63 });
    expect(begrens({ rijen: Number.NaN, kolommen: 2.6 })).toEqual({ rijen: 1, kolommen: 3 });
  });
});
