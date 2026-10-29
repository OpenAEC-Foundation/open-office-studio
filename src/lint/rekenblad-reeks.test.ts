import { describe, expect, it } from "vitest";
import {
  aantalTotEind,
  datumStap,
  isDatumnotatie,
  plusMaanden,
  plusWerkdagen,
  reeksWaarden,
  serieelUitDatum,
  datumUitSerieel,
  vulReeks,
  werkdagenTussen,
  type BronCel,
} from "./rekenblad-reeks";

const g = (value: number, datum = false): BronCel => ({
  input: String(value),
  isFormula: false,
  waarde: { kind: "number", value },
  datum,
});
const t = (value: string): BronCel => ({ input: value, isFormula: false, waarde: { kind: "text", value } });
const f = (input: string): BronCel => ({ input, isFormula: true, waarde: { kind: "number", value: 0 } });
const invoer = (r: { input: string }[]) => r.map((x) => x.input);

describe("getallen", () => {
  it("kopieert één getal bij slepen, maar telt op als reeks", () => {
    expect(invoer(vulReeks([g(5)], [1, 2, 3]))).toEqual(["5", "5", "5"]);
    expect(invoer(vulReeks([g(5)], [1, 2, 3], "reeks"))).toEqual(["6", "7", "8"]);
  });
  it("zet een rekenkundige reeks voort, ook omhoog", () => {
    expect(invoer(vulReeks([g(1), g(3)], [2, 3, 4]))).toEqual(["5", "7", "9"]);
    expect(invoer(vulReeks([g(1), g(3)], [-1, -2]))).toEqual(["-1", "-3"]);
    expect(invoer(vulReeks([g(0.1), g(0.2)], [2, 3]))).toEqual(["0.3", "0.4"]);
  });
  it("volgt een lineaire trend bij ongelijke stappen, zoals Excel", () => {
    expect(invoer(vulReeks([g(1), g(2), g(4)], [3]))).toEqual(["5.33333333333333"]);
  });
  it("kopieert in kopieermodus", () => {
    expect(invoer(vulReeks([g(1), g(2)], [2, 3, 4], "kopie"))).toEqual(["1", "2", "1"]);
  });
});

describe("datums", () => {
  const jan31 = serieelUitDatum(2026, 1, 31);
  it("rekent met seriële datums", () => {
    expect(datumUitSerieel(46023)).toEqual({ jaar: 2026, maand: 1, dag: 1 });
    expect(serieelUitDatum(2026, 1, 1)).toBe(46023);
  });
  it("telt dagen op en herkent maanden en jaren", () => {
    expect(invoer(vulReeks([g(46023, true)], [1, 2]))).toEqual(["46024", "46025"]);
    const feb1 = serieelUitDatum(2026, 2, 1);
    expect(datumStap([46023, feb1])).toEqual({ eenheid: "maand", stap: 1 });
    expect(datumStap([46023, serieelUitDatum(2027, 1, 1)])).toEqual({ eenheid: "jaar", stap: 1 });
    expect(invoer(vulReeks([g(46023, true), g(feb1, true)], [2]))).toEqual([
      String(serieelUitDatum(2026, 3, 1)),
    ]);
  });
  it("houdt de laatste dag van de maand aan", () => {
    expect(datumUitSerieel(plusMaanden(jan31, 1))).toEqual({ jaar: 2026, maand: 2, dag: 28 });
    expect(datumUitSerieel(plusMaanden(jan31, 2))).toEqual({ jaar: 2026, maand: 3, dag: 31 });
  });
  it("slaat weekends over bij werkdagen", () => {
    const vrijdag = serieelUitDatum(2026, 1, 2);
    expect(datumUitSerieel(plusWerkdagen(vrijdag, 1))).toEqual({ jaar: 2026, maand: 1, dag: 5 });
    expect(datumUitSerieel(plusWerkdagen(serieelUitDatum(2026, 1, 5), -1))).toEqual({ jaar: 2026, maand: 1, dag: 2 });
    expect(werkdagenTussen(vrijdag, serieelUitDatum(2026, 1, 6))).toBe(2);
    expect(invoer(vulReeks([g(vrijdag, true)], [1, 2], { datum: "werkdag" }))).toEqual([
      String(serieelUitDatum(2026, 1, 5)),
      String(serieelUitDatum(2026, 1, 6)),
    ]);
  });
  it("herkent datumnotaties", () => {
    expect(isDatumnotatie("dd-mm-yyyy")).toBe(true);
    expect(isDatumnotatie("d mmm")).toBe(true);
    expect(isDatumnotatie("hh:mm")).toBe(false);
    expect(isDatumnotatie("0.00")).toBe(false);
    expect(isDatumnotatie('0 "dagen"')).toBe(false);
  });
});

