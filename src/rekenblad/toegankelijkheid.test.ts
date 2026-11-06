import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { buildA11yGrid, openWorkbook, selectionAt, type A11yStrings, type DisplayList, type WorkbookHandle } from "@betteroffice/xlsx";
import { actieveRasterCel, bouwToegankelijkRaster, rasterCelId, rasterCelStijl, zelfdeRasterSelectie } from "./toegankelijkheid";
import { herstelBladtabs, herstelToegankelijkRaster } from "../../scripts/rekenbladengine-compatibiliteit";

const woorden: A11yStrings = {
  gridLabel: "Rekenbladraster", rowHeaderLabel: "Rij {row}", columnHeaderLabel: "Kolom {column}",
  cellLabel: "{address}, {value}", cellLabelSelected: "{address}, {value}, geselecteerd",
  emptyCellLabel: "{address}, leeg", emptyCellLabelSelected: "{address}, leeg, geselecteerd",
};
const boeken: WorkbookHandle[] = [];
afterEach(() => { boeken.splice(0).forEach(h => h.dispose()); });
function boek() {
  const h = openWorkbook(readFileSync("public/templates/nieuw.xlsx"));
  boeken.push(h);
  h.editCell(0, 0, 0, "7");
  h.editCell(0, 0, 1, "11");
  h.editCell(0, 0, 2, "=SUM(A1:B1)");
  return h;
}

