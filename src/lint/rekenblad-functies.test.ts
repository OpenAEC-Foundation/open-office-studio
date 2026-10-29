import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ONDERSTEUNDE_FUNCTIES } from "../rekenbladcontrole";
import {
  aanvullingen,
  ARGUMENT_IDS,
  argumentBij,
  argumentOnderCursor,
  CATEGORIEEN,
  functie,
  FUNCTIES,
  syntaxis,
  verwijzingenIn,
  wisselAbsoluut,
  woordBijCursor,
} from "./rekenblad-functies";

const INTERFACETALEN = ["nl", "en", "de", "fr", "es", "it", "pt-BR", "zh-CN"];
const lees = (taal: string) =>
  JSON.parse(readFileSync(`src/i18n/locales/${taal}/functions.json`, "utf8")) as {
    fn: Record<string, string>;
    arg: Record<string, string>;
    cat: Record<string, string>;
  };

describe("catalogus", () => {
  it("bevat precies de functies die de rekenkern evalueert", () => {
    expect(FUNCTIES.map((f) => f.naam).sort()).toEqual([...ONDERSTEUNDE_FUNCTIES].sort());
  });
  it("heeft in elke interfacetaal een beschrijving, uitleg per argument en categorienamen", () => {
    for (const taal of INTERFACETALEN) {
      const t = lees(taal);
      expect(Object.keys(t.fn).sort(), taal).toEqual(FUNCTIES.map((f) => f.naam).sort());
      expect(Object.keys(t.arg).sort(), taal).toEqual(ARGUMENT_IDS);
      expect(Object.keys(t.cat).sort(), taal).toEqual([...CATEGORIEEN].sort());
    }
  });
  it("schrijft de syntaxis zoals Excel", () => {
    expect(syntaxis(functie("sum")!)).toBe("SUM(number1, [number2], …)");
    expect(syntaxis(functie("SUMIFS")!)).toBe(
      "SUMIFS(sum_range, criteria_range1, criteria1, [criteria_range2], [criteria2], …)",
    );
    expect(syntaxis(functie("VLOOKUP")!)).toBe("VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])");
    expect(syntaxis(functie("PI")!)).toBe("PI()");
  });
  it("vindt het argument bij herhalende groepen", () => {
    const sumifs = functie("SUMIFS")!;
    expect([0, 1, 2, 3, 4].map((n) => sumifs.argumenten[argumentBij(sumifs, n)].id)).toEqual([
      "sum_range",
      "criteria_range",
      "criteria",
      "criteria_range",
      "criteria",
    ]);
    const vl = functie("VLOOKUP")!;
    expect(argumentBij(vl, 7)).toBe(3);
  });
});

describe("typen in een formule", () => {
  it("herkent het woord vóór de cursor als functienaam", () => {
    expect(woordBijCursor("=su", 3)).toEqual({ begin: 1, woord: "su" });
    expect(woordBijCursor("=A1+vl", 6)).toEqual({ begin: 4, woord: "vl" });
    expect(woordBijCursor('="su', 4)).toBeNull();
    expect(woordBijCursor("=Blad1!A", 8)).toBeNull();
    expect(woordBijCursor("su", 2)).toBeNull();
    expect(woordBijCursor("=$A", 3)).toBeNull();
    expect(woordBijCursor("=sum(", 4)).toBeNull();
  });
  it("vult aan op naam", () => {
    expect(aanvullingen("vl").map((f) => f.naam)).toEqual(["VLOOKUP"]);
    expect(aanvullingen("SUMI").map((f) => f.naam)).toEqual(["SUMIF", "SUMIFS"]);
    expect(aanvullingen("")).toEqual([]);
  });
  it("weet in welk argument de cursor staat", () => {
    expect(argumentOnderCursor("=SUM(A1,", 8)).toEqual({ functie: "SUM", index: 1 });
    expect(argumentOnderCursor('=IF(A1=",",ROUND(B1,', 20)).toEqual({ functie: "ROUND", index: 1 });
    expect(argumentOnderCursor("=IF(A1,ROUND(B1,2),", 19)).toEqual({ functie: "IF", index: 2 });
    expect(argumentOnderCursor("=SUM({1,2,3}", 11)).toEqual({ functie: "SUM", index: 0 });
    expect(argumentOnderCursor("=A1+", 4)).toBeNull();
  });
});

describe("verwijzingen", () => {
  it("vindt verwijzingen buiten teksten, ook met bladnaam en bereik", () => {
    const refs = verwijzingenIn("=SUM(A1:B$2)+'Blad 2'!$C3+\"D4\"+LOG10(5)");
    expect(refs.map((r) => [r.tekst, r.blad, r.bereik])).toEqual([
      ["A1:B$2", null, { top: 0, left: 0, bottom: 1, right: 1 }],
      ["'Blad 2'!$C3", "Blad 2", { top: 2, left: 2, bottom: 2, right: 2 }],
    ]);
  });
  it("wisselt met F4 tussen relatief en absoluut", () => {
    expect(wisselAbsoluut("=A1", 3)).toEqual({ tekst: "=$A$1", begin: 5, eind: 5 });
    expect(wisselAbsoluut("=$A$1", 5)?.tekst).toBe("=A$1");
    expect(wisselAbsoluut("=A$1", 2)?.tekst).toBe("=$A1");
    expect(wisselAbsoluut("=$A1", 2)?.tekst).toBe("=A1");
    expect(wisselAbsoluut("=SUM(A1:B2)+C3", 7)).toEqual({ tekst: "=SUM($A$1:$B$2)+C3", begin: 14, eind: 14 });
    expect(wisselAbsoluut("=A1+B2", 0, 6)).toEqual({ tekst: "=$A$1+$B$2", begin: 0, eind: 10 });
    expect(wisselAbsoluut("=SUM(", 5)).toBeNull();
    expect(wisselAbsoluut("A1", 2)).toBeNull();
  });
});
