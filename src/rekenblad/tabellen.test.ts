import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import { attr, kind, kinderen, leesXml } from "../grafieken/xml";
import { werkmap, sectie, NS } from "./werkboekXml";
import {
  schrijfTabel,
  leesTabellen,
  nieuweTabelkeuze,
  laadTabellen,
  tabellen,
  schrijfTabelFilter,
  sorteerTabel,
} from "./tabellen";

const leeg = new Uint8Array(readFileSync("public/templates/nieuw.xlsx"));
function bron() {
  const h = openWorkbook(leeg);
  try {
    h.editCells(0, [
      { row: 0, col: 0, input: "Item" },
      { row: 0, col: 1, input: "Amount" },
      { row: 1, col: 0, input: "First" },
      { row: 1, col: 1, input: "2" },
      { row: 2, col: 0, input: "Second" },
      { row: 2, col: 1, input: "3" },
    ]);
    h.setNumberFormat(0, "B2:B3", { type: "custom", pattern: "$0.00" });
    const p = new Pakket(h.save());
    p.schrijf("custom/source.xml", '<source keep="yes"/>');
    return p.inpakken();
  } finally {
    h.dispose();
  }
}
function waarde(h: WorkbookHandle, ref: string) {
  const r = h.readCells({
    ranges: [
      { sheetId: h.sheetInfo().sheetIds[0], range: { kind: "a1", a1: ref } },
    ],
  });
  if (!r.ok) throw new Error(r.failure.message);
  return r.ranges[0].cells[0][0].value;
}
const cfg = () => nieuweTabelkeuze("A1:B3", "Sales");

