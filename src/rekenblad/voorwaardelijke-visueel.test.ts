import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  openWorkbook,
  cellRect,
  type WorkbookHandle,
} from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import { werkbladDeel } from "./pakket";
import { sectie } from "./werkboekXml";
import { leesVoorwaardelijkeRegels } from "./voorwaardelijke-opmaak";
import { visueleRegel } from "./voorwaardelijke-visueel";
import { bereidVoorwaardelijkeWeergave } from "./voorwaardelijke-weergave";
import { PICTOGRAMSETS, tekenPictogram } from "./pictogrammen";
const boeken: WorkbookHandle[] = [];
afterEach(() => boeken.splice(0).forEach((h) => h.dispose()));
function boek(
  type: string,
  inhoud: string,
  waarden = [0, 25, 50, 75, 100],
  bereid?: (h: WorkbookHandle) => void,
) {
  const h = openWorkbook(
    new Uint8Array(readFileSync("public/templates/nieuw.xlsx")),
  );
  h.editCells(
    0,
    waarden.map((n, row) => ({ row, col: 0, input: String(n) })),
  );
  bereid?.(h);
  const p = new Pakket(h.save());
  h.dispose();
  const { pad } = werkbladDeel(p, 0);
  sectie(
    p,
    pad,
    "conditionalFormatting",
    `<conditionalFormatting sqref="A1:A${waarden.length}"><cfRule type="${type}" priority="1">${inhoud}</cfRule></conditionalFormatting>`,
  );
  const loaded = openWorkbook(p.inpakken());
  boeken.push(loaded);
  return { h: loaded, regel: leesVoorwaardelijkeRegels(loaded, 0)[0] };
}
describe("visual conditional-format thresholds and icon levels (#67)", () => {
  it.each(PICTOGRAMSETS)(
    "renders every level of %s as distinct, finite vectors on screen and paper",
    (set) => {
      const count = Number(set[0]),
        values = [0, 25, 50, 75, 100].slice(0, count),
        thresholds = values
          .map((n) => `<cfvo type="num" val="${n}"/>`)
          .join("");
      const { h, regel } = boek(
        "iconSet",
        `<iconSet iconSet="${set}">${thresholds}</iconSet>`,
        values,
      );
      const icons = [...visueleRegel(h, 0, regel).values()].map(
        (c) => c.icoon!,
      );
      expect(icons.map((i) => i.index)).toEqual(values.map((_, i) => i));
      const signatures = icons.map((i) => {
        const commands = tekenPictogram(
          i,
          { x: 0, y: 0, w: 16, h: 16 },
          { x: 0, y: 0, w: 16, h: 16 },
        );
        expect(commands.length).toBeGreaterThan(0);
        expect(commands.some((c) => c.op === "text")).toBe(false);
        for (const c of commands)
          if (c.op === "path")
            for (const p of c.commands)
              for (const v of Object.values(p))
                if (typeof v === "number")
                  expect(Number.isFinite(v)).toBe(true);
        return JSON.stringify(commands);
      });
      expect(new Set(signatures).size).toBe(count);
      bereidVoorwaardelijkeWeergave(h);
      const viewport = { x: 0, y: 0, width: 400, height: 220 },
        metrics = {
          dpi: 96,
          maxDigitWidth: 7,
          defaultRowHeightPt: 15,
          fontSizePt: 11,
          fontFamily: "Calibri",
          fontAscent: 10,
          fontDescent: 3,
        };
      for (const frame of [
        h.displayList(viewport),
        h.displayListProfiled(viewport).displayList,
        h.printDisplayList(0, `A1:A${count}`, metrics, false),
      ]) {
        expect(
          frame.commands.filter((c) => c.op === "path").length,
        ).toBeGreaterThanOrEqual(count);
        expect(
          frame.commands.some(
            (c) =>
              c.op === "text" && ["●", "↓", "→", "↑", "⚑"].includes(c.text),
          ),
        ).toBe(false);
        expect(
          frame.commands.filter((c) => c.op === "text").length,
        ).toBeGreaterThanOrEqual(count);
      }
    },
  );
  it("evaluates formula thresholds in the original sheet and follows source edits without mutation", () => {
    const { h, regel } = boek(
      "iconSet",
      '<iconSet iconSet="3Arrows"><cfvo type="num" val="0"/><cfvo type="formula" val="$B$1"/><cfvo type="formula" val="$B$1*2"/></iconSet>',
      [10, 30, 70],
      (h) => h.editCell(0, 0, 1, "25"),
    );
    const versie = h.version(),
      history = h.historyState();
    expect(
      [...visueleRegel(h, 0, regel).values()].map((c) => c.icoon?.index),
    ).toEqual([0, 1, 2]);
    expect(h.version()).toBe(versie);
    expect(h.historyState()).toEqual(history);
    h.editCell(0, 0, 1, "40");
    expect(
      [...visueleRegel(h, 0, regel).values()].map((c) => c.icoon?.index),
    ).toEqual([0, 0, 1]);
    h.undo();
    expect(
      [...visueleRegel(h, 0, regel).values()].map((c) => c.icoon?.index),
    ).toEqual([0, 1, 2]);
  });
  it("retains all five arrow levels instead of collapsing intermediate values", () => {
    const { h, regel } = boek(
      "iconSet",
      '<iconSet iconSet="5Arrows"><cfvo type="num" val="0"/><cfvo type="num" val="25"/><cfvo type="num" val="50"/><cfvo type="num" val="75"/><cfvo type="num" val="100"/></iconSet>',
    );
    const icons = [...visueleRegel(h, 0, regel).values()].map((c) => c.icoon);
    expect(new Set(icons.map((i) => JSON.stringify(i))).size).toBe(5);
    expect(icons.map((i) => i?.index)).toEqual([0, 1, 2, 3, 4]);
    expect(icons.every((i) => i?.set === "5Arrows")).toBe(true);
  });
  it("honours XML false for exclusive thresholds and reverse order", () => {
    const { h, regel } = boek(
      "iconSet",
      '<iconSet iconSet="3TrafficLights1" reverse="true"><cfvo type="num" val="0"/><cfvo type="num" val="50" gte="false"/><cfvo type="num" val="100"/></iconSet>',
      [0, 50, 100],
    );
    expect(
      [...visueleRegel(h, 0, regel).values()].map((c) => c.icoon?.index),
    ).toEqual([2, 2, 0]);
  });
  it.each([
    ['gte="0"', 0],
    ['gte="false"', 0],
    ['gte="1"', 1],
    ['gte="true"', 1],
    ["", 1],
  ])("compares boundary equality with %s", (attribute, expected) => {
    const { h, regel } = boek(
      "iconSet",
      `<iconSet iconSet="3Arrows"><cfvo type="num" val="0"/><cfvo type="num" val="50" ${attribute}/><cfvo type="num" val="100"/></iconSet>`,
      [0, 50, 100],
    );
    expect(visueleRegel(h, 0, regel).get("A2")?.icoon?.index).toBe(expected);
  });
  it("reverses every five-icon level and preserves the rule on save/reopen", () => {
    const { h, regel } = boek(
      "iconSet",
      '<iconSet iconSet="5Quarters" reverse="1"><cfvo type="num" val="0"/><cfvo type="num" val="25"/><cfvo type="num" val="50"/><cfvo type="num" val="75"/><cfvo type="num" val="100"/></iconSet>',
    );
    const version = h.version(),
      history = h.historyState();
    expect(
      [...visueleRegel(h, 0, regel).values()].map((c) => c.icoon?.index),
    ).toEqual([4, 3, 2, 1, 0]);
    expect(h.version()).toBe(version);
    expect(h.historyState()).toEqual(history);
    const saved = openWorkbook(h.save());
    boeken.push(saved);
    const reloaded = leesVoorwaardelijkeRegels(saved, 0)[0];
    expect(reloaded.rawXml).toBe(regel.rawXml);
    expect(
      [...visueleRegel(saved, 0, reloaded).values()].map((c) => c.icoon?.index),
    ).toEqual([4, 3, 2, 1, 0]);
  });
  it("uses formulas for colour-scale interpolation points", () => {
    const { h, regel } = boek(
      "colorScale",
      '<colorScale><cfvo type="formula" val="MIN($A$1:$A$3)"/><cfvo type="formula" val="MAX($A$1:$A$3)"/><color rgb="FF0000FF"/><color rgb="FFFF0000"/></colorScale>',
      [0, 25, 100],
    );
    expect([...visueleRegel(h, 0, regel).values()].map((c) => c.fill)).toEqual([
      "#0000ff",
      "#4000bf",
      "#ff0000",
    ]);
  });
  it("resolves visual-rule theme/tint and indexed colours from the source workbook", () => {
    const { h } = boek(
      "colorScale",
      '<colorScale><cfvo type="min"/><cfvo type="max"/><color theme="4" tint="0.4"/><color indexed="2"/></colorScale>',
      [0, 100],
    );
    const p = new Pakket(h.save()),
      { werkmap } = werkbladDeel(p, 0),
      theme = p.relaties(werkmap).find((r) => r.type.endsWith("/theme"))!,
      path = Pakket.doelPad(werkmap, theme.target);
    p.schrijf(
      path,
      p.lees(path).replace(/(<a:accent1>\s*<a:srgbClr val=")[^"]*/, "$14F81BD"),
    );
    const loaded = openWorkbook(p.inpakken());
    boeken.push(loaded);
    const rule = leesVoorwaardelijkeRegels(loaded, 0)[0];
    expect(
      [...visueleRegel(loaded, 0, rule).values()].map((c) => c.fill),
    ).toEqual(["#95b3d7", "#ff0000"]);
  });
  it("applies classic data-bar min/max lengths to the threshold range", () => {
    const { h, regel } = boek(
      "dataBar",
      '<dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="FF3366CC"/></dataBar>',
      [50, 75, 100],
    );
    const bars = [...visueleRegel(h, 0, regel).values()].map((c) => c.balk!);
    expect(bars.map((b) => b.deel)).toEqual([0.1, 0.5, 0.9]);
    expect(bars.every((b) => b.nul === 0)).toBe(true);
  });
  it("clamps explicit bar lengths and rejects invalid ranges without NaN geometry", () => {
    const source =
      '<dataBar minLength="20" maxLength="80"><cfvo type="num" val="25"/><cfvo type="num" val="75"/><color rgb="FF3366CC"/></dataBar>';
    const { h, regel } = boek("dataBar", source);
    expect(
      [...visueleRegel(h, 0, regel).values()].map((c) => c.balk?.deel),
    ).toEqual([0.2, 0.2, 0.5, 0.8, 0.8]);
    for (const xml of [
      source.replace('minLength="20"', 'minLength="90"'),
      source.replace('maxLength="80"', 'maxLength="101"'),
      source.replace('val="75"', 'val="10"'),
    ]) {
      const invalid = boek("dataBar", xml);
      expect(visueleRegel(invalid.h, 0, invalid.regel).size).toBe(0);
    }
    const equal = boek("dataBar", source.replace('val="75"', 'val="25"'));
    expect(
      [...visueleRegel(equal.h, 0, equal.regel).values()].every((c) =>
        Number.isFinite(c.balk?.deel),
      ),
    ).toBe(true);
  });
  it("does not invent fallback icons for an unknown imported icon family", () => {
    const { h, regel } = boek(
      "iconSet",
      '<iconSet iconSet="FutureIcons"><cfvo type="num" val="0"/><cfvo type="num" val="50"/><cfvo type="num" val="100"/></iconSet>',
    );
    expect(visueleRegel(h, 0, regel).size).toBe(0);
  });

  it("uses local names from the requested sheet even when a different sheet is active", () => {
    const { h, regel } = boek(
      "iconSet",
      '<iconSet iconSet="3Arrows"><cfvo type="num" val="0"/><cfvo type="formula" val="Grens"/><cfvo type="formula" val="Grens*2"/></iconSet>',
      [10, 30, 70],
      (h) => {
        h.applyOps([
          {
            type: "setDefinedName",
            name: "Grens",
            refers_to: "5",
            scope: null,
            hidden: false,
          },
          {
            type: "setDefinedName",
            name: "Grens",
            refers_to: "25",
            scope: 0,
            hidden: false,
          },
          { type: "addSheet", index: 1, name: "Other" },
        ]);
        h.setActiveSheet(1);
      },
    );
    const before = h.version(),
      history = h.historyState();
    expect(
      [...visueleRegel(h, 0, regel).values()].map((c) => c.icoon?.index),
    ).toEqual([0, 1, 2]);
    expect(h.sheetInfo().activeSheet).toBe(1);
    expect(h.version()).toBe(before);
    expect(h.historyState()).toEqual(history);
  });

  it("reserves icon space without changing the source values, and honours icon-only display", () => {
    const xml =
      '<iconSet iconSet="3Arrows"><cfvo type="num" val="0"/><cfvo type="num" val="50"/><cfvo type="num" val="100"/></iconSet>';
    const { h } = boek("iconSet", xml, [0, 50, 100]);
    const viewport = { x: 0, y: 0, width: 400, height: 220 };
    const before = h.displayList(viewport),
      rect = cellRect(before.grid, 0, 0)!;
    bereidVoorwaardelijkeWeergave(h);
    const frame = h.displayList(viewport),
      text = frame.commands.find((c) => c.op === "text" && c.text === "0");
    expect(text?.op === "text" && text.clip!.x).toBeGreaterThan(rect.x + 16);
    expect(h.cell(0, 0, 0).input).toBe("0");
    const only = boek(
      "iconSet",
      xml.replace("<iconSet ", '<iconSet showValue="false" '),
      [0, 50, 100],
    ).h;
    bereidVoorwaardelijkeWeergave(only);
    expect(
      only
        .displayList(viewport)
        .commands.some(
          (c) => c.op === "text" && ["0", "50", "100"].includes(c.text),
        ),
    ).toBe(false);
    expect(
      only.displayList(viewport).commands.filter((c) => c.op === "path").length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("uses a merged cell's full geometry for data bars", () => {
    const { h, regel } = boek(
      "dataBar",
      '<dataBar minLength="0" maxLength="100"><cfvo type="num" val="0"/><cfvo type="num" val="100"/><color rgb="FF3366CC"/></dataBar>',
      [100],
      (h) =>
        h.applyOps([
          {
            type: "mergeCells",
            sheet: 0,
            range: { start: { row: 0, col: 0 }, end: { row: 0, col: 2 } },
          },
        ]),
    );
    expect(visueleRegel(h, 0, regel).get("A1")?.bereik).toEqual({
      top: 0,
      left: 0,
      bottom: 0,
      right: 2,
    });
    bereidVoorwaardelijkeWeergave(h);
    const version = h.version(),
      history = h.historyState(),
      viewport = { x: 0, y: 0, width: 400, height: 220 },
      metrics = {
        dpi: 96,
        maxDigitWidth: 7,
        defaultRowHeightPt: 15,
        fontSizePt: 11,
        fontFamily: "Calibri",
        fontAscent: 10,
        fontDescent: 3,
      };
    for (const frame of [
      h.displayList(viewport),
      h.displayListProfiled(viewport).displayList,
      h.printDisplayList(0, "A1:C1", metrics, false),
    ]) {
      const cell = cellRect(frame.grid, 0, 0)!;
      const bar = frame.commands.find(
        (c) => c.op === "fillRect" && c.color.toLowerCase() === "#3366cc",
      );
      expect(bar?.op === "fillRect" && bar.w).toBeGreaterThan(cell.w * 2.5);
    }
    expect(h.version()).toBe(version);
    expect(h.historyState()).toEqual(history);
  });

  it("keeps error and oversized threshold formulas non-destructive instead of inventing zero", () => {
    for (const formula of ["1/0", "SUM(" + "A1+".repeat(3000) + "0)"]) {
      const { h, regel } = boek(
        "colorScale",
        `<colorScale><cfvo type="num" val="0"/><cfvo type="formula" val="${formula}"/><color rgb="FF0000FF"/><color rgb="FFFF0000"/></colorScale>`,
      );
      const before = h.version(),
        history = h.historyState();
      expect(visueleRegel(h, 0, regel).size).toBe(0);
      expect(h.version()).toBe(before);
      expect(h.historyState()).toEqual(history);
    }
  });
});
