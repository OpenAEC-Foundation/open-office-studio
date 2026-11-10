import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { expect, it } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import { attr, kind, kinderen, leesXml } from "../grafieken/xml";
import { werkmap } from "./werkboekXml";
import { schrijfTabel, nieuweTabelkeuze } from "./tabellen";
import {
  schrijfDraaitabel,
  leesDraaitabellen,
  type DraaiKeuze,
} from "./draaitabellen";
function bron() {
  const h = openWorkbook(
    new Uint8Array(readFileSync("public/templates/nieuw.xlsx")),
  );
  try {
    const data = [
      ["Region", "Product", "Amount", "Date", "Units"],
      ["North", "A", "10", "46024", "1"],
      ["South", "A", "20", "46056", "2"],
      ["North", "B", "40", "46026", "4"],
      ["North", "A", "30", "46086", "3"],
      ["South", "B", "50", "46118", "5"],
    ];
    h.editCells(
      0,
      data.flatMap((row, r) =>
        row.map((input, col) => ({ row: r, col, input })),
      ),
    );
    h.setNumberFormat(0, "D2:D6", { type: "custom", pattern: "yyyy-mm-dd" });
    const p = new Pakket(h.save());
    p.schrijf("custom/pivot-source.xml", "<keep>pivot</keep>");
    return p.inpakken();
  } finally {
    h.dispose();
  }
}
const cfg = (): DraaiKeuze => ({
  naam: "SalesPivot",
  bron: { blad: 0, ref: "A1:E6" },
  doel: { blad: null, nieuwBlad: "Summary", cel: "A1" },
  rijen: [{ id: "region", kolom: 0 }],
  kolommen: [{ id: "product", kolom: 1 }],
  waarden: [
    {
      id: "sum",
      kolom: 2,
      naam: "Sum Amount",
      functie: "sum",
      weergave: "normal",
    },
  ],
  filters: [],
});
function value(h: WorkbookHandle, blad: number, a1: string) {
  const r = h.readCells({
    ranges: [
      { sheetId: h.sheetInfo().sheetIds[blad], range: { kind: "a1", a1 } },
    ],
  });
  if (!r.ok) throw Error(r.failure.message);
  return r.ranges[0].cells[0][0].value;
}
it("refuses unsupported structural edits without changing pivot metadata or results", () => {
  const r = schrijfDraaitabel(bron(), null, cfg()),
    h = openWorkbook(r.bytes),
    before = new Pakket(r.bytes);
  try {
    expect(() =>
      h.applyOps([{ type: "insertRows", sheet: 0, at: 0, count: 1 }]),
    ).toThrow(/cannot be rewritten/);
    const after = new Pakket(h.save()),
      t = leesDraaitabellen(r.bytes)[0];
    expect(after.lees(t.pad)).toBe(before.lees(t.pad));
    expect(after.lees(t.cachePad)).toBe(before.lees(t.cachePad));
    expect(value(h, 1, "D5")).toEqual({ kind: "number", value: 150 });
    expect(value(h, 0, "C2")).toEqual({ kind: "number", value: 10 });
  } finally {
    h.dispose();
  }
});
it("creates real pivot/cache/record parts and immediately renderable cells on a new worksheet", () => {
  const r = schrijfDraaitabel(bron(), null, cfg()),
    p = new Pakket(r.bytes),
    tables = leesDraaitabellen(r.bytes);
  expect(tables).toHaveLength(1);
  expect(tables[0]).toMatchObject({
    naam: "SalesPivot",
    blad: 1,
    ref: "A1:D5",
  });
  expect(p.lees("custom/pivot-source.xml")).toBe("<keep>pivot</keep>");
  const cache = leesXml(p.lees(tables[0].cachePad));
  expect(attr(cache, "recordCount")).toBe("5");
  expect(kinderen(kind(cache, "cacheFields"), "cacheField")).toHaveLength(5);
  const h = openWorkbook(r.bytes);
  try {
    expect(value(h, 1, "B3")).toEqual({ kind: "number", value: 40 });
    expect(value(h, 1, "D5")).toEqual({ kind: "number", value: 150 });
  } finally {
    h.dispose();
  }
  if (process.env.OOS_PIVOT_EVIDENCE) {
    mkdirSync(".local/proef-draaitabel", { recursive: true });
    writeFileSync(".local/proef-draaitabel/generated.xlsx", r.bytes);
  }
});
it("refreshes after source edits without changing the source or unrelated XML", () => {
  const c = cfg(),
    first = schrijfDraaitabel(bron(), null, c);
  c.doel.blad = first.blad;
  const h = openWorkbook(first.bytes);
  let bytes: Uint8Array;
  try {
    h.editCell(0, 1, 2, "100");
    bytes = h.save();
  } finally {
    h.dispose();
  }
  const second = schrijfDraaitabel(bytes, first.pad, c),
    again = openWorkbook(second.bytes);
  try {
    expect(value(again, 1, "D5")).toEqual({ kind: "number", value: 240 });
    expect(value(again, 0, "C2")).toEqual({ kind: "number", value: 100 });
  } finally {
    again.dispose();
  }
  expect(leesDraaitabellen(second.bytes)).toHaveLength(1);
});
it("writes grouped cache fields and percentage data fields with real member indexes", () => {
  const c = cfg();
  c.rijen = [
    { id: "year", kolom: 3, groep: { soort: "datum", eenheid: "year" } },
    { id: "month", kolom: 3, groep: { soort: "datum", eenheid: "month" } },
  ];
  c.waarden[0].weergave = "grandPercent";
  const r = schrijfDraaitabel(bron(), null, c),
    p = new Pakket(r.bytes),
    t = leesDraaitabellen(r.bytes)[0],
    cache = leesXml(p.lees(t.cachePad));
  expect(kinderen(kind(cache, "cacheFields"), "cacheField")).toHaveLength(6);
  expect(p.lees(t.cachePad)).toContain('groupBy="years"');
  expect(p.lees(t.cachePad)).toContain('groupBy="months"');
  expect(p.lees(t.pad)).toContain('showDataAs="percentOfTotal"');
  if (process.env.OOS_PIVOT_EVIDENCE)
    writeFileSync(".local/proef-draaitabel/grouped.xlsx", r.bytes);
});
it("refuses occupied targets and source overlap atomically", () => {
  const bytes = bron(),
    c = cfg();
  c.doel = { blad: 0, nieuwBlad: "", cel: "A1" };
  expect(() => schrijfDraaitabel(bytes, null, c)).toThrow("overlap");
  c.doel.cel = "H1";
  const h = openWorkbook(bytes);
  let occupied: Uint8Array;
  try {
    h.editCell(0, 0, 7, "keep");
    occupied = h.save();
  } finally {
    h.dispose();
  }
  expect(() => schrijfDraaitabel(occupied, null, c)).toThrow("occupiedTarget");
  expect(new Pakket(occupied).lees("custom/pivot-source.xml")).toBe(
    "<keep>pivot</keep>",
  );
});
it("rebuilds totals styling when grouped refresh moves the grand-total row", () => {
  const c = cfg(),
    first = schrijfDraaitabel(bron(), null, c);
  c.doel.blad = first.blad;
  c.rijen = [
    { id: "month", kolom: 3, groep: { soort: "datum", eenheid: "month" } },
  ];
  const out = schrijfDraaitabel(first.bytes, first.pad, c),
    h = openWorkbook(out.bytes);
  try {
    expect(h.selectionFormatting(1, "B5").bold).toBe(false);
    expect(h.selectionFormatting(1, "B7").bold).toBe(true);
  } finally {
    h.dispose();
  }
});
it("writes independently refreshable multiple-value, numeric-group and page-filter fixtures", () => {
  const multi = cfg();
  multi.waarden = ["count", "average"].map((f) => ({
    ...multi.waarden[0],
    id: f,
    naam: f,
    functie: f as "count" | "average",
  }));
  const interval = cfg();
  interval.rijen = [
    { id: "interval", kolom: 4, groep: { soort: "getal", stap: 2 } },
  ];
  const page = cfg();
  page.rijen = [
    { id: "quarter", kolom: 3, groep: { soort: "datum", eenheid: "quarter" } },
  ];
  page.filters = [{ id: "region", kolom: 0, gekozen: ['text:"North"'] }];
  const minimum = cfg();
  minimum.waarden[0].functie = "min";
  const maximum = cfg();
  maximum.waarden[0].functie = "max";
  for (const [name, c] of [
    ["minimum", minimum],
    ["maximum", maximum],
    ["multiple", multi],
    ["interval", interval],
    ["page", page],
  ] as const) {
    const out = schrijfDraaitabel(bron(), null, c),
      p = new Pakket(out.bytes),
      t = leesDraaitabellen(out.bytes)[0];
    expect(
      kinderen(kind(leesXml(p.lees(t.pad)), "dataFields"), "dataField"),
    ).toHaveLength(c.waarden.length);
    if (name === "interval") {
      expect(p.lees(t.cachePad)).toContain('autoStart="0"');
      expect(p.lees(t.cachePad)).toContain('autoEnd="0"');
    }
    if (process.env.OOS_PIVOT_EVIDENCE) {
      mkdirSync(".local/proef-draaitabel", { recursive: true });
      writeFileSync(`.local/proef-draaitabel/${name}.xlsx`, out.bytes);
    }
  }
});

