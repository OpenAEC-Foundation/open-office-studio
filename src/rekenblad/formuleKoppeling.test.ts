import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import { formuleKoppeling } from "./formuleKoppeling";
const boeken: WorkbookHandle[] = [];
afterEach(() => boeken.splice(0).forEach((h) => h.dispose()));
function boek(formula: string) {
  const h = openWorkbook(readFileSync("public/templates/nieuw.xlsx"));
  boeken.push(h);
  h.editCell(0, 0, 1, "https://example.com");
  h.editCell(0, 0, 2, "12");
  h.editCell(0, 0, 0, formula);
  return h;
}
describe("read-only HYPERLINK destinations", () => {
  it.each([
    ['=HYPERLINK("#L20","Internal")', "#L20"],
    ['=HYPERLINK("../Report.xlsx","File")', "../Report.xlsx"],
    [
      '=HYPERLINK("https://example.com/a,b;c","Web")',
      "https://example.com/a,b;c",
    ],
    [
      '=HYPERLINK("https://example.com/""quote""","Web")',
      'https://example.com/"quote"',
    ],
    ['=HYPERLINK(B1&"/"&C1,"Web")', "https://example.com/12"],
    ['=HYPERLINK((B1)&("/"&C1),"Web")', "https://example.com/12"],
    ["=HYPERLINK('Blad 1'!$B$1,\"Web\")", "https://example.com"],
  ])("resolves %s without touching the workbook", (formula, expected) => {
    const h = boek(formula),
      version = h.version(),
      history = h.historyState();
    expect(formuleKoppeling(h, 0, 0, 0)).toBe(expected);
    expect(h.version()).toBe(version);
    expect(h.historyState()).toEqual(history);
    expect(h.cell(0, 0, 0).input).toBe(formula);
  });
  it.each(['=HYPERLINK(B1:C1,"Range")', "=SUM(1,2)", "Plain text"])(
    "does not guess an unsupported target in %s",
    (formula) => {
      const h = boek(formula);
      expect(formuleKoppeling(h, 0, 0, 0)).toBeNull();
    },
  );
  it("uses native read-only expressions when the loaded engine supports them", () => {
    const h = boek('=HYPERLINK(LOWER(B1),"Nested function")');
    let queries = false;
    try {
      const request = {
        ranges: [],
        formulaQueries: [
          {
            sheetId: h.sheetInfo().sheetIds[0],
            origin: { row: 0, col: 0 },
            target: { row: 0, col: 0 },
            formula: '"probe"',
          },
        ],
      };
      queries = Array.isArray(
        (h.readCells(request) as { formulaResults?: unknown[] }).formulaResults,
      );
    } catch (error) {
      expect((error as Error).message).toMatch(
        /unknown field [`'"]formulaQueries/,
      );
    }
    const before = h.save(),
      version = h.version(),
      history = h.historyState();
    expect(formuleKoppeling(h, 0, 0, 0)).toBe(
      queries ? "https://example.com" : null,
    );
    expect(h.version()).toBe(version);
    expect(h.historyState()).toEqual(history);
    expect(h.save()).toEqual(before);
  });
  it("does not bypass a native evaluation budget with the literal fallback", () => {
    const h = boek('=HYPERLINK("https://example.com","Link")');
    const reader = {
      cell: h.cell.bind(h),
      sheetInfo: h.sheetInfo.bind(h),
      readCells: () => ({
        ...h.readCells({ ranges: [] }),
        formulaResults: [{ kind: "text", value: "https://example.com" }],
        formulaLimited: [0],
      }),
    } as Pick<WorkbookHandle, "cell" | "sheetInfo" | "readCells">;
    expect(formuleKoppeling(reader, 0, 0, 0)).toBeNull();
  });
});
