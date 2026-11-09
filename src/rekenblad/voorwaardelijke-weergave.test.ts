import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openWorkbook,
  cellRect,
  type WorkbookHandle,
} from "@betteroffice/xlsx";
import { bereidVoorwaardelijkeWeergave } from "./voorwaardelijke-weergave";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const boeken: WorkbookHandle[] = [];
afterEach(() => boeken.splice(0).forEach((h) => h.dispose()));
function boek(bytes: Uint8Array = readFileSync("public/templates/nieuw.xlsx")) {
  const h = openWorkbook(bytes);
  boeken.push(h);
  return h;
}
const viewport = { x: 0, y: 0, width: 320, height: 160 };
function tekst(h: WorkbookHandle, waarde: string) {
  const c = h
    .displayList(viewport)
    .commands.find((c) => c.op === "text" && c.text === waarde);
  if (c?.op !== "text") throw new Error("Celtekst ontbreekt");
  return c;
}
function regel(
  h: WorkbookHandle,
  formulest: string[],
  type = "expression",
  operator?: string,
) {
  h.applyOps([
    {
      type: "addConditionalFormat",
      sheet: 0,
      range: { start: { row: 0, col: 0 }, end: { row: 2, col: 0 } },
      kind: type,
      operator,
      formulas: formulest,
      format: { fontColor: "#ff0000", fill: "#ffff00", bold: true },
    },
  ]);
}

