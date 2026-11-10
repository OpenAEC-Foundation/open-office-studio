import { describe, expect, it } from "vitest";
import { leesDatum, leesGetal, raadSoort, sorteerVolgorde } from "./logica";

describe("geldige sorteerwaarden in Writer-tabellen (#48)", () => {
  it.each([
    "31-02-2026", "29/02/2025", "2026-13-01", "2026-00-01", "2026-01-00",
    "32-01-2026", "31 apr 2026", "29 feb 1900", "29 feb 2100", "01-01-0000",
  ])("wijst ongeldige kalenderdatum %s af", (tekst) => expect(leesDatum(tekst)).toBeNull());

  it.each([
    ["29-02-2024", 2024, 2, 29], ["29 feb 2000", 2000, 2, 29],
    ["2026-12-31", 2026, 12, 31], ["1 maart 2026", 2026, 3, 1],
    ["5/1/26", 2026, 1, 5], ["01-01-0099", 99, 1, 1],
  ] as const)("behoudt geldige datum %s zonder lokale tijdzone of 1900-verschuiving", (tekst, jaar, maand, dag) => {
    const d = new Date(0); d.setUTCFullYear(jaar, maand - 1, dag);
    expect(leesDatum(tekst)).toBe(d.getTime());
  });

  it.each(["31-02-2026", "12 dozen", "1e", "1,2,3", "12-3"])("leest geen numerieke prefix uit %s", (tekst) => {
    expect(leesGetal(tekst)).toBeNull();
    expect(raadSoort([tekst])).toBe("tekst");
  });

  it.each([["€ 1.234,50", 1234.5], ["1,234.5", 1234.5], ["12%", 12], ["-0,5", -0.5], ["1e-3", 0.001]] as const)("behoudt getal %s", (tekst, verwacht) => {
    expect(leesGetal(tekst)).toBe(verwacht);
  });

  it("houdt ongeldige waarden stabiel achteraan en de kopregel vast bij beide richtingen", () => {
    const rijen = [["Datum"], ["31-02-2026"], ["02-03-2026"], ["01-03-2026"], [""], ["2026-13-01"]];
    expect(sorteerVolgorde(rijen, [{ kolom: 0, soort: "datum" }], 1)).toEqual([0, 3, 2, 1, 4, 5]);
    expect(sorteerVolgorde(rijen, [{ kolom: 0, soort: "datum", aflopend: true }], 1)).toEqual([0, 2, 3, 1, 4, 5]);
    expect(raadSoort(["31-02-2026", "01-03-2026"])).toBe("tekst");
  });
});
