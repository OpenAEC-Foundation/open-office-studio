import { describe, expect, it, vi } from "vitest";
import { deriveDisplayListSelectedCellRects, type DisplayList } from "@betteroffice/docx/layout/render";
import { lijstVoorTabelPagina } from "./geometrie";

const tekst = (tableId: string | undefined, docStart: number | undefined, y: number) => ({
  kind: "text", text: "cel", x: 20, y, w: 70, h: 20, fontSize: 12,
  docStart, cell: { row: 0, col: 0, rowSpan: 1, colSpan: 1 },
  table: tableId ? { tableId } : undefined,
  clipGroup: { clip: { x: 15, y: y - 5, w: 100, h: 40 } },
});
const lijst = () => ({ pages: [
  { pageIndex: 0, primitives: [tekst("doorlopend", 10, 20)] },
  // Een doorlopende cel mist hier een eigen docStart; de eerdere pagina is nodig.
  { pageIndex: 1, primitives: [tekst("doorlopend", undefined, 20)] },
  { pageIndex: 2, primitives: [tekst("andere", 5000, 20)] },
] } as unknown as DisplayList);

describe("tabelgeometrie op één zichtbare pagina", () => {
  it("behoudt de echte celvakken van een doorlopende cel zonder de verre tabel te projecteren", () => {
    const bron = lijst();
    const cellen = [{ tableKey: "eerste", row: 0, col: 0, rowSpan: 1, colSpan: 1 }];
    const sleutel = (pos: number | undefined) => pos === 10 ? "eerste" : "ander";
    const volledig = deriveDisplayListSelectedCellRects(bron, cellen, sleutel).filter(c => c.pageIndex === 1);
    expect(volledig).toHaveLength(1);
    const lezen = vi.fn(sleutel);
    const beperkt = lijstVoorTabelPagina(bron, 1);
    expect(beperkt.pages.map(p => p.pageIndex)).toEqual([0, 1]);
    expect(deriveDisplayListSelectedCellRects(beperkt, cellen, lezen).filter(c => c.pageIndex === 1)).toEqual(volledig);
    expect(lezen.mock.calls.every(([pos]) => pos !== 5000)).toBe(true);
    expect(bron.pages).toHaveLength(3);
    expect(beperkt.pages[1]).toBe(bron.pages[1]);
  });

  it("houdt de volledige terugval bij ontbrekende tabelidentiteiten", () => {
    const bron = lijst();
    bron.pages[1].primitives = [tekst(undefined, undefined, 20)] as unknown as typeof bron.pages[1]["primitives"];
    expect(lijstVoorTabelPagina(bron, 1)).toBe(bron);
    expect(lijstVoorTabelPagina(bron, 99)).toBe(bron);
  });

  it("behoudt alle pagina’s van meerdere zichtbare en geneste tabelidentiteiten", () => {
    const bron = lijst();
    bron.pages[1].primitives.push(tekst("andere", 5000, 80) as unknown as typeof bron.pages[1]["primitives"][number]);
    expect(lijstVoorTabelPagina(bron, 1).pages).toEqual(bron.pages);
  });
});
