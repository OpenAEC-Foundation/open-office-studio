import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { openWorkbook } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import { werkmap } from "./werkboekXml";
import { schrijfTabel, nieuweTabelkeuze, laadTabellen } from "./tabellen";
import { bereidTabelweergave } from "./tabelweergave";
import { registreerRenderProjectie } from "./renderprojectie";
const metrics = {
  dpi: 96,
  maxDigitWidth: 7,
  defaultRowHeightPt: 15,
  fontSizePt: 11,
  fontFamily: "Calibri",
  fontAscent: 10,
  fontDescent: 3,
};
const viewport = { x: 0, y: 0, width: 400, height: 150 };
function bron() {
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
        schrijfTabel(h.save(), 0, null, nieuweTabelkeuze("A1:B3", "Sales")),
      ),
      wb = werkmap(p),
      rel = p.relaties(wb.pad).find((r) => r.type.endsWith("/styles"))!,
      pad = Pakket.doelPad(wb.pad, rel.target);
    // Mimic Excel: table formatting lives only in tableStyleInfo/DXFs.
    p.schrijf(
      pad,
      p
        .lees(pad)
        .replace(/fontId="\d+"/g, 'fontId="0"')
        .replace(/fillId="\d+"/g, 'fillId="0"'),
    );
    return p.inpakken();
  } finally {
    h.dispose();
  }
}
it("renders imported table DXFs in screen, profile and print without changing the source or Undo", () => {
  const bytes = bron(),
    h = openWorkbook(bytes);
  try {
    laadTabellen(h, bytes);
    const v = h.version(),
      history = h.historyState(),
      before = h.save();
    const stop = bereidTabelweergave(h, bytes);
    for (const f of [
      h.displayList(viewport),
      h.displayListProfiled(viewport).displayList,
      h.printDisplayList(0, "A1:B3", metrics, false),
    ]) {
      expect(
        f.commands.some(
          (c) => c.op === "fillRect" && c.color.toLowerCase() === "#365f91",
        ),
      ).toBe(true);
      expect(
        f.commands.find((c) => c.op === "text" && c.text === "Item"),
      ).toMatchObject({ bold: true, color: "#ffffff" });
    }
    expect(h.version()).toBe(v);
    expect(h.historyState()).toEqual(history);
    expect(h.save()).toEqual(before);
    stop();
    expect(
      h
        .displayList(viewport)
        .commands.find((c) => c.op === "text" && c.text === "Item"),
    ).toMatchObject({ color: "#000000" });
  } finally {
    h.dispose();
  }
});
it("preserves explicit cell formatting and lets a later conditional format override the table", () => {
  const bytes = bron(),
    h = openWorkbook(bytes);
  try {
    laadTabellen(h, bytes);
    h.patchRangeStyle(0, "A1", { textColor: "#ff0000" });
    bereidTabelweergave(h, bytes);
    expect(
      h
        .displayList(viewport)
        .commands.find((c) => c.op === "text" && c.text === "Item"),
    ).toMatchObject({ color: "#ff0000" });
    registreerRenderProjectie(h, 10, (f) => ({
      ...f,
      commands: f.commands.map((c) =>
        c.op === "text" && c.text === "Item" ? { ...c, color: "#00ff00" } : c,
      ),
    }));
    expect(
      h
        .displayList(viewport)
        .commands.find((c) => c.op === "text" && c.text === "Item"),
    ).toMatchObject({ color: "#00ff00" });
  } finally {
    h.dispose();
  }
});
