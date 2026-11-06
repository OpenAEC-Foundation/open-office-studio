import {
  deriveDisplayListSelectedCellRects,
  type CanvasPointHit,
  type DisplayListQueries,
  type DisplayListSelectedCellRect,
} from "@betteroffice/docx/layout/render";
import type { YrsPositionProjection } from "@betteroffice/docx/yrs";

type Celvak = DisplayListSelectedCellRect & { verhaal: string };
const cache = new WeakMap<DisplayListQueries, WeakMap<YrsPositionProjection, Celvak[]>>();
const sleutel = (cel: { story: string; tableIndex: number }) => `${cel.story}|${cel.tableIndex}`;

function celvakken(queries: DisplayListQueries, projectie: YrsPositionProjection): Celvak[] {
  let perProjectie = cache.get(queries);
  if (!perProjectie) cache.set(queries, (perProjectie = new WeakMap()));
  const bestaand = perProjectie.get(projectie);
  if (bestaand) return bestaand;
  const verhalen = new Map<string, string>();
  const cellen = projectie.allTables().flatMap((t) => t.cells.map((c) => {
    const tableKey = sleutel(t);
    verhalen.set(`${tableKey}|${c.row}|${c.column}`, c.story);
    return { tableKey, row: c.row, col: c.column, rowSpan: c.rowspan, colSpan: c.colspan };
  }));
  const tableKeyOf = (pos: number | undefined) => {
    if (pos === undefined) return null;
    const cel = projectie.targetAt(pos).cell;
    return cel ? sleutel(cel) : null;
  };
  const uit = deriveDisplayListSelectedCellRects(queries.displayList, cellen, tableKeyOf)
    .flatMap((r) => {
      const verhaal = verhalen.get(`${r.tableKey}|${r.row}|${r.col}`);
      return verhaal ? [{ ...r, verhaal }] : [];
    });
  perProjectie.set(projectie, uit);
  return uit;
}

/**
 * Lege ruimte binnen een cel hoort bij die cel, ook als de dichtstbijzijnde
 * tekst op de pagina buiten de tabel staat. De eigen muiswachtrij blijft
 * de selectie uitvoeren; alleen de geometrische treffer wordt aangevuld.
 */
export function herstelTabelPunt(queries: DisplayListQueries, punt: CanvasPointHit | null, projectie: YrsPositionProjection | null): CanvasPointHit | null {
  if (!punt || !projectie || !queries.isReady() || (punt.hit && punt.hit.region !== "body") || punt.hit?.target === "image") return punt;
  try {
    const vak = celvakken(queries, projectie)
      // De randen houden hun selectie- en formaatbediening. Bij geneste
      // tabellen wint het kleinste celvlak onder de aanwijzer.
      .filter((r) => r.pageIndex === punt.pageIndex && r.region === "body"
        && punt.x > r.x + 3 && punt.x < r.x + r.w - 3
        && punt.y > r.y + 3 && punt.y < r.y + r.h - 3)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    if (!vak || (punt.hit?.pos != null && projectie.targetAt(punt.hit.pos).story === vak.verhaal)) return punt;
    const lijnen = queries.visualLinesOnPage(punt.pageIndex)
      .filter((l) => projectie.targetAt(l.from).story === vak.verhaal);
    const afstand = (l: typeof lijnen[number]) => Math.max(l.y - punt.y, punt.y - l.y - l.height, 0);
    const lijn = [...lijnen].sort((a, b) => afstand(a) - afstand(b))[0];
    if (!lijn) return punt;
    const x = Math.max(lijn.x, Math.min(punt.x, lijn.x + lijn.width));
    const treffer = queries.hitTestRegions(punt.pageIndex, x, lijn.y + lijn.height / 2);
    const pos = treffer?.region === "body" && treffer.pos != null && projectie.targetAt(treffer.pos).story === vak.verhaal
      ? treffer.pos : lijn.from;
    return { ...punt, hit: { region: "body", pos, target: "text" } };
  } catch {
    // Een nog niet bruikbare projectie blijft bij de oorspronkelijke route.
    return punt;
  }
}
