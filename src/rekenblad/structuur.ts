/**
 * Kolombreedte en rijhoogte instellen en passend maken (#60), via de
 * engine-ops `setColWidth`/`setRowHeight`: één ongedaan-maakstap per opdracht,
 * en de waarden komen zo in het bestand.
 */
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { XlsxExportCell } from "@betteroffice/xlsx";
import {
  bereikA1,
  kolomLetters,
  kolomNummer,
  ontleedBereik,
  type Bereik,
} from "../lint/rekenblad-logica";
import { leesSelectie, voerOpsUit, type RuweOp } from "../lint/rekenblad-opdrachten";
import {
  breedsteRegel,
  breedteTekens,
  breedteVoor,
  canvasMeter,
  hoogsteCel,
  hoogtePunten,
  hoogteVoor,
  STANDAARD_HOOGTE,
  type Celtekst,
  type Meter,
} from "./maten";

/** Zoveel cellen meten we hooguit voor één passend-opdracht. */
const MAX_TE_METEN = 20000;

const reeks = (van: number, tot: number) =>
  Array.from({ length: tot - van + 1 }, (_, i) => van + i);

export function kolomPx(api: XlsxEditorApi, blad: number, kolom: number) {
  const h = api.handle;
  return h.cellPosition(blad, 0, kolom + 1).x - h.cellPosition(blad, 0, kolom).x;
}

export function rijPx(api: XlsxEditorApi, blad: number, rij: number) {
  const h = api.handle;
  return h.cellPosition(blad, rij + 1, 0).y - h.cellPosition(blad, rij, 0).y;
}

/** De kolommen en rijen van de selectie op het actieve blad. */
export function selectieSporen(api: XlsxEditorApi) {
  const { blad, bereik } = leesSelectie(api);
  return {
    blad,
    bereik,
    kolommen: reeks(bereik.left, bereik.right),
    rijen: reeks(bereik.top, Math.min(bereik.bottom, bereik.top + 9999)),
  };
}

/** Eén waarde als alle sporen gelijk zijn, anders null (zoals Excel een leeg veld toont). */
function gemeenschappelijk(waarden: number[]) {
  return waarden.length && waarden.every((w) => w === waarden[0]) ? waarden[0] : null;
}

export function huidigeBreedte(api: XlsxEditorApi) {
  const { blad, kolommen } = selectieSporen(api);
  return gemeenschappelijk(
    kolommen.slice(0, 500).map((k) => breedteTekens(kolomPx(api, blad, k))),
  );
}

export function huidigeHoogte(api: XlsxEditorApi) {
  const { blad, rijen } = selectieSporen(api);
  return gemeenschappelijk(
    rijen.slice(0, 500).map((r) => hoogtePunten(rijPx(api, blad, r))),
  );
}

/** Breedte in tekens (null = standaard) voor de gegeven of geselecteerde kolommen. */
export async function zetBreedte(
  api: XlsxEditorApi,
  tekens: number | null,
  kolommen = selectieSporen(api).kolommen,
) {
  const blad = api.handle.sheetInfo().activeSheet;
  await voerOpsUit(
    api,
    kolommen.map((col) => ({ type: "setColWidth", sheet: blad, col, width: tekens })),
  );
}

/** Hoogte in punten (null = standaard) voor de gegeven of geselecteerde rijen. */
export async function zetHoogte(
  api: XlsxEditorApi,
  punten: number | null,
  rijen = selectieSporen(api).rijen,
) {
  const blad = api.handle.sheetInfo().activeSheet;
  await voerOpsUit(
    api,
    rijen.map((row) => ({ type: "setRowHeight", sheet: blad, row, height: punten })),
  );
}

function gebruiktBereik(api: XlsxEditorApi, blad: number): Bereik | null {
  const uitvoer = api.handle.exportStructured({
    scope: [{ sheet: blad, range: "A1" }],
    maxCells: 1,
    includeDefinedNames: false,
  });
  const bereik = uitvoer.ok ? uitvoer.content.sheets[0]?.usedRange : null;
  return bereik ? ontleedBereik(bereik) : null;
}

/** Niet-lege cellen binnen het bereik, met de opmaak die het meten nodig heeft. */
function cellenIn(api: XlsxEditorApi, blad: number, bereik: Bereik) {
  const uitvoer = api.handle.exportStructured({
    scope: [{ sheet: blad, range: bereikA1(bereik) }],
    maxCells: 1_000_000,
    includeDefinedNames: false,
  });
  if (!uitvoer.ok) return [];
  const cellen: { cel: XlsxExportCell; a1: string }[] = [];
  for (const cel of uitvoer.content.sheets[0]?.cells ?? []) {
    if (!cel.displayText || cel.anchor.kind !== "cell") continue;
    cellen.push({ cel, a1: cel.anchor.a1 });
    if (cellen.length >= MAX_TE_METEN) break;
  }
  return cellen;
}

