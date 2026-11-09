import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { leesGroepen, wijzigGroep } from "./groepen";

const boeken: WorkbookHandle[] = [];
afterEach(() => boeken.splice(0).forEach((h) => h.dispose()));
function open(bytes: Uint8Array) {
  const h = openWorkbook(bytes);
  boeken.push(h);
  return h;
}
function bron() {
  const h = open(readFileSync("public/templates/nieuw.xlsx"));
  h.editCells(0, [
    { row: 1, col: 0, input: "10" },
    { row: 2, col: 0, input: "=A2*2" },
    { row: 8, col: 0, input: "Bewaren" },
  ]);
  h.applyOps([
    { type: "setRowHeight", sheet: 0, row: 2, height: 33 },
    { type: "setColWidth", sheet: 0, col: 1, width: 22 },
  ]);
  return h.save();
}
const sheet = (b: Uint8Array) =>
  strFromU8(unzipSync(b)["xl/worksheets/sheet1.xml"]);
describe("standaard XLSX-overzichtsgroepen (#60)", () => {
  it("groepeert lege en gevulde rijen zonder celinhoud, formules of maten te veranderen", () => {
    const bytes = bron(),
      voor = open(bytes),
      nieuw = wijzigGroep(bytes, 0, "rij", 1, 5, "groepeer"),
      h = open(nieuw);
    expect(leesGroepen(nieuw, 0)).toMatchObject([
      { as: "rij", van: 1, tot: 5, niveau: 1, ingeklapt: false },
    ]);
    expect(h.cell(0, 1, 0).input).toBe("10");
    expect(h.cell(0, 2, 0).input).toBe("=A2*2");
    expect(h.cell(0, 8, 0).input).toBe("Bewaren");
    expect(h.cellRect(0, 2, 0).h).toBe(voor.cellRect(0, 2, 0).h);
    expect(leesGroepen(h.save(), 0)).toMatchObject([
      { van: 1, tot: 5, niveau: 1 },
    ]);
  });
  it("klapt rijen in en uit, bewaart handmatige hoogten en overleeft native celbewerking", () => {
    const bytes = bron(),
      gegroepeerd = wijzigGroep(bytes, 0, "rij", 1, 5, "groepeer"),
      dicht = wijzigGroep(gegroepeerd, 0, "rij", 1, 5, "inklappen");
    expect(leesGroepen(dicht, 0)[0].ingeklapt).toBe(true);
    const h = open(dicht);
    expect(h.cellPosition(0, 3, 0).y - h.cellPosition(0, 2, 0).y).toBe(0);
    h.editCell(0, 8, 1, "Extra");
    const weer = wijzigGroep(h.save(), 0, "rij", 1, 5, "uitklappen"),
      terug = open(weer);
    expect(terug.cellRect(0, 2, 0).h).toBeCloseTo(
      open(bytes).cellRect(0, 2, 0).h,
      2,
    );
    expect(terug.cell(0, 8, 1).input).toBe("Extra");
    expect(leesGroepen(weer, 0)[0].ingeklapt).toBe(false);
  });
  it("houdt een geneste groep ingeklapt na uitklappen van de buitenste groep", () => {
    let b = wijzigGroep(bron(), 0, "rij", 1, 8, "groepeer");
    b = wijzigGroep(b, 0, "rij", 2, 4, "groepeer");
    b = wijzigGroep(b, 0, "rij", 2, 4, "inklappen");
    b = wijzigGroep(b, 0, "rij", 1, 8, "inklappen");
    b = wijzigGroep(b, 0, "rij", 1, 8, "uitklappen");
    expect(leesGroepen(b, 0).find((g) => g.niveau === 1)?.ingeklapt).toBe(
      false,
    );
    expect(leesGroepen(b, 0).find((g) => g.niveau === 2)?.ingeklapt).toBe(true);
    const h = open(b);
    expect(h.cellPosition(0, 4, 0).y - h.cellPosition(0, 3, 0).y).toBe(0);
    expect(h.cellRect(0, 1, 0).h).toBeGreaterThan(0);
  });
  it("groepeert kolomspannen en behoudt breedten na native save en uitklappen", () => {
    const b = bron(),
      voor = open(b),
      gegroepeerd = wijzigGroep(b, 0, "kolom", 1, 4, "groepeer"),
      dicht = wijzigGroep(gegroepeerd, 0, "kolom", 1, 4, "inklappen"),
      h = open(dicht);
    expect(leesGroepen(dicht, 0)).toMatchObject([
      { as: "kolom", van: 1, tot: 4, niveau: 1, ingeklapt: true },
    ]);
    h.editCell(0, 8, 0, "Nieuw");
    const terug = open(wijzigGroep(h.save(), 0, "kolom", 1, 4, "uitklappen"));
    expect(terug.cellRect(0, 0, 1).w).toBeCloseTo(voor.cellRect(0, 0, 1).w, 2);
    expect(terug.cell(0, 8, 0).input).toBe("Nieuw");
  });
  it("heft alleen het geselecteerde niveau op en weigert acht niveaus", () => {
    let b = bron();
    for (let i = 0; i < 7; i++) b = wijzigGroep(b, 0, "rij", 1, 5, "groepeer");
    expect(() => wijzigGroep(b, 0, "rij", 1, 5, "groepeer")).toThrow(/zeven/);
    b = wijzigGroep(b, 0, "rij", 1, 5, "opheffen");
    expect(Math.max(...leesGroepen(b, 0).map((g) => g.niveau))).toBe(6);
  });
  it("behoudt onbekende row-attributen en alle andere pakketonderdelen", () => {
    const z = unzipSync(bron());
    z["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(z["xl/worksheets/sheet1.xml"]).replace(
        '<row r="3"',
        '<row customFormat="1" thickBot="1" r="3"',
      ),
    );
    z["vendor/keep.bin"] = new Uint8Array([1, 3, 5]);
    const b = zipSync(z),
      nieuw = wijzigGroep(b, 0, "rij", 1, 5, "groepeer"),
      na = unzipSync(nieuw);
    expect(sheet(nieuw)).toContain('thickBot="1"');
    for (const [naam, inhoud] of Object.entries(z))
      if (naam !== "xl/worksheets/sheet1.xml") expect(na[naam]).toEqual(inhoud);
  });
  it("weigert beveiliging, buitenranden, te grote selecties en ongeldige bereiken", () => {
    const z = unzipSync(bron());
    z["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(z["xl/worksheets/sheet1.xml"]).replace(
        "</sheetData>",
        '</sheetData><sheetProtection sheet="1"/>',
      ),
    );
    expect(() => wijzigGroep(zipSync(z), 0, "rij", 1, 5, "groepeer")).toThrow(
      /beveiligd/,
    );
    for (const [van, tot] of [
      [-1, 2],
      [2, 1],
      [0, 10000],
      [1048575, 1048576],
    ])
      expect(() =>
        wijzigGroep(bron(), 0, "rij", van, tot, "groepeer"),
      ).toThrow();
  });
});
