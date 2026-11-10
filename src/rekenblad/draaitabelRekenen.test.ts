import { expect, it } from "vitest";
import type { XlsxCellValue } from "@betteroffice/xlsx";
import {
  berekenDraaitabel,
  draaiVeldleden,
  draaiSleutel,
  type DraaiBron,
  type DraaiIndeling,
} from "./draaitabelRekenen";
const n = (value: number): XlsxCellValue => ({ kind: "number", value });
const s = (value: string): XlsxCellValue => ({ kind: "text", value });
const bron = (): DraaiBron => ({
  koppen: ["Region", "Product", "Amount"],
  datum1904: false,
  rijen: [
    [s("North"), s("A"), n(10)],
    [s("South"), s("A"), n(20)],
    [s("North"), s("B"), n(40)],
    [s("North"), s("A"), n(30)],
    [s("South"), s("B"), n(50)],
  ],
});
const cfg = (): DraaiIndeling => ({
  rijen: [{ id: "region", kolom: 0 }],
  kolommen: [{ id: "product", kolom: 1 }],
  waarden: [
    {
      id: "amount",
      naam: "Amount",
      kolom: 2,
      functie: "sum",
      weergave: "normal",
    },
  ],
  filters: [],
});
it("filters row and column members and enumerates members without a cross product", () => {
  const c = cfg();
  c.rijen[0].gekozen = [draaiSleutel(s("South"))];
  c.kolommen[0].gekozen = [draaiSleutel(s("B"))];
  expect(berekenDraaitabel(bron(), c).totaal).toEqual([n(50)]);
  expect(draaiVeldleden(bron(), c.rijen[0]).map((m) => m.tekst)).toEqual([
    "North",
    "South",
  ]);
});
it("rejects ambiguous duplicate axis fields and value captions before producing OOXML", () => {
  const c = cfg();
  c.filters = [{ ...c.rijen[0], id: "again", gekozen: null }];
  expect(() => berekenDraaitabel(bron(), c)).toThrow("invalidFields");
  c.filters = [];
  c.waarden.push({ ...c.waarden[0], id: "average", functie: "average" });
  expect(() => berekenDraaitabel(bron(), c)).toThrow("invalidFields");
});
it("aggregates typed row/column groups and calculates grand totals from source records", () => {
  const r = berekenDraaitabel(bron(), cfg());
  expect(r.rijen.map((t) => t[0].tekst)).toEqual(["North", "South"]);
  expect(r.kolommen.map((t) => t[0].tekst)).toEqual(["A", "B"]);
  expect(r.cellen).toEqual([
    [[n(40)], [n(40)]],
    [[n(20)], [n(50)]],
  ]);
  expect(r.rijtotalen).toEqual([[n(80)], [n(70)]]);
  expect(r.kolomtotalen).toEqual([[n(60)], [n(90)]]);
  expect(r.totaal).toEqual([n(150)]);
});
it("supports count, average, min and max without averaging already aggregated groups", () => {
  const c = cfg();
  c.waarden = ["count", "average", "min", "max"].map((f) => ({
    ...c.waarden[0],
    id: f,
    naam: f,
    functie: f as "count" | "average" | "min" | "max",
  }));
  const r = berekenDraaitabel(bron(), c);
  expect(r.cellen[0][0]).toEqual([n(2), n(20), n(10), n(30)]);
  expect(r.totaal).toEqual([n(5), n(30), n(10), n(50)]);
});
it("calculates row, column and grand percentages with the selected aggregation", () => {
  for (const [weergave, value] of [
    ["rowPercent", 0.5],
    ["columnPercent", 2 / 3],
    ["grandPercent", 40 / 150],
  ] as const) {
    const c = cfg();
    c.waarden[0].weergave = weergave;
    expect(berekenDraaitabel(bron(), c).cellen[0][0][0]).toEqual(n(value));
  }
});
it("filters source members with typed keys and sorts axes independently", () => {
  const c = cfg();
  c.rijen[0].aflopend = true;
  c.kolommen = [];
  c.filters = [{ id: "filter", kolom: 1, gekozen: [draaiSleutel(s("A"))] }];
  const r = berekenDraaitabel(bron(), c);
  expect(r.records).toBe(3);
  expect(r.totaal).toEqual([n(60)]);
  expect(r.rijen.map((t) => t[0].tekst)).toEqual(["South", "North"]);
  const b = bron();
  b.rijen = [
    [n(2), s("A"), n(10)],
    [s("2"), s("A"), n(20)],
  ];
  expect(berekenDraaitabel(b, cfg()).rijen).toHaveLength(2);
});
it("groups dates by year, quarter and month in both date systems", () => {
  for (const datum1904 of [false, true]) {
    const b = bron();
    b.datum1904 = datum1904;
    b.koppen = ["Date", "Product", "Amount"];
    const shift = datum1904 ? 1462 : 0;
    b.rijen = [
      [n(46024 - shift), s("A"), n(10)],
      [n(46117 - shift), s("A"), n(20)],
    ];
    for (const [eenheid, keys] of [
      ["year", ["year:2026"]],
      ["quarter", ["quarter:1", "quarter:2"]],
      ["month", ["month:1", "month:4"]],
    ] as const) {
      const c = cfg();
      c.rijen[0].groep = { soort: "datum", eenheid };
      expect(berekenDraaitabel(b, c).rijen.map((t) => t[0].sleutel)).toEqual(
        keys,
      );
    }
  }
});
it("groups numeric intervals without losing decimal boundaries, blanks, text or errors", () => {
  const b = bron();
  b.rijen = [
    [n(0.2), s("A"), n(10)],
    [n(0.3), s("A"), n(20)],
    [{ kind: "empty" }, s("A"), { kind: "empty" }],
  ];
  const c = cfg();
  c.rijen[0].groep = { soort: "getal", stap: 0.1, begin: 0 };
  expect(berekenDraaitabel(b, c).rijen.map((t) => t[0].sleutel)).toEqual([
    "empty",
    "interval:0.2",
    "interval:0.3",
  ]);
  b.rijen = [
    [s("North"), s("A"), { kind: "error", value: "#N/A" }],
    [s("North"), s("A"), s("text")],
  ];
  c.rijen[0].groep = undefined;
  expect(berekenDraaitabel(b, c).totaal).toEqual([
    { kind: "error", value: "#N/A" },
  ]);
  c.waarden[0].functie = "count";
  expect(berekenDraaitabel(b, c).totaal).toEqual([n(2)]);
});
it("refuses malformed configurations and excessive pivot cross products", () => {
  const b = bron();
  b.koppen = ["same", "same", "Amount"];
  expect(() => berekenDraaitabel(b, cfg())).toThrow("invalidSource");
  const c = cfg();
  c.rijen[0].groep = { soort: "getal", stap: 0 };
  expect(() => berekenDraaitabel(bron(), c)).toThrow("invalidGroup");
  const large = bron();
  large.rijen = Array.from({ length: 400 }, (_, i) => [n(i), n(i), n(1)]);
  expect(() => berekenDraaitabel(large, cfg())).toThrow("tooLarge");
});
