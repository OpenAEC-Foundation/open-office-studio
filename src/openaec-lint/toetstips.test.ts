import { describe, expect, it } from "vitest";
import { kenToetstips, lettersVan, lintToetsActie, zoekToetstip } from "./toetstips";

describe("lintopdrachten bij keydown", () => {
  const toets = (key: string, extra = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false, ...extra });

  it("laat gewone invoer en andere sneltoetsen zonder lintmeting door", () => {
    for (const key of ["a", "A", " ", "Enter", "Backspace", "Delete", "ArrowLeft", "Escape", "Alt", "Shift", "Control", "Dead", "Unidentified"])
      for (let masker = 0; masker < 16; masker++)
        expect(lintToetsActie(toets(key, { ctrlKey: !!(masker & 1), metaKey: !!(masker & 2), altKey: !!(masker & 4), shiftKey: !!(masker & 8) }))).toBeNull();
  });

  it("behoudt F10 en Ctrl/Meta+F1 met precies de bestaande modifiers", () => {
    for (let masker = 0; masker < 16; masker++) {
      const modifiers = { ctrlKey: !!(masker & 1), metaKey: !!(masker & 2), altKey: !!(masker & 4), shiftKey: !!(masker & 8) };
      expect(lintToetsActie(toets("F10", modifiers))).toBe(masker === 0 ? "tips" : null);
      expect(lintToetsActie(toets("F1", modifiers))).toBe([1, 2, 3].includes(masker) ? "inklappen" : null);
    }
  });

  it("neemt een al afgehandelde sneltoets niet over", () => {
    expect(lintToetsActie(toets("F10", { defaultPrevented: true }))).toBeNull();
    expect(lintToetsActie(toets("F1", { ctrlKey: true, defaultPrevented: true }))).toBeNull();
  });
});

const prefixvrij = (codes: string[]) =>
  codes.every((a, i) =>
    codes.every((b, j) => i === j || !b.startsWith(a)),
  );

describe("toetstips", () => {
  it("haalt letters zonder accenten op", () => {
    expect(lettersVan("Beëindig ’t")).toEqual([..."BEEINDIGT"]);
  });

  it("geeft liefst de beginletter en respecteert vaste codes", () => {
    expect(
      kenToetstips(["Bestand", "Start", "Invoegen", "Indeling", "Beeld"], ["B"]),
    ).toEqual(["B", "S", "I", "N", "E"]);
  });

  it("blijft uniek en prefixvrij bij veel knoppen", () => {
    const namen = Array.from({ length: 80 }, (_, i) => `Knop ${i}`);
    const codes = kenToetstips(namen);
    expect(new Set(codes).size).toBe(80);
    expect(prefixvrij(codes)).toBe(true);
    expect(codes.every((code) => code.length <= 2)).toBe(true);
  });

  it("geeft namen zonder letters toch een code", () => {
    const codes = kenToetstips(["€", "%", "—"]);
    expect(new Set(codes).size).toBe(3);
    expect(prefixvrij(codes)).toBe(true);
  });

  it("zoekt volledige codes en voorvoegsels", () => {
    expect(zoekToetstip(["A", "ZB", "ZC"], "Z")).toBe("verder");
    expect(zoekToetstip(["A", "ZB", "ZC"], "ZC")).toEqual({ index: 2 });
    expect(zoekToetstip(["A", "ZB"], "Q")).toBeNull();
  });
});
