import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { bereidStructuurBeveiliging, leesStructuurBeveiliging } from "./structuurbeveiliging";

const boeken: WorkbookHandle[] = [];
afterEach(() => boeken.splice(0).forEach(h => h.dispose()));
function open(bytes: Uint8Array) { const h = openWorkbook(bytes); boeken.push(h); return h; }
function bron(vlag: string | null = "1", afwijkendPad = false) {
  const h = open(readFileSync("public/templates/nieuw.xlsx"));
  h.applyOps([{ type: "addSheet", index: 1, name: "Tweede" }]);
  h.editCell(0, 0, 0, "13");
  h.editCell(1, 0, 0, "='Blad 1'!A1*2");
  const delen = unzipSync(h.save());
  delen['xl/workbook.xml'] = strToU8(strFromU8(delen['xl/workbook.xml']).replace(/<workbookProtection\b[^>]*\/>/, `<workbookProtection${vlag === null ? '' : ` lockStructure="${vlag}"`} workbookPassword="ABCD"/>`));
  if (afwijkendPad) {
    delen['xl/boek.xml'] = delen['xl/workbook.xml'];delete delen['xl/workbook.xml'];
    delen['_rels/.rels'] = strToU8(strFromU8(delen['_rels/.rels']).replace('xl/workbook.xml','/xl/boek.xml'));
  }
  return zipSync(delen,{mtime:new Date(2026,0,1)});
}

describe("bestaande werkmapstructuurbeveiliging (#72, #61)", () => {
  it.each(["1", "true", "onbekend"])("weigert alle structurele bewerkingen bij vlag %s zonder deelwijziging", vlag => {
    const bytes = bron(vlag), h = open(bytes);bereidStructuurBeveiliging(h,bytes);
    const versie = h.version(), namen = h.sheetInfo().sheetNames;
    for (const op of [{type:"renameSheet",sheet:0,name:"Ander"},{type:"removeSheet",index:0},{type:"addSheet",index:1,name:"Nieuw"},{type:"moveSheet",from:0,to:1}])
      expect(() => h.applyOps([op])).toThrow(/beveiligd/);
    // Een gemengde opdracht mag ook niet alvast de cel wijzigen.
    expect(() => h.applyOps([{type:"setColWidth",sheet:0,col:0,width:30},{type:"removeSheet",index:1}])).toThrow();
    expect(h.version()).toBe(versie);expect(h.sheetInfo().sheetNames).toEqual(namen);
    expect(h.cell(0,0,0).input).toBe('13');
  });
  it.each([null,"0","false"])("weigert geen structurele wijziging wanneer lockStructure niet actief is: %s", vlag => {
    const bytes=bron(vlag),h=open(bytes);bereidStructuurBeveiliging(h,bytes);
    expect(h.applyOps([{type:"renameSheet",sheet:0,name:"Ander"}]).applied).toBe(true);
    expect(h.sheetInfo().sheetNames[0]).toBe('Ander');
  });
  it("laat gewone celbewerkingen toe en bewaart bescherming en formules bij heropenen", () => {
    const bytes=bron(),h=open(bytes);bereidStructuurBeveiliging(h,bytes);bereidStructuurBeveiliging(h,bytes);
    h.editCell(0,0,0,'17');const bewaard=h.save();expect(leesStructuurBeveiliging(bewaard)).toBe(true);
    const terug=open(bewaard);bereidStructuurBeveiliging(terug,bewaard);expect(terug.cell(0,0,0).input).toBe('17');
    expect(terug.cell(1,0,0).input).toBe("='Blad 1'!A1*2");expect(() => terug.applyOps([{type:'removeSheet',index:1}])).toThrow();
  });
  it("volgt de werkelijke hoofdrelatie in plaats van een vast werkmappad", () => {
    expect(leesStructuurBeveiliging(bron('true',true))).toBe(true);
  });
});
