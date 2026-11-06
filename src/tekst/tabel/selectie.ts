import type { YrsTableRange } from "@betteroffice/docx/yrs";
import type { TabelBeeld } from "../liniaal/geometrie";

/** Hele celvlakken voor een meervoudige selectie, ook als de cellen leeg zijn. */
export function celSelectieVakken(tabel: TabelBeeld, selectie: YrsTableRange) {
  const { anchor: a, head: h } = selectie;
  const loc = tabel.info.loc;
  if (a.story !== loc.story || h.story !== loc.story || a.tableIndex !== loc.tableIndex || h.tableIndex !== loc.tableIndex) return [];
  const vanRij = Math.min(a.row, h.row), totRij = Math.max(a.row, h.row);
  const vanKolom = Math.min(a.column, h.column), totKolom = Math.max(a.column, h.column);
  const cellen: { verhaal: string; rij: number; rijTot: number; kolom: number; kolomTot: number }[] = [];
  tabel.info.payload.rows.forEach((r, rij) => {
    let kolom = Number(r.trPr?.gridBefore ?? 0);
    for (const c of r.cells) {
      const breed = Math.max(1, Number(c.tcPr?.colspan ?? 1));
      const hoog = Math.max(1, Number(c.tcPr?.rowspan ?? 1));
      if (rij <= totRij && rij + hoog - 1 >= vanRij && kolom <= totKolom && kolom + breed - 1 >= vanKolom)
        cellen.push({ verhaal: c.story, rij, rijTot: rij + hoog - 1, kolom, kolomTot: kolom + breed });
      kolom += breed;
    }
  });
  // Een gewone tekstselectie of één hele cel houdt zijn eigen engineweergave.
  if (new Set(cellen.map((c) => c.verhaal)).size < 2) return [];
  return cellen.flatMap((c) => {
    const banden = tabel.rijen.filter((r) => r.rij >= c.rij && r.rij <= c.rijTot);
    const links = tabel.lijnen[c.kolom], rechts = tabel.lijnen[c.kolomTot];
    if (!banden.length || links === undefined || rechts === undefined) return [];
    const boven = Math.min(...banden.map((r) => r.boven));
    const onder = Math.max(...banden.map((r) => r.onder));
    return [{ sleutel: `${tabel.pagina}:${c.verhaal}`, pagina: tabel.pagina, x: links, y: boven, width: rechts - links, height: onder - boven }];
  });
}
