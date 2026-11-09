import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { openWorkbook } from "@betteroffice/xlsx";
import { volgKopRaster } from "./kopraster";

const venster = { x: 0, y: 0, width: 500, height: 180 };

describe("de koppen delen alleen het reeds getekende raster", () => {
  it("spaart dubbele lezingen, maar slaat geen enkele echte tekenaanroep over", () => {
    const h = openWorkbook(readFileSync("public/templates/nieuw.xlsx"));
    const native = vi.spyOn(h, "displayList");
    const raster = volgKopRaster(h);
    try {
      const frame = h.displayList(venster);
      for (let i = 0; i < 20; i++)
        expect(raster.lees({ ...venster })).toBe(frame.grid);
      expect(native).toHaveBeenCalledTimes(1);
      h.displayList(venster);
      expect(native).toHaveBeenCalledTimes(2);
      raster.lees({ ...venster, x: 32 });
      raster.lees({ ...venster, width: 600 });
      raster.lees(venster);
      expect(native).toHaveBeenCalledTimes(5);
      // Slechts het laatste venster wordt onthouden.
      raster.lees({ ...venster, width: 600 });
      expect(native).toHaveBeenCalledTimes(6);
    } finally {
      raster.stop();
      h.dispose();
    }
  });

  it("volgt echte structuurwijzigingen, verborgen sporen en Undo/Redo", () => {
    const h = openWorkbook(readFileSync("public/templates/nieuw.xlsx"));
    const native = h.displayList.bind(h);
    const raster = volgKopRaster(h);
    try {
      const eerste = raster.lees(venster);
      h.applyOps([{ type: "setColWidth", sheet: 0, col: 0, width: 24 }]);
      expect(raster.lees(venster)).toEqual(native(venster).grid);
      expect(raster.lees(venster)).not.toEqual(eerste);
      h.applyOps([{ type: "setRowHeight", sheet: 0, row: 0, height: 0 }]);
      expect(raster.lees(venster)).toEqual(native(venster).grid);
      h.undo();
      expect(raster.lees(venster)).toEqual(native(venster).grid);
      h.redo();
      expect(raster.lees(venster)).toEqual(native(venster).grid);
    } finally {
      raster.stop();
      h.dispose();
    }
  });

  it("houdt editors gescheiden en bewaart later gekoppelde wrappers bij stoppen", () => {
    const a = openWorkbook(readFileSync("public/templates/nieuw.xlsx"));
    const b = openWorkbook(readFileSync("public/templates/nieuw.xlsx"));
    const native = a.displayList;
    const r = volgKopRaster(a),
      s = volgKopRaster(b);
    try {
      a.applyOps([{ type: "setColWidth", sheet: 0, col: 0, width: 32 }]);
      expect(r.lees(venster)).not.toEqual(s.lees(venster));
      const vorige = a.displayList;
      const ander = vi.fn((v) => vorige(v));
      a.displayList = ander;
      r.stop();
      expect(a.displayList).toBe(ander);
      r.lees(venster);
      expect(ander).toHaveBeenCalledTimes(1);
      // De gestopte tussenlaag blijft slechts een doorgeefluik.
      expect(a.displayList(venster)).toEqual(native.call(a, venster));
    } finally {
      s.stop();
      a.dispose();
      b.dispose();
    }
  });
});
