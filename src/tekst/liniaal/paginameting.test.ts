import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { meetLiniaal, paginaBeelden, paginaInBeeld, type IndelingPagina, type Vak } from "./geometrie";

afterEach(() => vi.unstubAllGlobals());

function proef(aantal: number, zoom = 1, eigenKolom = true) {
  const kolom = { classList: { contains: (naam: string) => eigenKolom && naam === "canvas-pages__column" } };
  vi.stubGlobal("getComputedStyle", () => ({ display: "flex", flexDirection: "column" }));
  let metingen = 0, top = 0;
  const paginas: IndelingPagina[] = [];
  const vakken = Array.from({ length: aantal }, (_, index) => {
    const hoogte = 500 + (index % 5) * 40;
    paginas.push({ size: { w: 800, h: hoogte }, margins: { left: 40, right: 40, top: 30, bottom: 30 }, fragments: [] });
    const r = { left: 100, top, width: 800 * zoom, height: hoogte * zoom };
    top += r.height + 24;
    return r;
  });
  const elementen = vakken.map((vak, index) => ({
    dataset: { pageIndex: String(index) }, parentElement: kolom,
    getBoundingClientRect: () => { metingen++; return { ...vak, bottom: vak.top + vak.height }; },
  }));
  let venster: Vak = { left: 0, top: 0, width: 1200, height: 700 };
  const vlak = {
    querySelectorAll: () => elementen,
    querySelector: (selector: string) => selector === ".docx-editor__scroll-container"
      ? { getBoundingClientRect: () => ({ ...venster, bottom: venster.top + venster.height }) }
      : null,
  } as unknown as Element;
  return { paginas, vakken, vlak, metingen: () => metingen, wis: () => { metingen = 0; }, venster: (v: Vak) => { venster = v; } };
}

describe("paginameting voor de liniaal", () => {
  it("meet bij een nog onbekende cursorpagina niet alle 5.000 pagina’s", () => {
    const p = proef(5000);
    p.venster({ left: 0, top: p.vakken.at(-1)!.top, width: 1200, height: 600 });
    const ref = {
      getDocument: () => null,
      getEditorRef: () => ({
        getLayout: () => ({ pages: p.paginas }),
        getYrsSession: () => ({ selection: () => ({ head: { story: "body", paraId: "p", offset: 1 } }) }),
        yrsLocToDisplayPosition: () => 999999,
      }),
    } as unknown as DocxEditorRef;
    const stand = meetLiniaal(ref, p.vlak, null);
    expect(stand?.pagina.index).toBe(4999);
    expect(stand?.kolommen).toEqual([{ links: 40, breedte: 720 }]);
    expect(p.metingen()).toBeLessThan(40);
  });

  it("kiest dezelfde pagina en schaal bij grenzen, gaten, zoom en verschillende hoogtes", () => {
    for (const zoom of [0.75, 1, 1.5]) {
      const p = proef(80, zoom);
      for (const index of [0, 1, 39, 79]) {
        const vak = p.vakken[index];
        for (const top of [vak.top - 1, vak.top, vak.top + vak.height, vak.top + vak.height + 0.5, vak.top + vak.height + 2])
          for (const height of [0, 400, 3000]) {
            const venster = { left: 0, top, width: 1200, height };
            const volledig = paginaInBeeld(paginaBeelden(p.vlak, p.paginas), venster);
            const begrensd = paginaInBeeld(paginaBeelden(p.vlak, p.paginas, venster), venster);
            expect(begrensd).toEqual(volledig);
          }
      }
    }
  });

  it("leest opnieuw na scrollen en een veranderde paginameting", () => {
    const p = proef(100);
    const venster = { left: 0, top: 0, width: 1200, height: 400 };
    expect(paginaInBeeld(paginaBeelden(p.vlak, p.paginas, venster), venster)?.index).toBe(0);
    const verschuiving = p.vakken[90].top;
    for (const vak of p.vakken) vak.top -= verschuiving;
    p.vakken[90].left = 250;
    p.vakken[90].width = 1200;
    const nieuw = paginaInBeeld(paginaBeelden(p.vlak, p.paginas, venster), venster);
    expect(nieuw?.index).toBe(90);
    expect(nieuw?.rect.left).toBe(250);
    expect(nieuw?.schaal).toBe(1.5);
  });

  it("behoudt de algemene route voor een onbekende paginavolgorde", () => {
    const p = proef(80, 1, false);
    const boven = p.vakken.map((vak) => vak.top).reverse();
    p.vakken.forEach((vak, index) => { vak.top = boven[index]; });
    const venster = { left: 0, top: 10, width: 1200, height: 500 };
    const volledig = paginaInBeeld(paginaBeelden(p.vlak, p.paginas), venster);
    p.wis();
    expect(paginaInBeeld(paginaBeelden(p.vlak, p.paginas, venster), venster)).toEqual(volledig);
    expect(p.metingen()).toBe(80);
  });
});