function celtekst(api: XlsxEditorApi, blad: number, a1: string, tekst: string): Celtekst {
  const f = api.handle.selectionFormatting(blad, a1);
  return {
    tekst,
    grootte: f.fontSize ?? 11,
    familie: f.fontFamily,
    vet: f.bold,
    cursief: f.italic,
    terugloop: f.textWrapping === "wrap",
  };
}

/** Een samengevoegde cel over meer kolommen (of rijen) telt niet mee, zoals in Excel. */
function overSporen(cel: XlsxExportCell, kolommen: boolean) {
  const r = cel.merge?.range ? ontleedBereik(cel.merge.range) : null;
  if (!r) return false;
  return kolommen ? r.left !== r.right : r.top !== r.bottom;
}

const kolomVan = (a1: string) => /^\$?([A-Z]+)/i.exec(a1)?.[1].toUpperCase() ?? "";
const rijVan = (a1: string) => Number(/(\d+)$/.exec(a1)?.[1] ?? 0) - 1;

/** Optimale breedte per kolom in tekens; null voor een lege kolom (standaardbreedte). */
export function berekenOptimaleBreedte(
  api: XlsxEditorApi,
  blad: number,
  kolommen: number[],
  meet: Meter = canvasMeter,
) {
  const gebruikt = gebruiktBereik(api, blad);
  const uitkomst = new Map<number, number | null>(kolommen.map((k) => [k, null]));
  if (!gebruikt || !kolommen.length) return uitkomst;
  const links = Math.min(...kolommen);
  const rechts = Math.max(...kolommen);
  const per = new Map<string, Celtekst[]>();
  for (const { cel, a1 } of cellenIn(api, blad, {
    top: gebruikt.top,
    bottom: gebruikt.bottom,
    left: links,
    right: rechts,
  })) {
    if (overSporen(cel, true)) continue;
    const letters = kolomVan(a1);
    const lijst = per.get(letters) ?? [];
    lijst.push(celtekst(api, blad, a1, cel.displayText));
    per.set(letters, lijst);
  }
  for (const k of kolommen) {
    const cellen = per.get(kolomLetters(k));
    const breedst = cellen ? breedsteRegel(cellen, meet) : 0;
    uitkomst.set(k, breedst > 0 ? breedteVoor(breedst) : null);
  }
  return uitkomst;
}

/** Optimale hoogte per rij in punten; null voor een rij zonder tekst (standaardhoogte). */
export function berekenOptimaleHoogte(
  api: XlsxEditorApi,
  blad: number,
  rijen: number[],
  meet: Meter = canvasMeter,
) {
  const gebruikt = gebruiktBereik(api, blad);
  const uitkomst = new Map<number, number | null>(rijen.map((r) => [r, null]));
  if (!gebruikt || !rijen.length) return uitkomst;
  const per = new Map<number, (Celtekst & { kolomPx: number })[]>();
  const breedten = new Map<string, number>();
  for (const { cel, a1 } of cellenIn(api, blad, {
    top: Math.min(...rijen),
    bottom: Math.max(...rijen),
    left: gebruikt.left,
    right: gebruikt.right,
  })) {
    if (overSporen(cel, false)) continue;
    const letters = kolomVan(a1);
    if (!breedten.has(letters)) {
      const k = kolomNummer(letters);
      breedten.set(letters, kolomPx(api, blad, k));
    }
    const r = rijVan(a1);
    const lijst = per.get(r) ?? [];
    lijst.push({ ...celtekst(api, blad, a1, cel.displayText), kolomPx: breedten.get(letters)! });
    per.set(r, lijst);
  }
  for (const r of rijen) {
    const cellen = per.get(r);
    const px = cellen ? hoogsteCel(cellen, meet) : 0;
    // Niet lager dan de standaardrij: zo blijft een rij met kleine letters leesbaar.
    uitkomst.set(r, px > 0 ? Math.max(hoogteVoor(px), STANDAARD_HOOGTE) : null);
  }
  return uitkomst;
}

export async function optimaleBreedte(
  api: XlsxEditorApi,
  kolommen = selectieSporen(api).kolommen,
) {
  const blad = api.handle.sheetInfo().activeSheet;
  const breedten = berekenOptimaleBreedte(api, blad, kolommen);
  const ops: RuweOp[] = [...breedten].map(([col, width]) => ({
    type: "setColWidth",
    sheet: blad,
    col,
    width,
  }));
  await voerOpsUit(api, ops);
}

export async function optimaleHoogte(
  api: XlsxEditorApi,
  rijen = selectieSporen(api).rijen,
) {
  const blad = api.handle.sheetInfo().activeSheet;
  const hoogten = berekenOptimaleHoogte(api, blad, rijen);
  const ops: RuweOp[] = [...hoogten].map(([row, height]) => ({
    type: "setRowHeight",
    sheet: blad,
    row,
    height,
  }));
  await voerOpsUit(api, ops);
}
