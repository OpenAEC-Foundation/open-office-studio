/**
 * Rijen/kolommen (#60), bladen (#61) en klembord (#20) tegen de echte
 * rekenkern, met een kleine nep-editor rond de WorkbookHandle.
 */
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import * as xlsx from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { ontleedBereik } from "../lint/rekenblad-logica";
import { bladKopieren, bladenLijst, kopieNaam } from "./bladen";
import { kopieerSelectie, plak } from "./klembord";
import { leesHtmlTabel } from "./klembordLogica";
import { breedteTekens, hoogtePunten } from "./maten";
import { berekenOptimaleBreedte, kolomPx, rijPx, zetBreedte, zetHoogte } from "./structuur";

let selectie = "A1";
function nepEditor(h: xlsx.WorkbookHandle): XlsxEditorApi {
  const host = {
    querySelector: (s: string) => (s.includes("name-box") ? { value: selectie.split(":")[0] } : null),
    querySelectorAll: () => [],
    closest: () => null,
  };
  (globalThis as { document?: unknown }).document = {
    querySelectorAll: (s: string) => (s === ".office-rekenblad-host" ? [host] : []),
  };
  const api = {
    handle: h,
    focus: () => {},
    commands: {
      getState: (id: string) => {
        if (id !== "merge") return { enabled: true };
        const b = ontleedBereik(selectie)!;
        return { value: { rows: b.bottom - b.top + 1, columns: b.right - b.left + 1 } };
      },
      subscribe: () => () => {},
    },
    selectCells: (blad: number, sel: { anchor: { row: number; col: number }; focus: { row: number; col: number } }) => {
      h.setActiveSheet(blad);
      const a = h.cell(blad, sel.focus.row, sel.focus.col).a1;
      const b = h.cell(blad, sel.anchor.row, sel.anchor.col).a1;
      selectie = a === b ? a : `${a}:${b}`;
      return true;
    },
    version: async () => h.version(),
    readCells: async (r: xlsx.XlsxReadRequest) => h.readCells(r),
    validateEdits: async (r: xlsx.XlsxEditRequest) => h.validateEdits(r),
    applyEdits: async (r: xlsx.XlsxEditRequest) => h.applyEdits(r),
  };
  return api as unknown as XlsxEditorApi;
}

const waarde = (h: xlsx.WorkbookHandle, blad: number, a1: string) => {
  const id = h.sheetInfo().sheetIds[blad];
  const r = h.readCells({ ranges: [{ sheetId: id, range: { kind: "a1", a1 } }] });
  if (!r.ok) throw new Error(r.failure.message);
  return r.ranges[0].cells[0][0];
};

beforeAll(async () => {
  await xlsx.initWasm(readFileSync("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"));
});

let h: xlsx.WorkbookHandle;
let api: XlsxEditorApi;
beforeEach(() => {
  h = xlsx.openWorkbook(readFileSync("public/templates/nieuw.xlsx"));
  api = nepEditor(h);
  selectie = "A1";
});

describe("kolombreedte en rijhoogte (#60)", () => {
  it("zet breedte en hoogte als één ongedaan-maakstap en bewaart ze in het bestand", async () => {
    selectie = "B2:C3";
    await zetBreedte(api, 20);
    await zetHoogte(api, 30);
    expect(breedteTekens(kolomPx(api, 0, 1))).toBe(20);
    expect(breedteTekens(kolomPx(api, 0, 2))).toBe(20);
    expect(hoogtePunten(rijPx(api, 0, 2))).toBe(30);
    const xml = strFromU8(unzipSync(h.save())["xl/worksheets/sheet1.xml"]);
    expect(xml).toMatch(/<col min="2" max="3" width="20"|<col min="2" max="2" width="20"/);
    expect(xml).toContain('ht="30"');
    h.undo();
    expect(hoogtePunten(rijPx(api, 0, 2))).toBe(15);
    h.undo();
    expect(breedteTekens(kolomPx(api, 0, 1))).toBe(8.43);
  });
  it("optimale breedte volgt de langste tekst; een lege kolom krijgt de standaard", () => {
    h.editCell(0, 0, 0, "kort");
    h.editCell(0, 1, 0, "een veel langere tekst");
    const meet = (tekst: string) => tekst.length * 7;
    const breedten = berekenOptimaleBreedte(api, 0, [0, 1], meet);
    expect(breedten.get(0)).toBeCloseTo((22 * 7 + 8 - 5) / 7, 1);
    expect(breedten.get(1)).toBeNull();
  });
});

describe("bladen (#61)", () => {
  it("kopieert een blad met inhoud, formules, opmaak, maten en samenvoeging naar een positie", async () => {
    h.editCell(0, 0, 0, "Titel");
    h.editCell(0, 1, 0, "5");
    h.editCell(0, 1, 1, "=A2*2");
    h.patchRangeStyle(0, "A1", { bold: true });
    h.applyOps([
      { type: "setColWidth", sheet: 0, col: 0, width: 25 },
      { type: "mergeCells", sheet: 0, range: { start: { row: 3, col: 0 }, end: { row: 3, col: 2 } } },
    ]);
    const naam = kopieNaam("Blad 1", h.sheetInfo().sheetNames);
    expect(naam).toBe("Blad 1 (2)");
    await bladKopieren(api, 0, naam);
    expect(h.sheetInfo().sheetNames).toEqual(["Blad 1 (2)", "Blad 1"]);
    expect(waarde(h, 0, "A1").displayText).toBe("Titel");
    expect(waarde(h, 0, "B2").formula).toBe("A2*2");
    expect(waarde(h, 0, "B2").displayText).toBe("10");
    expect(h.selectionFormatting(0, "A1").bold).toBe(true);
    expect(breedteTekens(kolomPx(api, 0, 0))).toBe(25);
    expect(h.mergedRanges(0, "A1:D10")).toHaveLength(1);
    // Het origineel blijft ongewijzigd.
    expect(waarde(h, 1, "B2").formula).toBe("A2*2");
    // Blijft na opslaan en heropenen.
    const terug = xlsx.openWorkbook(h.save());
    expect(terug.sheetInfo().sheetNames).toEqual(["Blad 1 (2)", "Blad 1"]);
    expect(bladenLijst(nepEditor(terug)).map((b) => b.verborgen)).toEqual([false, false]);
  });
});

