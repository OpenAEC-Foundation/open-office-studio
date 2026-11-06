import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";

const bron = () => readFileSync("docs/tests/formulebediening-bron-2026-11-06.xlsx");
const keten = (aantal: number) => Array(aantal).fill("A1").join("+");
const doel = (h: WorkbookHandle, a1: string) => ({
  sheetId: h.sheetInfo().sheetIds[0], range: { kind: "a1" as const, a1 },
});
function waarde(h: WorkbookHandle, a1: string) {
  const r = h.readCells({ ranges: [doel(h, a1)] });
  if (!r.ok) throw new Error(r.failure.message);
  return r.ranges[0].cells[0][0];
}

describe("lange formuleketens (#58, #59)", () => {
  for (const aantal of [101, 200, 400, 1000]) {
    it(`bewaart ${aantal} optellingen als formule en herberekent na heropenen`, () => {
      let h = openWorkbook(bron());
      try {
        const formule = keten(aantal);
        const r = h.applyEdits({
          expectVersion: h.version(),
          steps: [{ op: "setCellInputs", target: doel(h, "D2"), inputs: [[`=${formule}`]] }],
        });
        expect(r.ok).toBe(true);
        expect(h.cell(0, 1, 3)).toMatchObject({ input: `=${formule}`, isFormula: true });
        expect(waarde(h, "D2").value).toEqual({ kind: "number", value: aantal * 10 });
        const opgeslagen = h.save();
        h.dispose();
        h = openWorkbook(opgeslagen);
        expect(h.cell(0, 1, 3)).toMatchObject({ input: `=${formule}`, isFormula: true });
        expect(waarde(h, "D2").value).toEqual({ kind: "number", value: aantal * 10 });
        h.editCell(0, 0, 0, "11");
        expect(waarde(h, "D2").value).toEqual({ kind: "number", value: aantal * 11 });
        h.undo();
        expect(waarde(h, "D2").value).toEqual({ kind: "number", value: aantal * 10 });
        h.redo();
        expect(waarde(h, "D2").value).toEqual({ kind: "number", value: aantal * 11 });
      } finally { h.dispose(); }
    });
  }

  it("accepteert dezelfde keten via de expliciete formulebewerking", () => {
    const h = openWorkbook(bron());
    try {
      const formule = keten(400);
      const r = h.applyEdits({ expectVersion: h.version(),
        steps: [{ op: "setFormulas", target: doel(h, "D2"), formulas: [[formule]] }] });
      expect(r.ok).toBe(true);
      expect(waarde(h, "D2")).toMatchObject({ formula: formule, value: { kind: "number", value: 4000 } });
    } finally { h.dispose(); }
  });

  it("behoudt operatorvolgorde, haakjes en afronding", () => {
    const h = openWorkbook(bron());
    try {
      for (const [formule, verwacht] of [
        [`1000${"-1".repeat(399)}`, 601],
        [`10000000000000000+1-10000000000000000${"+0".repeat(398)}`, 0],
        [`(${keten(400)})*2+3`, 8003],
      ] as const) {
        const r = h.applyEdits({ expectVersion: h.version(),
          steps: [{ op: "setCellInputs", target: doel(h, "D2"), inputs: [[`=${formule}`]] }] });
        expect(r.ok).toBe(true);
        expect(waarde(h, "D2").value).toEqual({ kind: "number", value: verwacht });
      }
    } finally { h.dispose(); }
  });

  it("blijft werkelijk te diepe invoer zonder werkmapwijziging weigeren", () => {
    const h = openWorkbook(bron());
    try {
      const versie = h.version();
      const r = h.applyEdits({ expectVersion: versie,
        steps: [{ op: "setFormulas", target: doel(h, "D2"), formulas: [["(".repeat(200) + "1" + ")".repeat(200)]] }] });
      expect(r.ok).toBe(false);
      expect(h.version()).toBe(versie);
      expect(h.cell(0, 1, 3).input).toBe("");
    } finally { h.dispose(); }
  });

  it("behoudt matrixberekening en de eerste foutwaarde in lange ketens", () => {
    const h = openWorkbook(bron());
    try {
      for (const [formule, verwacht] of [
        [`SUMPRODUCT(${Array(400).fill("A1:A2").join("+")})`, { kind: "number", value: 12000 }],
        [`#DIV/0!${"+0".repeat(400)}+#N/A`, { kind: "error", value: "#DIV/0!" }],
      ] as const) {
        const r = h.applyEdits({ expectVersion: h.version(),
          steps: [{ op: "setCellInputs", target: doel(h, "D2"), inputs: [[`=${formule}`]] }] });
        expect(r.ok).toBe(true);
        expect(waarde(h, "D2").value).toEqual(verwacht);
      }
    } finally { h.dispose(); }
  });
});
