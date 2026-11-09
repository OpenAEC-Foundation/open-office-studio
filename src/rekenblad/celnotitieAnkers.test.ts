import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import { leesCelnotities, schrijfCelnotitie } from "./celnotities";
import {
  celnotities,
  laadCelnotities,
  metCelnotitieAnkers,
} from "./celnotitieAnkers";
import { werkboekBytes } from "../lint/rekenblad-filter";
import { namenLijst, naamFout } from "./namen";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";

const bron = readFileSync("public/templates/nieuw.xlsx");
const noot = {
  auteur: "Anna",
  tekst: "Deze notitie volgt de cel",
  zichtbaar: true,
};
function bytes() {
  return schrijfCelnotitie(schrijfCelnotitie(bron, 0, "B2", noot), 0, "D5", {
    ...noot,
    tekst: "Tweede",
  });
}
function boek() {
  const h = openWorkbook(metCelnotitieAnkers(bytes()));
  laadCelnotities(h, h.save());
  return h;
}
const bewaard = (h: WorkbookHandle) =>
  werkboekBytes({ handle: h, save: () => h.save() });
const cellen = (bytes: Uint8Array, blad = 0) =>
  leesCelnotities(bytes)[blad].map((n) => n.cel);
describe("celnotities volgen de enginegeschiedenis", () => {
  it("voegt verborgen ankers toe zonder overige pakketonderdelen of gebruikersnamen te wijzigen", () => {
    const input = bytes(),
      oud = new Pakket(input),
      voorbereid = new Pakket(metCelnotitieAnkers(input));
    for (const naam of oud.namen())
      if (naam !== "xl/workbook.xml")
        expect(voorbereid.bytes(naam), naam).toEqual(oud.bytes(naam));
    expect(voorbereid.lees("xl/workbook.xml")).toContain(
      'name="_OpenAEC_CellNote_0_B2" hidden="1"',
    );
    expect(
      new Pakket(metCelnotitieAnkers(voorbereid.inpakken())).lees(
        "xl/workbook.xml",
      ),
    ).toBe(voorbereid.lees("xl/workbook.xml"));
    expect(naamFout("_OpenAEC_CellNote_0_B2")).toBe("reservedName");
    const h = boek();
    try {
      expect(
        namenLijst({ handle: h } as XlsxEditorApi).some((n) =>
          n.naam.startsWith("_OpenAEC_CellNote_"),
        ),
      ).toBe(false);
    } finally {
      h.dispose();
    }
  });
  it("behoudt rij-/kolomankers bij invoegen, meermalen bewaren, Undo en Redo", () => {
    const h = boek();
    try {
      h.editCell(0, 0, 0, "42");
      h.applyOps([{ type: "insertRows", sheet: 0, at: 1, count: 1 }]);
      h.applyOps([{ type: "insertCols", sheet: 0, at: 1, count: 1 }]);
      expect(celnotities(h, 0).map((n) => n.cel)).toEqual(["C3", "E6"]);
      const uit = bewaard(h);
      expect(cellen(uit)).toEqual(["C3", "E6"]);
      expect(leesCelnotities(uit)[0].every((n) => n.zichtbaar)).toBe(true);
      expect(cellen(bewaard(h))).toEqual(["C3", "E6"]);
      expect(h.undo().applied).toBe(true);
      expect(h.undo().applied).toBe(true);
      expect(cellen(bewaard(h))).toEqual(["B2", "D5"]);
      h.redo();
      h.redo();
      expect(cellen(bewaard(h))).toEqual(["C3", "E6"]);
      const terug = openWorkbook(metCelnotitieAnkers(uit));
      try {
        laadCelnotities(terug, terug.save());
        expect(cellen(bewaard(terug))).toEqual(["C3", "E6"]);
        expect(terug.cell(0, 0, 0).input).toBe("42");
      } finally {
        terug.dispose();
      }
    } finally {
      h.dispose();
    }
  });
  it("verwijdert de notitie van een verwijderde rij en herstelt haar met Undo", () => {
    const h = boek();
    try {
      h.applyOps([{ type: "deleteRows", sheet: 0, at: 1, count: 1 }]);
      expect(celnotities(h, 0).map((n) => n.cel)).toEqual(["D4"]);
      expect(cellen(bewaard(h))).toEqual(["D4"]);
      h.undo();
      expect(cellen(bewaard(h))).toEqual(["B2", "D5"]);
    } finally {
      h.dispose();
    }
  });
  it("houdt notities bij het oorspronkelijke blad na toevoegen van een blad ervoor", () => {
    const h = boek();
    try {
      h.applyOps([{ type: "addSheet", index: 0, name: "Nieuw" }]);
      expect(celnotities(h, 0)).toEqual([]);
      expect(celnotities(h, 1).map((n) => n.cel)).toEqual(["B2", "D5"]);
      expect(cellen(bewaard(h), 1)).toEqual(["B2", "D5"]);
    } finally {
      h.dispose();
    }
  });
});
