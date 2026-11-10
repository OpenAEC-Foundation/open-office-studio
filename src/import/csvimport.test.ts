import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  STANDAARD_INSTELLINGEN,
  bereidCsvVoor,
  csvNaarXlsx,
  herkenInstellingen,
  leesDatum,
  leesGetal,
  ontleedCsv,
  raadScheidingsteken,
  typeerCel,
} from "./csvimport";
import { bereidOpenen } from "./openen";

const enc = (t: string) => new TextEncoder().encode(t);
const nl = { getalnotatie: "nl", datumvolgorde: "DMJ" } as const;

describe("CSV ontleden", () => {
  it("volgt RFC 4180 met afgebakende velden, dubbele tekens en regeleinden", () => {
    expect(ontleedCsv('a;"b;c";"d ""e"""\r\n"f\ng";h', ";", '"')).toEqual([
      ["a", "b;c", 'd "e"'],
      ["f\ng", "h"],
    ]);
    expect(ontleedCsv("'x,y',z", ",", "'")).toEqual([["x,y", "z"]]);
    expect(ontleedCsv('"x,y",z', ",", "")).toEqual([['"x', 'y"', "z"]]);
  });
  it("herkent het scheidingsteken", () => {
    expect(raadScheidingsteken("a;b;c\n1;2,5;3\n")).toBe(";");
    expect(raadScheidingsteken("a,b,c\n1,2.5,3\n")).toBe(",");
    expect(raadScheidingsteken("a\tb\n1\t2\n")).toBe("\t");
    expect(raadScheidingsteken('naam,"adres; straat"\nx,"y; z"\n')).toBe(",");
  });
  it("herkent codering en getalnotatie voor het venster", () => {
    const bytes = new Uint8Array([
      ...enc("Prijs;Plaats\n1.234,50;Caf"),
      0xe9,
      ...enc("\n"),
    ]);
    const ingesteld = herkenInstellingen(bytes, "csv");
    expect(ingesteld).toMatchObject({
      scheidingsteken: ";",
      getalnotatie: "nl",
    });
    expect(
      herkenInstellingen(enc("a,b\n1,234.5,x\n"), "csv").getalnotatie,
    ).toBe("en");
  });
});

describe("Celtypen", () => {
  it("leest NL- en EN-getallen, procenten en weigert dubbelzinnige notaties", () => {
    expect(leesGetal("1.234,56", "nl")).toEqual({
      waarde: 1234.56,
      procent: false,
    });
    expect(leesGetal("1,234.56", "en")).toEqual({
      waarde: 1234.56,
      procent: false,
    });
    expect(leesGetal("12,5%", "nl")).toEqual({ waarde: 0.125, procent: true });
    expect(leesGetal("12.5", "nl")).toBeNull();
    expect(leesGetal("-3", "nl")!.waarde).toBe(-3);
  });
  it("leest datums in de gekozen volgorde en ISO", () => {
    expect(leesDatum("31-12-2026", "DMJ")).toEqual({
      waarde: 46387,
      tijd: false,
    });
    expect(leesDatum("12/31/2026", "MDJ")).toEqual({
      waarde: 46387,
      tijd: false,
    });
    expect(leesDatum("2026-12-31 12:00", "DMJ")).toEqual({
      waarde: 46387.5,
      tijd: true,
    });
    expect(leesDatum("31-02-2026", "DMJ")).toBeNull();
    expect(leesDatum("01-02-03", "JMD")!.waarde).toBe(
      leesDatum("2001-02-03", "DMJ")!.waarde,
    );
  });
  it("houdt voorloopnullen, lange codes en formules als tekst", () => {
    expect(typeerCel("01234", "standaard", nl)).toMatchObject({
      soort: "tekst",
    });
    expect(typeerCel("NL91ABNA0417164300", "standaard", nl)).toMatchObject({
      soort: "tekst",
    });
    expect(typeerCel("8712345678901234", "standaard", nl)).toMatchObject({
      soort: "tekst",
    });
    expect(typeerCel("0,5", "standaard", nl)).toMatchObject({
      soort: "getal",
      waarde: 0.5,
    });
    expect(typeerCel("42", "tekst", nl)).toMatchObject({ soort: "tekst" });
    expect(typeerCel('=HYPERLINK("x")', "standaard", nl)).toMatchObject({
      soort: "tekst",
      formuleachtig: true,
    });
    expect(typeerCel("+31 6 1234", "standaard", nl)).toMatchObject({
      soort: "tekst",
      formuleachtig: true,
    });
    expect(typeerCel("geen datum", "datum", nl)).toMatchObject({
      soort: "tekst",
    });
  });
});

