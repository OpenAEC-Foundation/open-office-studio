import { describe, expect, it } from "vitest";
import { extensieVan, opslagplan, vertaal } from "./werkbestand";
import {
  beginToestand,
  tabbladReducer,
  zoekWerkbestand,
} from "./tabbladen";

describe("Ctrl+S en het werkbestand", () => {
  it("schrijft het eigen formaat zonder vragen terug", () => {
    expect(
      opslagplan({
        soort: "docx",
        werkbestand: { token: "t", naam: "Verslag.DOCX" },
        heeftKeuze: false,
      }),
    ).toEqual({ route: "terugschrijven", ext: "docx", bevestigen: false });
  });

  it("vraagt eenmalig bij een geïmporteerd formaat", () => {
    const tabblad = {
      soort: "docx" as const,
      werkbestand: { token: "t", naam: "notitie.odt" },
      heeftKeuze: true,
    };
    expect(opslagplan(tabblad)).toEqual({
      route: "terugschrijven",
      ext: "odt",
      bevestigen: true,
    });
    expect(
      opslagplan({
        ...tabblad,
        werkbestand: { ...tabblad.werkbestand, bevestigd: true },
      }),
    ).toMatchObject({ bevestigen: false });
  });

  it.each([false, true])("houdt de XLSB-bron buiten terugschrijven (bevestigd=%s)", (bevestigd) => {
    const bron = Object.freeze({ token: "originele-xlsb", naam: "Begroting.XLSB", bevestigd });
    const toestand = tabbladReducer(beginToestand, {
      type: "openDocument",
      naam: "Begroting.xlsx",
      soort: "xlsx",
      bytes: new Uint8Array([1]),
      werkbestand: bron,
      gewijzigd: true,
    });
    const kopie = toestand.tabbladen[0];
    if (kopie.type !== "document") throw new Error("Verwacht de geïmporteerde werkmap");
    expect(kopie).toMatchObject({ naam: "Begroting.xlsx", exportFormaat: "xlsx", gewijzigd: true });
    // Ook een eerdere uitvoerkeuze mag een niet-ondersteunde bronroute niet activeren.
    for (const heeftKeuze of [false, true]) {
      expect(opslagplan({ ...kopie, heeftKeuze })).toEqual({ route: "opslaanAls" });
    }
    expect(kopie.werkbestand).toBe(bron);
    expect(bron).toEqual({ token: "originele-xlsb", naam: "Begroting.XLSB", bevestigd });
  });

  it("bewaart de gekozen XLSX rechtstreeks en behoudt de XLS-waarschuwing", () => {
    expect(opslagplan({
      soort: "xlsx", werkbestand: { token: "nieuwe-xlsx", naam: "Begroting.xlsx" }, heeftKeuze: true,
    })).toEqual({ route: "terugschrijven", ext: "xlsx", bevestigen: false });
    expect(opslagplan({
      soort: "xlsx", werkbestand: { token: "originele-xls", naam: "Begroting.xls" }, heeftKeuze: false,
    })).toEqual({ route: "terugschrijven", ext: "xls", bevestigen: true });
  });

  it("nieuw document: eerst Opslaan als, daarna dezelfde keuze", () => {
    expect(
      opslagplan({ soort: "xlsx", werkbestand: null, heeftKeuze: false }),
    ).toEqual({ route: "opslaanAls" });
    expect(
      opslagplan({ soort: "xlsx", werkbestand: null, heeftKeuze: true }),
    ).toEqual({ route: "keuze" });
  });

  it("alleen-lezen en een ander formaat leiden naar Opslaan als", () => {
    expect(vertaal({ status: "alleen-lezen" }, "a.docx")).toMatchObject({
      status: "opslaan-als",
      toelichting: expect.stringContaining("alleen-lezen"),
    });
    expect(vertaal({ status: "ander-formaat" }, "a.odt").status).toBe(
      "opslaan-als",
    );
    expect(
      vertaal({ status: "opgeslagen", naam: "a.docx", pad: "/x/a.docx" }, ""),
    ).toEqual({ status: "opgeslagen", pad: "/x/a.docx" });
    expect(vertaal({ status: "geannuleerd" }, "a.docx").status).toBe(
      "geannuleerd",
    );
  });

  it("extensie in kleine letters", () => {
    expect(extensieVan("Begroting 2026.XLSX")).toBe("xlsx");
    expect(extensieVan("zonder")).toBe("");
  });

  it("tabblad vindt en onthoudt zijn werkbestand", () => {
    let t = tabbladReducer(beginToestand, {
      type: "openDocument",
      naam: "a.docx",
      soort: "docx",
      bytes: new Uint8Array([1]),
      werkbestand: { token: "abc", naam: "a.docx" },
    });
    expect(zoekWerkbestand(t, "abc")?.id).toBe(1);
    t = tabbladReducer(t, {
      type: "werkBij",
      id: 1,
      wijziging: {
        naam: "b.docx",
        werkbestand: { token: "def", naam: "b.docx" },
      },
    });
    expect(zoekWerkbestand(t, "abc")).toBeUndefined();
    expect(zoekWerkbestand(t, "def")?.naam).toBe("b.docx");
  });
});
