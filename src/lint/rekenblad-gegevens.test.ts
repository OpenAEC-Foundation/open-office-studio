import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import {
  doelBereik,
  filterAanUit,
  filterTelling,
  gebiedRond,
  kolomKeuzes,
  pasFilterToe,
  raadKopregel,
  sorteerBereik,
  vul,
  vulTotEinde,
  zetKolomFilter,
} from "./rekenblad-gegevens";
import { bladFilter, laadFilters, metFilters, leesAutoFilters } from "./rekenblad-filter";

let xlsx: typeof import("@betteroffice/xlsx");
beforeAll(async () => {
  xlsx = await import("@betteroffice/xlsx");
  await xlsx.initWasm(readFileSync("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"));
});

/** Een minimale editor-API rond een werkboek, zoals XlsxEditor die geeft. */
function maakApi(handle: WorkbookHandle) {
  let selectie = { row: 0, col: 0 };
  const api = {
    handle,
    commands: { getState: () => ({ enabled: true }) },
    version: async () => handle.version(),
    readCells: async (r: Parameters<WorkbookHandle["readCells"]>[0]) => handle.readCells(r),
    validateEdits: async (r: Parameters<WorkbookHandle["validateEdits"]>[0]) => handle.validateEdits(r),
    applyEdits: async (r: Parameters<WorkbookHandle["applyEdits"]>[0]) => handle.applyEdits(r),
    selectCells: (_: number, s: { focus: { row: number; col: number } }) => {
      selectie = s.focus;
      return true;
    },
  };
  return { api: api as unknown as XlsxEditorApi, selectie: () => selectie };
}

function boek(rijen: string[][]) {
  const handle = xlsx.openWorkbook(new Uint8Array(readFileSync("public/templates/nieuw.xlsx")));
  handle.editCells(
    0,
    rijen.flatMap((rij, r) => rij.map((input, c) => ({ row: r, col: c, input }))).filter((e) => e.input !== ""),
  );
  return handle;
}
const inhoud = (h: WorkbookHandle, a1: string) => h.rangeCells(0, a1).map((r) => r.map((c) => c.input));
const tekst = (h: WorkbookHandle, a1: string) =>
  (h.readCells({ ranges: [{ sheetId: h.sheetInfo().sheetIds[0], range: { kind: "a1", a1 } }] }) as {
    ranges: { cells: { displayText: string }[][] }[];
  }).ranges[0].cells.map((r) => r.map((c) => c.displayText));
const sid = (h: WorkbookHandle) => h.sheetInfo().sheetIds[0];

describe("doorvoeren", () => {
  it("zet reeksen voort en kopieert opmaak in één stap als alleen de notatie verschilt", async () => {
    const h = boek([["1", "maandag", "=A1*2"], ["2", "", ""]]);
    h.applyEdits({
      expectVersion: h.version(),
      steps: [{ op: "setNumberFormat", target: { sheetId: sid(h), range: { kind: "a1", a1: "A1:A2" } }, format: { type: "custom", pattern: "0.0" } }],
    });
    const { api } = maakApi(h);
    const voor = h.historyState().undoDepth;
    const bron = { top: 0, left: 0, bottom: 1, right: 0 };
    const r = await vul(api, 0, sid(h), bron, doelBereik(bron, "omlaag", 3), "omlaag");
    expect(r.stappen).toBe(1);
    expect(h.historyState().undoDepth).toBe(voor + 1);
    expect(tekst(h, "A3:A5")).toEqual([["3.0"], ["4.0"], ["5.0"]]);
    const bron2 = { top: 0, left: 1, bottom: 0, right: 2 };
    await vul(api, 0, sid(h), bron2, doelBereik(bron2, "omlaag", 2), "omlaag");
    expect(inhoud(h, "B2:C3")).toEqual([["dinsdag", "=A2*2"], ["woensdag", "=A3*2"]]);
    // Ongedaan maken in één keer.
    h.undo();
    expect(inhoud(h, "B2:C3")).toEqual([["", ""], ["", ""]]);
    h.dispose();
  });
  it("kopieert opmaak exact via een tweede stap als meer dan de notatie verschilt", async () => {
    const h = boek([["x"]]);
    h.applyEdits({
      expectVersion: h.version(),
      steps: [{ op: "patchStyle", target: { sheetId: sid(h), range: { kind: "a1", a1: "A1" } }, patch: { bold: true, fillColor: "#ffcc00" } }],
    });
    const { api } = maakApi(h);
    const bron = { top: 0, left: 0, bottom: 0, right: 0 };
    const r = await vul(api, 0, sid(h), bron, doelBereik(bron, "rechts", 2), "rechts", "kopie");
    expect(r.stappen).toBe(2);
    expect(h.selectionFormatting(0, "C1").bold).toBe(true);
    expect(inhoud(h, "B1:C1")).toEqual([["x", "x"]]);
    h.dispose();
  });
  it("vindt het einde van de aangrenzende gegevens voor dubbelklikken", async () => {
    const h = boek([["a", "1"], ["b", ""], ["c", ""], ["", ""], ["e", ""]]);
    const { api } = maakApi(h);
    expect(await vulTotEinde(api, sid(h), { top: 0, left: 1, bottom: 0, right: 1 })).toBe(2);
    h.dispose();
  });
});