describe("zichtbare voorwaardelijke opmaak (#67)", () => {
  it("evalueert ROW/COLUMN, lokale namen en helekolomverwijzingen op de oorspronkelijke cel", () => {
    const z = unzipSync(boek().save());
    z["xl/workbook.xml"] = strToU8(
      strFromU8(z["xl/workbook.xml"]).replace(
        "</workbook>",
        '<definedNames><definedName name="Grens" localSheetId="0">3</definedName></definedNames></workbook>',
      ),
    );
    const h = boek(zipSync(z));
    h.editCells(0, [
      { row: 0, col: 0, input: "3" },
      { row: 1, col: 0, input: "9" },
    ]);
    regel(h, ['AND(ROW()=2,COLUMN()=1,A1>Grens,SUM(A:A)=12,"A1"="A1")']);
    bereidVoorwaardelijkeWeergave(h);
    expect(tekst(h, "3").color).toBe("#000000");
    expect(tekst(h, "9").color).toBe("#ff0000");
  });
  it("laat vluchtige bronwaarden en hun oorspronkelijke tekenopdrachten intact", () => {
    const h = boek();
    h.editCell(0, 0, 0, "=RAND()");
    regel(h, ["TRUE"]);
    const frame = h.displayList(viewport),
      voor = h.version(),
      geschiedenis = h.historyState();
    const origineel = frame.commands.find((c) => c.op === "text");
    bereidVoorwaardelijkeWeergave(h);
    const na = h.displayList(viewport).commands.find((c) => c.op === "text");
    expect(na).toMatchObject({ ...origineel, color: "#ff0000", bold: true });
    expect(h.version()).toBe(voor);
    expect(h.historyState()).toEqual(geschiedenis);
  });
  it("tekent vergelijking, herberekent na wijzigingen en bewaart gewone stijlen en geschiedenis", () => {
    const h = boek();
    h.editCells(0, [
      { row: 0, col: 0, input: "10" },
      { row: 1, col: 0, input: "2" },
    ]);
    regel(h, ["5"], "cellIs", "greaterThan");
    const voor = h.version(),
      geschiedenis = h.historyState(),
      formaat = h.captureFormat(0, "A1");
    bereidVoorwaardelijkeWeergave(h);
    expect(tekst(h, "10")).toMatchObject({ color: "#ff0000", bold: true });
    expect(tekst(h, "2").color).toBe("#000000");
    expect(
      h
        .displayList(viewport)
        .commands.some((c) => c.op === "fillRect" && c.color === "#ffff00"),
    ).toBe(true);
    expect(h.version()).toBe(voor);
    expect(h.historyState()).toEqual(geschiedenis);
    expect(h.captureFormat(0, "A1")).toEqual(formaat);
    h.editCell(0, 0, 0, "1");
    expect(tekst(h, "1").color).toBe("#000000");
    h.undo();
    expect(tekst(h, "10").color).toBe("#ff0000");
  });
  it("exporteert het pakket niet opnieuw bij gewoon typen of scrollen", () => {
    const h = boek();
    h.editCell(0, 0, 0, "10");
    regel(h, ["A1>5"]);
    const opslaan = vi.spyOn(h, "save");
    bereidVoorwaardelijkeWeergave(h);
    h.displayList(viewport);
    expect(opslaan).toHaveBeenCalledTimes(1);
    opslaan.mockClear();
    h.editCell(0, 0, 0, "11");
    h.displayList(viewport);
    h.displayList({ ...viewport, y: 20 });
    expect(opslaan).not.toHaveBeenCalled();
    expect(tekst(h, "11").color).toBe("#ff0000");
  });
  it("evalueert relatieve/absolute formules en kruisbladverwijzingen met de echte rekenkern", () => {
    const h = boek();
    h.applyOps([{ type: "addSheet", index: 1, name: "Grens" }]);
    h.editCell(1, 0, 0, "5");
    h.editCells(0, [
      { row: 0, col: 0, input: "3" },
      { row: 1, col: 0, input: "8" },
      { row: 2, col: 0, input: "=Grens!A1*2" },
    ]);
    regel(h, ["A1>Grens!$A$1"]);
    bereidVoorwaardelijkeWeergave(h);
    expect(tekst(h, "3").color).toBe("#000000");
    expect(tekst(h, "8").color).toBe("#ff0000");
    expect(tekst(h, "10").color).toBe("#ff0000");
    h.editCell(1, 0, 0, "9");
    expect(tekst(h, "8").color).toBe("#000000");
    expect(tekst(h, "18").color).toBe("#ff0000");
  });
  it("behoudt regels na opslaan en heropenen zonder tijdelijke bladen of gewone opmaak mee te bewaren", () => {
    const h = boek();
    h.editCell(0, 0, 0, "10");
    regel(h, ["A1>5"]);
    bereidVoorwaardelijkeWeergave(h);
    tekst(h, "10");
    const terug = boek(h.save());
    bereidVoorwaardelijkeWeergave(terug);
    expect(terug.sheetCount()).toBe(1);
    expect(terug.conditionalFormats(0)).toHaveLength(1);
    expect(terug.captureFormat(0, "A1")).toEqual(h.captureFormat(0, "A1"));
    expect(tekst(terug, "10").color).toBe("#ff0000");
  });
  it("geeft eerdere regels voorrang per eigenschap en behandelt foutwaarden als onwaar", () => {
    const h = boek();
    h.editCell(0, 0, 0, "10");
    regel(h, ["A1>5"]);
    h.applyOps([
      {
        type: "addConditionalFormat",
        sheet: 0,
        range: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
        kind: "expression",
        formulas: ["TRUE"],
        format: { fontColor: "#0000FF", italic: true },
      },
    ]);
    bereidVoorwaardelijkeWeergave(h);
    expect(tekst(h, "10")).toMatchObject({
      color: "#ff0000",
      bold: true,
      italic: true,
    });
  });
  it("gebruikt de echte rasterposities bij vastzetten en scrollen", () => {
    const h = boek();
    h.editCells(0, [
      { row: 0, col: 0, input: "5" },
      { row: 20, col: 0, input: "9" },
    ]);
    h.applyOps([
      {
        type: "setFreezePane",
        sheet: 0,
        pane: { rows: 1, cols: 1, top_left: { row: 1, col: 1 } },
      },
      {
        type: "addConditionalFormat",
        sheet: 0,
        range: { start: { row: 0, col: 0 }, end: { row: 30, col: 0 } },
        kind: "expression",
        formulas: ["A1>0"],
        format: { fill: "#abcdef", fontColor: "#123456" },
      },
    ]);
    bereidVoorwaardelijkeWeergave(h);
    const frame = h.displayList({ x: 180, y: 400, width: 320, height: 160 });
    const r = cellRect(frame.grid, 0, 0)!;
    expect(r).not.toBeNull();
    expect(frame.commands).toContainEqual({
      op: "fillRect",
      ...r,
      color: "#abcdef",
      clip: r,
    });
    expect(
      frame.commands.find((c) => c.op === "text" && c.text === "5"),
    ).toMatchObject({ color: "#123456" });
  });
  it("tekent samengevoegde cellen ook bij afdrukken met dezelfde waarden en geschiedenis", () => {
    const h = boek();
    h.editCell(0, 0, 0, "10");
    h.applyOps([
      {
        type: "mergeCells",
        sheet: 0,
        range: { start: { row: 0, col: 0 }, end: { row: 0, col: 2 } },
      },
    ]);
    regel(h, ["A1>5"]);
    const metrics = {
      dpi: 96,
      maxDigitWidth: 7,
      defaultRowHeightPt: 15,
      fontSizePt: 11,
      fontFamily: "Calibri",
      fontAscent: 10,
      fontDescent: 3,
    };
    const voor = h.printDisplayList(0, "A1:C3", metrics, false),
      versie = h.version(),
      geschiedenis = h.historyState();
    bereidVoorwaardelijkeWeergave(h);
    const na = h.printDisplayList(0, "A1:C3", metrics, false),
      t = na.commands.find((c) => c.op === "text" && c.text === "10");
    expect(t).toMatchObject({ color: "#ff0000", bold: true });
    const fill = na.commands.find(
      (c) => c.op === "fillRect" && c.color === "#ffff00",
    );
    expect(fill?.op === "fillRect" && fill.w).toBeGreaterThan(
      cellRect(voor.grid, 0, 0)!.w * 2.5,
    );
    expect(h.version()).toBe(versie);
    expect(h.historyState()).toEqual(geschiedenis);
  });
});
