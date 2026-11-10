/** Visual CFVO thresholds evaluated once in the original workbook context. */
import type { WorkbookHandle, XlsxCellValue } from "@betteroffice/xlsx";
import {
  attr,
  kinderen,
  kind,
  tekstVan,
  type XmlElement,
} from "../grafieken/xml";
import { ontleedBereik, serieleDatum } from "../lint/rekenblad-logica";
import type { VoorwaardelijkeRegel } from "./voorwaardelijke-opmaak";

export function visueleGrenzen(
  h: WorkbookHandle,
  blad: number,
  regel: VoorwaardelijkeRegel,
  opties: XmlElement,
  waarden: number[],
  nowSerial?: number,
): number[] | null {
  const knopen = kinderen(opties, "cfvo");
  if (!waarden.length || knopen.length < 2 || knopen.length > 5) return null;
  let min = Infinity,
    max = -Infinity;
  for (const n of waarden) {
    min = Math.min(min, n);
    max = Math.max(max, n);
  }
  const gesorteerd = knopen.some((v) => attr(v, "type") === "percentile")
    ? [...waarden].sort((a, b) => a - b)
    : [];
  const vragen = knopen
    .map((v, index) => ({
      index,
      type: attr(v, "type"),
      formule: (attr(v, "val") ?? tekstVan(kind(v, "f")))
        .trim()
        .replace(/^=/, ""),
    }))
    .filter((v) => v.type === "formula");
  const formules = new Map<number, number>();
  if (vragen.length) {
    const bereik = ontleedBereik(regel.range.split(/\s+/)[0]),
      sheetId = h.sheetInfo().sheetIds[blad];
    if (
      !bereik ||
      !sheetId ||
      vragen.some(
        (v) => !v.formule || new TextEncoder().encode(v.formule).length > 8192,
      )
    )
      return null;
    const origin = { row: bereik.top, col: bereik.left },
      moment = serieleDatum(new Date());
    const request = {
      ranges: [],
      nowSerial: nowSerial ?? moment.datum + moment.tijd,
      formulaQueries: vragen.map((v) => ({
        sheetId,
        origin,
        target: origin,
        formula: v.formule,
      })),
    };
    const result = h.readCells(request) as ReturnType<
      WorkbookHandle["readCells"]
    > & { formulaResults?: XlsxCellValue[]; formulaLimited?: number[] };
    if (!result.ok || !result.formulaResults) return null;
    const beperkt = new Set(result.formulaLimited);
    result.formulaResults.forEach((v, i) => {
      if (!beperkt.has(i) && v.kind === "number" && Number.isFinite(v.value))
        formules.set(vragen[i].index, v.value);
    });
  }
  const grenzen = knopen.map((v, i) => {
    const type = attr(v, "type"),
      raw = attr(v, "val"),
      n = raw?.trim() ? Number(raw) : NaN;
    if (type === "min" || type === "autoMin") return min;
    if (type === "max" || type === "autoMax") return max;
    if (type === "formula") return formules.get(i) ?? NaN;
    if (type === "num") return n;
    if ((type === "percent" || type === "percentile") && n >= 0 && n <= 100) {
      if (type === "percent") return min + ((max - min) * n) / 100;
      const p = ((gesorteerd.length - 1) * n) / 100,
        a = Math.floor(p);
      return (
        gesorteerd[a] +
        (gesorteerd[Math.min(a + 1, gesorteerd.length - 1)] - gesorteerd[a]) *
          (p - a)
      );
    }
    return NaN;
  });
  return grenzen.some(
    (n, i) => !Number.isFinite(n) || (i > 0 && n < grenzen[i - 1]),
  )
    ? null
    : grenzen;
}
