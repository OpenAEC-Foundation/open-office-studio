import { ontleedCsv } from "../import/csvimport";
import {
  eigenaars,
  nieuwRooster,
  plakCellen,
  TabelFout,
  voegCellenSamen,
  wijzigRooster,
  type TabelRooster,
} from "./tabelrooster";

/** Lees alleen tabelwaarden en samenvoegingen. Bron-HTML wordt nooit in de app ingevoegd. */
export function leesTabelKlembord(tekst: string, html = ""): TabelRooster {
  if (tekst.length + html.length > 2 * 1024 * 1024)
    throw new TabelFout("tooLarge");
  if (html && typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html"),
      table = doc.querySelector("table");
    if (table) {
      const rows = Array.from(table.rows).filter(
        (r) => r.closest("table") === table,
      );
      if (rows.length > 200) throw new TabelFout("tooLarge");
      const grid: (
        | { text: string; rs: number; cs: number; bedekt: boolean }
        | undefined
      )[][] = [];
      rows.forEach((row, r) => {
        grid[r] ??= [];
        let c = 0;
        for (const cel of Array.from(row.cells)) {
          while (grid[r][c]) c++;
          const rs = cel.rowSpan === 0 ? rows.length - r : cel.rowSpan,
            cs = cel.colSpan;
          if (
            !Number.isInteger(rs) ||
            rs < 1 ||
            r + rs > rows.length ||
            cs < 1 ||
            c + cs > 50
          )
            throw new TabelFout("invalid");
          const kopie = cel.cloneNode(true) as HTMLElement;
          kopie.querySelectorAll("script,style").forEach((e) => e.remove());
          kopie
            .querySelectorAll("br")
            .forEach((e) => e.replaceWith(doc.createTextNode("\n")));
          const blocks = Array.from(kopie.querySelectorAll("p,div")).filter(
            (e) => !e.querySelector("p,div"),
          );
          blocks.forEach((e) => e.append(doc.createTextNode("\n")));
          const text = (kopie.textContent ?? "").replace(
            blocks.length ? /\n$/ : /$^/,
            "",
          );
          for (let y = r; y < r + rs; y++)
            for (let x = c; x < c + cs; x++) {
              grid[y] ??= [];
              if (grid[y][x]) throw new TabelFout("invalid");
              grid[y][x] = {
                text: y === r && x === c ? text : "",
                rs: y === r && x === c ? rs : 1,
                cs: y === r && x === c ? cs : 1,
                bedekt: y !== r || x !== c,
              };
            }
          c += cs;
        }
      });
      const cols = Math.max(0, ...grid.map((r) => r.length)),
        t = nieuwRooster(rows.length, cols);
      grid.forEach((row, r) =>
        row.forEach((c, k) => {
          if (c)
            t.cellen[r][k] = {
              tekst: c.text,
              rijSpan: c.rs,
              kolomSpan: c.cs,
              bedekt: c.bedekt,
              tekstGewijzigd: true,
            };
        }),
      );
      eigenaars(t);
      return t;
    }
  }
  const data = ontleedCsv(tekst, "\t", '"', 201);
  if (!tekst || !data.length) throw new TabelFout("invalid");
  // Een afsluitende regeleinde is geen extra lege tabelrij.
  if (data.length > 1 && data.at(-1)!.every((c) => !c) && /\r?\n$/.test(tekst))
    data.pop();
  const cols = Math.max(...data.map((r) => r.length));
  return plakCellen(
    nieuwRooster(data.length, cols),
    0,
    0,
    data.map((row) => Array.from({ length: cols }, (_, i) => row[i] ?? "")),
  );
}
export function plakRooster(
  t: TabelRooster,
  r: number,
  c: number,
  bron: TabelRooster,
): TabelRooster {
  eigenaars(bron);
  let n = t;
  while (n.cellen.length < r + bron.cellen.length)
    n = wijzigRooster(n, "rij", n.cellen.length);
  while (n.breedtes.length < c + bron.breedtes.length)
    n = wijzigRooster(n, "kolom", n.breedtes.length);
  n = plakCellen(
    n,
    r,
    c,
    bron.cellen.map((row) => row.map((c) => c.tekst)),
  );
  bron.cellen.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (!cell.bedekt && (cell.rijSpan > 1 || cell.kolomSpan > 1))
        n = voegCellenSamen(n, {
          r0: r + y,
          c0: c + x,
          r1: r + y + cell.rijSpan - 1,
          c1: c + x + cell.kolomSpan - 1,
        });
    }),
  );
  return n;
}
