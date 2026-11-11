import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { bladVerplaatsen } from "./bladen";
import { bereidStructuurBeveiliging } from "./structuurbeveiliging";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const boeken: WorkbookHandle[] = [];
afterEach(() => boeken.splice(0).forEach(h => h.dispose()));
function boek(bytes: Uint8Array = readFileSync("public/templates/nieuw.xlsx")) { const h = openWorkbook(bytes); boeken.push(h); return h; }
function resultaat(h: WorkbookHandle, sheet: number) {
  const r=h.readCells({ranges:[{sheetId:h.sheetInfo().sheetIds[sheet],range:{kind:"a1",a1:"A1"}}]});
  if(!r.ok) throw Error(r.failure.message);
  return r.ranges[0].cells[0][0].displayText;
}
function api(h: WorkbookHandle) { return { handle: h, version: async () => h.version(), commands: { getState: () => ({ enabled: true }) }, focus() {} } as unknown as XlsxEditorApi; }
function bron() {
  const h = boek();
  h.applyOps([{type:"renameSheet",sheet:0,name:"Bron"},{type:"addSheet",index:1,name:"Rekenen"},{type:"addSheet",index:2,name:"Laatste"}]);
  h.editCell(0,0,0,"21"); h.editCell(1,0,0,"=Bron!A1*2");
  return h;
}
describe("bladen werkelijk verplaatsen (#61)", () => {
  it("behoudt identiteit, inhoud en kruisverwijzingen na verplaatsen en bewaren/heropenen", async () => {
    const h=bron();
    await bladVerplaatsen(api(h),3);
    expect(h.sheetInfo().sheetNames).toEqual(["Rekenen","Laatste","Bron"]);
    expect(h.cell(2,0,0).input).toBe("21");
    expect(h.cell(0,0,0).input).toBe("=Bron!A1*2");
    expect(resultaat(h,0)).toBe("42");
    const terug=boek(h.save());
    expect(terug.sheetInfo().sheetNames).toEqual(["Rekenen","Laatste","Bron"]);
    expect(resultaat(terug,0)).toBe("42");
    h.undo();expect(h.sheetInfo().sheetNames).toEqual(["Bron","Rekenen","Laatste"]);
    h.redo();expect(h.sheetInfo().sheetNames).toEqual(["Rekenen","Laatste","Bron"]);
  });
  it("kan terug naar voren en maakt geen geschiedenis voor dezelfde positie", async () => {
    const h=bron();h.setActiveSheet(2);
    await bladVerplaatsen(api(h),0);expect(h.sheetInfo().sheetNames[0]).toBe("Laatste");
    const versie=h.version(), history=h.historyState();
    await bladVerplaatsen(api(h),0);expect(h.version()).toBe(versie);expect(h.historyState()).toEqual(history);
    await bladVerplaatsen(api(h),1);expect(h.version()).toBe(versie);
  });
  it("weigert bestaande structuurbeveiliging vóór een verplaatsing", async () => {
    const z=unzipSync(bron().save());
    z['xl/workbook.xml']=strToU8(strFromU8(z['xl/workbook.xml']).replace(/<workbookProtection\b[^>]*\/>/,'<workbookProtection lockStructure="1"/>'));
    const bytes=zipSync(z),h=boek(bytes);bereidStructuurBeveiliging(h,bytes);
    const versie=h.version();await expect(bladVerplaatsen(api(h),3)).rejects.toThrow(/beveiligd/);
    expect(h.version()).toBe(versie);
  });
});