describe("namen en tekst", () => {
  it("zet Nederlandse en Engelse dagen en maanden voort met dezelfde hoofdletters", () => {
    expect(invoer(vulReeks([t("maandag")], [1, 2]))).toEqual(["dinsdag", "woensdag"]);
    expect(invoer(vulReeks([t("Zondag")], [1]))).toEqual(["Maandag"]);
    expect(invoer(vulReeks([t("JAN")], [1, 2]))).toEqual(["FEB", "MRT"]);
    expect(invoer(vulReeks([t("December")], [1]))).toEqual(["Januari"]);
    expect(invoer(vulReeks([t("Mon"), t("Wed")], [2]))).toEqual(["Fri"]);
    expect(invoer(vulReeks([t("march")], [-1]))).toEqual(["february"]);
  });
  it("telt het getal in tekst op, met voorloopnullen", () => {
    expect(invoer(vulReeks([t("Week 1")], [1, 2]))).toEqual(["Week 2", "Week 3"]);
    expect(invoer(vulReeks([t("Item 1"), t("Item 3")], [2]))).toEqual(["Item 5"]);
    expect(invoer(vulReeks([t("K-007")], [1]))).toEqual(["K-008"]);
    expect(invoer(vulReeks([t("3e kwartaal")], [1]))).toEqual(["4e kwartaal"]);
    expect(invoer(vulReeks([t("a1"), t("b1")], [2, 3]))).toEqual(["a2", "b2"]);
  });
  it("herhaalt gewone tekst", () => {
    expect(invoer(vulReeks([t("x"), t("y")], [2, 3, 4]))).toEqual(["x", "y", "x"]);
  });
});

describe("formules", () => {
  it("verschuift relatieve verwijzingen langs de vulrichting", () => {
    expect(invoer(vulReeks([f("=A1*2")], [1, 2]))).toEqual(["=A2*2", "=A3*2"]);
    expect(invoer(vulReeks([f("=A1+$B$1")], [1], "auto", "rij"))).toEqual(["=B1+$B$1"]);
    expect(invoer(vulReeks([f("=A2")], [-1]))).toEqual(["=A1"]);
  });
});

describe("venster Reeks", () => {
  it("vult lineair, als groei en als datum", () => {
    const opties = { soort: "lineair" as const, eenheid: "dag" as const, stap: 2, eind: null };
    expect(reeksWaarden(1, 4, opties)).toEqual([3, 5, 7]);
    expect(reeksWaarden(1, 4, { ...opties, soort: "groei", stap: 3 })).toEqual([3, 9, 27]);
    expect(reeksWaarden(46023, 3, { ...opties, soort: "datum", eenheid: "maand", stap: 1 })).toEqual([
      serieelUitDatum(2026, 2, 1),
      serieelUitDatum(2026, 3, 1),
    ]);
  });
  it("stopt bij de eindwaarde", () => {
    const opties = { soort: "lineair" as const, eenheid: "dag" as const, stap: 5, eind: 12 };
    expect(reeksWaarden(1, 5, opties)).toEqual([6, 11, null, null]);
    expect(aantalTotEind(1, opties)).toBe(3);
    expect(aantalTotEind(10, { ...opties, stap: -3, eind: 0 })).toBe(4);
  });
});
