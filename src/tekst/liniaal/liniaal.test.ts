import { describe, expect, it } from "vitest";
import {
  MIN_KOLOM,
  MIN_TEKSTBREEDTE,
  directeTabs,
  inspringingUitBlok,
  inspringingWijziging,
  rondOp,
  sleepInspringing,
  sleepKolomrand,
  sleepRijhoogte,
  standaardTabs,
  strepen,
  tabToevoegen,
  tabVerplaatsen,
  tabVerwijderen,
  tabsUitBlok,
  tabsWijziging,
  volgendeTabSoort,
} from "./model";
import { celGrenzen, celIn, paginaMetPositie, rasterVan, tekstkolommen, type IndelingPagina } from "./geometrie";
import { effectieveEigenschappen, formulierUit, wijzigingUit } from "../alinea/model";

describe("opgeloste alinea-indeling", () => {
  it("leest inspringing in pixels als twips", () => {
    expect(inspringingUitBlok({ indent: { left: 75.6, hanging: 37.8 } })).toEqual({ links: 1134, rechts: 0, eerste: -567 });
    expect(inspringingUitBlok({ indent: { firstLine: 47.266666 } })).toEqual({ links: 0, rechts: 0, eerste: 709 });
    expect(inspringingUitBlok(undefined)).toEqual({ links: 0, rechts: 0, eerste: 0 });
  });
  it("leest tabs van de engine (start/end) als links/rechts", () => {
    expect(
      tabsUitBlok({
        tabs: [
          { val: "end", pos: 9026, leader: "dot" },
          { val: "start", pos: 1701 },
          { val: "center", pos: 4536, leader: "none" },
        ],
      }),
    ).toEqual([
      { positie: 1701, soort: "left", opvul: undefined },
      { positie: 4536, soort: "center", opvul: undefined },
      { positie: 9026, soort: "right", opvul: "dot" },
    ]);
  });
  it("leest directe tabs in beide vormen", () => {
    expect(directeTabs({ tabs: [{ position: 100, alignment: "left" }, { pos: 200, val: "right", leader: "dot" }] })).toEqual([
      { position: 100, alignment: "left" },
      { position: 200, alignment: "right", leader: "dot" },
    ]);
  });
});

describe("tabstops op de liniaal", () => {
  const tabs = [
    { position: 1701, alignment: "left" as const },
    { position: 4536, alignment: "center" as const },
  ];
  it("voegt toe en vervangt een tab op dezelfde plek", () => {
    expect(tabToevoegen(tabs, 3000, "right").map((t) => t.position)).toEqual([1701, 3000, 4536]);
    expect(tabToevoegen(tabs, 1702, "decimal")).toEqual([
      { position: 1702, alignment: "decimal" },
      { position: 4536, alignment: "center" },
    ]);
  });
  it("verwijdert een directe tab, en wist een stijltab met clear", () => {
    expect(tabVerwijderen(tabs, 1701, false)).toEqual([{ position: 4536, alignment: "center" }]);
    expect(tabVerwijderen([], 2000, true)).toEqual([{ position: 2000, alignment: "clear" }]);
  });
  it("verplaatst met soort en opvulteken", () => {
    expect(tabVerplaatsen(tabs, 1701, 2268, { positie: 1701, soort: "left", opvul: "dot" }, false)).toEqual([
      { position: 2268, alignment: "left", leader: "dot" },
      { position: 4536, alignment: "center" },
    ]);
  });
  it("geen tabs over = wissen", () => {
    expect(tabsWijziging([])).toEqual({ tabs: null });
  });
  it("standaardtabs na de laatste eigen tab", () => {
    expect(standaardTabs([{ positie: 1000, soort: "left" }], { links: 0, rechts: 0, eerste: 0 }, 3000, 720)).toEqual([1440, 2160, 2880]);
    expect(standaardTabs([], { links: 0, rechts: 0, eerste: 0 }, 3000, 0)).toEqual([]);
  });
  it("tabsoortknop gaat rond", () => {
    expect(volgendeTabSoort("left")).toBe("center");
    expect(volgendeTabSoort("bar")).toBe("left");
  });
});

