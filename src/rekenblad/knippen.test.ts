import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as xlsx from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { ontleedBereik } from "../lint/rekenblad-logica";
import { kopieerSelectie, plak } from "./klembord";
import { STANDAARD_PLAKKEN } from "./klembordLogica";

const boeken: xlsx.WorkbookHandle[] = [];
let selectie = "A1";
afterEach(() => {
  boeken.splice(0).forEach((h) => h.dispose());
  vi.unstubAllGlobals();
});

function boek() {
  const h = xlsx.openWorkbook(readFileSync("public/templates/nieuw.xlsx"));
  boeken.push(h);
  const host = {
    querySelector: () => ({ value: selectie.split(":")[0] }),
    querySelectorAll: () => [],
    closest: () => null,
  };
  vi.stubGlobal("document", { querySelectorAll: () => [host] });
  const api = {
    handle: h,
    commands: { getState: () => {
      const b = ontleedBereik(selectie)!;
      return { enabled: true, value: { rows: b.bottom - b.top + 1, columns: b.right - b.left + 1 } };
    } },
    version: async () => h.version(),
    validateEdits: vi.fn(async (r: xlsx.XlsxEditRequest) => h.validateEdits(r)),
    applyEdits: vi.fn(async (r: xlsx.XlsxEditRequest) => h.applyEdits(r)),
    selectCells: vi.fn(),
  } as unknown as XlsxEditorApi;
  selectie = "A1";
  return { h, api };
}

const invoer = (h: xlsx.WorkbookHandle, blad: number, a1: string) => h.rangeCells(blad, a1)[0][0].input;

