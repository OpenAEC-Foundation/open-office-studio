import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openWorkbook } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import {
  leesBeveiliging,
  standaardRechten,
  schrijfBladBeveiliging,
  schrijfStructuurBeveiliging,
  legacyWachtwoord,
  isoWachtwoord,
  controleerWachtwoord,
  zetCelBeveiliging,
  celBeveiliging,
} from "./beveiliging";
import {
  bladBeveiligd,
  installeerBladBeveiliging,
  selectieToegestaan,
  geefFilterBatchVrij,
  geefSorteerBatchVrij,
} from "./bladbeveiliging";
import { bereidStructuurBeveiliging } from "./structuurbeveiliging";
import { sectie, NS, werkmap } from "./werkboekXml";
import {attr,kind,kinderen,leesXml,tekstVan,vervang} from "../grafieken/xml";
import { sorteerBereik, pasFilterToe } from "../lint/rekenblad-gegevens";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { WorkbookHandle } from "@betteroffice/xlsx";
function nepApi(h: WorkbookHandle) {
  return {
    handle: h,
    version: async () => h.version(),
    readCells: async (r: any) => h.readCells(r),
    applyEdits: async (r: any) => h.applyEdits(r),
    validateEdits: async (r: any) => h.validateEdits(r),
    commands: { getState: () => ({ enabled: true }) },
  } as unknown as XlsxEditorApi;
}
const bron = new Uint8Array(readFileSync("public/templates/nieuw.xlsx"));
async function boek(rechten = standaardRechten()) {
  const h = openWorkbook(bron);
  h.editCell(0, 0, 0, "=1+1");
  h.editCell(0, 1, 1, "10");
  h.patchRangeStyle(0, "B2", { bold: true });
  zetCelBeveiliging(h, 0, "A1", true, true);
  zetCelBeveiliging(h, 0, "B2:B5", false, false);
  const bytes = await schrijfBladBeveiliging(h.save(), 0, rechten);
  h.dispose();
  const k = openWorkbook(bytes);
  installeerBladBeveiliging(k, bytes);
  return k;
}
describe("blad- en werkmapbeveiliging (#72)", () => {
  it("behoudt niet-gemodelleerde stijlgegevens bij het wijzigen van celbeveiliging",()=>{
    const p=new Pakket(bron),wb=werkmap(p),rel=p.relaties(wb.pad).find(r=>r.type.endsWith("/styles"))!,pad=Pakket.doelPad(wb.pad,rel.target);let xml=p.lees(pad);const root=leesXml(xml),xfs=kind(root,"cellXfs")!,xf=kinderen(xfs,"xf")[0];
    const fragment=xml.slice(xf.start,xf.eind).replace(/\/>$/,`><alignment textRotation="45"/><extLst><ext uri="urn:probe"><v:keep xmlns:v="urn:vendor" value="preserve"/></ext></extLst></xf>`);p.schrijf(pad,vervang(xml,[{start:xf.start,eind:xf.eind,tekst:fragment}]));
    const h=openWorkbook(p.inpakken());try{zetCelBeveiliging(h,0,"A1",false,true);const uit=new Pakket(h.save()),sheet=leesXml(uit.lees(werkmap(uit).bladen[0].pad)),c=kinderen(kinderen(kind(sheet,"sheetData"),"row")[0],"c").find(c=>attr(c,"r")==="A1")!,style=Number(attr(c,"s")??0),nieuw=uit.lees(pad),n=kinderen(kind(leesXml(nieuw),"cellXfs"),"xf")[style],tekst=nieuw.slice(n.start,n.eind);expect(tekst).toContain('textRotation="45"');expect(tekst).toContain('value="preserve"');expect(celBeveiliging(h,0,"A1")).toEqual({locked:false,hidden:true});}finally{h.dispose();}
  });
  it("sorteert ontgrendelde cellen inclusief opmaak en gebruikt filters zonder gewone rijopmaak vrij te geven", async () => {
    const h = await boek({
      ...standaardRechten(),
      sort: true,
      autoFilter: true,
    });
    try {
      h.editCell(0, 2, 1, "5");
      h.editCell(0, 3, 1, "20");
      const api = nepApi(h),
        id = h.sheetInfo().sheetIds[0];
      await sorteerBereik(api, {
        blad: 0,
        sheetId: id,
        bereik: { top: 1, left: 1, bottom: 3, right: 1 },
        kop: false,
        sleutels: [{ kolom: 1, op: "waarden", aflopend: false }],
        hoofdlettergevoelig: false,
      });
      expect(h.rangeCells(0, "B2:B4").map((r) => r[0].input)).toEqual([
        "5",
        "10",
        "20",
      ]);
      expect(h.selectionFormatting(0, "B3").bold).toBe(true);
      await pasFilterToe(api, 0, id, {
        bereik: { top: 0, left: 1, bottom: 3, right: 1 },
        kolommen: new Map([
          [0, { soort: "waarden", waarden: ["10"], leeg: false }],
        ]),
      });
      expect(h.cellRect(0, 1, 1).h).toBe(0);
      expect(h.cellRect(0, 2, 1).h).toBeGreaterThan(0);
      expect(() =>
        h.applyOps([{ type: "setRowHeight", sheet: 0, row: 2, height: 50 }]),
      ).toThrow();
    } finally {
      h.dispose();
    }
  });
  it("wijzigt locked/hidden via een native opmaaktransactie met behoud van opmaak en Undo/Redo", () => {
    const h = openWorkbook(bron);
    try {
      h.patchRangeStyle(0, "A1", { bold: true });
      zetCelBeveiliging(h, 0, "A1:A2", false, true);
      expect(celBeveiliging(h, 0, "A1")).toEqual({
        locked: false,
        hidden: true,
      });
      expect(h.selectionFormatting(0, "A1").bold).toBe(true);
      h.undo();
      expect(celBeveiliging(h, 0, "A1")).toEqual({
        locked: true,
        hidden: false,
      });
      h.redo();
      expect(celBeveiliging(h, 0, "A2").hidden).toBe(true);
      const k = openWorkbook(h.save());
      expect(celBeveiliging(k, 0, "A2").locked).toBe(false);
      k.dispose();
    } finally {
      h.dispose();
    }
  });
  it("weigert legacy invoer, ruwe batches en typed edits naar vergrendelde cellen zonder deelwijziging", async () => {
    const h = await boek();
    try {
      const v = h.version();
      expect(() => h.editCell(0, 0, 0, "9")).toThrow();
      expect(() =>
        h.editCells(0, [
          { row: 1, col: 1, input: "15" },
          { row: 0, col: 0, input: "9" },
        ]),
      ).toThrow();
      expect(() =>
        h.applyOps([
          { type: "setRowHeight", sheet: 0, row: 0, height: 35 },
          {
            type: "setCell",
            sheet: 0,
            at: { row: 0, col: 0 },
            cell: { value: { kind: "number", value: 9 } },
          },
        ]),
      ).toThrow();
      expect(
        h.applyEdits({
          expectVersion: v,
          steps: [
            {
              op: "setCellInputs",
              target: {
                sheetId: h.sheetInfo().sheetIds[0],
                range: { kind: "a1", a1: "A1" },
              },
              inputs: [["9"]],
            },
          ],
        }).ok,
      ).toBe(false);
      expect(h.version()).toBe(v);
      expect(h.cell(0, 1, 1).input).toBe("10");
      h.editCell(0, 1, 1, "15");
      expect(h.cell(0, 1, 1).input).toBe("15");
      h.undo();
      expect(h.cell(0, 1, 1).input).toBe("10");
    } finally {
      h.dispose();
    }
  });
  it("verbergt beveiligde formules in de formulebalk en celkopie maar behoudt berekening en opslag", async () => {
    const h = await boek();
    try {
      expect(h.cell(0, 0, 0)).toMatchObject({ isFormula: false, input: "2" });
      expect(h.rangeCells(0, "A1")[0][0].isFormula).toBe(false);
      const p = new Pakket(h.save());
      expect(p.lees(werkmap(p).bladen[0].pad)).toContain("<f>1+1</f>");
      const k = openWorkbook(await schrijfBladBeveiliging(h.save(), 0, null));
      expect(k.cell(0, 0, 0).input).toBe("=1+1");
      k.dispose();
    } finally {
      h.dispose();
    }
  });
  it("dwingt selectierechten en standaard geweigerde opmaak en invoeging af", async () => {
    const h = await boek({ ...standaardRechten(), selectLockedCells: false });
    try {
      expect(selectieToegestaan(h, 0, { row: 0, col: 0 })).toBe(false);
      expect(selectieToegestaan(h, 0, { row: 1, col: 1 })).toBe(true);
      expect(() => h.patchRangeStyle(0, "B2", { italic: true })).toThrow();
      expect(() => h.setNumberFormat(0, "B2", "currency")).toThrow();
      expect(() =>
        h.applyOps([{ type: "insertRows", sheet: 0, at: 2, count: 1 }]),
      ).toThrow();
    } finally {
      h.dispose();
    }
  });
  it("laat toegestane opmaak en rijeninvoeging toe maar laat geen celbeveiliging wijzigen", async () => {
    const h = await boek({
      ...standaardRechten(),
      formatCells: true,
      insertRows: true,
    });
    try {
      h.patchRangeStyle(0, "B2", { italic: true });
      expect(h.selectionFormatting(0, "B2").italic).toBe(true);
      expect(() => zetCelBeveiliging(h, 0, "A1", false, false)).toThrow();
      h.applyOps([{ type: "insertRows", sheet: 0, at: 0, count: 1 }]);
      expect(h.cell(0, 2, 1).input).toBe("10");
      expect(celBeveiliging(h, 0, "B3").locked).toBe(false);
      expect(bladBeveiligd(h, 0)?.actief).toBe(true);
    } finally {
      h.dispose();
    }
  });
  it("laat uitsluitend geregistreerde filterrijen toe als filteren is toegestaan", async () => {
    const h = await boek({ ...standaardRechten(), autoFilter: true });
    try {
      const ops = [{ type: "setRowHeight", sheet: 0, row: 2, height: 0 }];
      expect(() => h.applyOps(ops)).toThrow();
      geefFilterBatchVrij(h, 0, ops);
      expect(h.applyOps(ops).applied).toBe(true);
      expect(() => h.applyOps([{ ...ops[0], height: 40 }])).toThrow();
      expect(() => geefFilterBatchVrij(h, 0, [{ type: "setCell" }])).toThrow();
    } finally {
      h.dispose();
    }
  });
  it("bewaart de permissiematrix, onbekende onderdelen en bestaande verifier", async () => {
    const p = new Pakket(bron);
    p.schrijf("customXml/protection.xml", "<keep/>");
    sectie(
      p,
      werkmap(p).bladen[0].pad,
      "sheetProtection",
      `<sheetProtection xmlns="${NS}" sheet="1" password="${legacyWachtwoord("test")}" custom="keep"/>`,
    );
    const r = {
      ...standaardRechten(),
      sort: true,
      autoFilter: true,
      formatRows: true,
      insertRows: true,
    };
    const bytes = await schrijfBladBeveiliging(p.inpakken(), 0, r, "test");
    expect(leesBeveiliging(bytes).bladen[0].rechten).toEqual(r);
    expect(new Pakket(bytes).lees("customXml/protection.xml")).toBe("<keep/>");
    expect(leesBeveiliging(bytes).bladen[0].attrs.custom).toBe("keep");
    await expect(
      schrijfBladBeveiliging(bytes, 0, null, "fout"),
    ).rejects.toThrow();
    const uit = await schrijfBladBeveiliging(bytes, 0, null, "test");
    expect(leesBeveiliging(uit).bladen[0].actief).toBe(false);
  });
  it("controleert legacy hashes en ISO-hashes tegen een onafhankelijke Node-implementatie", async () => {
    expect(legacyWachtwoord("password")).toBe("83AF");
    expect(legacyWachtwoord("test")).toBe("CBEB");
    const salt = Uint8Array.from([1, 2, 3, 4]),
      w = "Wachtwoord 😀";
    let hash = createHash("sha512")
      .update(salt)
      .update(Buffer.from(w, "utf16le"))
      .digest();
    for (let i = 0; i < 3; i++) {
      const n = Buffer.alloc(4);
      n.writeUInt32LE(i);
      hash = createHash("sha512").update(hash).update(n).digest();
    }
    expect(await isoWachtwoord(w, salt, 3)).toBe(hash.toString("base64"));
    await controleerWachtwoord(
      {
        algorithmName: "SHA-512",
        saltValue: Buffer.from(salt).toString("base64"),
        spinCount: "3",
        hashValue: hash.toString("base64"),
      },
      w,
    );
    await expect(
      controleerWachtwoord({ password: "CBEB" }, "wrong"),
    ).rejects.toThrow();
    await expect(
      controleerWachtwoord(
        {
          algorithmName: "SHA-512",
          saltValue: Buffer.from(salt).toString("base64"),
          spinCount: "3",
          hashValue: hash.toString("base64"),
        },
        "wrong",
      ),
    ).rejects.toThrow();
  });
  it("maakt wachtwoordbeveiliging en heft deze alleen met het wachtwoord op", async () => {
    const bytes = await schrijfBladBeveiliging(
      bron,
      0,
      standaardRechten(),
      "",
      "Test 😀",
    );
    const attrs = leesBeveiliging(bytes).bladen[0].attrs;
    expect(attrs.algorithmName).toBe("SHA-512");
    expect(attrs.password).toBeUndefined();
    expect(
      leesBeveiliging(await schrijfBladBeveiliging(bytes, 0, null, "Test 😀"))
        .bladen[0].actief,
    ).toBe(false);
  }, 60000);
  it("beheert werkmapstructuur zonder bestaande andere beveiligingsvlaggen te verwijderen", async () => {
    const p = new Pakket(bron),
      wb = werkmap(p);
    p.schrijf(
      wb.pad,
      wb.xml.replace(
        /<workbookProtection\b[^>]*\/>/,
        `<workbookProtection lockStructure="1" lockWindows="1" workbookPassword="CBEB" revisionsPassword="1234"/>`,
      ),
    );
    const bytes = p.inpakken(),
      h = openWorkbook(bytes);
    try {
      bereidStructuurBeveiliging(h, bytes);
      expect(() =>
        h.applyOps([{ type: "addSheet", index: 1, name: "Nieuw" }]),
      ).toThrow();
    } finally {
      h.dispose();
    }
    await expect(
      schrijfStructuurBeveiliging(bytes, false, "wrong"),
    ).rejects.toThrow();
    const uit = await schrijfStructuurBeveiliging(bytes, false, "test");
    expect(leesBeveiliging(uit).structuur).toBe(false);
    expect(leesBeveiliging(uit).werkmap).toMatchObject({
      lockWindows: "1",
      revisionsPassword: "1234",
    });
    const k = openWorkbook(uit);
    bereidStructuurBeveiliging(k, uit);
    expect(
      k.applyOps([{ type: "addSheet", index: 1, name: "Nieuw" }]).applied,
    ).toBe(true);
    k.dispose();
  });
});