describe("inspringmarkeringen slepen", () => {
  const oud = { links: 1134, rechts: 0, eerste: -567 };
  const breedte = 9026;
  it("eerste regel verschuift alleen de eerste regel", () => {
    expect(sleepInspringing("eerste", 1701, oud, breedte, 1440)).toEqual({ links: 1134, rechts: 0, eerste: 567 });
  });
  it("verkeerd om laat de eerste regel staan", () => {
    expect(sleepInspringing("verkeerd", 1701, oud, breedte, 1440)).toEqual({ links: 1701, rechts: 0, eerste: -1134 });
  });
  it("het blokje verschuift beide", () => {
    expect(sleepInspringing("links", 567, oud, breedte, 1440)).toEqual({ links: 567, rechts: 0, eerste: -567 });
  });
  it("rechts rekent vanaf de rechterkant", () => {
    expect(sleepInspringing("rechts", 8000, oud, breedte, 1440)).toEqual({ ...oud, rechts: 1026 });
  });
  it("houdt een minimale tekstbreedte en niet voorbij de paginarand", () => {
    expect(sleepInspringing("links", 99999, { links: 0, rechts: 0, eerste: 0 }, breedte, 1440).links).toBe(breedte - MIN_TEKSTBREEDTE);
    expect(sleepInspringing("eerste", -5000, { links: 0, rechts: 0, eerste: 0 }, breedte, 1440).eerste).toBe(-1440);
  });
  it("geeft alleen gewijzigde velden", () => {
    expect(inspringingWijziging(oud, { ...oud, links: 1701 })).toEqual({ indentLeft: 1701 });
    expect(inspringingWijziging(oud, { ...oud, eerste: 0 })).toEqual({ indentFirstLine: null, hangingIndent: null });
    expect(inspringingWijziging(oud, { ...oud, eerste: 284 })).toEqual({ indentFirstLine: 284, hangingIndent: false });
    expect(inspringingWijziging(oud, { ...oud, links: 0 })).toEqual({ indentLeft: null });
  });
});

describe("liniaalschaal", () => {
  it("cijfers bij hele cm, zonder teken, links van nul ook", () => {
    const s = strepen(-567, 1134);
    expect(s.filter((x) => x.soort === "cijfer").map((x) => x.cijfer)).toEqual([1, 1, 2]);
    expect(s.some((x) => x.positie === 0)).toBe(false);
    expect(s.filter((x) => x.soort === "half")).toHaveLength(3);
  });
  it("rondOp", () => {
    expect(rondOp(1000, 141.73)).toBeCloseTo(992.1, 1);
  });
});

describe("tabelranden slepen", () => {
  it("binnenrand verdeelt tussen de buren", () => {
    expect(sleepKolomrand([2000, 3000, 4026], 0, 551)).toEqual([2551, 2449, 4026]);
  });
  it("met Shift of aan de buitenrand verandert alleen die kolom", () => {
    expect(sleepKolomrand([2000, 3000], 0, 500, true)).toEqual([2500, 3000]);
    expect(sleepKolomrand([2000, 3000], 1, -500)).toEqual([2000, 2500]);
  });
  it("houdt een minimale kolombreedte", () => {
    expect(sleepKolomrand([2000, 3000], 0, 99999)).toEqual([5000 - MIN_KOLOM, MIN_KOLOM]);
    expect(sleepKolomrand([2000, 3000], 0, -99999)).toEqual([MIN_KOLOM, 5000 - MIN_KOLOM]);
  });
  it("rijhoogte op het raster, minimaal", () => {
    expect(sleepRijhoogte(400, 567, 56.7)).toBe(964);
    expect(sleepRijhoogte(400, -9999, 56.7)).toBe(57);
  });
});