describe("structured tables (#73), actual WASM", () => {
  it("clears filtered visibility when disabling table filters", () => {
    let bytes = schrijfTabel(bron(), 0, null, { ...cfg(), totaal: true }),
      id = leesTabellen(bytes)[0][0].id;
    bytes = schrijfTabelFilter(bytes, 0, id, 0, {
      soort: "waarden",
      waarden: ["First"],
      leeg: false,
    });
    bytes = schrijfTabel(bytes, 0, id, {
      ...cfg(),
      totaal: true,
      filters: false,
      stijl: "existing",
    });
    expect(leesTabellen(bytes)[0][0].filters).toBe(false);
    const h = openWorkbook(bytes);
    try {
      expect(waarde(h, "B4")).toEqual({ kind: "number", value: 5 });
    } finally {
      h.dispose();
    }
    const p = new Pakket(bytes),
      pad = werkmap(p).bladen[0].pad;
    expect(
      kinderen(kind(leesXml(p.lees(pad)), "sheetData"), "row").find(
        (r) => attr(r, "r") === "3",
      )?.attrs.hidden,
    ).toBeUndefined();
  });
  it("moves the totals row while extending the table range without retaining its old subtotal as data", () => {
    let bytes = schrijfTabel(bron(), 0, null, { ...cfg(), totaal: true }),
      id = leesTabellen(bytes)[0][0].id;
    bytes = schrijfTabel(bytes, 0, id, {
      ...cfg(),
      ref: "A1:B4",
      totaal: true,
      stijl: "existing",
    });
    const h = openWorkbook(bytes);
    try {
      expect(waarde(h, "B4").kind).toBe("empty");
      expect(waarde(h, "B5")).toEqual({ kind: "number", value: 5 });
    } finally {
      h.dispose();
    }
  });
  it("recalculates table totals from visible rows and restores them when clearing the filter", () => {
    let bytes = schrijfTabel(bron(), 0, null, { ...cfg(), totaal: true });
    const id = leesTabellen(bytes)[0][0].id;
    bytes = schrijfTabelFilter(bytes, 0, id, 0, {
      soort: "waarden",
      waarden: ["First"],
      leeg: false,
    });
    let h = openWorkbook(bytes);
    try {
      expect(waarde(h, "B4")).toEqual({ kind: "number", value: 2 });
    } finally {
      h.dispose();
    }
    bytes = schrijfTabelFilter(bytes, 0, id, 0, null);
    h = openWorkbook(bytes);
    try {
      expect(waarde(h, "B4")).toEqual({ kind: "number", value: 5 });
    } finally {
      h.dispose();
    }
  });
  it("sorts table data without moving headers or totals and reapplies criteria to the moved values", () => {
    let bytes = schrijfTabel(bron(), 0, null, { ...cfg(), totaal: true }),
      id = leesTabellen(bytes)[0][0].id;
    bytes = schrijfTabelFilter(bytes, 0, id, 0, {
      soort: "waarden",
      waarden: ["First"],
      leeg: false,
    });
    bytes = sorteerTabel(bytes, 0, id, 1, true);
    const h = openWorkbook(bytes);
    try {
      expect(h.cell(0, 0, 0).input).toBe("Item");
      expect(h.cell(0, 1, 0).input).toBe("Second");
      expect(h.cell(0, 2, 0).input).toBe("First");
      expect(waarde(h, "B4")).toEqual({ kind: "number", value: 2 });
    } finally {
      h.dispose();
    }
    const p = new Pakket(bytes),
      pad = werkmap(p).bladen[0].pad,
      rows = kinderen(kind(leesXml(p.lees(pad)), "sheetData"), "row");
    expect(rows.find((r) => attr(r, "r") === "2")?.attrs.hidden).toBe("1");
    expect(
      rows.find((r) => attr(r, "r") === "3")?.attrs.hidden,
    ).toBeUndefined();
  });
  it("inserts data above a totals row with matching structured references and one structural Undo", () => {
    const bytes = schrijfTabel(bron(), 0, null, { ...cfg(), totaal: true }),
      h = openWorkbook(bytes);
    try {
      h.applyOps([{ type: "insertRows", sheet: 0, at: 3, count: 1 }]);
      expect(leesTabellen(h.save())[0][0].ref).toBe("A1:B5");
      h.editCell(0, 3, 1, "7");
      expect(waarde(h, "B5")).toEqual({ kind: "number", value: 12 });
      h.undo();
      h.undo();
      expect(leesTabellen(h.save())[0][0].ref).toBe("A1:B4");
      expect(waarde(h, "B4")).toEqual({ kind: "number", value: 5 });
    } finally {
      h.dispose();
    }
  });
  it("persists header filter criteria and restores filtered rows without unhiding manually hidden rows", () => {
    let bytes = schrijfTabel(bron(), 0, null, cfg());
    const id = leesTabellen(bytes)[0][0].id;
    bytes = schrijfTabelFilter(bytes, 0, id, 0, {
      soort: "waarden",
      waarden: ["First"],
      leeg: false,
    });
    expect(leesTabellen(bytes)[0][0].criteria.get(0)).toEqual({
      soort: "waarden",
      waarden: ["First"],
      leeg: false,
    });
    let p = new Pakket(bytes),
      pad = werkmap(p).bladen[0].pad;
    expect(
      kinderen(kind(leesXml(p.lees(pad)), "sheetData"), "row").find(
        (r) => attr(r, "r") === "3",
      )?.attrs.hidden,
    ).toBe("1");
    bytes = schrijfTabelFilter(bytes, 0, id, 0, null);
    p = new Pakket(bytes);
    expect(leesTabellen(bytes)[0][0].criteria.size).toBe(0);
    expect(
      kinderen(kind(leesXml(p.lees(pad)), "sheetData"), "row").find(
        (r) => attr(r, "r") === "3",
      )?.attrs.hidden,
    ).toBeUndefined();
    const h = openWorkbook(bytes);
    try {
      h.applyOps([{ type: "setRowHeight", sheet: 0, row: 1, height: 0 }]);
      bytes = h.save();
    } finally {
      h.dispose();
    }
    bytes = schrijfTabelFilter(bytes, 0, id, 0, {
      soort: "waarden",
      waarden: ["First", "Second"],
      leeg: false,
    });
    p = new Pakket(bytes);
    expect(
      kinderen(kind(leesXml(p.lees(pad)), "sheetData"), "row").find(
        (r) => attr(r, "r") === "2",
      )?.attrs.hidden,
    ).toBe("1");
  });
  it("moves a matching worksheet autoFilter into the new table", () => {
    const p = new Pakket(bron()),
      pad = werkmap(p).bladen[0].pad;
    sectie(
      p,
      pad,
      "autoFilter",
      `<autoFilter xmlns="${NS}" ref="A1:B3"><filterColumn colId="0"><filters><filter val="First"/></filters></filterColumn></autoFilter>`,
    );
    const bytes = schrijfTabel(p.inpakken(), 0, null, cfg()),
      uit = new Pakket(bytes);
    expect(kind(leesXml(uit.lees(pad)), "autoFilter")).toBeNull();
    expect(leesTabellen(bytes)[0][0].criteria.get(0)?.soort).toBe("waarden");
  });
  it("creates a standard styled table, retains currency and other parts, recalculates references after reopen", () => {
    const bytes = schrijfTabel(bron(), 0, null, cfg());
    expect(leesTabellen(bytes)[0][0]).toMatchObject({
      naam: "Sales",
      ref: "A1:B3",
      kop: true,
      totaal: false,
      filters: true,
      banden: true,
    });
    const p = new Pakket(bytes);
    expect(p.lees("custom/source.xml")).toBe('<source keep="yes"/>');
    const t = leesXml(p.lees(leesTabellen(bytes)[0][0].pad));
    expect(kind(t, "autoFilter")?.attrs.ref).toBe("A1:B3");
    expect(kind(t, "tableStyleInfo")?.attrs.name).toMatch(/^OpenAEC_blue_/);
    const h = openWorkbook(bytes);
    try {
      h.editCell(0, 0, 4, "=SUM(Sales[Amount])");
      expect(waarde(h, "E1")).toMatchObject({ kind: "number", value: 5 });
      expect(h.selectionFormatting(0, "B2").numberFormatPattern).toBe("$0.00");
      expect(h.selectionFormatting(0, "A1").bold).toBe(true);
      const again = openWorkbook(h.save());
      try {
        expect(waarde(again, "E1")).toMatchObject({ kind: "number", value: 5 });
      } finally {
        again.dispose();
      }
    } finally {
      h.dispose();
    }
  });
  it("expands rows and columns atomically with formulas, style, Undo and native metadata", () => {
    const bytes = schrijfTabel(bron(), 0, null, cfg()),
      h = openWorkbook(bytes);
    try {
      laadTabellen(h, bytes);
      h.editCell(0, 0, 4, "=SUM(Sales[Amount])");
      h.editCell(0, 3, 1, "7");
      expect(tabellen(h, 0)[0].ref).toBe("A1:B4");
      expect(waarde(h, "E1")).toMatchObject({ kind: "number", value: 12 });
      expect(h.selectionFormatting(0, "B4").numberFormatPattern).toBe("$0.00");
      h.undo();
      expect(tabellen(h, 0)[0].ref).toBe("A1:B3");
      expect(waarde(h, "E1")).toMatchObject({ kind: "number", value: 5 });
      h.redo();
      h.editCell(0, 1, 2, "9");
      expect(tabellen(h, 0)[0].ref).toBe("A1:C4");
      expect(tabellen(h, 0)[0].kolommen).toHaveLength(3);
      expect(leesTabellen(h.save())[0][0].ref).toBe("A1:C4");
    } finally {
      h.dispose();
    }
  });
  it("supports totals, repeated configuration and disabling totals without losing data", () => {
    let bytes = schrijfTabel(bron(), 0, null, { ...cfg(), totaal: true });
    let t = leesTabellen(bytes)[0][0];
    expect(t.ref).toBe("A1:B4");
    let h = openWorkbook(bytes);
    try {
      expect(waarde(h, "B4")).toMatchObject({ kind: "number", value: 5 });
    } finally {
      h.dispose();
    }
    bytes = schrijfTabel(bytes, 0, t.id, {
      ...cfg(),
      totaal: true,
      stijl: "green",
      totalen: ["none", "average"],
    });
    t = leesTabellen(bytes)[0][0];
    expect(t.kolommen[1].totaal).toBe("average");
    h = openWorkbook(bytes);
    try {
      expect(waarde(h, "B4")).toMatchObject({ kind: "number", value: 2.5 });
    } finally {
      h.dispose();
    }
    bytes = schrijfTabel(bytes, 0, t.id, {
      ...cfg(),
      totaal: false,
      stijl: "existing",
    });
    h = openWorkbook(bytes);
    try {
      expect(waarde(h, "B4").kind).toBe("empty");
      expect(waarde(h, "B3")).toMatchObject({ kind: "number", value: 3 });
    } finally {
      h.dispose();
    }
  });
  it("preserves unknown table and column XML on configuration and growth", () => {
    const bytes = schrijfTabel(bron(), 0, null, cfg()),
      p = new Pakket(bytes),
      t = leesTabellen(bytes)[0][0];
    p.schrijf(
      t.pad,
      p
        .lees(t.pad)
        .replace("<table ", '<table xmlns:probe="urn:test" probe:keep="yes" ')
        .replace('name="Amount"', 'name="Amount" probe:column="yes"')
        .replace("</table>", '<extLst><ext uri="source"/></extLst></table>'),
    );
    const edited = schrijfTabel(p.inpakken(), 0, t.id, {
      ...cfg(),
      stijl: "existing",
      banden: false,
    });
    const h = openWorkbook(edited);
    try {
      h.editCell(0, 3, 1, "4");
      const xml = new Pakket(h.save()).lees(t.pad);
      expect(xml).toContain('probe:keep="yes"');
      expect(xml).toContain('probe:column="yes"');
      expect(xml).toContain('uri="source"');
    } finally {
      h.dispose();
    }
  });
  it("supports headerless tables without changing the first data row", () => {
    const bytes = schrijfTabel(bron(), 0, null, { ...cfg(), kop: false });
    const t = leesTabellen(bytes)[0][0];
    expect(t.kolommen.map((k) => k.naam)).toEqual(["Column1", "Column2"]);
    expect(t.filters).toBe(false);
    const h = openWorkbook(bytes);
    try {
      expect(h.cell(0, 0, 0).input).toBe("Item");
    } finally {
      h.dispose();
    }
  });
  it("refuses occupied totals, overlap, merges, protection and huge ranges before changing the source", () => {
    const h = openWorkbook(bron());
    let bytes: Uint8Array;
    try {
      h.editCell(0, 3, 1, "occupied");
      bytes = h.save();
    } finally {
      h.dispose();
    }
    expect(() =>
      schrijfTabel(bytes, 0, null, { ...cfg(), totaal: true }),
    ).toThrow("occupiedTotal");
    bytes = schrijfTabel(bytes, 0, null, cfg());
    expect(() =>
      schrijfTabel(bytes, 0, null, { ...cfg(), naam: "Other" }),
    ).toThrow("overlap");
    expect(() =>
      schrijfTabel(bron(), 0, null, { ...cfg(), ref: "A1:Z100000" }),
    ).toThrow("tooLarge");
    for (const [tag, error] of [
      [
        `<mergeCells xmlns="${NS}"><mergeCell ref="A1:B1"/></mergeCells>`,
        "mergedCells",
      ],
      [`<sheetProtection xmlns="${NS}" sheet="1"/>`, "protectedSheet"],
    ]) {
      const p = new Pakket(bron()),
        pad = werkmap(p).bladen[0].pad;
      sectie(
        p,
        pad,
        error === "mergedCells" ? "mergeCells" : "sheetProtection",
        tag,
      );
      const source = p.inpakken();
      expect(() => schrijfTabel(source, 0, null, cfg())).toThrow(error);
      expect(p.inpakken()).toEqual(source);
    }
  });
});
