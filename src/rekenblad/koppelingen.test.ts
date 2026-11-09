import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Pakket } from "../grafieken/pakket";
import {
  bewaarKoppeling,
  koppelingsadres,
  leesKoppeling,
  openKoppeling,
  type KoppelingDoel,
} from "./koppelingen";
vi.mock("../lint/editorApi", () => ({
  meldWijziging: vi.fn(),
  zichtbaarElement: () => null,
}));
const boeken: WorkbookHandle[] = [];
afterEach(() => boeken.splice(0).forEach((h) => h.dispose()));
function proef(bytes: Uint8Array = readFileSync("public/templates/nieuw.xlsx")) {
  const h = openWorkbook(bytes);
  boeken.push(h);
  const api = {
    handle: h,
    version: async () => h.version(),
    commands: { getState: () => ({ enabled: true }) },
  } as unknown as XlsxEditorApi;
  const doel = (): KoppelingDoel => ({
    versie: h.version(),
    blad: 0,
    sheetId: h.sheetInfo().sheetIds[0],
    focus: { row: 0, col: 0 },
    bereik: { top: 0, left: 0, bottom: 0, right: 0 },
  });
  return { h, api, doel };
}
describe("hyperlinks in het rekenblad (#75)", () => {
  it.each(["https://example.com/a?q=1&b=2", "mailto:test@example.com"])(
    "bewaart %s met tekst/opmaak in één Undo-stap",
    async (adres) => {
      const { h, api, doel } = proef();
      h.applyOps([
        {
          type: "setRangeNumberFormat",
          sheet: 0,
          range: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
          format: { type: "custom", pattern: '0.00" kg"' },
        },
      ]);
      const opmaak = h.captureFormat(0, "A1");
      await bewaarKoppeling(api, doel(), {
        soort: "web",
        adres,
        tekst: "Voorbeeld",
        tip: "Klik",
      });
      expect(h.cell(0, 0, 0).input).toBe("Voorbeeld");
      expect(h.captureFormat(0, "A1")).toEqual(opmaak);
      expect(leesKoppeling(api, doel())).toMatchObject({
        externalTarget: adres,
        display: "Voorbeeld",
        tooltip: "Klik",
      });
      h.undo();
      expect(h.cell(0, 0, 0).input).toBe("");
      expect(leesKoppeling(api, doel())).toBeNull();
      h.redo();
      expect(h.cell(0, 0, 0).input).toBe("Voorbeeld");
      const terug = openWorkbook(h.save());
      boeken.push(terug);
      expect(
        terug.exportStructured({
          scope: [{ sheet: 0, range: "A1" }],
          maxCells: 1,
        }),
      ).toMatchObject({
        ok: true,
        content: { sheets: [{ hyperlinks: [{ externalTarget: adres }] }] },
      });
      await bewaarKoppeling(api, doel(), null);
      expect(leesKoppeling(api, doel())).toBeNull();
      expect(h.cell(0, 0, 0).input).toBe("Voorbeeld");
    },
  );
  it("bewaart interne locaties en bestandspaden en weigert uitvoerbare URL-schema's", () => {
    expect(koppelingsadres("cel", "#'Blad 1'!B2")).toEqual({
      location: "'Blad 1'!B2",
    });
    expect(koppelingsadres("bestand", "C:\\Project\\bestand.xlsx")).toEqual({
      externalTarget: "file:///C:/Project/bestand.xlsx",
    });
    expect(
      koppelingsadres("bestand", "C:\\Mijn project\\plan #1.xlsx"),
    ).toEqual({ externalTarget: "file:///C:/Mijn%20project/plan%20%231.xlsx" });
    expect(koppelingsadres("bestand", "../Mijn project/plan.xlsx")).toEqual({
      externalTarget: "../Mijn%20project/plan.xlsx",
    });
    expect(() => koppelingsadres("web", "javascript:alert(1)")).toThrow();
    expect(() => koppelingsadres("bestand", "javascript:alert(1)")).toThrow();
    expect(() => koppelingsadres("cel", "XFE1")).toThrow();
  });
  it("geeft bestandslinks uitsluitend aan de documenthost door", async () => {
    const { api } = proef(),
      bestand = vi.fn(async () => {});
    await openKoppeling(api, "bestand", "C:\\Project\\plan.xlsx", bestand);
    expect(bestand).toHaveBeenCalledWith("file:///C:/Project/plan.xlsx");
    await expect(
      openKoppeling(api, "bestand", "javascript:alert(1)", bestand),
    ).rejects.toThrow();
    expect(bestand).toHaveBeenCalledOnce();
    await expect(
      openKoppeling(api, "bestand", "../plan.xlsx"),
    ).rejects.toThrow();
  });
  it("weigert verouderde doelen zonder de actuele werkmap te wijzigen", async () => {
    const { h, api, doel } = proef(),
      oud = doel();
    h.editCell(0, 1, 0, "nieuw");
    const versie = h.version();
    await expect(
      bewaarKoppeling(api, oud, {
        soort: "web",
        adres: "https://example.com",
        tekst: "x",
        tip: "",
      }),
    ).rejects.toThrow();
    expect(h.version()).toBe(versie);
  });
  it("behoudt de HYPERLINK-formule en weigert een overschrijvende weergavetekst", async () => {
    const { h, api, doel } = proef();
    const formule = '=HYPERLINK("https://example.com","Formula link")';
    h.editCell(0, 0, 0, formule);
    const r = h.readCells({
      ranges: [
        { sheetId: h.sheetInfo().sheetIds[0], range: { kind: "a1", a1: "A1" } },
      ],
    });
    expect(r).toMatchObject({
      ok: true,
      ranges: [
        { cells: [[{ value: { kind: "text", value: "Formula link" } }]] },
      ],
    });
    await expect(
      bewaarKoppeling(api, doel(), {
        soort: "web",
        adres: "https://example.org",
        tekst: "Overschrijven",
        tip: "",
      }),
    ).rejects.toThrow();
    expect(h.cell(0, 0, 0).input).toBe(formule);
    const terug = openWorkbook(h.save());
    boeken.push(terug);
    expect(terug.cell(0, 0, 0).input).toBe(formule);
  });
  it("weigert hyperlinks in alleen-lezen werkboeken en vergrendelde cellen", async () => {
    const { h, api, doel } = proef();
    const versie = h.version();
    const lezen = {
      ...api,
      commands: { getState: () => ({ disabledReason: { code: "read-only" } }) },
    } as unknown as XlsxEditorApi;
    await expect(
      bewaarKoppeling(lezen, doel(), {
        soort: "web",
        adres: "https://example.com",
        tekst: "x",
        tip: "",
      }),
    ).rejects.toThrow();
    expect(h.version()).toBe(versie);
    const p = new Pakket(readFileSync("public/templates/nieuw.xlsx"));
    p.schrijf("xl/worksheets/sheet1.xml", p.lees("xl/worksheets/sheet1.xml").replace('</sheetData>', '</sheetData><sheetProtection sheet="1"/>'));
    const beschermd = proef(p.inpakken()), oud = beschermd.h.version();
    await expect(bewaarKoppeling(beschermd.api, beschermd.doel(), { soort: "web", adres: "https://example.com", tekst: "x", tip: "" })).rejects.toThrow();
    expect(beschermd.h.version()).toBe(oud);
    expect(leesKoppeling(beschermd.api, beschermd.doel())).toBeNull();
  });
});
