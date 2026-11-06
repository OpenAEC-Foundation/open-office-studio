import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { benoemdeBereiken, gaNaar } from "./rekenblad-opdrachten";

vi.mock("./editorApi", () => ({ zichtbaarElement: () => null, meldWijziging: vi.fn() }));

let xlsx: typeof import("@betteroffice/xlsx");
const boeken: WorkbookHandle[] = [];
beforeAll(async () => {
  xlsx = await import("@betteroffice/xlsx");
  await xlsx.initWasm(readFileSync("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"));
});
afterEach(() => boeken.splice(0).forEach((h) => h.dispose()));

function boek() {
  const h = xlsx.openWorkbook(new Uint8Array(readFileSync("public/templates/nieuw.xlsx")));
  boeken.push(h);
  h.applyOps([
    { type: "renameSheet", sheet: 0, name: "Eerste" },
    { type: "addSheet", index: 1, name: "Tweede" },
    { type: "setDefinedName", name: "Gedeeld", refers_to: "'Eerste'!$A$1", scope: null },
    { type: "setDefinedName", name: "Gedeeld", refers_to: "'Eerste'!$B$2", scope: 0 },
    { type: "setDefinedName", name: "AlleenTweede", refers_to: "'Tweede'!$C$3", scope: 1 },
  ]);
  const selectCells = vi.fn((blad: number) => { h.setActiveSheet(blad); return true; });
  const api = { handle: h, selectCells, focus: vi.fn(), version: async () => h.version() } as unknown as XlsxEditorApi;
  return { h, api, selectCells };
}

