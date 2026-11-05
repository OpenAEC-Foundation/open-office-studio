import { describe, expect, it } from "vitest";
import { plaatsFormuleBereik, verwijzingsplek } from "./formuleVerwijzing";

describe("muisverwijzingen in de uitgebreide formulebalk (#58)", () => {
  it("voegt een cel in zonder de conceptformule of de tekst erna te verliezen", () => {
    const tekst = "=SUM()+B3", plek = verwijzingsplek(tekst, 5)!;
    expect(plaatsFormuleBereik(tekst, plek, { row: 0, col: 0 }, { row: 0, col: 0 }))
      .toEqual({ tekst: "=SUM(A1)+B3", cursor: 7 });
  });
  it("berekent elke sleepstand vanaf dezelfde oorspronkelijke invoegplek", () => {
    const tekst = "=SUM(", plek = verwijzingsplek(tekst, 5)!;
    const anker = { row: 2, col: 2 };
    expect(plaatsFormuleBereik(tekst, plek, anker, { row: 1, col: 0 }).tekst).toBe("=SUM(A2:C3");
    expect(plaatsFormuleBereik(tekst, plek, anker, { row: 0, col: 1 }).tekst).toBe("=SUM(B1:C3");
  });
  it("vervangt de bestaande verwijzing onder de cursor als geheel", () => {
    const tekst = "=SUM($A$1:B2)+C3", plek = verwijzingsplek(tekst, 8)!;
    expect(plaatsFormuleBereik(tekst, plek, { row: 3, col: 3 }, { row: 4, col: 3 }).tekst)
      .toBe("=SUM(D4:D5)+C3");
  });
  it("vervangt alleen de geselecteerde formuletekst", () => {
    const tekst = "=SUM(A1,B2)", plek = verwijzingsplek(tekst, 8, 10)!;
    expect(plaatsFormuleBereik(tekst, plek, { row: 5, col: 2 }, { row: 5, col: 2 }).tekst)
      .toBe("=SUM(A1,C6)");
  });
  it.each([
    ["gewone tekst", 5], ['="een tekst"', 5], ['="een ""tekst"""', 10], ["='Blad een'!A1", 5], ["=A1", 0], ["=A1", 4],
  ])("neemt geen rasterverwijzing over in %s op positie %s", (tekst, cursor) => {
    expect(verwijzingsplek(tekst, cursor)).toBeNull();
  });
  it("herkent het einde van een volledig aangehaalde bladverwijzing", () => {
    expect(verwijzingsplek("='Blad een'!A1", 14)).toEqual({ begin: 1, eind: 14 });
  });
});
