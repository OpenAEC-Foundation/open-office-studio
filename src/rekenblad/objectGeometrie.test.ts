import { describe, expect, it } from "vitest";
import { objectBereik, objectGeometrie } from "./objectGeometrie";
import type { Tekenobject } from "./tekenobjecten";
const h = {
  cellPosition: (_blad: number, row: number, col: number) => ({
    x: 64 * col,
    y: 20 * row,
  }),
};
const object = {
  blad: 0,
  plek: { row: 2, col: 3, x: 0, y: 0, breedte: 128, hoogte: 40 },
  rotatie: 0,
} as Tekenobject;
describe("drawing geometry and print bounds", () => {
  it("does not add an empty row or column when an object ends on a cell edge", () => {
    expect(objectBereik(h, [object])).toEqual({
      rij1: 2,
      rij2: 3,
      kol1: 3,
      kol2: 4,
    });
    expect(objectBereik(h, [])).toBeNull();
  });
  it("takes current end-cell positions and offsets from two-cell anchors", () => {
    const two = { ...object, einde: { row: 5, col: 7, x: 10, y: 10 } };
    expect(objectGeometrie(h, two)).toEqual({
      x: 192,
      y: 40,
      breedte: 266,
      hoogte: 70,
    });
    expect(objectBereik(h, [two])).toEqual({
      rij1: 2,
      rij2: 5,
      kol1: 3,
      kol2: 7,
    });
  });
  it("includes rotated bounds while clipping negative sheet coordinates", () => {
    expect(objectBereik(h, [{ ...object, rotatie: 90 }])).toEqual({
      rij1: 0,
      rij2: 6,
      kol1: 3,
      kol2: 4,
    });
  });
});