describe("de focuscel in de werkelijke toegankelijke tekenlaag (#24)", () => {
  it("behoudt een gewone viewport en een frame zonder raster ongewijzigd", () => {
    const h = boek(), frame = h.displayList({ x: 0, y: 0, width: 500, height: 180 });
    const selectie = selectionAt({ row: 0, col: 2 });
    expect(bouwToegankelijkRaster(frame, selectie, "Getallen", woorden)).toEqual(buildA11yGrid(frame, selectie, "Getallen", woorden));
    const leeg = { ...frame, grid: undefined };
    expect(bouwToegankelijkRaster(leeg, selectie, "Getallen", woorden)).toEqual(buildA11yGrid(leeg, selectie, "Getallen", woorden));
  });
  it("houdt de celspiegel begrensd bij een grote viewport, met de echte focuswaarde en geometrie", () => {
    const h = boek(); h.editCell(0, 200, 100, "23");
    const frame = h.displayList({ x: 0, y: 0, width: 14000, height: 6000 });
    const gridVooraf = structuredClone(frame.grid);
    expect((frame.grid!.rowOffsets.length - 1) * (frame.grid!.colOffsets.length - 1)).toBeGreaterThan(20000);
    for (const focus of [{ row: 0, col: 2 }, { row: 200, col: 100 }]) {
      const selectie = selectionAt(focus), raster = bouwToegankelijkRaster(frame, selectie, "Getallen", woorden);
      expect(raster.rows.flatMap(r => r.cells).length).toBeLessThanOrEqual(1000);
      const cel = raster.rows.flatMap(r => r.cells).find(c => c.row === focus.row && c.col === focus.col)!;
      expect(cel.selected).toBe(true);
      expect(cel.text).toBe(focus.row === 0 ? "18" : "23");
      expect(actieveRasterCel(raster, selectie, "editor", 0)).toBe(rasterCelId("editor", 0, focus.row, focus.col));
      expect(Number(rasterCelStijl(frame.grid, focus.row, focus.col, .1).width)).toBeGreaterThan(0);
    }
    expect(frame.grid).toEqual(gridVooraf);
  });
  it("volgt verschoven en verborgen rijen en kolommen tot beide vensterranden", () => {
    const h = boek(), frame = h.displayList({ x: 0, y: 0, width: 500, height: 180 });
    const groot: DisplayList = { ...frame, grid: {
      startRow: 100, startCol: 10,
      rowIndices: Array.from({ length: 150 }, (_, i) => 100 + i * 2),
      colIndices: Array.from({ length: 80 }, (_, i) => 10 + i * 3),
      rowOffsets: Array.from({ length: 151 }, (_, i) => i * 20),
      colOffsets: Array.from({ length: 81 }, (_, i) => i * 64),
    } };
    for (const focus of [{ row: 100, col: 10 }, { row: 398, col: 247 }, { row: 240, col: 130 }]) {
      const raster = bouwToegankelijkRaster(groot, selectionAt(focus), "Getallen", woorden);
      expect(raster.rows).toHaveLength(40);
      expect(raster.columnHeaders).toHaveLength(25);
      const cel = raster.rows.flatMap(r => r.cells).find(c => c.row === focus.row && c.col === focus.col)!;
      expect(cel.selected).toBe(true);
      expect(raster.rows.every(r => groot.grid!.rowIndices!.includes(r.row))).toBe(true);
      expect(raster.columnHeaders.every(c => groot.grid!.colIndices!.includes(c.col))).toBe(true);
    }
  });
  it("legt opeenvolgende cellen naast elkaar en volgt de getekende zoom", () => {
    const h = boek(), frame = h.displayList({ x: 0, y: 0, width: 500, height: 180 });
    const a = rasterCelStijl(frame.grid, 0, 0, 1), b = rasterCelStijl(frame.grid, 0, 1, 1);
    expect(a.position).toBe("absolute");
    expect(Number(a.width)).toBeGreaterThan(0);
    expect(Number(a.height)).toBeGreaterThan(0);
    expect(Number(b.left) - Number(a.left)).toBeCloseTo(Number(a.width));
    expect(b.top).toBe(a.top);
    const groot = rasterCelStijl(frame.grid, 0, 1, 1.5);
    expect(groot.left).toBeCloseTo(Number(b.left) * 1.5);
    expect(groot.top).toBeCloseTo(Number(b.top) * 1.5);
    expect(groot.width).toBeCloseTo(Number(b.width) * 1.5);
    expect(rasterCelStijl(undefined, 0, 0, 1)).toEqual({ display: "none" });
  });
  it("volgt de bewegende focus van een meercelselectie, niet het anker", () => {
    const h = boek(), selectie = { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 2 } };
    const raster = buildA11yGrid(h.displayList({ x: 0, y: 0, width: 500, height: 180 }), selectie, "Getallen", woorden);
    expect(raster.rows[0].cells.filter(c => c.selected).map(c => c.address)).toEqual(["A1", "B1", "C1"]);
    expect(raster.rows[0].cells.find(c => c.address === "C1")?.text).toBe("18");
    expect(actieveRasterCel(raster, selectie, "editor-een", 0)).toBe(rasterCelId("editor-een", 0, 0, 2));
    const terug = { anchor: selectie.focus, focus: selectie.anchor };
    expect(actieveRasterCel(raster, terug, "editor-een", 0)).toBe(rasterCelId("editor-een", 0, 0, 0));
  });
  it("geeft tijdens een viewportwissel geen verwijzing naar een niet-bestaande cel", () => {
    const h = boek(), selectie = selectionAt({ row: 999, col: 0 });
    const raster = buildA11yGrid(h.displayList({ x: 0, y: 0, width: 500, height: 180 }), selectie, "Getallen", woorden);
    expect(actieveRasterCel(raster, selectie, "editor", 0)).toBeUndefined();
    expect(actieveRasterCel(null, selectie, "editor", 0)).toBeUndefined();
    expect(actieveRasterCel(raster, null, "editor", 0)).toBeUndefined();
  });
  it("houdt dezelfde celpositie in andere editors en werkbladen gescheiden", () => {
    const h = boek(), selectie = selectionAt({ row: 0, col: 0 });
    const raster = buildA11yGrid(h.displayList({ x: 0, y: 0, width: 500, height: 180 }), selectie, "Getallen", woorden);
    const ids = [actieveRasterCel(raster, selectie, "een", 0), actieveRasterCel(raster, selectie, "twee", 0), actieveRasterCel(raster, selectie, "een", 1)];
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(3);
  });
  it("herkent gekopieerde selecties en weigert een inmiddels verplaatste focus", () => {
    const s = { anchor: { row: 0, col: 1 }, focus: { row: 999, col: 2 } };
    expect(zelfdeRasterSelectie(structuredClone(s), s)).toBe(true);
    expect(zelfdeRasterSelectie({ anchor: s.focus, focus: s.anchor }, s)).toBe(false);
    expect(zelfdeRasterSelectie({ ...s, focus: { row: 999, col: 3 } }, s)).toBe(false);
    expect(zelfdeRasterSelectie(null, s)).toBe(false);
  });
  it("weigert een andere bron, patchvolgorde of dubbele rastercorrectie", () => {
    const bron = readFileSync("node_modules/@betteroffice/xlsx-react/dist/index.js", "utf8");
    const tabs = herstelBladtabs(bron), toegankelijk = herstelToegankelijkRaster(tabs);
    expect(toegankelijk).toContain('oosUseRasterFocus(J,oosActieveRasterCel');
    expect(toegankelijk).toContain('id:oosRasterId+"-rijen",role:"rowgroup"');
    expect(() => herstelToegankelijkRaster(bron)).toThrow("rastertoegankelijkheid");
    expect(() => herstelToegankelijkRaster(tabs + " ")).toThrow("rastertoegankelijkheid");
    expect(() => herstelToegankelijkRaster(toegankelijk)).toThrow("rastertoegankelijkheid");
  });
});
