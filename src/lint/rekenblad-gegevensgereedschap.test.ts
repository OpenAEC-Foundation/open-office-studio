import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { bewerkDuplicaten, reeksen, zoekDuplicaten } from "./rekenblad-duplicaten";

let xlsx: typeof import("@betteroffice/xlsx");
beforeAll(async () => {
  xlsx = await import("@betteroffice/xlsx");
  await xlsx.initWasm(readFileSync("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"));
});

/** Een minimale editor-API rond een werkboek, zoals XlsxEditor die geeft. */
function maakApi(handle: WorkbookHandle) {
  const api = {
    handle,
    commands: { getState: () => ({ enabled: true }) },
    version: async () => handle.version(),
    readCells: async (r: Parameters<WorkbookHandle["readCells"]>[0]) => handle.readCells(r),
    validateEdits: async (r: Parameters<WorkbookHandle["validateEdits"]>[0]) => handle.validateEdits(r),
    applyEdits: async (r: Parameters<WorkbookHandle["applyEdits"]>[0]) => handle.applyEdits(r),
    selectCells: () => true,
  };
  return api as unknown as XlsxEditorApi;
}

export function boek(rijen: string[][]) {
  const handle = xlsx.openWorkbook(new Uint8Array(readFileSync("public/templates/nieuw.xlsx")));
  handle.editCells(
    0,
    rijen.flatMap((rij, r) => rij.map((input, c) => ({ row: r, col: c, input }))).filter((e) => e.input !== ""),
  );
  return handle;
}
const inhoud = (h: WorkbookHandle, a1: string) => h.rangeCells(0, a1).map((r) => r.map((c) => c.input));
const sid = (h: WorkbookHandle) => h.sheetInfo().sheetIds[0];

describe("duplicaten zoeken", () => {
  it("vergelijkt de gekozen kolommen op weergegeven tekst, standaard zonder hoofdletters", () => {
    const t = [
      ["Jan", "1"],
      ["jan", "2"],
      ["Piet", "1"],
      ["JAN", "1"],
    ];
    const a = zoekDuplicaten(t, [0], false);
    expect(a.uniek).toEqual([0, 2]);
    expect(a.dubbel).toEqual([1, 3]);
    expect(a.meervoudig).toEqual([0, 1, 3]);
    expect(a.enkel).toEqual([2]);
    expect(zoekDuplicaten(t, [0], true).dubbel).toEqual([]);
    expect(zoekDuplicaten(t, [0, 1], false).dubbel).toEqual([3]);
  });
  it("vat rijen samen tot aaneengesloten reeksen", () => {
    expect(reeksen([1, 2, 3, 6, 8, 9])).toEqual([
      [1, 3],
      [6, 6],
      [8, 9],
    ]);
  });
});

describe("duplicaten bewerken", () => {
  it("verwijdert dubbele rijen in één ongedaan-maakstap en houdt formules juist", async () => {
    const h = boek([
      ["Naam", "Getal", "Dubbel"],
      ["a", "1", "=B2*2"],
      ["b", "2", "=B3*2"],
      ["A", "1", "=B4*2"],
      ["c", "3", "=B5*2"],
      ["x", "", ""],
    ]);
    const api = maakApi(h);
    const voor = h.historyState().undoDepth;
    const r = await bewerkDuplicaten(api, {
      blad: 0,
      sheetId: sid(h),
      bereik: { top: 0, left: 0, bottom: 4, right: 2 },
      kop: true,
      kolommen: [0, 1],
      hoofdlettergevoelig: false,
      actie: "verwijderen",
    });
    expect(r).toEqual({ aantal: 1, over: 3 });
    expect(h.historyState().undoDepth).toBe(voor + 1);
    expect(inhoud(h, "A1:C6")).toEqual([
      ["Naam", "Getal", "Dubbel"],
      ["a", "1", "=B2*2"],
      ["b", "2", "=B3*2"],
      ["c", "3", "=B4*2"],
      ["", "", ""],
      ["x", "", ""],
    ]);
    h.undo();
    expect(inhoud(h, "A4:C4")).toEqual([["A", "1", "=B4*2"]]);
    h.dispose();
  });

  it("markeert dubbele rijen en verbergt herhalingen bij filteren", async () => {
    const h = boek([["k"], ["1"], ["2"], ["1"], ["3"], ["2"]]);
    const api = maakApi(h);
    const basis = { blad: 0, sheetId: sid(h), bereik: { top: 0, left: 0, bottom: 5, right: 0 }, kop: true, kolommen: [0], hoofdlettergevoelig: false };
    const m = await bewerkDuplicaten(api, { ...basis, actie: "markerenDubbel" });
    expect(m).toEqual({ aantal: 4, over: 5 });
    const f = h.selectionFormatting(0, "A2");
    expect(f.fillColor?.toUpperCase()).toBe("#FFC7CE");
    expect(h.selectionFormatting(0, "A5").fillColor ?? null).not.toBe("#FFC7CE");
    const u = await bewerkDuplicaten(api, { ...basis, actie: "markerenUniek" });
    expect(u.aantal).toBe(1);
    h.dispose();
  });
});
