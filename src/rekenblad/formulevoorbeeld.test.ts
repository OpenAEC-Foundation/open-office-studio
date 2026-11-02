import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as xlsx from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { voorbeeldResultaat } from "../lint/rekenblad-formulebalk";

const bytes = readFileSync("public/templates/nieuw.xlsx");
beforeAll(async () => {
  await xlsx.initWasm(readFileSync("node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm"));
});
afterEach(() => vi.unstubAllGlobals());

describe("weekformules in het functievoorbeeld", () => {
  it.each([["ISOWEEKNUM(A1)", "53"], ["ISOWEEKNUM()", "#VALUE!"]])("toont %s zonder het geopende bestand te veranderen", async (formule, uitkomst) => {
    vi.stubGlobal("location", { href: "http://localhost/" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes)));
    const h = xlsx.openWorkbook(bytes);
    try {
      h.editCell(0, 0, 0, "44197");
      const versie = h.version();
      const api = { handle: h, readCells: async (r: xlsx.XlsxReadRequest) => h.readCells(r) } as unknown as XlsxEditorApi;
      expect(await voorbeeldResultaat(api, formule, 0, { row: 0, col: 1 })).toBe(uitkomst);
      expect(h.version()).toBe(versie);
      expect(h.cell(0, 0, 0).input).toBe("44197");
      expect(h.cell(0, 0, 1).input).toBe("");
    } finally { h.dispose(); }
  });
});
