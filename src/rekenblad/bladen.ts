/**
 * Bladen beheren (#61): kopiëren naar een gekozen positie, lijst met
 * zichtbaarheid. Verplaatsen, verbergen en tabkleur kent de rekenkern
 * (@betteroffice/xlsx 0.3) nog niet als bewerking; die staan in het menu
 * uitgeschakeld met uitleg.
 */
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { CellInputEdit } from "@betteroffice/xlsx";
import i18next from "../i18n/config";
import { bereikA1, bladnaamFout, ontleedBereik, type Bereik } from "../lint/rekenblad-logica";
import { gaNaarBlad, Melding, voerOpsUit, type RuweOp } from "../lint/rekenblad-opdrachten";
import { meldWijziging } from "../lint/editorApi";
import { breedteTekens, hoogtePunten } from "./maten";

export interface BladInfo {
  index: number;
  naam: string;
  verborgen: boolean;
}

/** Alle bladen met hun zichtbaarheid zoals in het bestand. */
export function bladenLijst(api: XlsxEditorApi): BladInfo[] {
  const info = api.handle.sheetInfo();
  let zichtbaarheid: string[] = [];
  try {
    const uitvoer = api.handle.exportStructured({
      scope: info.sheetNames.map((_, sheet) => ({ sheet, range: "A1" })),
      includeHiddenSheets: true,
      includeDefinedNames: false,
      maxCells: Math.max(1, info.sheetNames.length),
    });
    if (uitvoer.ok) zichtbaarheid = uitvoer.content.sheets.map((s) => s.visibility);
  } catch {
    // Zonder export: alles zichtbaar tonen.
  }
  return info.sheetNames.map((naam, index) => ({
    index,
    naam,
    verborgen: zichtbaarheid[index] === "hidden" || zichtbaarheid[index] === "veryHidden",
  }));
}

/** "Blad1" → "Blad1 (2)", "Blad1 (2)" → "Blad1 (3)"; past binnen 31 tekens. */
export function kopieNaam(naam: string, namen: string[]) {
  const basis = naam.replace(/ \(\d+\)$/, "");
  const bezet = new Set(namen.map((n) => n.toLowerCase()));
  for (let n = 2; ; n++) {
    const achter = ` (${n})`;
    const kandidaat = basis.slice(0, 31 - achter.length) + achter;
    if (!bezet.has(kandidaat.toLowerCase())) return kandidaat;
  }
}

function gebruikt(api: XlsxEditorApi, blad: number): Bereik | null {
  const uitvoer = api.handle.exportStructured({
    scope: [{ sheet: blad, range: "A1" }],
    maxCells: 1,
    includeDefinedNames: false,
  });
  const bereik = uitvoer.ok ? uitvoer.content.sheets[0]?.usedRange : null;
  return bereik ? ontleedBereik(bereik) : null;
}

/**
 * Kopieert het actieve blad naar `positie` (0 = vooraan) onder `naam`: celinhoud
 * met formules, opmaak, kolombreedten, rijhoogten, samengevoegde cellen en
 * vaste titels. Grafieken, afbeeldingen, opmerkingen en koppelingen gaan niet mee.
 */
export async function bladKopieren(api: XlsxEditorApi, positie: number, naam: string) {
  const h = api.handle;
  const info = h.sheetInfo();
  const bron = info.activeSheet;
  const fout = bladnaamFout(naam, info.sheetNames);
  if (fout) throw new Melding(fout);
  const doel = Math.max(0, Math.min(positie, info.sheetNames.length));
  const bereik = gebruikt(api, bron);

  // Eerst alles van de bron lezen: na addSheet verschuiven de indexen.
  const a1 = bereik ? bereikA1(bereik) : null;
  const invoer = a1 ? h.rangeCells(bron, a1).map((r) => r.map((c) => c.input)) : [];
  const opmaak = a1 ? h.captureFormat(bron, a1) : null;
  // Samenvoegingen kunnen ook buiten het gebruikte bereik liggen (lege cellen).
  const samengevoegd = h.mergedRanges(bron, "A1:XFD1048576");
  const breedten: number[] = [];
  const hoogten: number[] = [];
  const laatsteKolom = Math.max(bereik?.right ?? 0, 25);
  const laatsteRij = Math.max(bereik?.bottom ?? 0, 0);
  for (let k = 0; k <= laatsteKolom + 1; k++) breedten.push(h.cellPosition(bron, 0, k).x);
  for (let r = 0; r <= laatsteRij + 1; r++) hoogten.push(h.cellPosition(bron, r, 0).y);

  // Standaardmaten van de bron: een kolom en rij ver buiten het gebruikte bereik.
  const verKolom = h.cellPosition(bron, 0, 16001).x - h.cellPosition(bron, 0, 16000).x;
  const verRij = h.cellPosition(bron, 1048001, 0).y - h.cellPosition(bron, 1048000, 0).y;
  // De kern controleert een reeks ops tegen de stand vooraf: eerst het blad
  // zelf, dan opmaak en maten in één stap, dan de inhoud.
  await voerOpsUit(api, [{ type: "addSheet", index: doel, name: naam.trim() }]);
  const ops: RuweOp[] = [];
  if (bereik && opmaak)
    ops.push({
      type: "applyRangeFormat",
      sheet: doel,
      range: {
        start: { row: bereik.top, col: bereik.left },
        end: { row: bereik.bottom, col: bereik.right },
      },
      format: opmaak,
    });
  for (let k = 0; k < breedten.length - 1; k++) {
    const px = breedten[k + 1] - breedten[k];
    if (Math.abs(px - verKolom) > 0.1)
      ops.push({ type: "setColWidth", sheet: doel, col: k, width: breedteTekens(px) });
  }
  for (let r = 0; r < hoogten.length - 1; r++) {
    const px = hoogten[r + 1] - hoogten[r];
    if (Math.abs(px - verRij) > 0.1)
      ops.push({ type: "setRowHeight", sheet: doel, row: r, height: hoogtePunten(px) });
  }
  for (const m of samengevoegd)
    ops.push({ type: "mergeCells", sheet: doel, range: { start: m.start, end: m.end } });
  if (info.frozenRows + info.frozenCols > 0)
    ops.push({
      type: "setFreezePane",
      sheet: doel,
      pane: {
        rows: info.frozenRows,
        cols: info.frozenCols,
        top_left: { row: info.frozenRows, col: info.frozenCols },
      },
    });
  if (ops.length) await voerOpsUit(api, ops);

  // Inhoud via het plakpad van de kern: lege cellen (en dus de volgcellen van
  // samengevoegde cellen) worden niet beschreven.
  if (bereik) {
    const cellen: CellInputEdit[] = [];
    invoer.forEach((rij, i) =>
      rij.forEach((tekst, j) => {
        if (tekst) cellen.push({ row: bereik.top + i, col: bereik.left + j, input: tekst });
      }),
    );
    if (cellen.length) {
      h.editCells(doel, cellen);
      meldWijziging(h);
    }
  }
  await gaNaarBlad(api, doel);
}

/** Tekst voor een verborgen blad in de lijst. */
export const verborgenLabel = (naam: string) =>
  i18next.t("spreadsheet:sheets.hiddenSheet", { name: naam }) as string;
