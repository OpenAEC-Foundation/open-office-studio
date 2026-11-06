/** De getalnotatie en bestandsregio worden samen als één wijziging bewaard. */
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { NumberFormatMutation } from "@betteroffice/xlsx";
import { voerOpsUit, type RuweOp } from "../lint/rekenblad-opdrachten";
import { adres, type Bereik, type Cel } from "../lint/rekenblad-logica";
import { herkenRegio, leesWerkmapinstelling, REGIONAAM, Regiofout, type Werkmapregio } from "./werkmapregio";

export interface Getaldoel {
  versie: string;
  sheetId: string;
  bereik: Bereik;
  regio: Werkmapregio;
}

/** Ook ingebouwde datum-/valutavarianten exact lezen, geen categoriebenadering. */
export function leesGetalcode(api: XlsxEditorApi, blad: number, focus: Cel): string {
  const r = api.handle.exportStructured({
    scope: [{ sheet: blad, range: adres(focus) }],
    maxCells: 1, includeDefinedNames: false, includeHiddenSheets: true, includeHiddenRows: true, includeHiddenColumns: true,
  });
  if (!r.ok) throw new Error(r.failure.message);
  return r.content.sheets[0]?.cells[0]?.numberFormat ?? "General";
}

export async function bewaarGetalopmaak(api: XlsxEditorApi, doel: Getaldoel, format: NumberFormatMutation | null, regio: Werkmapregio, wijzigRegio = regio !== doel.regio) {
  const bekend = herkenRegio(regio);
  if (!bekend) throw new Regiofout("invalidRegion");
  if (await api.version() !== doel.versie || api.handle.version() !== doel.versie)
    throw new Regiofout("staleDocument");
  const blad = api.handle.sheetInfo().sheetIds.indexOf(doel.sheetId);
  if (blad < 0) throw new Regiofout("missingSheet");
  const instelling = leesWerkmapinstelling(api);
  const ops: RuweOp[] = [];
  if (wijzigRegio && bekend !== instelling.bekendeRegio) {
    if (instelling.definitie && !instelling.definitie.hidden) throw new Regiofout("nameConflict");
    ops.push({ type: "setDefinedName", name: REGIONAAM, refers_to: `"${bekend}"`, scope: null, hidden: true });
  }
  if (format !== null) {
    const b = doel.bereik;
    ops.push({ type: "setRangeNumberFormat", sheet: blad, range: { start: { row: b.top, col: b.left }, end: { row: b.bottom, col: b.right } }, format });
  }
  if (ops.length) await voerOpsUit(api, ops, doel.versie);
}