describe("CSV naar XLSX", () => {
  const csv = [
    "Code;Bedrag;Datum;Opmerking;Weg",
    "0123;1.234,50;31-12-2026;=1+1;x",
    "0456;-7;01-01-2027;@SUM(A1);y",
  ].join("\r\n");

  it("importeert 150.000 rijen en verwijdert veel lege slotregels zonder stackfout", () => {
    const aantal = 150_000;
    const resultaat = csvNaarXlsx(
      enc("0123\n".repeat(aantal) + "\n".repeat(10_000)),
      { ...STANDAARD_INSTELLINGEN, scheidingsteken: ";" },
    );
    expect(resultaat).toMatchObject({
      rijen: aantal,
      kolommen: 1,
      afgekapt: false,
    });
    const pakket = unzipSync(resultaat.xlsx);
    const blad = strFromU8(pakket["xl/worksheets/sheet1.xml"]);
    expect(blad).toContain(`<c r="A${aantal}" t="s"><v>0</v></c>`);
    expect(blad).not.toContain(`<row r="${aantal + 1}">`);
    expect(strFromU8(pakket["xl/sharedStrings.xml"])).toContain(
      '<t xml:space="preserve">0123</t>',
    );
  });

  it("meldt kolomverlies ook wanneer de brede rij pas na rij 1000 staat", () => {
    const bytes = enc("code\n".repeat(1000) + "x;".repeat(16_384) + "VERLOREN");
    expect(bereidCsvVoor(bytes, STANDAARD_INSTELLINGEN).kolommen).toBe(16_385);
    const resultaat = csvNaarXlsx(bytes, {
      ...STANDAARD_INSTELLINGEN,
      scheidingsteken: ";",
    });
    expect(resultaat).toMatchObject({
      rijen: 1001,
      kolommen: 16_384,
      afgekapt: true,
    });
    const pakket = unzipSync(resultaat.xlsx);
    const blad = strFromU8(pakket["xl/worksheets/sheet1.xml"]);
    expect(blad).toContain('r="XFD1001"');
    expect(blad).not.toContain('r="XFE1001"');
    expect(strFromU8(pakket["xl/sharedStrings.xml"])).not.toContain("VERLOREN");
  });

  it("maakt een geldig werkblad met typen, kopregel en neutralisatie", () => {
    const resultaat = csvNaarXlsx(enc(csv), {
      ...STANDAARD_INSTELLINGEN,
      scheidingsteken: ";",
      kolomtypen: ["tekst", "standaard", "datum", "standaard", "overslaan"],
    });
    expect(resultaat).toMatchObject({
      rijen: 3,
      kolommen: 4,
      formuleachtig: 2,
    });
    const pakket = unzipSync(resultaat.xlsx);
    const blad = strFromU8(pakket["xl/worksheets/sheet1.xml"]);
    const teksten = strFromU8(pakket["xl/sharedStrings.xml"]);
    expect(blad).not.toContain("<f>");
    expect(blad).toContain('<c r="B2"><v>1234.5</v></c>');
    expect(blad).toContain('<c r="C2" s="1"><v>46387</v></c>');
    expect(blad).toMatch(/<c r="D2" t="s" s="3">/);
    expect(blad).toContain('state="frozen"');
    expect(teksten).toContain('<t xml:space="preserve">0123</t>');
    expect(teksten).toContain("=1+1");
    expect(teksten).not.toContain(">x<");
    expect(strFromU8(pakket["xl/styles.xml"])).toContain('quotePrefix="1"');
  });

  it("leest het resultaat met de rekenbladengine", async () => {
    const xlsx = await import("@betteroffice/xlsx");
    const { readFileSync } = await import("node:fs");
    await xlsx.initWasm(
      readFileSync(
        "node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm",
      ),
    );
    const { xlsx: bytes } = csvNaarXlsx(enc(csv), {
      ...STANDAARD_INSTELLINGEN,
      scheidingsteken: ";",
    });
    const inhoud = await xlsx.exportXlsxStructured(bytes, {
      maxCells: 1000,
      maxBytes: 1 << 20,
    });
    const cellen = inhoud.sheets[0].cells;
    const cel = (a1: string) =>
      cellen.find((c) => c.anchor.kind === "cell" && c.anchor.a1 === a1);
    expect(cel("A2")?.value).toEqual({ kind: "text", value: "0123" });
    expect(cel("B2")?.value).toEqual({ kind: "number", value: 1234.5 });
    expect(cel("D2")?.value).toEqual({ kind: "text", value: "=1+1" });
    expect(cel("C2")?.displayText).toBe("31-12-2026");
  });

  it("opent via de openroute met het venster of de herkende instellingen", async () => {
    const zonder = async () => {
      throw new Error("geen runtime");
    };
    const auto = (await bereidOpenen("Export.csv", enc(csv), {
      converteer: zonder,
    }))!;
    expect(auto).toMatchObject({
      soort: "xlsx",
      naam: "Export.xlsx",
      exportFormaat: "csv",
    });
    expect(auto.rapport!.regels.map((r) => r.onderdeel)).toContain(
      "Formuleachtige tekst",
    );
    const geannuleerd = await bereidOpenen("Export.tsv", enc("a\tb"), {
      converteer: zonder,
      vraagCsv: async () => null,
    });
    expect(geannuleerd).toBeNull();
  });
});
