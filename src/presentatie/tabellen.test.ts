import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  initWasm,
  openPresentation,
  type PresentationHandle,
} from "@betteroffice/pptx";
import { Pakket } from "../grafieken/pakket";
import { leesTabellen, schrijfTabel } from "./tabellen";
import {
  eigenaars,
  leesCelBereik,
  nieuwRooster,
  plakCellen,
  splitsCel,
  TabelFout,
  voegCellenSamen,
  wijzigRooster,
} from "./tabelrooster";
import { leesTabelKlembord, plakRooster } from "./tabellen-klembord";

beforeAll(async () =>
  initWasm(
    readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  ),
);
const handles: PresentationHandle[] = [];
afterEach(() => handles.splice(0).forEach((h) => h.dispose()));
const bron = () =>
  new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpvisie.pptx"));
function open(b: Uint8Array) {
  const h = openPresentation(b);
  h.registerFont({
    family: "Arial",
    bytes: readFileSync(
      "node_modules/@betteroffice/fonts/assets/LiberationSans-Regular.ttf",
    ),
  });
  handles.push(h);
  return h;
}
const tabel = () =>
  plakCellen(nieuwRooster(3, 3), 0, 0, [
    ["A", "B", "C"],
    ["D", "E", "F"],
    ["G", "H", "I"],
  ]);
