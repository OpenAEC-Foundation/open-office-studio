import type { XlsxCellValue } from "@betteroffice/xlsx";
import type {
  DraaiBron,
  DraaiIndeling,
  DraaiResultaat,
} from "./draaitabelRekenen";
import { Draaifout, MAX_DRAAICELLEN } from "./draaitabelRekenen";

const leeg = (): XlsxCellValue => ({ kind: "empty" });
const tekst = (value: string): XlsxCellValue => ({ kind: "text", value });
/** Explicit worksheet cells let every spreadsheet reader render the current pivot immediately. */
export function maakDraairaster(
  bron: DraaiBron,
  cfg: DraaiIndeling,
  r: DraaiResultaat,
  naam: string,
) {
  const meerdere = cfg.waarden.length > 1,
    left = Math.max(1, cfg.rijen.length),
    headers = Math.max(1, cfg.kolommen.length + (meerdere ? 1 : 0));
  const grandColumn = cfg.kolommen.length > 0,
    grandRow = cfg.rijen.length > 0;
  const cols =
      left + (r.kolommen.length + (grandColumn ? 1 : 0)) * cfg.waarden.length,
    rows = 1 + headers + r.rijen.length + (grandRow ? 1 : 0);
  if (rows * cols > MAX_DRAAICELLEN) throw new Draaifout("tooLarge");
  const cellen: XlsxCellValue[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, leeg),
  );
  cellen[0][0] = tekst(naam);
  cfg.rijen.forEach(
    (v, i) => (cellen[headers][i] = tekst(bron.koppen[v.kolom])),
  );
  if (!cfg.rijen.length) cellen[headers][0] = tekst("Values");
  for (let ci = 0; ci < r.kolommen.length; ci++)
    for (let vi = 0; vi < cfg.waarden.length; vi++) {
      const col = left + ci * cfg.waarden.length + vi;
      for (let level = 0; level < cfg.kolommen.length; level++)
        cellen[1 + level][col] = tekst(
          r.kolommen[ci][level].tekst || "(blank)",
        );
      if (meerdere || !cfg.kolommen.length)
        cellen[headers][col] = tekst(cfg.waarden[vi].naam);
    }
  if (grandColumn)
    for (let vi = 0; vi < cfg.waarden.length; vi++) {
      const col = left + r.kolommen.length * cfg.waarden.length + vi;
      cellen[1][col] = tekst("Grand total");
      if (meerdere) cellen[headers][col] = tekst(cfg.waarden[vi].naam);
    }
  for (let ri = 0; ri < r.rijen.length; ri++) {
    const row = 1 + headers + ri;
    r.rijen[ri].forEach(
      (m, i) => (cellen[row][i] = tekst(m.tekst || "(blank)")),
    );
    if (!cfg.rijen.length) cellen[row][0] = tekst("Grand total");
    for (let ci = 0; ci < r.kolommen.length; ci++)
      for (let vi = 0; vi < cfg.waarden.length; vi++)
        cellen[row][left + ci * cfg.waarden.length + vi] = r.cellen[ri][ci][vi];
    if (grandColumn)
      for (let vi = 0; vi < cfg.waarden.length; vi++)
        cellen[row][left + r.kolommen.length * cfg.waarden.length + vi] =
          r.rijtotalen[ri][vi];
  }
  if (grandRow) {
    const row = rows - 1;
    cellen[row][0] = tekst("Grand total");
    for (let ci = 0; ci < r.kolommen.length; ci++)
      for (let vi = 0; vi < cfg.waarden.length; vi++)
        cellen[row][left + ci * cfg.waarden.length + vi] =
          r.kolomtotalen[ci][vi];
    if (grandColumn)
      for (let vi = 0; vi < cfg.waarden.length; vi++)
        cellen[row][cols - cfg.waarden.length + vi] = r.totaal[vi];
  }
  return { cellen, left, headers, rows, cols, grandColumn, grandRow };
}
