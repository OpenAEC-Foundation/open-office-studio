import { describe, expect, it } from "vitest";
import {
  bouwCode,
  herkenCode,
  STANDAARD_KEUZES,
  type Categorie,
  type Keuzes,
} from "./getalnotatie";
import { besteBreuk, landinstelling, splitsSecties, toonMetCode } from "./getalweergave";

const nl = landinstelling("nl-NL");
const en = landinstelling("en-GB");
const k = (extra: Partial<Keuzes> = {}): Keuzes => ({ ...STANDAARD_KEUZES, ...extra });

describe("notatiecodes samenstellen", () => {
  it("getal met decimalen, duizendtallen en negatieve vormen", () => {
    expect(bouwCode("getal", k())).toBe("#,##0.00");
    expect(bouwCode("getal", k({ decimalen: 0, duizendtal: false }))).toBe("0");
    expect(bouwCode("getal", k({ negatief: "rood" }))).toBe("#,##0.00;[Red]-#,##0.00");
    expect(bouwCode("getal", k({ negatief: "haakjes" }))).toBe("#,##0.00_);(#,##0.00)");
    expect(bouwCode("getal", k({ negatief: "roodHaakjes" }))).toBe("#,##0.00_);[Red](#,##0.00)");
  });
  it("valuta, boekhouding, procent, wetenschappelijk, tekst", () => {
    expect(bouwCode("valuta", k())).toBe("[$€-413] #,##0.00;[$€-413] -#,##0.00");
    expect(bouwCode("valuta", k({ valuta: "eurNa", decimalen: 0 }))).toBe("#,##0 [$€-407]");
    expect(bouwCode("boekhouding", k())).toBe(
      '_-[$€-413] * #,##0.00_-;_-[$€-413] * -#,##0.00_-;_-[$€-413] * "-"??_-;_-@_-',
    );
    expect(bouwCode("percentage", k({ decimalen: 1 }))).toBe("0.0%");
    expect(bouwCode("wetenschappelijk", k())).toBe("0.00E+00");
    expect(bouwCode("tekst", k())).toBe("@");
    expect(bouwCode("algemeen", k())).toBe("General");
  });
  it("herkent wat het zelf maakt, en anders aangepast", () => {
    const gevallen: [Categorie, Partial<Keuzes>][] = [
      ["getal", { decimalen: 3, negatief: "roodHaakjes" }],
      ["valuta", { valuta: "usd", decimalen: 0, negatief: "rood" }],
      ["boekhouding", { valuta: "geen" }],
      ["percentage", { decimalen: 0 }],
      ["wetenschappelijk", { decimalen: 1 }],
    ];
    for (const [categorie, keuzes] of gevallen) {
      const code = bouwCode(categorie, k(keuzes));
      const herkend = herkenCode(code);
      expect(herkend.categorie).toBe(categorie);
      expect(bouwCode(herkend.categorie, herkend.keuzes)).toBe(code);
    }
    expect(herkenCode("d-m-yyyy").categorie).toBe("datum");
    expect(herkenCode("[h]:mm:ss").categorie).toBe("tijd");
    expect(herkenCode("# ?/?").categorie).toBe("breuk");
    expect(herkenCode('0.00" kg"')).toMatchObject({ categorie: "aangepast", keuzes: { code: '0.00" kg"' } });
  });
});

