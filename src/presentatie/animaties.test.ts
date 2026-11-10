import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  animatieGroepen,
  leesAnimaties,
  nieuweAnimatie,
  schrijfAnimaties,
} from "./animaties";

const bron = () =>
  new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpvisie.pptx"));
const p3 = () =>
  new Uint8Array(
    readFileSync("docs/tests/documentmatrix-2026-11-06/bron/P3.pptx"),
  );
const vorm = 3;
describe("objectanimaties (#84)", () => {
  it.each([
    ['nodeType="clickEffect"', 'nodeType="customEffect"'],
    ['presetClass="entr"', 'presetClass="entr" repeatCount="2"'],
    ["style.visibility", "style.opacity"],
    ['presetClass="entr"', 'presetClass="entr" customFlag="1"'],
    ['dur="500"', 'dur="9999999"'],
  ])(
    "behoudt niet-ondersteunde timingvariant %s zonder herschrijven",
    (van, naar) => {
      const delen = unzipSync(p3());
      delen["ppt/slides/slide1.xml"] = strToU8(
        strFromU8(delen["ppt/slides/slide1.xml"]).replace(van, naar),
      );
      const bytes = zipSync(delen),
        model = leesAnimaties(bytes, 0);
      expect(model.alleenLezen).toBe(true);
      expect(schrijfAnimaties(bytes, 0, model.lijst)).toBe(bytes);
      expect(() => schrijfAnimaties(bytes, 0, [])).toThrow("unsupportedTiming");
    },
  );
  it("leest de bestaande P3-ingangsanimatie en bewaart een ongewijzigd pakket exact", () => {
    const bytes = p3(),
      r = leesAnimaties(bytes, 0);
    expect(r.alleenLezen).toBe(false);
    expect(r.lijst).toHaveLength(1);
    expect(r.lijst[0]).toMatchObject({
      vorm: 3,
      effect: "fadeIn",
      start: "click",
      duur: 500,
      vertraging: 0,
      alinea: null,
    });
    expect(schrijfAnimaties(bytes, 0, r.lijst)).toBe(bytes);
  });
  it.each(["fadeIn", "fadeOut", "spin", "move"] as const)(
    "schrijft en leest %s zonder andere pakketdelen te wijzigen",
    (effect) => {
      const bytes = bron(),
        a = {
          ...nieuweAnimatie(vorm),
          effect,
          duur: 1250,
          vertraging: 300,
          dx: 0.12,
          dy: -0.25,
          hoek: -180,
        };
      const na = schrijfAnimaties(bytes, 0, [a]),
        r = leesAnimaties(na, 0);
      expect(r.alleenLezen).toBe(false);
      expect(r.lijst[0]).toMatchObject({
        effect,
        vorm,
        duur: 1250,
        vertraging: 300,
        start: "click",
      });
      if (effect === "move")
        expect(r.lijst[0]).toMatchObject({ dx: 0.12, dy: -0.25 });
      if (effect === "spin") expect(r.lijst[0].hoek).toBe(-180);
      const voor = unzipSync(bytes),
        naDelen = unzipSync(na);
      for (const [pad, b] of Object.entries(voor))
        if (pad !== "ppt/slides/slide1.xml")
          expect(naDelen[pad], pad).toEqual(b);
    },
  );
  it("berekent klik-, samen- en na-vorige-timing en leest die weer terug", () => {
    const a = nieuweAnimatie(vorm);
    const lijst = [
      { ...a, start: "with" as const, duur: 200, vertraging: 100 },
      { ...a, id: "b", start: "after" as const, duur: 300, vertraging: 50 },
      { ...a, id: "c", start: "click" as const, vertraging: 20 },
      { ...a, id: "d", start: "with" as const, vertraging: 40 },
    ];
    expect(
      animatieGroepen(lijst).map((a) => [a.groep, a.begin, a.eind]),
    ).toEqual([
      [-1, 100, 300],
      [-1, 350, 650],
      [0, 20, 520],
      [0, 60, 560],
    ]);
    const terug = leesAnimaties(schrijfAnimaties(bron(), 0, lijst), 0);
    expect(terug.alleenLezen).toBe(false);
    expect(
      terug.lijst.map(({ start, duur, vertraging }) => ({
        start,
        duur,
        vertraging,
      })),
    ).toEqual(
      lijst.map(({ start, duur, vertraging }) => ({ start, duur, vertraging })),
    );
  });
  it("bewaart een alineadoel en verwijdert alleen de timing bij leegmaken", () => {
    const bytes = bron(),
      a = { ...nieuweAnimatie(vorm), alinea: [0, 1] as [number, number] };
    const na = schrijfAnimaties(bytes, 0, [a]);
    expect(leesAnimaties(na, 0).lijst[0].alinea).toEqual([0, 1]);
    expect(
      strFromU8(
        unzipSync(schrijfAnimaties(na, 0, []))["ppt/slides/slide1.xml"],
      ),
    ).toBe(strFromU8(unzipSync(bytes)["ppt/slides/slide1.xml"]));
  });
  it("houdt onbekende effecten en uitbreidingen onaangeroerd en weigert ze te herschrijven", () => {
    const delen = unzipSync(p3());
    delen["ppt/slides/slide1.xml"] = strToU8(
      strFromU8(delen["ppt/slides/slide1.xml"]).replace(
        'filter="fade"',
        'filter="wheel(8)"',
      ),
    );
    const bytes = zipSync(delen),
      r = leesAnimaties(bytes, 0);
    expect(r.alleenLezen).toBe(true);
    expect(r.onbekend).toBeGreaterThan(0);
    expect(schrijfAnimaties(bytes, 0, r.lijst)).toBe(bytes);
    expect(() => schrijfAnimaties(bytes, 0, [])).toThrow("unsupportedTiming");
  });
  it.each([-1, 60001, NaN])("weigert ongeldige duur %s", (duur) =>
    expect(() =>
      schrijfAnimaties(bron(), 0, [{ ...nieuweAnimatie(vorm), duur }]),
    ).toThrow(),
  );
  it("weigert een niet-bestaand object en een ongeldige dia", () => {
    expect(() =>
      schrijfAnimaties(bron(), 0, [nieuweAnimatie(999999)]),
    ).toThrow();
    expect(() => leesAnimaties(bron(), 99)).toThrow();
  });
  it("bewaart alle vier gedragingen en alineadoelen door de werkelijke engine", async () => {
    const pptx = await import("@betteroffice/pptx");
    await pptx.initWasm(
      readFileSync(
        "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
      ),
    );
    const lijst = ["fadeIn", "spin", "move", "fadeOut"].map((effect, i) => ({
      ...nieuweAnimatie(vorm),
      effect: effect as "fadeIn",
      start: i ? ("after" as const) : ("click" as const),
    }));
    const bytes = schrijfAnimaties(bron(), 0, lijst),
      doc = pptx.openPresentation(bytes),
      save = doc.save();
    expect(leesAnimaties(save, 0)).toEqual(leesAnimaties(bytes, 0));
    expect(pptx.openPresentation(save).snapshot().slides).toEqual(
      doc.snapshot().slides,
    );
  });
});