describe("knippen bewaart de bronwerkmap en het bronblad (#20)", () => {
  it("wist bij plakken in een ander blad uitsluitend de bron en groepeert de inhoud in één Undo", async () => {
    const { h, api } = boek();
    h.applyOps([{ type: "addSheet", index: 1, name: "Doel" }]);
    h.editCell(0, 0, 0, "bron");
    h.editCell(1, 0, 0, "behouden");
    const kopie = kopieerSelectie(api, true);
    h.setActiveSheet(1);
    selectie = "C3";
    await plak(api, { tekst: kopie.tsv });
    expect(invoer(h, 1, "C3")).toBe("bron");
    expect(invoer(h, 1, "A1")).toBe("behouden");
    expect(invoer(h, 0, "A1")).toBe("");
    h.undo();
    expect(invoer(h, 0, "A1")).toBe("bron");
    expect(invoer(h, 1, "C3")).toBe("");
  });

  it("wist nooit het overeenkomstige bronadres in een andere werkmap", async () => {
    const bron = boek();
    bron.h.editCell(0, 0, 0, "te verplaatsen");
    const kopie = kopieerSelectie(bron.api, true);
    const doel = boek();
    doel.h.editCell(0, 0, 0, "doel behouden");
    selectie = "C3";
    await plak(doel.api, { tekst: kopie.tsv });
    expect(invoer(doel.h, 0, "C3")).toBe("te verplaatsen");
    expect(invoer(doel.h, 0, "A1")).toBe("doel behouden");
    expect(invoer(bron.h, 0, "A1")).toBe("");
    doel.h.undo();
    bron.h.undo();
    expect(invoer(doel.h, 0, "C3")).toBe("");
    expect(invoer(bron.h, 0, "A1")).toBe("te verplaatsen");
  });

  it("verplaatst ook tussen verschillende bladindices in twee werkmappen", async () => {
    const bron = boek();
    bron.h.applyOps([{ type: "addSheet", index: 1, name: "Bron" }]);
    bron.h.setActiveSheet(1);
    bron.h.editCell(1, 0, 0, "=7*3");
    const kopie = kopieerSelectie(bron.api, true);
    const doel = boek();
    doel.h.editCell(0, 0, 0, "behouden");
    selectie = "C3";
    await plak(doel.api, { tekst: kopie.tsv });
    expect(invoer(doel.h, 0, "A1")).toBe("behouden");
    expect(invoer(doel.h, 0, "C3")).toBe("=7*3");
    expect(invoer(bron.h, 1, "A1")).toBe("");
  });

  it("weigert gewijzigde bladindices voordat een ander blad als bron wordt gewist", async () => {
    const { h, api } = boek();
    h.editCell(0, 0, 0, "bron");
    const kopie = kopieerSelectie(api, true);
    h.applyOps([{ type: "addSheet", index: 0, name: "Nieuw" }]);
    h.setActiveSheet(0);
    h.editCell(0, 0, 0, "bron");
    selectie = "C3";
    await expect(plak(api, { tekst: kopie.tsv })).rejects.toThrow();
    expect(invoer(h, 0, "C3")).toBe("");
    expect(invoer(h, 0, "A1")).toBe("bron");
    expect(invoer(h, 1, "A1")).toBe("bron");
  });

  it("wist bij overlappende verplaatsing geen geplakte cellen", async () => {
    const { h, api } = boek();
    h.editCell(0, 0, 0, "links");
    h.editCell(0, 0, 1, "rechts");
    selectie = "A1:B1";
    const kopie = kopieerSelectie(api, true);
    selectie = "B1";
    await plak(api, { tekst: kopie.tsv });
    expect(h.rangeCells(0, "A1:C1")[0].map((c) => c.input)).toEqual(["", "links", "rechts"]);
    h.undo();
    expect(h.rangeCells(0, "A1:C1")[0].map((c) => c.input)).toEqual(["links", "rechts", ""]);
  });

  it("weigert een gewijzigde bron voordat het doel wordt aangeraakt", async () => {
    const bron = boek();
    bron.h.editCell(0, 0, 0, "oude bron");
    const kopie = kopieerSelectie(bron.api, true);
    bron.h.editCell(0, 0, 0, "nieuwe bron");
    const doel = boek();
    doel.h.editCell(0, 0, 0, "behouden");
    selectie = "C3";
    await expect(plak(doel.api, { tekst: kopie.tsv })).rejects.toThrow();
    expect(invoer(bron.h, 0, "A1")).toBe("nieuwe bron");
    expect(invoer(doel.h, 0, "A1")).toBe("behouden");
    expect(invoer(doel.h, 0, "C3")).toBe("");
    expect(doel.api.applyEdits).not.toHaveBeenCalled();
  });

  it("weigert een verwijderd bronblad zonder een gelijk geïndexeerd blad te wissen", async () => {
    const bron = boek();
    bron.h.applyOps([{ type: "addSheet", index: 1, name: "Behouden" }]);
    bron.h.editCell(0, 0, 0, "bron");
    bron.h.editCell(1, 0, 0, "ander blad");
    const kopie = kopieerSelectie(bron.api, true);
    bron.h.applyOps([{ type: "removeSheet", index: 0 }]);
    const doel = boek();
    await expect(plak(doel.api, { tekst: kopie.tsv })).rejects.toThrow();
    expect(invoer(bron.h, 0, "A1")).toBe("ander blad");
    expect(doel.api.applyEdits).not.toHaveBeenCalled();
  });

  it("valideert het wissen in de broneditor vóór de doelbewerking", async () => {
    const bron = boek();
    bron.h.editCell(0, 0, 0, "bron");
    const kopie = kopieerSelectie(bron.api, true);
    vi.mocked(bron.api.validateEdits).mockResolvedValueOnce({ ok: false, version: bron.h.version(),
      failure: { code: "read-only", message: "Bron is alleen-lezen" } });
    const doel = boek();
    await expect(plak(doel.api, { tekst: kopie.tsv })).rejects.toThrow("Bron is alleen-lezen");
    expect(invoer(bron.h, 0, "A1")).toBe("bron");
    expect(doel.api.applyEdits).not.toHaveBeenCalled();
  });

  it("behoudt de bron en de knipkopie bij een mislukte doelbewerking", async () => {
    const bron = boek();
    bron.h.editCell(0, 0, 0, "bron");
    const kopie = kopieerSelectie(bron.api, true);
    const doel = boek();
    vi.mocked(doel.api.applyEdits).mockResolvedValueOnce({ ok: false, version: doel.h.version(),
      failure: { code: "read-only", message: "Doel is alleen-lezen" } });
    selectie = "C3";
    await expect(plak(doel.api, { tekst: kopie.tsv })).rejects.toThrow("Doel is alleen-lezen");
    expect(invoer(bron.h, 0, "A1")).toBe("bron");
    await plak(doel.api, { tekst: kopie.tsv });
    expect(invoer(bron.h, 0, "A1")).toBe("");
    expect(invoer(doel.h, 0, "C3")).toBe("bron");
  });

  it("behoudt een bron die verandert nadat de doelbewerking is gestart", async () => {
    const bron = boek();
    bron.h.editCell(0, 0, 0, "oude bron");
    const kopie = kopieerSelectie(bron.api, true);
    const doel = boek();
    vi.mocked(doel.api.applyEdits).mockImplementationOnce(async (r) => {
      bron.h.editCell(0, 0, 0, "nieuwe bron");
      return doel.h.applyEdits(r);
    });
    selectie = "C3";
    await expect(plak(doel.api, { tekst: kopie.tsv })).rejects.toThrow();
    expect(invoer(bron.h, 0, "A1")).toBe("nieuwe bron");
    expect(invoer(doel.h, 0, "C3")).toBe("oude bron");
  });

  it("verbruikt een knipkopie niet bij uitsluitend opmaak plakken", async () => {
    const { h, api } = boek();
    h.editCell(0, 0, 0, "bron");
    h.editCell(0, 0, 1, "behouden");
    const kopie = kopieerSelectie(api, true);
    selectie = "B1";
    await plak(api, { tekst: kopie.tsv }, { ...STANDAARD_PLAKKEN, wat: "opmaak" });
    expect(invoer(h, 0, "A1")).toBe("bron");
    expect(invoer(h, 0, "B1")).toBe("behouden");
    selectie = "C3";
    await plak(api, { tekst: kopie.tsv });
    expect(invoer(h, 0, "A1")).toBe("");
    expect(invoer(h, 0, "C3")).toBe("bron");
  });

  it("laat gewoon kopiëren tussen werkmappen de bron ongemoeid", async () => {
    const bron = boek();
    bron.h.editCell(0, 0, 0, "kopie");
    const kopie = kopieerSelectie(bron.api);
    const doel = boek();
    selectie = "C3";
    await plak(doel.api, { tekst: kopie.tsv });
    expect(invoer(bron.h, 0, "A1")).toBe("kopie");
    expect(invoer(doel.h, 0, "C3")).toBe("kopie");
  });

  it("maakt een verouderde knipkopie niet weer geldig door uitsluitend opmaak te plakken", async () => {
    const { h, api } = boek();
    h.editCell(0, 0, 0, "oude bron");
    const kopie = kopieerSelectie(api, true);
    h.editCell(0, 0, 0, "nieuwe bron");
    selectie = "B1";
    await plak(api, { tekst: kopie.tsv }, { ...STANDAARD_PLAKKEN, wat: "opmaak" });
    selectie = "C3";
    await expect(plak(api, { tekst: kopie.tsv })).rejects.toThrow();
    expect(invoer(h, 0, "A1")).toBe("nieuwe bron");
    expect(invoer(h, 0, "C3")).toBe("");
  });

  it("behoudt een nieuwe kopie die tijdens het plakken wordt gemaakt", async () => {
    const bron = boek();
    bron.h.editCell(0, 0, 0, "eerste");
    bron.h.editCell(0, 0, 1, "tweede");
    const kopie = kopieerSelectie(bron.api, true);
    const doel = boek();
    let nieuw: { tsv: string };
    vi.mocked(doel.api.applyEdits).mockImplementationOnce(async (r) => {
      selectie = "B1";
      nieuw = kopieerSelectie(bron.api);
      return doel.h.applyEdits(r);
    });
    selectie = "C3";
    await plak(doel.api, { tekst: kopie.tsv });
    selectie = "D4";
    await plak(doel.api, { tekst: nieuw!.tsv }, { ...STANDAARD_PLAKKEN, wat: "opmaak" });
    expect(invoer(bron.h, 0, "B1")).toBe("tweede");
    expect(invoer(doel.h, 0, "C3")).toBe("eerste");
  });
});