describe("voorbeeld met landinstelling", () => {
  it("decimale komma en punt als duizendtal (nl), andersom (en)", () => {
    expect(toonMetCode(1234.567, "#,##0.00", nl).tekst).toBe("1.234,57");
    expect(toonMetCode(1234.567, "#,##0.00", en).tekst).toBe("1,234.57");
    expect(toonMetCode(-1234.567, "#,##0.00", nl).tekst).toBe("-1.234,57");
    expect(toonMetCode(0.5, "0", nl).tekst).toBe("1");
    expect(toonMetCode(0.25, "0.0#", nl).tekst).toBe("0,25");
    expect(toonMetCode(0.2, "0.0#", nl).tekst).toBe("0,2");
    expect(toonMetCode(1234567, "#,##0,", nl).tekst).toBe("1.235");
  });
  it("negatief rood of tussen haakjes", () => {
    expect(toonMetCode(-5, "#,##0.00;[Red]-#,##0.00", nl)).toEqual({ tekst: "-5,00", kleur: "red" });
    expect(toonMetCode(-5, "#,##0.00_);(#,##0.00)", nl).tekst).toBe("(5,00)");
    expect(toonMetCode(5, "#,##0.00_);(#,##0.00)", nl).tekst).toBe("5,00 ");
    expect(toonMetCode(-5, "#,##0.00_);[Red](#,##0.00)", nl)).toEqual({ tekst: "(5,00)", kleur: "red" });
  });
  it("valuta en boekhouding", () => {
    expect(toonMetCode(-1234.5, "[$€-413] #,##0.00;[$€-413] -#,##0.00", nl).tekst).toBe("€ -1.234,50");
    expect(toonMetCode(1234.5, "#,##0 [$€-407]", nl).tekst).toBe("1.235 €");
    expect(
      toonMetCode(0, '_-[$€-413] * #,##0.00_-;_-[$€-413] * -#,##0.00_-;_-[$€-413] * "-"??_-;_-@_-', nl)
        .tekst,
    ).toBe(" €  -   ");
  });
  it("procent, wetenschappelijk, breuken", () => {
    expect(toonMetCode(0.125, "0.0%", nl).tekst).toBe("12,5%");
    expect(toonMetCode(-1234.5678, "0.00E+00", nl).tekst).toBe("-1,23E+03");
    expect(toonMetCode(0.000123, "0.00E+00", en).tekst).toBe("1.23E-04");
    expect(toonMetCode(12345, "##0.0E+0", en).tekst).toBe("12.3E+3");
    expect(toonMetCode(1.75, "# ?/?", nl).tekst).toBe("1 3/4");
    expect(toonMetCode(0.3333, "# ??/??", nl).tekst).toBe("1/3");
    expect(toonMetCode(2.5, "# ?/4", nl).tekst).toBe("2 2/4");
    expect(toonMetCode(3, "# ?/?", nl).tekst).toBe("3");
    expect(besteBreuk(Math.PI - 3, 9)).toEqual([1, 7]);
    expect(besteBreuk(Math.PI - 3, 99)).toEqual([14, 99]);
  });
  it("datum en tijd met maandnamen van de taal", () => {
    // 46000,75 = 9 december 2025, 18:00
    expect(toonMetCode(46000.75, "d-m-yyyy", nl).tekst).toBe("9-12-2025");
    expect(toonMetCode(46000.75, "dddd d mmmm yyyy", nl).tekst).toBe("dinsdag 9 december 2025");
    expect(toonMetCode(46000.75, "dddd d mmmm yyyy", en).tekst).toBe("Tuesday 9 December 2025");
    expect(toonMetCode(46000.75, "hh:mm", nl).tekst).toBe("18:00");
    expect(toonMetCode(46000.75, "h:mm AM/PM", en).tekst).toMatch(/^6:00 pm$/i);
    expect(toonMetCode(1.5, "[h]:mm:ss", nl).tekst).toBe("36:00:00");
    expect(toonMetCode(46000.75, "d-m-yyyy h:mm", nl).tekst).toBe("9-12-2025 18:00");
    expect(toonMetCode(-1, "d-m-yyyy", nl).tekst).toBe("#######");
  });
  it("tekst, letterlijke tekst, secties en voorwaarden", () => {
    expect(toonMetCode("abc", "@", nl).tekst).toBe("abc");
    expect(toonMetCode("abc", '0.00;-0.00;0;"tekst: "@', nl).tekst).toBe("tekst: abc");
    expect(toonMetCode(2.5, '0.00" kg"', nl).tekst).toBe("2,50 kg");
    expect(toonMetCode(0, '0;-0;"nul"', nl).tekst).toBe("nul");
    expect(toonMetCode(1500, "[>=1000]#,##0;0.0", nl).tekst).toBe("1.500");
    expect(toonMetCode(15, "[>=1000]#,##0;0.0", nl).tekst).toBe("15,0");
    expect(toonMetCode(1234.5, "General", nl).tekst).toBe("1234,5");
    expect(toonMetCode(-0.1, "General", en).tekst).toBe("-0.1");
    expect(splitsSecties('0;"a;b";[Red]0')).toEqual(["0", '"a;b"', "[Red]0"]);
  });
});
