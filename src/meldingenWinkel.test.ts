import { describe, expect, it } from "vitest";
import {
  Afteller,
  MAX_PER_TABBLAD,
  STANDAARDDUUR,
  raadToon,
  rapportMelding,
  rol,
  standaardDuur,
  vergeetTabblad,
  verwijder,
  voegToe,
  zichtbaar,
  type Melding,
} from "./meldingenWinkel";
import type { Rapport } from "./import/rapport";

const info = (tabblad: number | null, tekst: string) =>
  ({ tabblad, toon: "info", tekst }) as const;

describe("meldingen rechtsonder", () => {
  it("laat info en gelukt vanzelf verdwijnen; let op en fout blijven", () => {
    expect(standaardDuur("info")).toBe(STANDAARDDUUR);
    expect(standaardDuur("succes")).toBe(STANDAARDDUUR);
    expect(standaardDuur("waarschuwing")).toBeNull();
    expect(standaardDuur("fout")).toBeNull();
    const lijst = voegToe([], { tabblad: 1, toon: "fout", tekst: "Opslaan mislukt" }, 1);
    expect(lijst[0].duur).toBeNull();
    expect(voegToe([], info(1, "Opgeslagen"), 2)[0].duur).toBe(STANDAARDDUUR);
    // Een eigen duur gaat voor.
    expect(voegToe([], { ...info(1, "x"), duur: null }, 3)[0].duur).toBeNull();
  });

  it("leest fouten onderbrekend voor, de rest beleefd", () => {
    expect(rol("fout")).toBe("alert");
    expect(rol("waarschuwing")).toBe("status");
    expect(rol("info")).toBe("status");
  });

  it("toont alleen de meldingen van het actieve tabblad en van het venster", () => {
    let lijst: Melding[] = [];
    lijst = voegToe(lijst, info(1, "Opgeslagen: a.docx"), 1);
    lijst = voegToe(lijst, info(2, "Opgeslagen: b.xlsx"), 2);
    lijst = voegToe(lijst, info(null, "Te veel documenten open"), 3);
    expect(zichtbaar(lijst, 1).map((m) => m.id)).toEqual([1, 3]);
    expect(zichtbaar(lijst, 2).map((m) => m.id)).toEqual([2, 3]);
    // Start (geen tabblad): alleen de vensterbrede melding.
    expect(zichtbaar(lijst, null).map((m) => m.id)).toEqual([3]);
  });

  it("vervangt dezelfde melding in plaats van te stapelen", () => {
    let lijst: Melding[] = [];
    lijst = voegToe(lijst, info(1, "Opgeslagen"), 1);
    lijst = voegToe(lijst, info(1, "Iets anders"), 2);
    lijst = voegToe(lijst, info(1, "Opgeslagen"), 3);
    expect(lijst.map((m) => m.id)).toEqual([2, 3]);
    // Dezelfde tekst in een ander tabblad is een eigen melding.
    lijst = voegToe(lijst, info(2, "Opgeslagen"), 4);
    expect(lijst).toHaveLength(3);
  });

  it("houdt per tabblad hooguit een handvol meldingen", () => {
    let lijst: Melding[] = [];
    for (let i = 1; i <= MAX_PER_TABBLAD + 2; i++) lijst = voegToe(lijst, info(1, `m${i}`), i);
    lijst = voegToe(lijst, info(2, "ander tabblad"), 99);
    const van1 = lijst.filter((m) => m.tabblad === 1);
    expect(van1).toHaveLength(MAX_PER_TABBLAD);
    expect(van1[0].tekst).toBe("m3");
    expect(lijst.some((m) => m.tabblad === 2)).toBe(true);
  });

  it("sluit een melding en vergeet die van een gesloten tabblad", () => {
    let lijst: Melding[] = [];
    lijst = voegToe(lijst, info(1, "a"), 1);
    lijst = voegToe(lijst, info(2, "b"), 2);
    lijst = voegToe(lijst, info(null, "c"), 3);
    expect(verwijder(lijst, 1).map((m) => m.id)).toEqual([2, 3]);
    expect(verwijder(lijst, 42)).toBe(lijst);
    expect(vergeetTabblad(lijst, 2).map((m) => m.id)).toEqual([1, 3]);
    expect(vergeetTabblad(lijst, 7)).toBe(lijst);
  });

  it("maakt van een openrapport een blijvende melding met details", () => {
    const rapport = { kop: "Niet alles wordt volledig ondersteund.", regels: [] } as unknown as Rapport;
    const melding = voegToe([], rapportMelding(4, rapport, "a.docx"), 1)[0];
    expect(melding).toMatchObject({ tabblad: 4, toon: "waarschuwing", duur: null });
    expect(melding.rapport?.bestandsnaam).toBe("a.docx");
  });

  it("telt alleen af terwijl de melding in beeld en niet aangewezen is", () => {
    let nu = 1000;
    const teller = new Afteller(6000, () => nu);
    expect(teller.resterend()).toBe(6000);
    teller.start();
    nu += 2000;
    expect(teller.resterend()).toBe(4000);
    teller.pauzeer(); // muis erop of focus erin
    nu += 10_000;
    expect(teller.resterend()).toBe(4000);
    expect(teller.loopt).toBe(false);
    teller.start();
    teller.start(); // dubbel starten verandert niets
    nu += 5000;
    expect(teller.resterend()).toBe(0);
  });

  it("raadt de toon van meldingen zonder eigen toon", () => {
    expect(raadToon("Verwijderen mislukt: geen verbinding")).toBe("fout");
    expect(raadToon("Kon de browser niet openen.")).toBe("fout");
    expect(raadToon("Berichten opgehaald.")).toBe("info");
  });
});
