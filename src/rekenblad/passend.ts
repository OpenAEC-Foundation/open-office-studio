import type { WorkbookHandle } from "@betteroffice/xlsx";
import { ontleedBereik } from "../lint/rekenblad-logica";

/** Breedte vanaf kolom A tot de laatste gebruikte kolom, in ongeschaalde pixels. */
export function gebruikteBreedte(h: WorkbookHandle): number | null {
  const blad = h.sheetInfo().activeSheet;
  const uitvoer = h.exportStructured({
    scope: [{ sheet: blad }], maxCells: 1, includeDefinedNames: false,
  });
  if (!uitvoer.ok) return null;
  const inhoud = uitvoer.content.sheets[0];
  if (!inhoud) return null;
  // Een leeg blad toont acht gewone kolommen in plaats van maximaal in te zoomen.
  let rechts = inhoud.usedRange ? ontleedBereik(inhoud.usedRange)?.right ?? 7 : 7;
  for (const onderdeel of [...inhoud.merges, ...inhoud.tables, ...inhoud.objects.filter(o => !o.hidden)]) {
    const anker = onderdeel.anchor;
    if (anker?.kind === "range" || anker?.kind === "cell")
      rechts = Math.max(rechts, ontleedBereik(anker.a1)?.right ?? 0);
  }
  const breedte = h.cellPosition(blad, 0, rechts + 1).x;
  return Number.isFinite(breedte) && breedte > 0 ? breedte : null;
}
