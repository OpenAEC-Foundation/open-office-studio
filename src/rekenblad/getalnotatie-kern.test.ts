import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { maakGetalvoorbeelden } from "./getalvoorbeeld";
import { maakInvoerlezer } from "./invoerlezer";
import { bouwCode, STANDAARD_KEUZES } from "./getalnotatie";

const bytes = readFileSync("public/templates/nieuw.xlsx");
const open: { dispose(): void }[] = [];
afterEach(() => open.splice(0).forEach((v) => v.dispose()));
const voorbeeld = () => { const v = maakGetalvoorbeelden(bytes); open.push(v); return v; };

describe("getalvoorbeelden met de werkelijke rekenkern", () => {
  it("gebruikt zonder herkende bestandsregio dezelfde oude datumweergave als het bestand", () => {
    const v = voorbeeld();
    expect(v.toon(46054, 14, null, "1900").tekst).toBe("2/1/26");
    expect(v.toon(46054, 14, "nl-NL", "1900").tekst).toBe("01-02-2026");
    expect(v.toon(46054, 14, null, "1900").tekst).toBe("2/1/26");
  });
  it("volgt de bestandsregio bij een ingebouwde datum zonder die als eigen code vast te zetten", () => {
    const v = voorbeeld();
    expect(v.toon(46023, 14, "nl-NL", "1900")).toMatchObject({ tekst: "01-01-2026", code: "dd-mm-yyyy" });
    expect(v.toon(46023, 14, "en-US", "1900")).toMatchObject({ tekst: "01/01/2026", code: "mm/dd/yyyy" });
    expect(v.toon(46023.625, 22, "nl-NL", "1900")).toMatchObject({ tekst: "01-01-2026 15:00", code: "dd-mm-yyyy h:mm" });
    expect(v.toon(0, 14, "nl-NL", "1904")).toMatchObject({ tekst: "01-01-1904", code: "dd-mm-yyyy" });
  });
  it("meldt dat een ongeschikte breukcode terugvalt op Algemene notatie", () => {
    const v = voorbeeld().toon(1234.5, "0/0/0", "nl-NL", "1900");
    expect(v.fout).toBeTruthy();
    expect(v.tekst).toBe("1234,5");
  });
  it.each([
    [1234.5678, "General", "1234,5678"],
    [1234.5678, "#,##0.00", "1.234,57"],
    [1234.5, "[$€-413] #,##0.00", "€ 1.234,50"],
    [46023, "dd-mm-yyyy", "01-01-2026"],
    [0.625, "hh:mm", "15:00"],
    [0.15, "0.00%", "15,00%"],
    [1.75, "# ?/?", "1 3/4"],
    [1234.5, "0.00E+00", "1,23E+03"],
    ["tekst", "@", "tekst"],
    [12.5, '0.00" kg;liter"', "12,50 kg;liter"],
  ])("geeft %s met code %s correct weer", (waarde, code, verwacht) => {
    expect(voorbeeld().toon(waarde, code as string, "nl-NL", "1900").tekst).toBe(verwacht);
  });
  it("toont werkelijke rode kleur en haakjes", () => {
    expect(voorbeeld().toon(-1234.5, "#,##0.00;[Red](#,##0.00)", "nl-NL", "1900"))
      .toMatchObject({ tekst: "(1.234,50)", kleur: "red" });
  });
  it("volgt expliciete datumtaal, onafhankelijk van getalscheidingstekens", () => {
    const v = voorbeeld();
    expect(v.toon(46023, "[$-409]dddd d mmmm yyyy", "nl-NL", "1900").tekst).toBe("Thursday 1 January 2026");
    expect(v.toon(46023, "[$-413]dddd d mmmm yyyy", "en-US", "1900").tekst).toBe("donderdag 1 januari 2026");
    expect(v.toon(1234.5, "#,##0.00", "fr-FR", "1900").tekst).toBe("1\u202f234,50");
  });
  it("houdt beide datumoorsprongen en regio’s gescheiden", () => {
    const v = voorbeeld(); const origineel = Buffer.from(bytes);
    expect(v.toon(0, "dd-mm-yyyy", "nl-NL", "1904").tekst).toBe("01-01-1904");
    expect(v.toon(44561, "dd-mm-yyyy", "nl-NL", "1904").tekst).toBe("01-01-2026");
    expect(v.toon(46023, "dd-mm-yyyy", "nl-NL", "1900").tekst).toBe("01-01-2026");
    expect(v.toon(1234.5, "#,##0.00", "en-US", "1900").tekst).toBe("1,234.50");
    expect(v.toon(1234.5, "#,##0.00", "nl-NL", "1900").tekst).toBe("1.234,50");
    expect(bytes).toEqual(origineel);
  });
  it("ondersteunt de boekhoudcode uit het venster", () => {
    const v = voorbeeld(); const code = bouwCode("boekhouding", STANDAARD_KEUZES);
    expect(v.toon(1234.5, code, "nl-NL", "1900").tekst.replace(/\s/g, "")).toBe("€1.234,50");
    expect(v.toon(-1234.5, code, "nl-NL", "1900").tekst.replace(/\s/g, "")).toBe("€-1.234,50");
  });
  it("sluit idempotent en weigert daarna gebruik", () => {
    const v = voorbeeld(); v.dispose(); v.dispose();
    expect(() => v.toon(7, "General", "nl-NL", "1900")).toThrow("gesloten");
  });
});

describe("regionale bronwaarden zonder gebruikersbestand", () => {
  it("gebruikt zonder herkende regio de oorspronkelijke invoerroute", () => {
    const oud = maakInvoerlezer(bytes, null, "1900"); const brits = maakInvoerlezer(bytes, "en-GB", "1900"); open.push(oud, brits);
    expect(oud.lees([["1/2/2026"]])).toEqual([[{ kind: "number", value: 46024 }]]);
    expect(brits.lees([["1/2/2026"]])).toEqual([[{ kind: "number", value: 46054 }]]);
  });
  it.each([
    ["nl-NL", "1900", ["12,5", "1.234", "15%", "1-1-2026"], [12.5, 1234, 0.15, 46023]],
    ["nl-NL", "1904", ["12,5", "1.234", "15%", "1-1-2026"], [12.5, 1234, 0.15, 44561]],
    ["en-US", "1900", ["12.5", "1,234", "15%", "01/02/2026"], [12.5, 1234, 0.15, 46024]],
    ["fr-FR", "1900", ["12,5", "1\u202f234", "15%", "02/01/2026"], [12.5, 1234, 0.15, 46024]],
  ] as const)("leest %s %s", (regio, datumstelsel, teksten, getallen) => {
    const v = maakInvoerlezer(bytes, regio, datumstelsel); open.push(v);
    expect(v.lees([[...teksten]])).toEqual([getallen.map((value) => ({ kind: "number", value }))]);
  });
  it("evalueert geen gekopieerde formules en laat tekst tekst", () => {
    const v = maakInvoerlezer(bytes, "nl-NL", "1900"); open.push(v);
    expect(v.lees([["=A1+1", "'12,5", "onbekend"]])).toEqual([[{ kind: "text", value: "=A1+1" }, { kind: "text", value: "12,5" }, { kind: "text", value: "onbekend" }]]);
    expect(v.lees([["7"]])).toEqual([[{ kind: "number", value: 7 }]]);
    expect(v.lees([["12,5"]])).toEqual([[{ kind: "number", value: 12.5 }]]);
  });
});