it("renders and preserves an imported pivot without OpenAEC layout metadata", () => {
  const out = schrijfDraaitabel(bron(), null, cfg()),
    p = new Pakket(out.bytes),
    t = leesDraaitabellen(out.bytes)[0];
  p.schrijf(
    t.pad,
    p
      .lees(t.pad)
      .replace(
        /<extLst>[\s\S]*?<\/extLst>/,
        '<extLst><ext uri="vendor:keep"><v:keep xmlns:v="urn:vendor">opaque</v:keep></ext></extLst>',
      ),
  );
  const bytes = p.inpakken(),
    h = openWorkbook(bytes);
  try {
    expect(leesDraaitabellen(bytes)[0].keuze).toBeNull();
    expect(value(h, 1, "D5")).toEqual({ kind: "number", value: 150 });
    h.editCell(0, 1, 2, "100");
    const saved = new Pakket(h.save());
    for (const n of p
      .namen()
      .filter((n) => /^xl\/pivot(Cache|Tables)\//.test(n)))
      expect(saved.lees(n)).toBe(p.lees(n));
  } finally {
    h.dispose();
  }
});
it("uses a structured table source on an existing sheet and refreshes after table growth", () => {
  const bytes = schrijfTabel(bron(), 0, null, {
      ...nieuweTabelkeuze("A1:E6"),
      naam: "SourceTable",
    }),
    c = cfg();
  c.bron.tabel = "SourceTable";
  c.doel = { blad: 0, nieuwBlad: "", cel: "H1" };
  const first = schrijfDraaitabel(bytes, null, c),
    p = new Pakket(first.bytes),
    t = leesDraaitabellen(first.bytes)[0];
  expect(p.lees(t.cachePad)).toContain('<worksheetSource name="SourceTable"/>');
  const h = openWorkbook(first.bytes);
  let grown: Uint8Array;
  try {
    h.editCells(
      0,
      ["South", "A", "20", "46120", "2"].map((input, col) => ({
        row: 6,
        col,
        input,
      })),
    );
    grown = h.save();
  } finally {
    h.dispose();
  }
  const refreshed = schrijfDraaitabel(grown, first.pad, c),
    again = openWorkbook(refreshed.bytes);
  try {
    expect(value(again, 0, "K5")).toEqual({ kind: "number", value: 170 });
  } finally {
    again.dispose();
  }
  const cache = leesXml(new Pakket(refreshed.bytes).lees(t.cachePad));
  expect(attr(cache, "recordCount")).toBe("6");
});
