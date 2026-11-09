import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { openWorkbook, type WorkbookHandle, type XlsxCellValue } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { voorbeeldResultaat } from "./rekenblad-formulebalk";

const sjabloon = readFileSync("public/templates/nieuw.xlsx");
const boeken: WorkbookHandle[] = [];
beforeAll(() => {
  vi.stubGlobal("location", { href: "http://localhost/" });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(sjabloon))));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => boeken.splice(0).forEach(h => h.dispose()));

function boek(waarde: XlsxCellValue, anderBlad = false) {
  const h = openWorkbook(sjabloon);
  boeken.push(h);
  if (anderBlad) h.applyOps([{ type: "addSheet", index: 1, name: "Bron blad" }]);
  const blad = anderBlad ? 1 : 0;
  const r = h.applyEdits({ expectVersion: h.version(), steps: [{
    op: "setCellValues",
    target: { sheetId: h.sheetInfo().sheetIds[blad], range: { kind: "a1", a1: "A1" } },
    values: [[waarde]],
  }] });
  if (!r.ok) throw new Error(r.failure.message);
  return { h, api: { handle: h, readCells: async (r: Parameters<WorkbookHandle["readCells"]>[0]) => h.readCells(r) } as unknown as XlsxEditorApi };
}

describe("foutwaarden in het functievoorbeeld (#59)", () => {
  it.each(["#NULL!", "#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#N/A"] as const)(
    "behoudt %s bij berekening en foutafhandeling", async fout => {
      const { h, api } = boek({ kind: "error", value: fout });
      const versie = h.version();
      const geschiedenis = h.historyState();
      expect(await voorbeeldResultaat(api, "A1+1", 0, { row: 0, col: 1 })).toBe(fout);
      expect(await voorbeeldResultaat(api, "IFERROR(A1,99)", 0, { row: 0, col: 1 })).toBe("99");
      expect(h.version()).toBe(versie);
      expect(h.historyState()).toEqual(geschiedenis);
    },
  );
  it("behoudt ook foutwaarden van een ander blad", async () => {
    const { api } = boek({ kind: "error", value: "#DIV/0!" }, true);
    expect(await voorbeeldResultaat(api, "IFERROR('Bron blad'!A1,99)", 0, { row: 0, col: 1 })).toBe("99");
  });
  it.each([
    [{ kind: "number", value: 12.5 }, "A1*2", "25"],
    [{ kind: "bool", value: true }, "IF(A1,7,8)", "7"],
    [{ kind: "text", value: "=1+2" }, "LEN(A1)", "4"],
    [{ kind: "empty" }, "ISBLANK(A1)", "TRUE"],
  ] satisfies [XlsxCellValue, string, string][])("behoudt de celwaarde %j", async (waarde, formule, verwacht) => {
    const { api } = boek(waarde);
    expect(await voorbeeldResultaat(api, formule, 0, { row: 0, col: 1 })).toBe(verwacht);
  });
});
