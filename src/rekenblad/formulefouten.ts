import type { WorkbookHandle, XlsxCellAddress } from "@betteroffice/xlsx";

export interface Formulefout {
  soort:
    | "cycle"
    | "limited"
    | "division"
    | "missing"
    | "name"
    | "intersection"
    | "number"
    | "reference"
    | "value"
    | "spill"
    | "calculation";
  waarde: string;
  cel: string;
}
const codes: Record<string, Formulefout["soort"]> = {
  "#DIV/0!": "division",
  "#N/A": "missing",
  "#NAME?": "name",
  "#NULL!": "intersection",
  "#NUM!": "number",
  "#REF!": "reference",
  "#VALUE!": "value",
  "#SPILL!": "spill",
  "#CALC!": "calculation",
};
/** Alleen de geselecteerde cel lezen; geen export of scan van het werkboek. */
export function leesFormulefout(
  h: WorkbookHandle,
  sheetId: string,
  row: number,
  col: number,
): Formulefout | null {
  const r = h.readCells({
    ranges: [
      {
        sheetId,
        range: { kind: "rowCol", start: { row, col }, end: { row, col } },
      },
    ],
  });
  if (!r.ok) return null;
  const c = r.ranges[0]?.cells[0]?.[0];
  if (!c) return null;
  const deze = (a: XlsxCellAddress) =>
    a.sheetId === sheetId && a.row === row && a.col === col;
  if (r.calculation.cycleCells.some(deze))
    return { soort: "cycle", waarde: c.displayText, cel: c.a1 };
  if (r.calculation.limitedCells.some(deze))
    return { soort: "limited", waarde: c.displayText, cel: c.a1 };
  return c.value.kind === "error"
    ? {
        soort: codes[c.value.value] ?? "calculation",
        waarde: c.value.value,
        cel: c.a1,
      }
    : null;
}
