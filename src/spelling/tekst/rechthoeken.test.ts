import { describe, expect, it, vi } from "vitest";
import { BereikRechthoeken } from "./rechthoeken";

const rect = (x = 1) => ({ x, y: 2, width: 3, height: 4 });
function cache() {
  const c = new BereikRechthoeken();
  const g = {},
    dom = {},
    bron = {};
  c.bij(g, dom, "v1", bron);
  return { c, g, dom, bron };
}

describe("begrensde spellingrechthoeken voor één actuele geometrie", () => {
  it("hergebruikt overlappende bereiken en houdt de twee eindposities apart", () => {
    const { c } = cache(),
      haal = vi.fn(() => [rect()]);
    for (let n = 0; n < 3; n++)
      for (let i = n; i < n + 10; i++) c.lees(i, i + 1, haal);
    expect(haal).toHaveBeenCalledTimes(12);
    c.lees(0, 2, haal);
    expect(haal).toHaveBeenCalledTimes(13);
    expect(c.omvang).toEqual({ bereiken: 13, rechthoeken: 13 });
  });
  it("laat wijzigingen aan bronresultaten of teruggegeven kopieën niet doorlekken", () => {
    const { c } = cache(),
      bron = [rect()],
      haal = vi.fn(() => bron);
    c.lees(1, 2, haal);
    bron[0].x = 99;
    const gelezen = c.lees(1, 2, haal);
    gelezen[0].x = 88;
    expect(c.lees(1, 2, haal)).toEqual([rect()]);
    expect(haal).toHaveBeenCalledTimes(1);
  });
  it("vervangt het hele frame bij document/Undo-versie, geometrie, DOM of maatwijziging", () => {
    const { c, g, dom, bron } = cache(),
      haal = vi.fn(() => [rect()]);
    for (const v of ["v1", "v2", "v1", "v1:resize"]) {
      c.bij(g, dom, v, bron);
      c.lees(1, 2, haal);
      c.lees(1, 2, haal);
    }
    c.bij({}, dom, "v1:resize", bron);
    c.lees(1, 2, haal);
    c.bij(g, {}, "v1:resize", bron);
    c.lees(1, 2, haal);
    expect(haal).toHaveBeenCalledTimes(6);
    expect(c.omvang.bereiken).toBe(1);
  });
  it("deelt geen antwoorden tussen documenten met eenzelfde versie en aangehouden frame", () => {
    const { c, g, dom, bron } = cache(),
      haal = vi.fn(() => [rect()]);
    c.lees(1, 2, haal);
    c.bij(g, dom, "v1", bron);
    c.lees(1, 2, haal);
    expect(haal).toHaveBeenCalledTimes(1);
    c.bij(g, dom, "v1", {});
    c.lees(1, 2, haal);
    expect(haal).toHaveBeenCalledTimes(2);
  });
  it.each([
    { naam: "leeg", items: [] },
    { naam: "niet eindig", items: [rect(NaN)] },
    { naam: "zonder breedte", items: [{ ...rect(), width: 0 }] },
    { naam: "te groot", items: Array.from({ length: 513 }, () => rect()) },
  ])("bewaart een $naam antwoord niet", ({ items }) => {
    const { c } = cache();
    const haal = vi.fn().mockReturnValueOnce(items).mockReturnValue([rect()]);
    c.lees(1, 2, haal);
    expect(c.omvang.bereiken).toBe(0);
    expect(c.lees(1, 2, haal)).toEqual([rect()]);
    expect(haal).toHaveBeenCalledTimes(2);
  });
  it("laat een mislukte lezing opnieuw proberen en leegt bij verbergen/sluiten", () => {
    const { c } = cache();
    expect(() =>
      c.lees(1, 2, () => {
        throw Error("niet gereed");
      }),
    ).toThrow("niet gereed");
    c.lees(1, 2, () => [rect()]);
    c.wis();
    expect(c.omvang).toEqual({ bereiken: 0, rechthoeken: 0 });
    const haal = vi.fn(() => [rect()]);
    c.lees(1, 2, haal);
    c.lees(1, 2, haal);
    expect(haal).toHaveBeenCalledTimes(2);
  });
  it("houdt maximaal 256 bereiken en ververst de recent gebruikte bereiken", () => {
    const { c } = cache(),
      haal = vi.fn(() => [rect()]);
    for (let i = 0; i < 256; i++) c.lees(i, i + 1, haal);
    c.lees(0, 1, haal);
    c.lees(256, 257, haal);
    c.lees(0, 1, haal);
    expect(haal).toHaveBeenCalledTimes(257);
    c.lees(1, 2, haal);
    expect(haal).toHaveBeenCalledTimes(258);
    expect(c.omvang).toEqual({ bereiken: 256, rechthoeken: 256 });
  });
  it("houdt ook bij meerdere rechthoeken per bereik maximaal 512 rechthoeken vast", () => {
    const { c } = cache();
    for (let i = 0; i < 2000; i++)
      c.lees(i, i + 1, () => [rect(), rect(), rect()]);
    expect(c.omvang.bereiken).toBeLessThanOrEqual(256);
    expect(c.omvang.rechthoeken).toBe(510);
  });
});
