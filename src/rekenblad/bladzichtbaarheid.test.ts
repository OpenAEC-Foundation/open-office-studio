import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { bereidBladweergave, leesBladZichtbaarheid, zichtbareBladen } from "./bladzichtbaarheid";
import { bladVerwijderen } from "../lint/rekenblad-opdrachten";
import { herstelBladtabs } from "../../scripts/rekenbladengine-compatibiliteit";
import { leesXml, zoekAlle, vervang } from "../grafieken/xml";

const boeken: WorkbookHandle[] = [];
afterEach(() => { boeken.splice(0).forEach(h => h.dispose()); });
function open(bytes: Uint8Array) { const h = openWorkbook(bytes); boeken.push(h); return h; }
function bron(staten = ["hidden", "visible", "veryHidden", "visible"]) {
  const h = open(readFileSync("public/templates/nieuw.xlsx"));
  h.applyOps([{ type: "renameSheet", sheet: 0, name: "Verborgen" },
    { type: "addSheet", index: 1, name: "Zichtbaar A" },
    { type: "addSheet", index: 2, name: "Zeer verborgen" },
    { type: "addSheet", index: 3, name: "Zichtbaar B" }]);
  h.editCell(0, 0, 0, "7");
  h.editCell(2, 0, 0, "11");
  h.editCell(1, 0, 0, "='Verborgen'!A1+'Zeer verborgen'!A1");
  h.editCell(3, 0, 0, "='Zichtbaar A'!A1*2");
  const delen = unzipSync(h.save());
  let index = 0;
  delen["xl/workbook.xml"] = strToU8(strFromU8(delen["xl/workbook.xml"]).replace(/<sheet\b[^>]*\/>/g,
    tag => tag.replace(/\s+state="[^"]*"/, "").replace('/>', ` state="${staten[index++]}"/>`)));
  expect(index).toBe(4);
  delen["xl/openaec-proef.xml"] = strToU8('<proef xmlns="urn:openaec:proef">behouden</proef>');
  return zipSync(delen, { mtime: new Date(2026, 0, 1) });
}
function waarde(h: WorkbookHandle, blad: number) {
  const r = h.readCells({ ranges: [{ sheetId: h.sheetInfo().sheetIds[blad], range: { kind: "a1", a1: "A1" } }] });
  if (!r.ok) throw new Error(r.failure.message);
  return r.ranges[0].cells[0][0].displayText;
}
function api(h: WorkbookHandle): XlsxEditorApi {
  return { handle: h, version: async () => h.version(),
    selectCells: (blad: number) => { h.setActiveSheet(blad); return true; },
    commands: { getState: () => ({ enabled: true }) } } as unknown as XlsxEditorApi;
}

describe("verborgen werkbladen blijven onderdeel van de werkmap (#3, #61)", () => {
  it("toont alleen zichtbare tabs met hun werkelijke bladindexen", () => {
    const h = open(bron());
    expect(zichtbareBladen(h, h.sheetInfo()).map(b => [b.index, b.naam])).toEqual([[1, "Zichtbaar A"], [3, "Zichtbaar B"]]);
    expect(leesBladZichtbaarheid(h).map(b => b.zichtbaarheid)).toEqual(["hidden", "visible", "veryHidden", "visible"]);
    bereidBladweergave(h);
    expect(h.sheetInfo().activeSheet).toBe(1);
    expect(() => h.setActiveSheet(0)).toThrow("Verborgen");
    expect(() => h.setActiveSheet(2)).toThrow("Zeer verborgen");
    h.setActiveSheet(3);
    expect(h.sheetInfo().activeSheet).toBe(3);
    expect(waarde(h, 1)).toBe("18");
    expect(waarde(h, 3)).toBe("36");
  });
  it("bewaart verborgen bladen, formules en onbekende onderdelen na een zichtbare bewerking", () => {
    const bytes = bron(), h = open(bytes);
    bereidBladweergave(h);
    h.editCell(1, 1, 0, "Gewijzigd");
    const opgeslagen = h.save(), delen = unzipSync(opgeslagen);
    expect(delen["xl/openaec-proef.xml"]).toEqual(unzipSync(bytes)["xl/openaec-proef.xml"]);
    const terug = open(opgeslagen);
    expect(leesBladZichtbaarheid(terug).map(b => b.zichtbaarheid)).toEqual(["hidden", "visible", "veryHidden", "visible"]);
    expect(waarde(terug, 0)).toBe("7");
    expect(waarde(terug, 2)).toBe("11");
    expect(waarde(terug, 3)).toBe("36");
  });
  it("maakt alleen bladkeuze niet tot een inhoudelijke wijziging", () => {
    const bytes = bron(), h = open(bytes), versie = h.version();
    bereidBladweergave(h);
    h.setActiveSheet(3);
    expect(h.version()).toBe(versie);
    const voor = unzipSync(bytes), na = unzipSync(h.save());
    expect(Object.keys(na).sort()).toEqual(Object.keys(voor).sort());
    // De bestaande schrijver bewaart activeTab en tabSelected. Alleen die
    // weergavekeuze mag wijzigen: alle overige XML en bytes blijven gelijk.
    for (const naam of Object.keys(voor)) {
      const zonderWeergave = (b: Uint8Array) => {
        const xml = strFromU8(b), root = leesXml(xml);
        const delen = [...zoekAlle(root, "bookViews"), ...zoekAlle(root, "sheetViews")];
        return vervang(xml, delen.map(x => ({ start: x.start, eind: x.eind, tekst: "" })));
      };
      if (naam === "xl/workbook.xml" || /^xl\/worksheets\/[^/]+\.xml$/.test(naam))
        expect(zonderWeergave(na[naam]), naam).toBe(zonderWeergave(voor[naam]));
      else expect(na[naam], naam).toEqual(voor[naam]);
    }
  });
  it("weigert een ongeldige werkmap zonder enig zichtbaar blad", () => {
    const h = open(bron(["hidden", "hidden", "veryHidden", "hidden"]));
    expect(() => bereidBladweergave(h)).toThrow();
  });
  it("volgt de echte bladidentiteit na verplaatsen, Undo en Redo", () => {
    const h = open(bron());
    bereidBladweergave(h);
    h.applyOps([{ type: "moveSheet", from: 0, to: 3 }]);
    expect(zichtbareBladen(h, h.sheetInfo()).map(b => [b.index, b.naam]))
      .toEqual([[0, "Zichtbaar A"], [2, "Zichtbaar B"]]);
    expect(waarde(h, 2)).toBe("36");
    h.undo();
    expect(zichtbareBladen(h, h.sheetInfo()).map(b => b.index)).toEqual([1, 3]);
    h.redo();
    expect(zichtbareBladen(h, h.sheetInfo()).map(b => b.index)).toEqual([0, 2]);
    expect(leesBladZichtbaarheid(h)[h.sheetInfo().activeSheet].verborgen).toBe(false);
  });
  it("weigert het laatste zichtbare blad te verwijderen, ook met verborgen bladen", async () => {
    const h = open(bron(["hidden", "visible", "veryHidden", "hidden"]));
    bereidBladweergave(h);
    await expect(bladVerwijderen(api(h))).rejects.toThrow();
    expect(h.sheetInfo().sheetNames).toHaveLength(4);
  });
  it("kiest na verwijderen een zichtbaar blad in plaats van de naastgelegen verborgen tab", async () => {
    const h = open(bron(["visible", "visible", "hidden", "hidden"]));
    bereidBladweergave(h);
    await bladVerwijderen(api(h));
    expect(h.sheetInfo().sheetNames).toEqual(["Zichtbaar A", "Zeer verborgen", "Zichtbaar B"]);
    expect(h.sheetInfo().activeSheet).toBe(0);
    expect(leesBladZichtbaarheid(h)[0].verborgen).toBe(false);
  });
  it("stopt bij gewijzigde of dubbele editoraansluitingen", () => {
    const tekst = readFileSync("node_modules/@betteroffice/xlsx-react/dist/index.js", "utf8");
    expect(herstelBladtabs(tekst)).toContain("data-oos-blad");
    expect(() => herstelBladtabs("andere editor")).toThrow("bladtabs");
    expect(() => herstelBladtabs(tekst + tekst)).toThrow("bladtabs");
  });
});
