import { describe, expect, it } from "vitest";
import type { XlsxCellValue } from "@betteroffice/xlsx";
import { huidigGebied, lijktKopregel, sorteerLijsten, sorteerRijen } from "./rekenblad-sorteren";

const g = (value: number): XlsxCellValue => ({ kind: "number", value });
const t = (value: string): XlsxCellValue => ({ kind: "text", value });
const b = (value: boolean): XlsxCellValue => ({ kind: "bool", value });
const leeg: XlsxCellValue = { kind: "empty" };
const waarden = { op: "waarden" as const };

describe("sorteren", () => {
  it("sorteert getallen, tekst, logisch en fouten zoals Excel, lege cellen onderaan", () => {
    const rijen = [[t("b")], [leeg], [g(2)], [b(true)], [{ kind: "error", value: "#N/A" } as XlsxCellValue], [g(1)], [t("A")]];
    expect(sorteerRijen(rijen, [{ kolom: 0, aflopend: false, ...waarden }], { hoofdlettergevoelig: false, taal: "nl" })).toEqual([5, 2, 6, 0, 3, 4, 1]);
    expect(sorteerRijen(rijen, [{ kolom: 0, aflopend: true, ...waarden }], { hoofdlettergevoelig: false, taal: "nl" })).toEqual([4, 3, 0, 6, 2, 5, 1]);
  });
  it("gebruikt de taal en optioneel hoofdletters", () => {
    const rijen = [[t("Été")], [t("ete")], [t("eta")], [t("Ete")]];
    const zonder = sorteerRijen(rijen, [{ kolom: 0, aflopend: false, ...waarden }], { hoofdlettergevoelig: false, taal: "fr" });
    expect(zonder.map((i) => (rijen[i][0] as { value: string }).value)).toEqual(["eta", "ete", "Ete", "Été"]);
    const met = sorteerRijen([[t("B")], [t("b")], [t("a")], [t("A")]], [{ kolom: 0, aflopend: false, ...waarden }], { hoofdlettergevoelig: true, taal: "nl" });
    expect(met).toEqual([2, 3, 1, 0]);
    const ij = sorteerRijen([[t("Zon")], [t("ä")], [t("aap")]], [{ kolom: 0, aflopend: false, ...waarden }], { hoofdlettergevoelig: false, taal: "de" });
    expect(ij).toEqual([1, 2, 0]);
  });
  it("sorteert op meerdere niveaus en stabiel", () => {
    const rijen = [
      [t("b"), g(2)],
      [t("a"), g(2)],
      [t("a"), g(1)],
      [t("b"), g(1)],
    ];
    expect(
      sorteerRijen(rijen, [{ kolom: 1, aflopend: true, ...waarden }, { kolom: 0, aflopend: false, ...waarden }], { hoofdlettergevoelig: false, taal: "nl" }),
    ).toEqual([1, 0, 2, 3]);
  });
  it("sorteert op een eigen lijst en op kleur", () => {
    const dagen = sorteerLijsten("nl").find((l) => l.includes("maandag"))!;
    const rijen = [[t("Woensdag")], [t("maandag")], [t("x")], [t("dinsdag")]];
    expect(sorteerRijen(rijen, [{ kolom: 0, aflopend: false, op: "waarden", lijst: dagen }], { hoofdlettergevoelig: false, taal: "nl" })).toEqual([1, 3, 0, 2]);
    const kleuren = ["#ff0000", null, "#ff0000", "#00ff00"];
    expect(
      sorteerRijen([[g(1)], [g(2)], [g(3)], [g(4)]], [{ kolom: 0, aflopend: false, op: "celkleur", kleur: "#ff0000" }], {
        hoofdlettergevoelig: false,
        kleuren: [kleuren],
      }),
    ).toEqual([0, 2, 1, 3]);
  });
  it("herkent een kopregel", () => {
    expect(lijktKopregel([[t("Naam"), t("Bedrag")], [t("a"), g(1)]])).toBe(true);
    expect(lijktKopregel([[t("a")], [t("b")]])).toBe(false);
    expect(lijktKopregel([[t("Naam")], [t("b")]], true)).toBe(true);
    expect(lijktKopregel([[g(1)], [g(2)]], true)).toBe(false);
  });
  it("vindt het aaneengesloten gebied rond een cel", () => {
    const vol = new Set(["1:1", "1:2", "2:1", "3:2", "3:3", "6:6"]);
    const gevuld = (r: number, c: number) => vol.has(`${r}:${c}`);
    expect(huidigGebied(gevuld, { row: 2, col: 1 }, { top: 0, left: 0, bottom: 10, right: 10 })).toEqual({ top: 1, left: 1, bottom: 3, right: 3 });
    expect(huidigGebied(gevuld, { row: 6, col: 6 }, { top: 0, left: 0, bottom: 10, right: 10 })).toEqual({ top: 6, left: 6, bottom: 6, right: 6 });
  });
});
