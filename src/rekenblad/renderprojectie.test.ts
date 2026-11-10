import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  openWorkbook,
  type DisplayList,
  type WorkbookHandle,
} from "@betteroffice/xlsx";
import { registreerRenderProjectie } from "./renderprojectie";
import { bereidVoorwaardelijkeWeergave } from "./voorwaardelijke-weergave";
import { volgKopRaster } from "./kopraster";
const boeken: WorkbookHandle[] = [];
afterEach(() => boeken.splice(0).forEach((h) => h.dispose()));
const viewport = { x: 0, y: 0, width: 200, height: 100 };
const metrics = {
  dpi: 96,
  maxDigitWidth: 7,
  defaultRowHeightPt: 15,
  fontSizePt: 11,
  fontFamily: "Calibri",
  fontAscent: 10,
  fontDescent: 3,
};
const kleur = (frame: DisplayList, waarde: string) =>
  frame.commands.find((c) => c.op === "text" && c.text === waarde);
function boek() {
  const h = openWorkbook(
    new Uint8Array(readFileSync("public/templates/nieuw.xlsx")),
  );
  boeken.push(h);
  h.editCells(0, [
    { row: 0, col: 0, input: "10" },
    { row: 1, col: 0, input: "2" },
  ]);
  return h;
}
describe("shared ordered render projections", () => {
  it("applies late-registered table styles before conditional formatting in all three native render paths", () => {
    const h = boek();
    h.applyOps([
      {
        type: "addConditionalFormat",
        sheet: 0,
        range: { start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
        kind: "expression",
        formulas: ["A1>5"],
        format: { fontColor: "#ff0000" },
      },
    ]);
    bereidVoorwaardelijkeWeergave(h);
    const version = h.version(),
      history = h.historyState();
    const stop = registreerRenderProjectie(h, 0, (frame) => ({
      ...frame,
      commands: frame.commands.map((c) =>
        c.op === "text" ? { ...c, color: "#0000ff" } : c,
      ),
    }));
    for (const frame of [
      h.displayList(viewport),
      h.displayListProfiled(viewport).displayList,
      h.printDisplayList(0, "A1:A2", metrics, false),
    ]) {
      expect(kleur(frame, "10")).toMatchObject({ color: "#ff0000" });
      expect(kleur(frame, "2")).toMatchObject({ color: "#0000ff" });
    }
    expect(h.version()).toBe(version);
    expect(h.historyState()).toEqual(history);
    stop();
    stop();
    expect(kleur(h.displayList(viewport), "10")).toMatchObject({
      color: "#ff0000",
    });
    expect(kleur(h.displayList(viewport), "2")).toMatchObject({
      color: "#000000",
    });
    const reopened = openWorkbook(h.save());
    boeken.push(reopened);
    expect(kleur(reopened.displayList(viewport), "10")).toMatchObject({
      color: "#000000",
    });
  });

  it("preserves later grid-cache wrappers through cleanup and re-registration, and passes the requested print sheet", () => {
    const h = boek();
    h.applyOps([{ type: "addSheet", index: 1, name: "Other" }]);
    const seen: number[] = [];
    const stop = registreerRenderProjectie(h, 0, (frame, blad) => {
      seen.push(blad);
      return frame;
    });
    const raster = volgKopRaster(h);
    h.displayList(viewport);
    expect(raster.beschikbaar(viewport)).toBe(true);
    stop();
    const stop2 = registreerRenderProjectie(h, 0, (frame, blad) => {
      seen.push(blad);
      return frame;
    });
    h.displayList(viewport);
    h.displayListProfiled(viewport);
    h.printDisplayList(1, "A1:A2", metrics, false);
    expect(seen).toEqual([0, 0, 0, 1]);
    expect(raster.beschikbaar(viewport)).toBe(true);
    stop2();
    raster.stop();
    const stop3 = registreerRenderProjectie(h, 0, (frame, blad) => {
      seen.push(blad);
      return frame;
    });
    h.displayList(viewport);
    h.displayListProfiled(viewport);
    h.printDisplayList(1, "A1:A2", metrics, false);
    expect(seen.slice(-3)).toEqual([0, 0, 1]);
    stop3();
  });
});
