import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import { leesFormulefout } from "./formulefouten";

const boeken: WorkbookHandle[] = [];
afterEach(() => boeken.splice(0).forEach((h) => h.dispose()));
function boek() {
  const h = openWorkbook(readFileSync("public/templates/nieuw.xlsx"));
  boeken.push(h);
  return h;
}
const lees = (h: WorkbookHandle, row = 0, col = 0) =>
  leesFormulefout(h, h.sheetInfo().sheetIds[0], row, col);
describe("uitleg bij de actuele formulefout (#59)", () => {
  it.each([
    ["=1/0", "division", "#DIV/0!"],
    ["=NA()", "missing", "#N/A"],
    ["=SQRT(-1)", "number", "#NUM!"],
    ['=1+"tekst"', "value", "#VALUE!"],
    ["=#REF!", "reference", "#REF!"],
    ["=ONBESTAANDE_FUNCTIE(1)", "name", "#NAME?"],
  ])(
    "classificeert %s uit de werkelijk berekende cel",
    (formule, soort, waarde) => {
      const h = boek();
      h.editCell(0, 0, 0, formule);
      expect(lees(h)).toMatchObject({ soort, waarde, cel: "A1" });
    },
  );
  it("meldt een directe en een kruisbladkring ook als de kern een getal als plaatsvervanger toont", () => {
    const h = boek();
    h.editCell(0, 0, 0, "=A1+1");
    expect(lees(h)?.soort).toBe("cycle");
    h.editCell(0, 0, 0, "5");
    expect(lees(h)).toBeNull();
    h.applyOps([{ type: "addSheet", index: 1, name: "Tweede" }]);
    h.editCell(0, 0, 0, "=Tweede!A1+1");
    h.editCell(1, 0, 0, "='Blad 1'!A1+1");
    expect(lees(h)?.soort).toBe("cycle");
  });
  it("meldt geen fout bij tekst, lege cellen of een herstelde formule en wijzigt niets", () => {
    const h = boek();
    h.editCell(0, 0, 0, "'#DIV/0!");
    expect(lees(h)).toBeNull();
    expect(lees(h, 10, 2)).toBeNull();
    h.editCell(0, 0, 0, "=1/0");
    const versie = h.version(),
      geschiedenis = h.historyState();
    lees(h);
    expect(h.version()).toBe(versie);
    expect(h.historyState()).toEqual(geschiedenis);
    h.editCell(0, 0, 0, "=2+3");
    expect(lees(h)).toBeNull();
  });
});