describe("bereiknamen met werkmap- en bladbereik", () => {
  it("geeft op het eerste blad voorrang aan de lokale naam", () => {
    const { api } = boek();
    expect(benoemdeBereiken(api).filter((n) => n.naam === "Gedeeld"))
      .toEqual([{ naam: "Gedeeld", verwijzing: "'Eerste'!$B$2" }]);
  });

  it("biedt de lokale naam van een ander blad niet als ongekwalificeerde naam aan", () => {
    const { api } = boek();
    expect(benoemdeBereiken(api).some((n) => n.naam === "AlleenTweede")).toBe(false);
  });

  it("valt op het tweede blad terug op de werkmapnaam", () => {
    const { h, api } = boek();
    h.setActiveSheet(1);
    expect(benoemdeBereiken(api).filter((n) => n.naam === "Gedeeld"))
      .toEqual([{ naam: "Gedeeld", verwijzing: "'Eerste'!$A$1" }]);
    expect(benoemdeBereiken(api).some((n) => n.naam === "AlleenTweede")).toBe(true);
  });

  it("navigeert bij een gelijknamige werkmapnaam naar de lokale B2", async () => {
    const { api, selectCells } = boek();
    await gaNaar(api, "gEdEeLd");
    expect(selectCells).toHaveBeenLastCalledWith(0, {
      anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 },
    });
  });

  it("navigeert vanaf het tweede blad via de werkmapnaam naar A1", async () => {
    const { h, api, selectCells } = boek();
    h.setActiveSheet(1);
    await gaNaar(api, "Gedeeld");
    expect(selectCells).toHaveBeenLastCalledWith(0, {
      anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 },
    });
  });

  it("verandert door het lezen van namen geen werkmapversie of geschiedenis", () => {
    const { h, api } = boek();
    const versie = h.version(), historie = h.historyState();
    benoemdeBereiken(api);
    expect(h.version()).toBe(versie);
    expect(h.historyState()).toEqual(historie);
  });

  it.each(["5", '"tekst"', "SUM('Eerste'!$A$1:$A$2)", "#REF!"])(
    "valt bij de lokale definitie %s niet terug op een gelijknamig globaal bereik",
    async (verwijzing) => {
      const { h, api, selectCells } = boek();
      h.applyOps([{ type: "setDefinedName", name: "Gedeeld", refers_to: verwijzing, scope: 0 }]);
      expect(benoemdeBereiken(api).some((n) => n.naam === "Gedeeld")).toBe(false);
      await expect(gaNaar(api, "Gedeeld")).rejects.toThrow();
      expect(selectCells).not.toHaveBeenCalled();
    },
  );

  it("maakt door een verborgen lokale naam niet de globale naam zichtbaar", () => {
    const { h, api } = boek();
    h.applyOps([{ type: "setDefinedName", name: "Gedeeld", refers_to: "'Eerste'!$B$2", scope: 0, hidden: true }]);
    expect(benoemdeBereiken(api).some((n) => n.naam === "Gedeeld")).toBe(false);
  });

  it("laat een lokale naam met andere hoofdletters voorgaan", async () => {
    const { h, api, selectCells } = boek();
    h.applyOps([
      { type: "deleteDefinedName", name: "Gedeeld", scope: 0 },
      { type: "setDefinedName", name: "gEdEeLd", refers_to: "'Eerste'!$B$2", scope: 0 },
    ]);
    expect(benoemdeBereiken(api).filter((n) => n.naam.toLowerCase() === "gedeeld"))
      .toEqual([{ naam: "gEdEeLd", verwijzing: "'Eerste'!$B$2" }]);
    await gaNaar(api, "GEDEELD");
    expect(selectCells).toHaveBeenLastCalledWith(0, {
      anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 },
    });
  });

  it("laat een later gedefinieerde werkmapnaam niet de lokale naam verdringen", () => {
    const { h, api } = boek();
    h.applyOps([
      { type: "deleteDefinedName", name: "Gedeeld", scope: null },
      { type: "setDefinedName", name: "Gedeeld", refers_to: "'Eerste'!$A$1", scope: null },
    ]);
    expect(benoemdeBereiken(api).filter((n) => n.naam === "Gedeeld"))
      .toEqual([{ naam: "Gedeeld", verwijzing: "'Eerste'!$B$2" }]);
  });

  it("weigert navigatie naar een ongekwalificeerde lokale naam van een ander blad", async () => {
    const { api, selectCells } = boek();
    await expect(gaNaar(api, "AlleenTweede")).rejects.toThrow();
    expect(selectCells).not.toHaveBeenCalled();
  });

  it("houdt de naamdefinities en hun bereik bij bewaren en heropenen", () => {
    const { h, api } = boek();
    const voor = benoemdeBereiken(api);
    const heropend = xlsx.openWorkbook(h.save());
    boeken.push(heropend);
    const nieuw = { ...api, handle: heropend } as XlsxEditorApi;
    expect(benoemdeBereiken(nieuw)).toEqual(voor);
    heropend.setActiveSheet(1);
    expect(benoemdeBereiken(nieuw)).toContainEqual({ naam: "Gedeeld", verwijzing: "'Eerste'!$A$1" });
    expect(benoemdeBereiken(nieuw)).toContainEqual({ naam: "AlleenTweede", verwijzing: "'Tweede'!$C$3" });
  });

  it("volgt dezelfde lokale en globale binding als de formuleberekening", () => {
    const { h } = boek();
    h.editCells(0, [
      { row: 0, col: 0, input: "10" },
      { row: 1, col: 1, input: "20" },
      { row: 0, col: 3, input: "=Gedeeld" },
    ]);
    h.editCells(1, [{ row: 0, col: 3, input: "=Gedeeld" }]);
    const lees = (blad: number) => (h.readCells({
      ranges: [{ sheetId: h.sheetInfo().sheetIds[blad], range: { kind: "a1", a1: "D1" } }],
    }) as { ranges: { cells: { value: unknown }[][] }[] }).ranges[0].cells[0][0].value;
    expect(lees(0)).toEqual({ kind: "number", value: 20 });
    expect(lees(1)).toEqual({ kind: "number", value: 10 });
  });
});
