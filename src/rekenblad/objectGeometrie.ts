import type { WorkbookHandle } from "@betteroffice/xlsx";
import type { Tekenobject } from "./tekenobjecten";
import { objectOmvang } from "./groepGeometrie";

export function objectGeometrie(
  h: Pick<WorkbookHandle, "cellPosition">,
  o: Tekenobject,
) {
  const start = h.cellPosition(o.blad, o.plek.row, o.plek.col);
  const x = start.x + o.plek.x,
    y = start.y + o.plek.y;
  const eind = o.einde && h.cellPosition(o.blad, o.einde.row, o.einde.col);
  return {
    x,
    y,
    breedte: eind ? Math.max(1, eind.x + o.einde!.x - x) : o.plek.breedte,
    hoogte: eind ? Math.max(1, eind.y + o.einde!.y - y) : o.plek.hoogte,
  };
}
export function objectBereik(
  h: Pick<WorkbookHandle, "cellPosition">,
  objecten: Tekenobject[],
) {
  if (!objecten.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = 0,
    maxY = 0;
  for (const o of objecten) {
    const p = objectGeometrie(h, o),
      b = objectOmvang(o, p.breedte, p.hoogte);
    minX = Math.min(minX, p.x + b.links);
    minY = Math.min(minY, p.y + b.boven);
    maxX = Math.max(maxX, p.x + b.rechts);
    maxY = Math.max(maxY, p.y + b.onder);
  }
  const zoek = (
    waarde: number,
    max: number,
    positie: (n: number) => number,
  ) => {
    let laag = 0,
      hoog = max;
    while (laag < hoog) {
      const midden = Math.ceil((laag + hoog) / 2);
      if (positie(midden) <= waarde) laag = midden;
      else hoog = midden - 1;
    }
    return laag;
  };
  const blad = objecten[0].blad;
  return {
    rij1: zoek(Math.max(0, minY), 1048575, (n) => h.cellPosition(blad, n, 0).y),
    kol1: zoek(Math.max(0, minX), 16383, (n) => h.cellPosition(blad, 0, n).x),
    rij2: zoek(
      Math.max(0, maxY - 0.001),
      1048575,
      (n) => h.cellPosition(blad, n, 0).y,
    ),
    kol2: zoek(
      Math.max(0, maxX - 0.001),
      16383,
      (n) => h.cellPosition(blad, 0, n).x,
    ),
  };
}
