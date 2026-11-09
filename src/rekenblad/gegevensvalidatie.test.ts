import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { openWorkbook, type XlsxEditRequest } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import { metValidatieAnkers } from "./validatieAnkers";
import {
  celWaarde,
  installeerValidatie,
  leesValidaties,
  lijstWaarden,
  nieuweValidatie,
  schrijfValidatie,
  voldoetValidatie,
  type Validatieregel,
} from "./gegevensvalidatie";

const bron = new Uint8Array(readFileSync("public/templates/nieuw.xlsx"));
const regel = (extra: Partial<Validatieregel> = {}) => ({
  ...nieuweValidatie("B2:B4"),
  ...extra,
});
function boek(extra: Partial<Validatieregel> = {}) {
  const bytes = schrijfValidatie(bron, 0, null, regel(extra));
  const h = openWorkbook(metValidatieAnkers(bytes));
  installeerValidatie(h, bytes);
  return h;
}

describe("gegevensvalidatie (#68)", () => {
  it("schrijft standaard OOXML en behoudt overige onderdelen na opslaan/heropenen", () => {
    const p = new Pakket(bron);
    p.schrijf("customXml/vendor.xml", "<opaque keep='yes'/>");
    const r = regel({
      type: "list",
      formule1: '"Ja,Nee,< & >"',
      invoerTitel: "Kies",
      invoer: "Alleen ja/nee",
      foutType: "warning",
    });
    const bytes = schrijfValidatie(p.inpakken(), 0, null, r),
      h = openWorkbook(bytes);
    try {
      expect(leesValidaties(h.save())[0][0]).toMatchObject(r);
      h.editCell(0, 0, 0, "42");
      const b = h.save();
      expect(leesValidaties(b)[0][0]).toMatchObject(r);
      expect(new Pakket(b).lees("customXml/vendor.xml")).toBe(
        "<opaque keep='yes'/>",
      );
      const h2 = openWorkbook(b);
      h2.dispose();
    } finally {
      h.dispose();
    }
  });
  it("weigert ongeldige losse invoer en een hele plakactie zonder dirty/undo-verandering", () => {
    const h = boek();
    try {
      h.editCell(0, 1, 1, "50");
      const v = h.version(),
        hist = h.historyState();
      expect(() => h.editCell(0, 1, 1, "101")).toThrow("Ongeldige");
      expect(h.version()).toBe(v);
      expect(h.historyState()).toEqual(hist);
      expect(() =>
        h.editCells(0, [
          { row: 1, col: 1, input: "20" },
          { row: 2, col: 1, input: "200" },
        ]),
      ).toThrow();
      expect(h.cell(0, 1, 1).input).toBe("50");
      expect(h.cell(0, 2, 1).input).toBe("");
      h.editCells(0, [
        { row: 1, col: 1, input: "30" },
        { row: 2, col: 1, input: "40" },
      ]);
      h.undo();
      expect(h.cell(0, 1, 1).input).toBe("50");
      h.redo();
      expect(h.cell(0, 2, 1).input).toBe("40");
    } finally {
      h.dispose();
    }
  });
  it("controleert ook typed host edits en ruwe cell operations atomair", () => {
    const h = boek();
    try {
      const request: XlsxEditRequest = {
        expectVersion: h.version(),
        steps: [
          {
            op: "setCellInputs",
            target: {
              sheetId: h.sheetInfo().sheetIds[0],
              range: { kind: "a1", a1: "B2:B3" },
            },
            inputs: [["10"], ["200"]],
          },
        ],
      };
      expect(() => h.applyEdits(request)).toThrow();
      expect(h.cell(0, 1, 1).input).toBe("");
      expect(() =>
        h.applyOps([
          {
            type: "setCell",
            sheet: 0,
            at: { row: 1, col: 1 },
            cell: {
              value: { kind: "number", value: 200 },
              formula: null,
              style: null,
            },
          },
        ]),
      ).toThrow("Ongeldige");
      expect(h.cell(0, 1, 1).input).toBe("");
    } finally {
      h.dispose();
    }
  });
  it.each([
    [{ type: "whole", formule1: "1", formule2: "5" }, "3", "3.5"],
    [{ type: "decimal", formule1: "1.2", formule2: "2.8" }, "1.5", "3"],
    [{ type: "textLength", formule1: "2", formule2: "4" }, "abc", "a"],
    [{ type: "list", formule1: '"rood,groen"' }, "groen", "blauw"],
    [{ type: "custom", formule1: "AND(B2>0,B2<10)" }, "8", "11"],
    [
      {
        type: "date",
        formule1: "DATE(2026,1,1)",
        formule2: "DATE(2026,12,31)",
      },
      "46050",
      "1",
    ],
    [
      { type: "time", formule1: "TIME(9,0,0)", formule2: "TIME(17,0,0)" },
      "0.5",
      "0.8",
    ],
  ] as [Partial<Validatieregel>, string, string][])(
    "valideert %j via echte celwaarden en formules",
    (r, goed, fout) => {
      const h = boek(r);
      try {
        h.editCell(0, 1, 1, goed);
        expect(() => h.editCell(0, 1, 1, fout)).toThrow();
        expect(h.cell(0, 1, 1).input).toBe(goed);
        h.editCell(0, 2, 1, goed);
        expect(() => h.editCell(0, 2, 1, fout)).toThrow();
      } finally {
        h.dispose();
      }
    },
  );
  it("leest lijsten uit bereiken en lokaal overschreven namen", () => {
    const h = openWorkbook(bron);
    try {
      h.editCells(0, [
        { row: 0, col: 0, input: "A" },
        { row: 1, col: 0, input: "B" },
        { row: 2, col: 0, input: "C" },
      ]);
      const naam = h.sheetInfo().sheetNames[0];
      h.applyOps([
        {
          type: "setDefinedName",
          name: "Keuzes",
          refers_to: `'${naam}'!$A$1:$A$2`,
          scope: null,
          hidden: false,
        },
      ]);
      expect(lijstWaarden(h, 0, "$A$1:$A$2")).toEqual(["A", "B"]);
      expect(lijstWaarden(h, 0, "Keuzes")).toEqual(["A", "B"]);
      h.applyOps([
        {
          type: "setDefinedName",
          name: "Keuzes",
          refers_to: `'${naam}'!$A$3`,
          scope: 0,
          hidden: false,
        },
      ]);
      expect(lijstWaarden(h, 0, "Keuzes")).toEqual(["C"]);
    } finally {
      h.dispose();
    }
  });
  it.each(["warning", "information"] as const)(
    "vraagt bij %s en bewaart bij annuleren de oude waarde",
    (type) => {
      const bytes = schrijfValidatie(bron, 0, null, regel({ foutType: type })),
        h = openWorkbook(bytes),
        bevestig = vi.fn(() => false);
      installeerValidatie(h, bytes, bevestig);
      try {
        expect(() => h.editCell(0, 1, 1, "200")).toThrow();
        expect(bevestig).toHaveBeenCalledOnce();
        expect(h.cell(0, 1, 1).input).toBe("");
        bevestig.mockReturnValue(true);
        h.editCell(0, 1, 1, "200");
        expect(h.cell(0, 1, 1).input).toBe("200");
      } finally {
        h.dispose();
      }
    },
  );
  it("schuift bronregels mee met rijen en herstelt bij Undo/Redo", () => {
    const h = boek();
    try {
      h.applyOps([{ type: "insertRows", sheet: 0, at: 0, count: 1 }]);
      expect(leesValidaties(h.save())[0][0].ref).toBe("B3:B5");
      h.undo();
      expect(leesValidaties(h.save())[0][0].ref).toBe("B2:B4");
      h.redo();
      expect(leesValidaties(h.save())[0][0].ref).toBe("B3:B5");
    } finally {
      h.dispose();
    }
  });
  it("volgt bladhernoeming en relatieve formuleverwijzingen zonder formulestrings te veranderen", () => {
    const h = boek({
      type: "custom",
      formule1: 'AND(B2>0,"B2"="B2")',
      formule2: "",
    });
    try {
      h.applyOps([{ type: "insertRows", sheet: 0, at: 0, count: 1 }]);
      expect(leesValidaties(h.save())[0][0]).toMatchObject({
        ref: "B3:B5",
        formule1: 'AND(B3>0,"B2"="B2")',
      });
      h.applyOps([{ type: "renameSheet", sheet: 0, name: "Keuze & invoer" }]);
      h.editCell(0, 2, 1, "4");
      expect(() => h.editCell(0, 2, 1, "-4")).toThrow();
      const opnieuw = openWorkbook(metValidatieAnkers(h.save()));
      installeerValidatie(opnieuw, h.save());
      try {
        expect(() => opnieuw.editCell(0, 2, 1, "-2")).toThrow();
      } finally {
        opnieuw.dispose();
      }
    } finally {
      h.dispose();
    }
  });
  it("houdt een geweigerde typed batch en herhaalde installatie zonder extra effecten", () => {
    const h = boek();
    try {
      installeerValidatie(h, h.save());
      const version = h.version();
      const request: XlsxEditRequest = {
        expectVersion: version,
        steps: [
          {
            op: "setCellInputs",
            target: {
              sheetId: "missing",
              range: { kind: "a1", a1: "A1:XFD1048576" },
            },
            inputs: [["1"]],
          },
        ],
      };
      expect(h.applyEdits(request).ok).toBe(false);
      expect(h.version()).toBe(version);
    } finally {
      h.dispose();
    }
  });
  it("staat lege invoer en uitschakelen van foutmeldingen toe en vindt bestaande ongeldige data", () => {
    const h = boek({ foutTonen: false });
    try {
      h.editCell(0, 1, 1, "200");
      expect(voldoetValidatie(h, 0, 1, 1, regel())).toBe(false);
      expect(voldoetValidatie(h, 0, 2, 1, regel())).toBe(true);
      expect(voldoetValidatie(h, 0, 2, 1, regel({ leeg: false }))).toBe(false);
    } finally {
      h.dispose();
    }
  });
});
