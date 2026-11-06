/** Alleen ruwe gebruikersinvoer wordt door de kern volgens de bestandsregio gelezen. */
import type { XlsxEditStep, XlsxRangeTarget } from "@betteroffice/xlsx";
export type RegionaleInvoerstap = Extract<XlsxEditStep, { op: "setCellInputs" }> & { localized: true };
export function regionaleInvoer(target: XlsxRangeTarget, inputs: string[][]): RegionaleInvoerstap {
  return { op: "setCellInputs", target, inputs, localized: true };
}
