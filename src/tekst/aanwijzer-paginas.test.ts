/** Pagina-aanwijzen blijft exact, ook met duizenden onzichtbare paginaboxen. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Vak = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};
type Punt = { pageIndex: number; x: number; y: number } | null;
const bron = readFileSync(
  new URL(
    "../../node_modules/@betteroffice/docx/dist/chunk-AOWJ4WDE.mjs",
    import.meta.url,
  ),
  "utf8",
);
const code = bron.slice(bron.indexOf(";") + 1, bron.lastIndexOf("export{"));
if (!code.includes("function N("))
  throw new Error("Controleer de aanwijzeradapter bij een engine-update.");
const zoek = new Function("b", `${code};return N;`)(
  (o: Record<string, unknown>, k: string, v: unknown) => {
    o[k] = v;
  },
);

function paginas(aantal: number, schaal = 1): Vak[] {
  let boven = 100;
  return Array.from({ length: aantal }, (_, i) => {
    const width = (i % 3 === 0 ? 600 : 400) * schaal,
      height = (500 + (i % 7) * 30) * schaal;
    const left = 500 - width / 2,
      top = boven;
    boven += height + 24 * schaal;
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    };
  });
}

function proef(vakken: Vak[], eigenHost = true, ontbreekt = -1, leeg = -1) {
  let metingen = 0;
  const canvassen = vakken.flatMap((r, i) =>
    i === ontbreekt
      ? []
      : [
          {
            dataset: { pageIndex: String(i) },
            getBoundingClientRect: () => {
              metingen++;
              return i === leeg ? { ...r, width: 0 } : r;
            },
          },
        ],
  );
  const host = {
    classList: {
      contains: (naam: string) => eigenHost && naam === "canvas-pages",
    },
    querySelectorAll: () => canvassen,
    querySelector: (selector: string) => {
      if (selector === ".canvas-pages__column")
        return { style: { display: "flex", flexDirection: "column" } };
      const i = Number(/page-index="(\d+)"/.exec(selector)?.[1]);
      if (!Number.isSafeInteger(i) || !vakken[i]) return null;
      return selector.startsWith("canvas")
        ? (canvassen.find((c) => c.dataset.pageIndex === String(i)) ?? null)
        : {
            getBoundingClientRect: () => {
              metingen++;
              return vakken[i];
            },
          };
    },
  };
  const queries = {
    pageCount: () => vakken.length,
    pageSize: (i: number) => ({
      width: vakken[i].width * 2,
      height: vakken[i].height * 2,
    }),
    hitTestRegions: () => null,
  };
  return {
    zoek: (x: number, y: number, klem = false): Punt =>
      zoek(host, queries, x, y, { clampToNearestPage: klem }),
    get metingen() {
      return metingen;
    },
  };
}

/** Onafhankelijke volledige vergelijking met het gepubliceerde afstandscriterium. */
function verwacht(
  vakken: Vak[],
  x: number,
  y: number,
  klem: boolean,
): number | null {
  let beste: number | null = null,
    afstand = Infinity;
  for (let i = 0; i < vakken.length; i++) {
    const r = vakken[i];
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    const dy = y < r.top ? r.top - y : Math.max(0, y - r.bottom);
    const dx = x < r.left ? r.left - x : Math.max(0, x - r.right);
    if (dy * 4 + dx < afstand) {
      afstand = dy * 4 + dx;
      beste = i;
    }
  }
  return klem ? beste : null;
}

describe("aanwijzen in een lange verticale paginastapel", () => {
  it("vindt de laatste van 5.000 pagina’s zonder alle schermboxen te meten", () => {
    const vakken = paginas(5000),
      p = proef(vakken),
      r = vakken[4999];
    expect(p.zoek(r.left + 40, r.top + 50)).toMatchObject({
      pageIndex: 4999,
      x: 80,
      y: 100,
    });
    expect(p.metingen).toBeLessThan(30);
  });
  it("behoudt de dichtstbijzijnde pagina bij wisselende afmetingen, gaten en randen", () => {
    const vakken = paginas(200);
    for (const x of [-200, 80, 300, 500, 1000])
      for (const i of [0, 1, 10, 99, 199])
        for (const y of [
          vakken[i].top - 1,
          vakken[i].top,
          vakken[i].top + 80,
          vakken[i].bottom,
          vakken[i].bottom + 12,
        ])
          for (const klem of [false, true])
            expect(proef(vakken).zoek(x, y, klem)?.pageIndex ?? null).toBe(
              verwacht(vakken, x, y, klem),
            );
  });
  it("behoudt de eerste pagina bij een gedeelde grens en gelijke afstanden", () => {
    const vakken = paginas(30);
    const hoogte = vakken[1].height;
    vakken[1] = {
      ...vakken[1],
      top: vakken[0].bottom,
      bottom: vakken[0].bottom + hoogte,
    };
    expect(proef(vakken).zoek(500, vakken[0].bottom)?.pageIndex).toBe(0);
  });
  it("rekent kleine en grote zoom correct terug naar documentcoördinaten", () => {
    for (const schaal of [0.5, 2]) {
      const vakken = paginas(100, schaal),
        r = vakken[80];
      expect(proef(vakken).zoek(r.left + 30, r.top + 40)).toMatchObject({
        pageIndex: 80,
        x: 60,
        y: 80,
      });
    }
  });
  it("houdt de algemene zoekroute voor een andere paginavolgorde van een eigen host", () => {
    const vakken = paginas(30).reverse(),
      r = vakken[24];
    expect(proef(vakken, false).zoek(r.left + 1, r.top + 1)?.pageIndex).toBe(
      24,
    );
  });
  it("valt terug bij onvolledige registratie of een canvas zonder maat", () => {
    const vakken = paginas(100),
      r = vakken[80];
    expect(proef(vakken, true, 80).zoek(r.left + 1, r.top + 1)?.pageIndex).toBe(
      80,
    );
    expect(
      proef(vakken, true, -1, 80).zoek(r.left + 1, r.top + 1)?.pageIndex,
    ).toBe(80);
  });
  it("laat een punt naast de pagina’s zonder vastklemmen buiten het document", () => {
    const vakken = paginas(100);
    expect(proef(vakken).zoek(-500, vakken[90].top + 40)).toBeNull();
    expect(proef(vakken).zoek(-500, vakken[90].top + 40, true)?.pageIndex).toBe(
      90,
    );
  });
});
