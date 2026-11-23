import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openWorkbook } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import { leesTekenobjecten } from "./tekenobjecten";
import { chordGeometrie, leesChordHoeken } from "./chordGeometrie";

const map = "qa/sxc-chord-render/fixtures/";
const bron = readFileSync(map + "calcshapes-converted.xlsx");
const golden = JSON.parse(
  readFileSync(map + "ray-oracle-before-fix.json", "utf8"),
) as {
  case: string;
  width: number;
  height: number;
  adj1: number;
  adj2: number;
  start: number[];
  end: number[];
  sweepUnits: number;
}[];
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const object = (b: Uint8Array) =>
  leesTekenobjecten(b).find((o) => o.vorm === "chord")!;

describe("existing DrawingML chord rendering (#380)", () => {
  it("reads the genuine SXC converter output without inventing or rewriting its shape", () => {
    expect(hash(readFileSync(map + "calcshapes.sxc"))).toBe(
      "9a367d8e849001453b7d5684401f769abd63a621165ea3878da9d64b6fe2de2d",
    );
    expect(hash(bron)).toBe(
      "7b3410fa3b5cb0897bf6a4caf61390e65199aa5e9f5c1f95f3025c49932c1196",
    );
    expect(object(bron)).toMatchObject({
      soort: "vorm",
      id: "3",
      vorm: "chord",
      chord: { begin: 7798761, einde: 347606 },
      plek: { row: 2, col: 2, breedte: 958320 / 9525, hoogte: 736560 / 9525 },
      vulling: "#99CCFF",
      rotatie: 0,
      spiegelX: false,
      spiegelY: false,
    });
  });

  for (const c of golden)
    it(`matches independent conic/ray endpoints: ${c.case}`, () => {
      const g = chordGeometrie(c.width, c.height, {
        begin: c.adj1,
        einde: c.adj2,
      })!;
      expect(g.start.x).toBeCloseTo(c.start[0], 10);
      expect(g.start.y).toBeCloseTo(c.start[1], 10);
      expect(g.eind.x).toBeCloseTo(c.end[0], 10);
      expect(g.eind.y).toBeCloseTo(c.end[1], 10);
      expect(g.einde).toBeGreaterThan(g.begin);
      expect(g.pad).toMatch(/^M .* Z$/);
      if (c.adj1 === c.adj2) {
        expect(g.einde - g.begin).toBeCloseTo(2 * Math.PI, 12);
        expect(g.pad.match(/A /g)).toHaveLength(2);
      } else {
        expect(g.pad.match(/A /g)).toHaveLength(1);
        expect(g.pad).toContain(` 0 ${c.sweepUnits > 10800000 ? 1 : 0} 1 `);
      }
    });

  it("keeps defaults, pins literal adjustments and rejects unsupported/ambiguous formulas", () => {
    expect(leesChordHoeken([])).toEqual({ begin: 2700000, einde: 16200000 });
    expect(
      leesChordHoeken([
        { naam: "adj1", formule: "val -1" },
        { naam: "adj2", formule: "val 21600000" },
      ]),
    ).toEqual({ begin: 0, einde: 21599999 });
    for (const formule of [
      "*/ w 1 2",
      "val Infinity",
      "val NaN",
      "val 9007199254740992",
      "val 1.5",
      "val",
    ])
      expect(leesChordHoeken([{ naam: "adj1", formule }])).toBeUndefined();
    expect(
      leesChordHoeken([
        { naam: "adj1", formule: "val 1" },
        { naam: "adj1", formule: "val 2" },
      ]),
    ).toBeUndefined();
    for (const [w, h] of [
      [0, 10],
      [-1, 10],
      [10, 0],
      [NaN, 10],
      [10, Infinity],
    ])
      expect(chordGeometrie(w, h, { begin: 0, einde: 5400000 })).toBeNull();
    expect(chordGeometrie(100, 50, { begin: NaN, einde: 0 })).toBeNull();
  });

  it("keeps a valid but unsupported adjustment formula explicit as a preserved placeholder", () => {
    const p = new Pakket(bron),
      pad = object(bron).tekening;
    const xml = p
      .lees(pad)
      .replace('name="adj1" fmla="val 7798761"', 'name="adj1" fmla="*/ w 1 2"');
    p.schrijf(pad, xml);
    expect(object(p.inpakken())).toMatchObject({
      soort: "onbekend",
      vorm: "chord",
      chord: undefined,
    });
    expect(p.lees(pad)).toBe(xml);
  });

  it("retains rotation/flips/style/anchors and original object XML through cell save and fresh reopen", () => {
    const p = new Pakket(bron),
      pad = object(bron).tekening;
    const xml = p
      .lees(pad)
      .replace(
        '<a:xfrm><a:off x="2293560"',
        '<a:xfrm rot="1800000" flipH="1" flipV="1"><a:off x="2293560"',
      );
    expect(xml).not.toBe(p.lees(pad));
    p.schrijf(pad, xml);
    const original = p.inpakken(),
      before = object(original);
    expect(before).toMatchObject({
      rotatie: 30,
      spiegelX: true,
      spiegelY: true,
    });
    const h = openWorkbook(original);
    let saved: Uint8Array;
    try {
      h.editCell(0, 0, 7, "QA_CHORD_380");
      h.editCell(0, 0, 8, "=40+2");
      h.undo();
      h.redo();
      saved = h.save();
      expect(object(saved)).toEqual(before);
    } finally {
      h.dispose();
    }
    const fresh = openWorkbook(saved!);
    try {
      const again = fresh.save(),
        after = new Pakket(again);
      expect(object(again)).toEqual(before);
      for (const name of p
        .namen()
        .filter((n) =>
          /^(xl\/(drawings|ctrlProps|media)\/|xl\/comments)/.test(n),
        ))
        expect(after.bytes(name), name).toEqual(p.bytes(name));
    } finally {
      fresh.dispose();
    }
  });
});