describe("DrawingML-tabelrooster", () => {
  it("selecteert een celbereik met toetsenbordtekst, ook voorbij kolom Z", () => {
    expect(leesCelBereik("AA10:C1", 20, 30)).toEqual({
      r0: 0,
      c0: 2,
      r1: 9,
      c1: 26,
    });
    expect(() => leesCelBereik("A0:B2", 20, 30)).toThrow(TabelFout);
    expect(() => leesCelBereik("A1:AE2", 20, 30)).toThrow(TabelFout);
  });
  it("plakt TSV met quotes, lege cellen, Unicode en letterlijke formuletekst", () => {
    const t = leesTabelKlembord('Naam\tWaarde\n"A\nB"\t=1+2\n😀\t\n');
    expect(t.cellen.map((r) => r.map((c) => c.tekst))).toEqual([
      ["Naam", "Waarde"],
      ["A\nB", "=1+2"],
      ["😀", ""],
    ]);
  });
  it("vergroot het doel voor een geplakt rooster en behoudt samenvoegingen", () => {
    const source = voegCellenSamen(tabel(), { r0: 0, c0: 0, r1: 1, c1: 1 }),
      t = plakRooster(nieuwRooster(1, 1), 0, 0, source);
    expect(t.cellen.length).toBe(3);
    expect(t.breedtes.length).toBe(3);
    expect(t.cellen[0][0].tekst).toBe("A\nB\nD\nE");
    expect(t.cellen[0][0].rijSpan).toBe(2);
    eigenaars(t);
  });
  it("voegt een rechthoek samen zonder inhoud te verliezen en splitst vanaf een bedekte cel", () => {
    const t = tabel(),
      n = voegCellenSamen(t, { r0: 0, c0: 0, r1: 1, c1: 1 });
    expect(n.cellen[0][0].tekst).toBe("A\nB\nD\nE");
    expect(eigenaars(n)[1][1]).toEqual({ r: 0, c: 0 });
    expect(t.cellen[0][0].tekst).toBe("A");
    const s = splitsCel(n, 1, 1);
    expect(
      s.cellen
        .flat()
        .every((c) => !c.bedekt && c.rijSpan === 1 && c.kolomSpan === 1),
    ).toBe(true);
    expect(s.cellen[0][0].tekst).toBe("A\nB\nD\nE");
  });
  it("weigert gedeeltelijke merges en plakken op merges", () => {
    const n = voegCellenSamen(tabel(), { r0: 0, c0: 0, r1: 1, c1: 1 });
    expect(() => voegCellenSamen(n, { r0: 1, c0: 1, r1: 2, c1: 2 })).toThrow(
      "partialMerge",
    );
    expect(() => plakCellen(n, 0, 0, [["x"]])).toThrow("partialMerge");
  });
  it.each(["rij", "kolom"] as const)(
    "voegt een %s in een merge in en krimpt of verplaatst het anker bij verwijderen",
    (as) => {
      const t = voegCellenSamen(tabel(), { r0: 0, c0: 0, r1: 1, c1: 1 }),
        n = wijzigRooster(t, as, 1);
      expect(n.cellen[0][0][as === "rij" ? "rijSpan" : "kolomSpan"]).toBe(3);
      const s = wijzigRooster(n, as, 0, true);
      expect(s.cellen[0][0].tekst).toBe("A\nB\nD\nE");
      expect(s.cellen[0][0][as === "rij" ? "rijSpan" : "kolomSpan"]).toBe(2);
      eigenaars(s);
    },
  );
  it("houdt een geldig rooster bij een reeks rand-/binnenbewerkingen", () => {
    let t = voegCellenSamen(tabel(), { r0: 0, c0: 0, r1: 1, c1: 1 });
    for (const as of ["rij", "kolom"] as const)
      for (const index of [0, 1, 3]) {
        t = wijzigRooster(t, as, index);
        eigenaars(t);
      }
    for (const as of ["rij", "kolom"] as const)
      for (const index of [3, 1, 0]) {
        t = wijzigRooster(t, as, index, true);
        eigenaars(t);
      }
    expect(t.cellen.length).toBe(3);
    expect(t.breedtes.length).toBe(3);
    expect(t.cellen.flat().some((c) => c.tekst.includes("A"))).toBe(true);
  });
  it("beschermt de laatste rij/kolom en begrenst de grootte", () => {
    expect(() => nieuwRooster(0, 3)).toThrow(TabelFout);
    expect(() => nieuwRooster(201, 50)).toThrow(TabelFout);
    expect(() => wijzigRooster(nieuwRooster(1, 1), "rij", 0, true)).toThrow(
      TabelFout,
    );
    expect(() => wijzigRooster(nieuwRooster(200, 25), "kolom", 0)).toThrow(
      TabelFout,
    );
  });
});
describe("echte PPTX-tabellen", () => {
  it("voegt een tabel toe, rendert deze en bewaart tekst/stijl na engine-opslag", () => {
    const t = tabel();
    t.cellen[0][0].tekst = "A & <B> 😀\nNieuwe regel";
    t.cellen[0][0].stijl = {
      vulling: "#DDEEFF",
      rand: "#345678",
      randPunten: 2,
      uitlijning: "ctr",
      verticaal: "ctr",
      marge: 72000,
    };
    const b = schrijfTabel(bron(), 0, t),
      i = leesTabellen(b, 0);
    expect(i).toHaveLength(1);
    expect(i[0].cellen[0][0].tekst).toBe(t.cellen[0][0].tekst);
    const h = open(b);
    expect(h.layoutSlide(0).primitives.some((p) => p.kind === "table")).toBe(
      true,
    );
    const saved = h.save(),
      n = leesTabellen(saved, 0)[0];
    expect(n.cellen[0][0].tekst).toBe(t.cellen[0][0].tekst);
    expect(n.cellen[0][0].xml).toContain('val="DDEEFF"');
    expect(n.cellen[0][0].xml).toContain('marL="72000"');
    expect(
      open(saved)
        .layoutSlide(0)
        .primitives.some((p) => p.kind === "table"),
    ).toBe(true);
  });
  it("bewaart horizontale en verticale merges na native opslag en kan ze later splitsen", () => {
    const t = voegCellenSamen(tabel(), { r0: 0, c0: 0, r1: 1, c1: 1 });
    const b = schrijfTabel(bron(), 0, t),
      h = open(b),
      n = leesTabellen(h.save(), 0)[0];
    expect(n.cellen[0][0].rijSpan).toBe(2);
    expect(n.cellen[0][0].kolomSpan).toBe(2);
    expect(n.cellen[1][1].bedekt).toBe(true);
    const s = splitsCel(n, 1, 1),
      c = schrijfTabel(h.save(), 0, s, n.id);
    expect(
      leesTabellen(open(c).save(), 0)[0]
        .cellen.flat()
        .every((c) => !c.bedekt),
    ).toBe(true);
  });
  it("bewaart onbewerkte rijke tekst, onbekende celuitbreidingen en andere pakketdelen", () => {
    let b = schrijfTabel(bron(), 0, tabel()),
      p = new Pakket(b);
    const path = "ppt/slides/slide1.xml",
      xml = p.lees(path);
    p.schrijf(
      path,
      xml
        .replace('<a:rPr sz="1800"/>', '<a:rPr sz="1800" b="1" i="1"/>')
        .replace(
          "</a:tc>",
          '<a:extLst><a:ext uri="custom"><x:marker xmlns:x="urn:table-test">keep</x:marker></a:ext></a:extLst></a:tc>',
        ),
    );
    b = p.inpakken();
    const t = leesTabellen(b, 0)[0];
    const n = plakCellen(t, 2, 2, [["Veranderd"]]),
      c = schrijfTabel(b, 0, n, t.id),
      q = new Pakket(c);
    expect(q.lees(path)).toContain('b="1" i="1"');
    expect(q.lees(path)).toContain("urn:table-test");
    for (const part of p.namen().filter((n) => n !== path))
      expect(q.bytes(part)).toEqual(p.bytes(part));
    expect(leesTabellen(open(c).save(), 0)[0].cellen[2][2].tekst).toBe(
      "Veranderd",
    );
  });
  it("bewerkt rijen/kolommen in een bestaande tabel en behoudt merge-inhoud", () => {
    let b = schrijfTabel(
      bron(),
      0,
      voegCellenSamen(tabel(), { r0: 0, c0: 0, r1: 1, c1: 1 }),
    );
    const t = leesTabellen(b, 0)[0];
    const n = wijzigRooster(wijzigRooster(t, "rij", 1), "kolom", 0, true);
    b = schrijfTabel(b, 0, n, t.id);
    const s = leesTabellen(open(b).save(), 0)[0];
    expect(s.cellen.length).toBe(4);
    expect(s.breedtes.length).toBe(2);
    expect(s.cellen[0][0].tekst).toBe("A\nB\nD\nE");
    expect(s.cellen[0][0].rijSpan).toBe(3);
    expect(s.cellen[0][0].kolomSpan).toBe(1);
  });
  it("weigert ongeldige geometrie, stijl en ontbrekende tabel zonder bronmutatie", () => {
    const b = bron(),
      copy = b.slice(),
      t = tabel();
    t.breedtes[0] = 0;
    expect(() => schrijfTabel(b, 0, t)).toThrow(TabelFout);
    t.breedtes[0] = 100000;
    t.cellen[0][0].stijl = { vulling: "red" };
    expect(() => schrijfTabel(b, 0, t)).toThrow(TabelFout);
    expect(() => schrijfTabel(b, 0, tabel(), "missing")).toThrow(TabelFout);
    expect(b).toEqual(copy);
  });
});
