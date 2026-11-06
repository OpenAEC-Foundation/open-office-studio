import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  functiesInFormule,
  inventariseerRekenblad,
  isOndersteund,
  leesUitWerkboek,
  rekenbladMelding,
  vergelijkCache,
} from "./rekenbladcontrole";

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function werkboek(
  bladen: Record<string, string>,
  {
    calcPr = '<calcPr calcId="191029"/>',
    extra = {} as Record<string, string>,
  } = {},
) {
  const namen = Object.keys(bladen);
  const delen: Record<string, Uint8Array> = {
    "xl/workbook.xml": strToU8(
      `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${namen
        .map(
          (n, i) =>
            `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
        )
        .join("")}</sheets>${calcPr}</workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${namen
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("")}</Relationships>`,
    ),
  };
  namen.forEach((n, i) => {
    delen[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      `<worksheet xmlns="${MAIN}"><sheetData>${bladen[n]}</sheetData></worksheet>`,
    );
  });
  for (const [pad, inhoud] of Object.entries(extra))
    delen[pad] = strToU8(inhoud);
  return zipSync(delen);
}

describe("functienamen in formules", () => {
  it("vindt geneste functies maar geen tekst of bladnamen", () => {
    expect(
      functiesInFormule(
        `SUM(A1)+IF(B1>0,ROUND(C1,2),"FOO(1)")+'Blad (1)'!A1+_xlfn.XLOOKUP(1,A1:A2,B1:B2)`,
      ).sort(),
    ).toEqual(["IF", "ROUND", "SUM", "_XLFN.XLOOKUP"]);
  });
  it("kent de ondersteuning van de rekenkern", () => {
    expect(isOndersteund("SUM")).toBe(true);
    expect(isOndersteund("AREAS")).toBe(true);
    expect(isOndersteund("FACT")).toBe(true);
    expect(isOndersteund("ISOWEEKNUM")).toBe(true);
    expect(isOndersteund("_xlfn.XLOOKUP")).toBe(true);
    expect(isOndersteund("_xlfn._xlws.SORT")).toBe(true);
    expect(isOndersteund("RAND")).toBe(true);
    expect(isOndersteund("FACT")).toBe(true);
    expect(isOndersteund("IRR")).toBe(false);
    expect(isOndersteund("_xludf.SUM")).toBe(false);
    expect(isOndersteund("ONBEKENDEFUNCTIE")).toBe(false);
  });
});

describe("inventarisatie bij openen", () => {
  const bytes = werkboek(
    {
      Rekenen: [
        '<row r="1"><c r="A1"><v>2</v></c><c r="B1"><f>ONBEKEND(A1)</f><v>5</v></c>',
        '<c r="C1"><f>_xludf.MIJNMACRO(A1)</f><v>6</v></c>',
        '<c r="D1"><f>IRR(A1:A2)*A1</f><v>0.5</v></c></row>',
        '<row r="2"><c r="A2" t="e"><f>1/0</f><v>#DIV/0!</v></c>',
        '<c r="B2" t="e"><v>#N/A</v></c><c r="C2"><f>A1*3</f></c>',
        '<c r="D2" t="str"><f>IF(A1&gt;1,&quot;ja&quot;,&quot;nee&quot;)</f><v>ja</v></c></row>',
        '<row r="3"><c r="A3"><f t="shared" ref="A3:A4" si="0">IRR(A1:A2)+A1</f><v>2.4</v></c></row>',
        '<row r="4"><c r="A4"><f t="shared" si="0"/><v>2.7</v></c></row>',
      ].join(""),
    },
    {
      calcPr: '<calcPr calcId="191029" fullCalcOnLoad="1" calcMode="manual"/>',
      extra: { "xl/calcChain.xml": `<calcChain xmlns="${MAIN}"/>` },
    },
  );
  const controle = inventariseerRekenblad(bytes);

  it("vindt onbekende functies, ook in gedeelde formules", () => {
    expect(controle.formules).toBe(8);
    expect(controle.onbekendeFuncties).toEqual({
      ONBEKEND: ["Rekenen!B1"],
      "_XLUDF.MIJNMACRO": ["Rekenen!C1"],
      IRR: ["Rekenen!D1", "Rekenen!A3", "Rekenen!A4"],
    });
  });
  it("vindt foutcellen, formules zonder uitkomst en rekensignalen", () => {
    expect(controle.foutcellen).toEqual({
      "#DIV/0!": ["Rekenen!A2"],
      "#N/A": ["Rekenen!B2"],
    });
    expect(controle.zonderUitkomst).toEqual(["Rekenen!C2"]);
    expect(controle.volledigHerberekenen).toBe(true);
    expect(controle.handmatigRekenen).toBe(true);
    expect(controle.rekenketen).toBe(true);
    expect(controle.cellen.find((c) => c.cel === "D2")).toMatchObject({
      formule: 'IF(A1>1,"ja","nee")',
      opgeslagen: { kind: "text", value: "ja" },
    });
  });
  it("maakt een herkenbare Nederlandse melding", () => {
    const melding = rekenbladMelding(controle, ["Rekenen!C1"]);
    expect(melding?.ernst).toBe("waarschuwing");
    const tekst = melding?.regels.join("\n") ?? "";
    expect(tekst).toContain(
      "Functie ONBEKEND wordt niet berekend (1 cel: Rekenen!B1)",
    );
    expect(tekst).toContain(
      "Gebruikersfunctie (macro of invoegtoepassing) MIJNMACRO",
    );
    expect(tekst).toContain("Functie IRR wordt niet berekend (3 cellen");
    expect(tekst).toContain("1 cel had een verouderde opgeslagen uitkomst");
    expect(tekst).toContain("handmatig rekenen");
    expect(tekst).toContain("#DIV/0! (Rekenen!A2); #N/A (Rekenen!B2)");
    expect(tekst).toContain("fullCalcOnLoad");
    expect(tekst).toContain("calcChain");
  });
});

describe("opgeslagen uitkomst tegenover herberekening", () => {
  const controle = inventariseerRekenblad(
    werkboek({
      Cache: [
        '<row r="1"><c r="A1"><v>2</v></c><c r="A2"><f>A1+3</f><v>999</v></c>',
        '<c r="A3"><f>A1/3</f><v>0.66666666666666663</v></c>',
        '<c r="A4" t="b"><f>A1=2</f><v>1</v></c></row>',
      ].join(""),
    }),
  );
  it("meldt alleen werkelijk afwijkende uitkomsten", () => {
    const engine: Record<
      string,
      { kind: "number"; value: number } | { kind: "bool"; value: boolean }
    > = {
      "Cache!A2": { kind: "number", value: 5 },
      "Cache!A3": { kind: "number", value: 2 / 3 },
      "Cache!A4": { kind: "bool", value: true },
    };
    const afwijkend = vergelijkCache(controle, (b, c) => engine[`${b}!${c}`]);
    expect(afwijkend).toEqual(["Cache!A2"]);
    expect(rekenbladMelding(controle, afwijkend)?.ernst).toBe("waarschuwing");
    // Vraagt het bestand zelf om herberekening, dan is een oude cache verwacht.
    expect(
      rekenbladMelding({ ...controle, volledigHerberekenen: true }, afwijkend)
        ?.ernst,
    ).toBe("info");
  });
  it("leest waarden uit een werkboekhandle in één aanvraag", () => {
    const aanvragen: number[] = [];
    const lees = leesUitWerkboek(
      {
        readCells: (request) => {
          aanvragen.push(request.ranges.length);
          if (!request.ranges.length)
            return {
              ok: true,
              version: "1",
              sheets: [{ sheetId: "sheet:0", name: "Cache", editable: true }],
              ranges: [],
              calculation: {
                cycleCells: [],
                limitedCells: [],
                truncated: false,
              },
            };
          return {
            ok: true,
            version: "1",
            sheets: [],
            ranges: request.ranges.map((target) => ({
              target,
              cells: [
                [
                  {
                    a1: target.range.kind === "a1" ? target.range.a1 : "",
                    value: { kind: "number", value: 7 },
                    formula: null,
                    displayText: "7",
                  },
                ],
              ],
            })),
            calculation: { cycleCells: [], limitedCells: [], truncated: false },
          };
        },
      },
      controle,
    );
    expect(aanvragen).toEqual([0, 3]);
    expect(lees("Cache", "A2")).toEqual({ kind: "number", value: 7 });
    expect(lees("Anders", "A2")).toBeUndefined();
  });
  it("geeft geen melding bij een schoon werkboek", () => {
    const schoon = inventariseerRekenblad(
      werkboek({
        Blad: '<row r="1"><c r="A1"><v>1</v></c><c r="B1"><f>SUM(A1)</f><v>1</v></c></row>',
      }),
    );
    expect(rekenbladMelding(schoon)).toBeNull();
  });
  it("geeft alleen informatie bij foutwaarden zonder andere signalen", () => {
    const fouten = inventariseerRekenblad(
      werkboek({
        Blad: '<row r="1"><c r="A1" t="e"><f>NA()</f><v>#N/A</v></c></row>',
      }),
    );
    expect(rekenbladMelding(fouten)?.ernst).toBe("info");
  });
  it("weigert een pakket zonder werkboek", () => {
    expect(() =>
      inventariseerRekenblad(
        zipSync({ "word/document.xml": strToU8("<document/>") }),
      ),
    ).toThrow("Geen geldig XLSX-werkboek");
  });
});
