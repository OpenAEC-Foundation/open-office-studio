import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Item = { id: string; review?: { change: { from: number; to: number; hfRid?: string } } };
type Stand = { pages: unknown[]; rects: [string, unknown][]; zoom: number };
type Effect = () => (() => void) | undefined;

/** Voer de echte, vastgepinde reviewhook uit met controleerbare lifecycle-grenzen. */
function proef(aantal = 3) {
  const bron = readFileSync(new URL("../../node_modules/@betteroffice/docx-react/dist/index.mjs", import.meta.url), "utf8");
  const begin = bron.indexOf("function tg(");
  const einde = bron.indexOf("var kc=", begin);
  if (begin < 0 || einde < 0) throw new Error("Controleer de reviewhook opnieuw bij een engine-update");
  let stand: Stand | undefined, vorige: unknown[] | undefined, werk: Effect | undefined, opruimen: ReturnType<Effect>;
  const metingen = { canvas: 0, oorsprong: 0, afmetingen: 0, waarnemers: 0, losgemaakt: 0, luisteraars: 0, bereiken: [] as number[][] };
  const useState = (initieel: Stand) => {
    stand ??= initieel;
    return [stand, (nieuw: (oud: Stand) => Stand) => { stand = nieuw(stand!); }];
  };
  const useLayoutEffect = (fn: Effect, deps: unknown[]) => {
    if (!vorige || deps.some((waarde, i) => !Object.is(waarde, vorige![i])) || deps.length !== vorige.length) {
      werk = fn;
      vorige = deps;
    }
  };
  const venster = { addEventListener: () => { metingen.luisteraars++; }, removeEventListener: () => { metingen.luisteraars--; } };
  const host = { current: { ownerDocument: { defaultView: venster }, ...venster } };
  const oorsprong = { current: { getBoundingClientRect: () => { metingen.oorsprong++; return { left: 20, top: 30 }; } } };
  const queries = {
    pageCount: () => aantal,
    pageSize: () => { metingen.afmetingen++; return { width: 800, height: 1000 }; },
    rangeRects: (van: number, tot: number) => { metingen.bereiken.push([van, tot]); return [{ pageIndex: 1, x: 5, y: 6, width: 7, height: 8 }]; },
  };
  class Waarnemer {
    constructor(_fn: () => void) { metingen.waarnemers++; }
    observe() {}
    disconnect() { metingen.losgemaakt++; }
  }
  const maak = new Function("useState", "useLayoutEffect", "useMemo", "ResizeObserver", "canvasPageTops", "displayPageCanvas", "return (" + bron.slice(begin, einde) + ");");
  const hook = maak(useState, useLayoutEffect, (fn: () => unknown) => fn(), Waarnemer,
    () => Array.from({ length: aantal }, (_, i) => i * 1024),
    (_host: unknown, index: number) => ({ getBoundingClientRect: () => { metingen.canvas++; return { left: 100, top: 50 + index * 512, width: 400, height: 500 }; } }),
  ) as (q: typeof queries, h: typeof host, o: typeof oorsprong, items: Item[], zoom: number, epoch: number) => { pages: unknown[]; rects: Map<string, unknown>; zoom: number };
  function toon(items: Item[], zoom = 1, epoch = 0) {
    hook(queries, host, oorsprong, items, zoom, epoch);
    if (werk) {
      const fn = werk; werk = undefined;
      opruimen?.(); opruimen = fn();
    }
    return hook(queries, host, oorsprong, items, zoom, epoch);
  }
  return { toon, metingen, stop: () => opruimen?.() };
}

describe("paginameting voor opmerkingen en revisies", () => {
  it("meet geen van de 5.000 pagina’s als er niets voor deze overlay te tonen is", () => {
    const p = proef(5000);
    const stand = p.toon([]);
    expect(stand.pages).toEqual([]);
    expect(p.metingen.canvas).toBe(0);
    expect(p.metingen.afmetingen).toBe(0);
    expect(p.metingen.oorsprong).toBe(0);
    expect(p.metingen.waarnemers).toBe(0);
    p.stop();
  });

  it("behoudt pagina-, schaal- en bereikgeometrie zodra een revisie aanwezig is", () => {
    const p = proef();
    const stand = p.toon([{ id: "wijziging", review: { change: { from: 10, to: 20 } } }]);
    expect(stand.pages).toEqual([0, 1, 2].map(i => ({ page: { pageIndex: i }, bounds: { x: 160, y: 40 + i * 1024, width: 800, height: 1000 } })));
    expect(stand.zoom).toBe(0.5);
    expect(stand.rects.get("wijziging")).toEqual([{ pageIndex: 1, x: 5, y: 6, width: 7, height: 8 }]);
    expect(p.metingen.bereiken).toEqual([[10, 20]]);
    expect(p.metingen.canvas).toBe(3);
    p.stop();
    expect(p.metingen.luisteraars).toBe(0);
  });

  it("activeert ook een koptekstrevisie zonder nieuwe documentindeling en ruimt weer op", () => {
    const p = proef();
    p.toon([]);
    const aanwezig = p.toon([{ id: "kop", review: { change: { from: 2, to: 4, hfRid: "koptekst" } } }]);
    expect(aanwezig.pages).toHaveLength(3);
    expect(aanwezig.rects.size).toBe(0);
    expect(p.metingen.waarnemers).toBe(1);
    const leeg = p.toon([], 1.5);
    expect(leeg.pages).toEqual([]);
    expect(leeg.rects.size).toBe(0);
    expect(leeg.zoom).toBe(1.5);
    expect(p.metingen.losgemaakt).toBe(1);
    expect(p.metingen.luisteraars).toBe(0);
    const metingen = p.metingen.canvas;
    p.toon([], 1.5, 99);
    expect(p.metingen.canvas).toBe(metingen);
    p.stop();
  });

  it("vernieuwt revisiebereiken en negeert kop-/voettekstbereiken zoals voorheen", () => {
    const p = proef();
    p.toon([{ id: "wijziging", review: { change: { from: 10, to: 20 } } }]);
    const stand = p.toon([{ id: "wijziging", review: { change: { from: 12, to: 25 } } }, { id: "kop", review: { change: { from: 2, to: 4, hfRid: "koptekst" } } }]);
    expect(p.metingen.bereiken).toEqual([[10, 20], [12, 25]]);
    expect(stand.rects.has("kop")).toBe(false);
    p.stop();
  });
});
