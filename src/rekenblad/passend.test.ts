import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { gebruikteBreedte } from "./passend";

const boeken: WorkbookHandle[] = [];
afterEach(() => boeken.splice(0).forEach(h => h.dispose()));
function open(bytes: Uint8Array = readFileSync("public/templates/nieuw.xlsx")) {
  const h = openWorkbook(bytes); boeken.push(h); return h;
}

// Standaardbreedte: 8,43 tekens × 7 px + 5 px = 64,01 px; subpixelafronding maximaal 0,05 px.
describe("passend op de gebruikte bladbreedte (#28)", () => {
  it("gebruikt voor een leeg blad acht standaardkolommen", () => {
    expect(gebruikteBreedte(open())).toBeCloseTo(8 * 64.01, 1);
  });
  it("meet het actieve blad, inclusief lege kolommen vóór de laatste inhoud", () => {
    const h = open();
    h.editCell(0, 0, 19, "7");
    expect(gebruikteBreedte(h)).toBeCloseTo(20 * 64.01, 1);
    h.applyOps([{ type: "addSheet", index: 1, name: "Kort" }]);
    h.editCell(1, 0, 1, "11");
    h.setActiveSheet(1);
    expect(gebruikteBreedte(h)).toBeCloseTo(2 * 64.01, 1);
    h.setActiveSheet(0);
    expect(gebruikteBreedte(h)).toBeCloseTo(20 * 64.01, 1);
  });
  it("houdt rekening met afwijkende breedten en verborgen kolommen", () => {
    const h = open(); h.editCell(0, 0, 2, "18");
    const delen = unzipSync(h.save());
    delen["xl/worksheets/sheet1.xml"] = strToU8(strFromU8(delen["xl/worksheets/sheet1.xml"])
      .replace(/<cols>[\s\S]*?<\/cols>/, "")
      .replace("<sheetData>", '<cols><col min="1" max="1" width="20" customWidth="1"/><col min="2" max="2" hidden="1" width="8.43" customWidth="1"/></cols><sheetData>'));
    const terug = open(zipSync(delen));
    // Breedte 20 tekens: 145 px; verborgen B: 0 px; standaard C: 8,43 × 7 + 5 = 64,01 px. De kern kwantiseert op subpixels.
    expect(gebruikteBreedte(terug)).toBeCloseTo(145 + 64.01, 1);
  });
  it("laat een lege samenvoeging voorbij de laatste cel volledig passen", () => {
    const h = open(); h.editCell(0, 0, 0, "7");
    h.applyOps([{ type: "mergeCells", sheet: 0, range: { start: { row: 4, col: 1 }, end: { row: 4, col: 19 } } }]);
    const voor = h.version();
    expect(gebruikteBreedte(h)).toBeCloseTo(20 * 64.01, 1);
    expect(h.version()).toBe(voor);
  });
});
