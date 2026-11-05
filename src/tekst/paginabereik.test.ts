import { describe, expect, it } from "vitest";
import { paginaSelectie } from "./paginabereik";

const maak = (aantal: number) => {
  let top = -100;
  return Array.from({ length: aantal }, (_, i) => {
    const r = { top, bottom: top + 500 + (i % 5) * 40, index: i };
    top = r.bottom + 24;
    return r;
  });
};
const volledig = (p: ReturnType<typeof maak>, boven: number, onder: number) =>
  p.filter((r) => !(r.bottom < boven || r.top > onder));
describe("zichtbare pagina’s meten", () => {
  it("meet bij 10.000 pagina’s alleen de zoekgrenzen en zichtbare boxen", () => {
    const p = maak(10000);
    let aantal = 0;
    const uit = paginaSelectie(
      p,
      (r) => {
        aantal++;
        return r;
      },
      p[9998].top,
      p[9999].bottom,
      true,
    );
    expect(uit.map((x) => x.pagina)).toEqual(p.slice(-2));
    expect(aantal).toBeLessThan(35);
  });
  it("blijft gelijk aan een volledige vergelijking bij randen, gaten en verschillende hoogtes", () => {
    const p = maak(200);
    for (const i of [0, 1, 70, 199])
      for (const boven of [
        p[i].top - 24,
        p[i].top,
        p[i].bottom,
        p[i].bottom + 1,
      ])
        for (const hoogte of [0, 400, 3000])
          expect(
            paginaSelectie(p, (r) => r, boven, boven + hoogte, true).map(
              (x) => x.pagina,
            ),
          ).toEqual(volledig(p, boven, boven + hoogte));
  });
  it("behoudt een andere paginavolgorde en een onbekende indeling via de algemene route", () => {
    const p = maak(50).reverse();
    expect(paginaSelectie(p, (r) => r, 0, 1000).map((x) => x.pagina)).toEqual(
      volledig(p, 0, 1000),
    );
    expect(paginaSelectie([], (r) => r as never, 0, 1000, true)).toEqual([]);
  });
  it("vervalt niet in een zoeklus als een gemeten grens ongeldig is", () => {
    const p = maak(100);
    p[50].bottom = NaN;
    expect(
      paginaSelectie(p, (r) => r, 0, 1000, true).map((x) => x.pagina),
    ).toEqual(volledig(p, 0, 1000));
  });
});
