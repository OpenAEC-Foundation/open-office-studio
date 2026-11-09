import { describe, expect, it } from "vitest";
import type { Document, StyleDefinitions, NumberingDefinitions } from "@betteroffice/docx/types/document";
import { eigenTekenopmaak, gebruikteStijlen,
  lijstVoorbeelden,
  tabelVoorbeeld, losOp, ontbrekendeStijl, runOpPositie, stijlNaam, uitOpmaak, vindAlinea } from "./model";
import { galerijStijlen } from "./StijlGalerij";

const stijlen: StyleDefinitions = {
  docDefaults: { rPr: { fontSize: 22, fontFamily: { asciiTheme: "minorHAnsi" } } },
  styles: [
    { styleId: "Normal", type: "paragraph", name: "Normal", default: true, qFormat: true },
    { styleId: "Heading1", type: "paragraph", name: "heading 1", basedOn: "Normal", qFormat: true, uiPriority: 9, rPr: { bold: true, fontSize: 32, fontFamily: { asciiTheme: "majorHAnsi" }, color: { themeColor: "accent1" } } },
    { styleId: "Heading4", type: "paragraph", name: "heading 4", basedOn: "Normal", qFormat: true, semiHidden: true, uiPriority: 9 },
    { styleId: "Heading1Char", type: "character", name: "Heading 1 Char", link: "Heading1", qFormat: true },
    { styleId: "Strong", type: "character", name: "Strong", qFormat: true, uiPriority: 22, rPr: { bold: true } },
    { styleId: "Verborgen", type: "paragraph", name: "Verborgen", qFormat: true, hidden: true },
  ],
};
const thema = {
  fontScheme: { majorFont: { latin: "Calibri Light" }, minorFont: { latin: "Calibri" } },
  colorScheme: { accent1: "4472C4" },
};

describe("stijlmodel", () => {
  it("previews the actual list numbering override and counts its used named style", () => {
    const defs: StyleDefinitions = {
      styles: [
        {
          styleId: "Roman",
          name: "Roman",
          type: "numbering",
          pPr: { numPr: { numId: 7, ilvl: 0 } },
        },
      ],
    };
    const numbering: NumberingDefinitions = {
      nums: [
        {
          numId: 7,
          abstractNumId: 1,
          levelOverrides: [{ ilvl: 0, startOverride: 4 }],
        },
      ],
      abstractNums: [
        {
          abstractNumId: 1,
          levels: [{ ilvl: 0, start: 1, numFmt: "lowerRoman", lvlText: "%1)" }],
        },
      ],
    };
    expect(lijstVoorbeelden(defs, numbering, "Roman")).toEqual([
      "iv) Aa",
      "v) Bb",
    ]);
    const doc = {
      package: {
        styles: defs,
        numbering,
        document: {
          content: [
            {
              type: "paragraph",
              formatting: { numPr: { numId: 7 } },
              content: [],
            },
          ],
        },
      },
    } as unknown as Document;
    expect(gebruikteStijlen(doc).get("Roman")).toBe(1);
  });
  it("previews inherited table shading and first-row formatting", () => {
    const defs: StyleDefinitions = {
      styles: [
        {
          styleId: "Base",
          name: "Base",
          type: "table",
          tblPr: { shading: { fill: { rgb: "EEEEEE" } } },
        },
        {
          styleId: "Table",
          name: "Table",
          type: "table",
          basedOn: "Base",
          tblStylePr: [
            {
              type: "firstRow",
              tcPr: { shading: { fill: { rgb: "225588" } } },
              rPr: { bold: true, color: { rgb: "FFFFFF" } },
            },
          ],
        },
      ],
    };
    const preview = tabelVoorbeeld(defs, "Table");
    expect(preview[0]).toMatchObject({
      background: "#225588",
      color: "#FFFFFF",
      fontWeight: 700,
    });
    expect(preview[2]).toMatchObject({
      background: "#EEEEEE",
      fontWeight: 400,
    });
  });
  it("vertaalt ingebouwde namen", () => {
    expect(stijlNaam({ styleId: "Heading2", name: "heading 2" })).toBe("Kop 2");
    expect(stijlNaam({ styleId: "Normal", name: "Normal" })).toBe("Standaard");
    expect(stijlNaam({ styleId: "x", name: "List Bullet 2" })).toBe("Lijst met opsommingstekens 2");
    expect(stijlNaam({ styleId: "Eigen", name: "Mijn stijl" })).toBe("Mijn stijl");
  });

  it("meldt een ontbrekende kopstijl in het Nederlands", () => {
    expect(ontbrekendeStijl(stijlen, "Heading1")).toBeNull();
    expect(ontbrekendeStijl(stijlen, "Heading3")).toContain("‘Kop 3’");
    expect(ontbrekendeStijl(undefined, "Heading3")).toBeNull();
  });

  it("lost overerving en themalettertypen/-kleuren op", () => {
    expect(losOp(stijlen, "Heading1", thema)).toMatchObject({ lettertype: "Calibri Light", grootte: 16, vet: true, kleur: "4472C4" });
    expect(losOp(stijlen, "Normal", thema)).toMatchObject({ lettertype: "Calibri", grootte: 11, vet: false });
    expect(eigenTekenopmaak(stijlen, "Strong")).toEqual({ vet: true });
  });

  it("toont snelle stijlen, standaard vooraan en zonder gekoppelde/verborgen stijlen", () => {
    expect(galerijStijlen(stijlen.styles).map((s) => s.styleId)).toEqual(["Normal", "Heading1", "Strong"]);
    expect(galerijStijlen(stijlen.styles, new Map([["Heading4", 2]])).map((s) => s.styleId)).toContain("Heading4");
  });

  it("neemt alleen gemelde opmaak over uit de selectie", () => {
    expect(uitOpmaak({ italic: true, fontSize: 24 }, { alignment: "center", spaceAfter: 120 })).toEqual({
      cursief: true,
      grootte: 12,
      uitlijning: "center",
      ruimteNa: 6,
    });
    expect(uitOpmaak({ bold: true }, { alignment: "center" }, "character")).toEqual({ vet: true });
  });

  it("telt gebruikte stijlen en vindt alinea's en runs", () => {
    const doc = {
      package: {
        styles: stijlen,
        document: {
          content: [
            { type: "paragraph", formatting: { styleId: "Heading1" }, content: [{ type: "run", content: [{ type: "text", text: "Kop" }] }] },
            { type: "table", rows: [{ cells: [{ content: [{ type: "paragraph", content: [] }] }] }] },
            {
              type: "paragraph",
              content: [
                { type: "run", formatting: { bold: true }, content: [{ type: "text", text: "Vet " }] },
                { type: "run", formatting: { styleId: "Strong" }, content: [{ type: "text", text: "zwaar" }] },
              ],
            },
          ],
        },
      },
    } as unknown as Document;
    const telling = gebruikteStijlen(doc);
    expect(telling.get("Heading1")).toBe(1);
    expect(telling.get("Normal")).toBe(2);
    expect(telling.get("Strong")).toBe(1);
    const alinea = vindAlinea(doc, "body:p1");
    expect(alinea).not.toBeNull();
    expect(runOpPositie(alinea!.content, 1)).toEqual({ bold: true });
    expect(runOpPositie(alinea!.content, 6)).toEqual({ styleId: "Strong" });
  });
});
