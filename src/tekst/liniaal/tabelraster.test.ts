import { describe, expect, it } from "vitest";
import { getekendRaster } from "./tabelraster";

const cel = (col: number, x: number, w: number, colSpan = 1, exact = true) => ({ col, colSpan, x, w, exact });
const verwacht = { raster: [2880, 2880, 2880], lijnen: [100, 292, 484, 676] };

describe("tabelraster na inpassen op de pagina", () => {
  it("gebruikt de zichtbare kolombreedte voor selectie en grepen", () => {
    // Bron: 3 × 4320 twips = 864 px; getekend: 576 px, dus 2/3
    // daarvan. Elke zichtbare kolom is 192 px = 2880 twips breed.
    expect(getekendRaster([4320, 4320, 4320], 100, [cel(0, 100, 192), cel(1, 292, 192), cel(2, 484, 192)]))
      .toEqual(verwacht);
  });
  it("vult een interne rasterlijn onder een samengevoegde cel evenredig aan", () => {
    expect(getekendRaster([4320, 4320, 4320], 100, [cel(0, 100, 384, 2), cel(2, 484, 192)]))
      .toEqual(verwacht);
  });
  it("leidt ontbrekende buitenranden af uit een gemeten binnenkolom", () => {
    expect(getekendRaster([4320, 4320, 4320], 100, [cel(1, 292, 192)]))
      .toEqual(verwacht);
  });
  it("houdt zonder exacte celranden de bestaande terugval", () => {
    expect(getekendRaster([4320, 4320, 4320], 100, [cel(0, 104, 120, 1, false)]))
      .toEqual({ raster: [4320, 4320, 4320], lijnen: [100, 388, 676, 964] });
  });
});
