import { describe, expect, it } from "vitest";
import { past } from "./sneltoetsen";
import { moduleToets } from "./sneltoetsenlijst";

function druk(key: string, code: string, altGraph: boolean, meta = false) {
  return {
    key,
    code,
    ctrlKey: !meta,
    metaKey: meta,
    altKey: true,
    shiftKey: false,
    getModifierState(modifier: string) {
      return modifier === "AltGraph" && altGraph;
    },
  };
}

describe("AltGr is tekstinvoer, geen kantoorsneltoets (#19)", () => {
  it.each([
    ["Ctrl+Alt+M", "µ", "KeyM"],
    ["Ctrl+Alt+C", "©", "KeyC"],
    ["Ctrl+Alt+1", "¡", "Digit1"],
    ["Ctrl+Alt+F", "Dead", "KeyF"],
  ])("laat AltGr bij %s ongemoeid", (toets, key, code) => {
    expect(past(toets, druk(key, code, true))).toBe(false);
  });

  it("reserveert AltGr niet als moduleopdracht in beide Writer-profielen", () => {
    expect(moduleToets("tekst", "word", druk("µ", "KeyM", true))).toBe(false);
    expect(moduleToets("tekst", "standaard", druk("©", "KeyC", true))).toBe(
      false,
    );
  });

  it("behoudt echte Ctrl+Alt- en Cmd+Alt-opdrachten", () => {
    expect(past("Ctrl+Alt+M", druk("m", "KeyM", false))).toBe(true);
    expect(moduleToets("tekst", "word", druk("m", "KeyM", false))).toBe(true);
    expect(past("Ctrl+Alt+M", druk("m", "KeyM", false, true))).toBe(true);
  });

  it("leest de modifierstatus met de oorspronkelijke gebeurtenis als this", () => {
    const e = {
      ...druk("µ", "KeyM", true),
      altGraph: true,
      getModifierState(modifier: string) {
        return modifier === "AltGraph" && this.altGraph;
      },
    };
    expect(past("Ctrl+Alt+M", e)).toBe(false);
  });
});