describe("tabelgeometrie", () => {
  const payload = {
    grid: [1000, 2000, 3000],
    rows: [
      { cells: [{ story: "a", tcPr: { colspan: 2 } }, { story: "b" }] },
      { trPr: { gridBefore: 1 }, cells: [{ story: "c" }, { story: "d" }] },
    ],
  };
  it("rij en rasterkolom van een cel, met samengevoegde cellen", () => {
    expect(celIn(payload, "b")).toEqual({ rij: 0, kolom: 2, span: 1 });
    expect(celIn(payload, "c")).toEqual({ rij: 1, kolom: 1, span: 1 });
    expect(celIn(payload, "x")).toBeNull();
  });
  it("celgrenzen per rij", () => {
    expect(celGrenzen(payload, 0)).toEqual([0, 2, 3]);
    expect(celGrenzen(payload, 1)).toEqual([1, 2, 3]);
  });
  it("raster, of gelijk verdeeld zonder raster", () => {
    expect(rasterVan(payload)).toEqual([1000, 2000, 3000]);
    expect(rasterVan({ rows: [{ cells: [{ story: "a" }, { story: "b" }] }] })).toEqual([2000, 2000]);
  });
});

describe("pagina's en kolommen", () => {
  const pagina = (columns?: IndelingPagina["columns"]): IndelingPagina => ({
    size: { w: 800, h: 1000 },
    margins: { top: 100, right: 100, bottom: 100, left: 100 },
    columns,
    fragments: [{ kind: "paragraph", x: 100, y: 100, width: 600, pmStart: 10, pmEnd: 20 }],
  });
  it("één tekstkolom zonder kolommen", () => {
    expect(tekstkolommen(pagina())).toEqual([{ links: 100, breedte: 600 }]);
  });
  it("gelijke kolommen met tussenruimte", () => {
    expect(tekstkolommen(pagina({ count: 2, gap: 40 }))).toEqual([
      { links: 100, breedte: 280 },
      { links: 420, breedte: 280 },
    ]);
  });
  it("de pagina met een weergavepositie", () => {
    expect(paginaMetPositie([pagina(), pagina()], 15)).toBe(0);
    expect(paginaMetPositie([pagina()], 50)).toBe(-1);
    expect(paginaMetPositie([pagina()], null)).toBe(-1);
  });
});

describe("alineavenster met geërfde opmaak", () => {
  it("toont de inspringing en tabs uit de stijl", () => {
    const p = effectieveEigenschappen({}, { indent: { left: 48, hanging: 24 }, tabs: [{ val: "start", pos: 1440 }], spacing: { after: 10.6667, line: 1.15, lineUnit: "multiplier" } });
    const f = formulierUit(p);
    expect(f.links).toBeCloseTo(1.27, 2);
    expect(f.speciaal).toBe("verkeerd");
    expect(f.na).toBe(8);
    expect(f.regel).toEqual({ soort: "meerdere", regels: 1.15 });
    expect(f.tabs).toEqual([{ cm: 2.54, uitlijning: "left", opvul: "none" }]);
    expect(f.stijlTabs).toEqual([1440]);
  });
  it("directe opmaak gaat voor", () => {
    const p = effectieveEigenschappen({ indentLeft: 567 }, { indent: { left: 96 } });
    expect(formulierUit(p).links).toBe(1);
  });
  it("een weggehaalde stijltab wordt gewist met clear", () => {
    const f = formulierUit(effectieveEigenschappen({}, { tabs: [{ val: "start", pos: 1440 }, { val: "end", pos: 5000 }] }));
    const w = wijzigingUit(f, { ...f, tabs: f.tabs.filter((t) => t.uitlijning === "left") });
    expect(w.tabs).toEqual([
      { position: 1440, alignment: "left" },
      { position: 5000, alignment: "clear" },
    ]);
  });
  it("niets gewijzigd = niets geschreven", () => {
    const f = formulierUit(effectieveEigenschappen({}, { indent: { left: 48 }, tabs: [{ val: "start", pos: 1440 }] }));
    expect(wijzigingUit(f, { ...f })).toEqual({});
  });
});