describe("bladen in een bestaand bestand (#61)", () => {
  it("kopieert Materiaaloverzicht (vaste titels, samenvoegingen, breedten) naar het einde", async () => {
    const m = xlsx.openWorkbook(readFileSync("docs/voorbeelden/Materiaaloverzicht.xlsx"));
    const mApi = nepEditor(m);
    await bladKopieren(mApi, 1, "Kopie");
    expect(m.sheetInfo().sheetNames).toEqual(["Materialen", "Kopie"]);
    expect(m.mergedRanges(1, "A1:XFD1048576")).toHaveLength(m.mergedRanges(0, "A1:XFD1048576").length);
    for (const c of [0, 1, 7]) expect(kolomPx(mApi, 1, c)).toBeCloseTo(kolomPx(mApi, 0, c), 1);
    expect(waarde(m, 1, "B8").displayText).toBe(waarde(m, 0, "B8").displayText);
    m.setActiveSheet(1);
    expect(m.sheetInfo().frozenRows).toBe(6);
  });
});

describe("klembord (#20)", () => {
  function vul() {
    h.editCell(0, 0, 0, "1");
    h.editCell(0, 0, 1, "2");
    h.editCell(0, 1, 0, "=A1*10");
    h.editCell(0, 1, 1, "tekst");
  }
  it("kopieert als HTML-tabel en tekst; plakken in de app schuift formules mee", async () => {
    vul();
    selectie = "A1:B2";
    const { tsv, html } = kopieerSelectie(api);
    expect(tsv).toBe("1\t2\r\n10\ttekst");
    expect(html).toContain("<table");
    expect(html).toContain('x:num="10"');
    expect(leesHtmlTabel(html)).toEqual([
      ["1", "2"],
      ["10", "tekst"],
    ]);
    selectie = "D5";
    await plak(api, { tekst: tsv, html });
    expect(waarde(h, 0, "D6").formula).toBe("D5*10");
    expect(waarde(h, 0, "D6").displayText).toBe("10");
    expect(waarde(h, 0, "E6").displayText).toBe("tekst");
  });
  it("plakken speciaal: waarden, transponeren, bewerking en lege cellen overslaan", async () => {
    vul();
    selectie = "A1:B2";
    const { tsv } = kopieerSelectie(api);
    selectie = "D1";
    await plak(api, { tekst: tsv }, { wat: "waarden", bewerking: "geen", legeOverslaan: false, transponeren: true });
    expect(waarde(h, 0, "D2").displayText).toBe("2");
    expect(waarde(h, 0, "E1").formula).toBeNull();
    expect(waarde(h, 0, "E1").displayText).toBe("10");
    // Optellen bij bestaande getallen.
    h.editCell(0, 9, 0, "100");
    h.editCell(0, 9, 1, "100");
    selectie = "A1:B1";
    const rij = kopieerSelectie(api);
    selectie = "A10";
    await plak(api, { tekst: rij.tsv }, { wat: "alles", bewerking: "optellen", legeOverslaan: false, transponeren: false });
    expect(waarde(h, 0, "A10").displayText).toBe("101");
    expect(waarde(h, 0, "B10").displayText).toBe("102");
    // Lege cellen overslaan houdt de bestaande inhoud.
    h.editCell(0, 19, 1, "blijft");
    selectie = "A1:C1";
    const metLeeg = kopieerSelectie(api);
    selectie = "A20";
    await plak(api, { tekst: metLeeg.tsv }, { wat: "alles", bewerking: "geen", legeOverslaan: true, transponeren: false });
    expect(waarde(h, 0, "A20").displayText).toBe("1");
    expect(waarde(h, 0, "C20").displayText).toBe("");
  });
  it("plakt een HTML-tabel uit een ander programma met Nederlandse getallen en datums", async () => {
    const html =
      "<html><body><table><tr><th>Post</th><th>Bedrag</th><th>Datum</th></tr>" +
      "<tr><td>Hout &amp; staal</td><td>1.234,50</td><td>1-2-2026</td></tr>" +
      '<tr><td colspan="2">samen</td><td>15%</td></tr></table></body></html>';
    selectie = "B2";
    await plak(api, { tekst: "Post\tBedrag\tDatum", html });
    expect(waarde(h, 0, "B3").displayText).toBe("Hout & staal");
    expect(waarde(h, 0, "C3").value).toEqual({ kind: "number", value: 1234.5 });
    expect(waarde(h, 0, "D3").value).toEqual({ kind: "number", value: 46054 });
    expect(waarde(h, 0, "D3").displayText).toBe("1-2-2026");
    expect(waarde(h, 0, "D4").value).toEqual({ kind: "number", value: 0.15 });
    expect(waarde(h, 0, "C4").displayText).toBe("");
  });
  it("knippen verplaatst: de bron wordt leeg en formules blijven gelijk", async () => {
    vul();
    selectie = "A2";
    const { tsv } = kopieerSelectie(api, true);
    selectie = "C3";
    await plak(api, { tekst: tsv });
    expect(waarde(h, 0, "C3").formula).toBe("A1*10");
    expect(waarde(h, 0, "A2").displayText).toBe("");
  });
});