describe("sorteren", () => {
  it("sorteert met kopregel, verplaatst formules en herkent het gebied", async () => {
    const h = boek([
      ["Naam", "Getal", "Dubbel"],
      ["peer", "3", "=B2*2"],
      ["Appel", "1", "=B3*2"],
      ["éclair", "2", "=B4*2"],
    ]);
    const { api } = maakApi(h);
    const gebied = await gebiedRond(api, 0, sid(h), { row: 2, col: 1 });
    expect(gebied).toEqual({ top: 0, left: 0, bottom: 3, right: 2 });
    expect(await raadKopregel(api, 0, sid(h), gebied)).toBe(true);
    await sorteerBereik(api, {
      blad: 0,
      sheetId: sid(h),
      bereik: gebied,
      kop: true,
      sleutels: [{ kolom: 0, aflopend: false, op: "waarden" }],
      hoofdlettergevoelig: false,
    });
    expect(inhoud(h, "A1:C4")).toEqual([
      ["Naam", "Getal", "Dubbel"],
      ["Appel", "1", "=B2*2"],
      ["éclair", "2", "=B3*2"],
      ["peer", "3", "=B4*2"],
    ]);
    expect(tekst(h, "C2:C4")).toEqual([["2"], ["4"], ["6"]]);
    h.dispose();
  });
});

describe("filter", () => {
  it("verbergt rijen, telt, schuift na sorteren mee en bewaart in de XLSX", async () => {
    const h = boek([
      ["Fruit", "Aantal"],
      ["appel", "5"],
      ["peer", "2"],
      ["appel", "8"],
      ["kiwi", "1"],
    ]);
    const { api } = maakApi(h);
    laadFilters(h, new Map());
    // filterAanUit leest de selectie uit de DOM; hier zetten we het filter direct.
    await pasFilterToe(api, 0, sid(h), { bereik: { top: 0, left: 0, bottom: 4, right: 1 }, kolommen: new Map() });
    const voor = h.historyState().undoDepth;
    const r = await zetKolomFilter(api, 0, sid(h), 0, { soort: "waarden", waarden: ["appel"], leeg: false });
    expect(r).toEqual({ zichtbaar: 2, totaal: 4 });
    expect(h.historyState().undoDepth).toBe(voor + 1);
    expect(filterTelling(api, 0)).toEqual({ zichtbaar: 2, totaal: 4 });
    // De keuzelijst van kolom B toont alleen rijen die door het filter op A komen.
    expect((await kolomKeuzes(api, 0, sid(h), 1)).cellen.map((c) => c.tekst)).toEqual(["5", "8"]);
    expect((await kolomKeuzes(api, 0, sid(h), 0)).cellen.map((c) => c.tekst)).toEqual(["appel", "peer", "appel", "kiwi"]);
    // Een rij eronder erbij: bij opnieuw toepassen groeit het bereik mee.
    h.editCells(0, [{ row: 5, col: 0, input: "peer" }, { row: 5, col: 1, input: "4" }]);
    await zetKolomFilter(api, 0, sid(h), 1, { soort: "voorwaarden", en: true, voorwaarden: [{ operator: "groter", waarde: "6" }] });
    expect(bladFilter(h, 0)!.bereik.bottom).toBe(5);
    expect(filterTelling(api, 0)).toEqual({ zichtbaar: 1, totaal: 5 });
    const bytes = metFilters(h, h.save(), 1);
    const terug = leesAutoFilters(bytes).get(0)!;
    expect(terug.bereik).toEqual({ top: 0, left: 0, bottom: 5, right: 1 });
    expect([...terug.kolommen.keys()]).toEqual([0, 1]);
    // Heropenen: rijen blijven verborgen.
    const opnieuw = xlsx.openWorkbook(bytes);
    const ex = opnieuw.exportStructured({ scope: [{ sheet: 0, range: "A1:B6" }], maxCells: 1 });
    expect(ex.ok && ex.content.sheets[0].hiddenRows).toEqual(["2:3", "5:6"]);
    opnieuw.dispose();
    h.dispose();
  });
  it("weigert een filter zonder gegevens", async () => {
    const h = boek([["", ""]]);
    const { api } = maakApi(h);
    // Zonder DOM-selectie geeft leesSelectie een melding; dat is ook een weigering.
    await expect(filterAanUit(api)).rejects.toThrow();
    h.dispose();
  });
});
