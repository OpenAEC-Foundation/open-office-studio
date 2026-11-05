import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bereikInBeeld } from "./Golflijnen";
import type { SpellingSessie } from "./sessie";

beforeEach(() => {
  vi.stubGlobal("window", { innerHeight: 600 });
  vi.stubGlobal("getComputedStyle", () => ({ display: "flex", flexDirection: "column" }));
});
afterEach(() => vi.unstubAllGlobals());

function proef() {
  const toestand = { top: 0, bottom: 600, width: 800, verschuiving: 0 };
  const kolom = { classList: { contains: (naam: string) => naam === "canvas-pages__column" } };
  const paginas = [
    { fragments: [{ pmStart: 10, pmEnd: 50 }] },
    { fragments: [{ pmStart: 100, pmEnd: 150 }] },
  ];
  const elementen = [100, 2000].map(top => ({
    parentElement: kolom,
    getBoundingClientRect: vi.fn(() => ({ top: top - toestand.verschuiving, bottom: top + 1100 - toestand.verschuiving })),
  }));
  const indeling = vi.fn(() => ({ pages: paginas }));
  const sessie = { editor: () => ({ getEditorRef: () => ({ getLayout: indeling }) }) } as unknown as SpellingSessie;
  const vlak = {
    getBoundingClientRect: () => toestand,
    querySelectorAll: vi.fn(() => elementen),
  };
  const laag = { closest: () => vlak } as unknown as HTMLElement;
  return { sessie, laag, vlak, toestand, indeling, elementen };
}

describe("spellingsweergave in het werkelijke venster", () => {
  it("behoudt alle fragmentgrenzen van de pagina's in beeld", () => {
    const p = proef();
    expect(bereikInBeeld(p.sessie, p.laag)).toEqual([10, 50]);
  });

  it.each(["breedte", "hoogte", "buiten venster", "verborgen tabblad"])("leest geen documentindeling voor een onzichtbaar vlak: %s", soort => {
    const p = proef();
    if (soort === "breedte") p.toestand.width = 0;
    if (soort === "hoogte") p.toestand.bottom = 0;
    if (soort === "buiten venster") { p.toestand.top = -800; p.toestand.bottom = -200; }
    if (soort === "verborgen tabblad") vi.stubGlobal("getComputedStyle", () => ({ visibility: "hidden" }));
    expect(bereikInBeeld(p.sessie, p.laag)).toBeUndefined();
    expect(p.indeling).not.toHaveBeenCalled();
    expect(p.vlak.querySelectorAll).not.toHaveBeenCalled();
  });

  it("behoudt de volledige terugval als DOM en indeling niet overeenkomen", () => {
    const p = proef(); p.elementen.pop();
    expect(bereikInBeeld(p.sessie, p.laag)).toBeNull();
  });

  it("vindt na scrollen de andere pagina zonder de bron te veranderen", () => {
    const p = proef(); p.toestand.verschuiving = 2000;
    expect(bereikInBeeld(p.sessie, p.laag)).toEqual([100, 150]);
  });
});
