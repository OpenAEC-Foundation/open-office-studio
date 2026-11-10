import { readFileSync } from "node:fs";
import { openWorkbook } from "@betteroffice/xlsx";
import { Pakket } from "../../grafieken/pakket";
import { nieuweTabelkeuze, schrijfTabel } from "../tabellen";
import { werkmap } from "../werkboekXml";

/** A fully defined custom-DXF table, independent of built-in table presets. */
export function tabelstandaardBron(impliciet = false): Uint8Array {
  const h = openWorkbook(
    new Uint8Array(readFileSync("public/templates/nieuw.xlsx")),
  );
  try {
    h.editCells(0, [
      { row: 0, col: 0, input: "Item" },
      { row: 0, col: 1, input: "Amount" },
      { row: 1, col: 0, input: "First" },
      { row: 1, col: 1, input: "2" },
      { row: 2, col: 0, input: "Second" },
      { row: 2, col: 1, input: "3" },
    ]);
    const p = new Pakket(
      schrijfTabel(h.save(), 0, null, nieuweTabelkeuze("A1:B3", "CustomSales")),
    );
    const wb = werkmap(p);
    const rel = p.relaties(wb.pad).find((r) => r.type.endsWith("/styles"))!;
    const styles = Pakket.doelPad(wb.pad, rel.target);
    p.schrijf(
      styles,
      p
        .lees(styles)
        .replace(/fontId="\d+"/g, 'fontId="0"')
        .replace(/fillId="\d+"/g, 'fillId="0"'),
    );
    if (impliciet) {
      const sheet = wb.bladen[0].pad;
      p.schrijf(
        sheet,
        p.lees(sheet).replace(/(<c\b[^>]*?)\s+s="[^"]*"/g, "$1"),
      );
    }
    return p.inpakken();
  } finally {
    h.dispose();
  }
}
