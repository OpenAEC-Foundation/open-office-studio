import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  initWasm,
  openPresentation,
  type PresentationHandle,
} from "@betteroffice/pptx";
import { Pakket } from "../grafieken/pakket";
import { attr, kind, leesXml, zoekAlle } from "../grafieken/xml";
import {
  dupliceerLayout,
  dupliceerMaster,
  hernoemOntwerp,
  leesOntwerp,
  OntwerpFout,
  pasLayoutToe,
  pasThemaToe,
  schrijfAchtergrond,
  THEMAS,
  valideerThema,
  verwijderLayout,
} from "./ontwerp";

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
function open(bytes: Uint8Array) {
  const h = openPresentation(bytes);
  handles.push(h);
  return h;
}
function relatiesGeldig(bytes: Uint8Array) {
  const p = new Pakket(bytes);
  for (const pad of p.namen().filter((n) => !n.endsWith(".rels")))
    for (const r of p.relaties(pad).filter((r) => !r.extern))
      expect(
        p.heeft(Pakket.doelPad(pad, r.target)),
        `${pad} → ${r.target}`,
      ).toBe(true);
}
describe("PPTX diamodellen, indelingen en thema's", () => {
  it("maakt een onafhankelijk tweede diamodel met alle indelingen en unieke IDs", () => {
    const bytes = bron(),
      i = leesOntwerp(bytes);
    const b = dupliceerMaster(bytes, i.masters[0].pad, "Tweede master"),
      n = leesOntwerp(b);
    expect(n.masters.length).toBe(i.masters.length + 1);
    const p = new Pakket(b);
    const allIds = [
      ...zoekAlle(leesXml(p.lees("ppt/presentation.xml")), "sldMasterId"),
      ...n.masters.flatMap((m) =>
        zoekAlle(leesXml(p.lees(m.pad)), "sldLayoutId"),
      ),
    ].map((e) => attr(e, "id"));
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(n.dias).toEqual(i.dias);
    const m = n.masters.find((m) => m.naam === "Tweede master")!;
    expect(n.layouts.filter((l) => l.master === m.pad).length).toBe(
      i.layouts.filter((l) => l.master === i.masters[0].pad).length,
    );
    relatiesGeldig(b);
    expect(
      leesOntwerp(open(b).save()).masters.some(
        (m) => m.naam === "Tweede master",
      ),
    ).toBe(true);
  });
  it("leest echte master/layoutrelaties en gebruik in diavolgorde", () => {
    const i = leesOntwerp(bron());
    expect(i.dias.length).toBeGreaterThan(1);
    expect(i.masters.length).toBeGreaterThan(0);
    expect(i.layouts.length).toBeGreaterThan(1);
    expect(i.layouts.reduce((n, l) => n + l.gebruikt, 0)).toBe(i.dias.length);
  });
  it("dupliceert een indeling met eigen relaties en escaped naam, zonder dia's te wijzigen", () => {
    const bytes = bron(),
      a = leesOntwerp(bytes),
      b = dupliceerLayout(bytes, a.layouts[0].pad, 'A & B "nieuw"');
    const i = leesOntwerp(b),
      nieuw = i.layouts.find((l) => l.naam === 'A & B "nieuw"')!;
    expect(i.layouts.length).toBe(a.layouts.length + 1);
    expect(nieuw.gebruikt).toBe(0);
    const p = new Pakket(b),
      oud = new Pakket(bytes);
    a.dias.forEach((d) => expect(p.lees(d.pad)).toBe(oud.lees(d.pad)));
    relatiesGeldig(b);
    const h = open(b);
    expect(h.snapshot().slides.length).toBe(a.dias.length);
    expect(
      leesOntwerp(h.save()).layouts.some((l) => l.naam === 'A & B "nieuw"'),
    ).toBe(true);
  });
  it("hernoemt masters en indelingen zonder de inhoud te herschrijven", () => {
    const b = bron(),
      i = leesOntwerp(b),
      pad = i.masters[0].pad;
    const n = hernoemOntwerp(b, pad, "Organisatie");
    expect(leesOntwerp(n).masters[0].naam).toBe("Organisatie");
    const p = new Pakket(n),
      o = new Pakket(b);
    i.layouts.forEach((l) => expect(p.lees(l.pad)).toBe(o.lees(l.pad)));
    expect(() => hernoemOntwerp(b, pad, "  ")).toThrow(OntwerpFout);
  });
  it("verwijdert een ongebruikte kopie, houdt gedeelde media en weigert gebruikte indelingen", () => {
    const bytes = bron(),
      i = leesOntwerp(bytes);
    const b = dupliceerLayout(bytes, i.layouts[0].pad, "Tijdelijk"),
      pad = leesOntwerp(b).layouts.find((l) => l.naam === "Tijdelijk")!.pad;
    const c = verwijderLayout(b, pad);
    expect(leesOntwerp(c).layouts.length).toBe(i.layouts.length);
    expect(new Pakket(c).heeft(pad)).toBe(false);
    relatiesGeldig(c);
    expect(() =>
      verwijderLayout(bytes, i.layouts.find((l) => l.gebruikt)!.pad),
    ).toThrow("inUse");
  });
  it("past een indeling gericht toe en behoudt alle tekst, notities en gewone objecten", () => {
    const bytes = bron(),
      i = leesOntwerp(bytes),
      layout = i.layouts.find((l) => l.pad !== i.dias[0].layout)!;
    const b = pasLayoutToe(bytes, [0], layout.pad);
    const n = leesOntwerp(b);
    expect(n.dias[0].layout).toBe(layout.pad);
    expect(n.dias.slice(1)).toEqual(i.dias.slice(1));
    const p = new Pakket(b),
      o = new Pakket(bytes);
    i.dias.forEach((d) => expect(p.lees(d.pad)).toBe(o.lees(d.pad)));
    relatiesGeldig(b);
  });
  it("herstelt alleen placeholdergeometrie; tekst en eigen vormen blijven behouden", () => {
    const h = open(new Uint8Array(readFileSync("public/templates/nieuw.pptx"))),
      slide = h.snapshot().slides[0];
    const shape = slide.shapes.find((s) => s.textStories.length)!;
    h.setShapeRect(slide.id, shape.id, {
      x: 100,
      y: 200,
      width: 300,
      height: 400,
    });
    h.addShape(slide.id, {
      name: "Eigen vorm",
      geometry: "rect",
      rect: { x: 500, y: 600, width: 700, height: 800 },
    });
    const b = h.save(),
      i = leesOntwerp(b),
      p = new Pakket(b),
      old = p.lees(i.dias[0].pad);
    const c = pasLayoutToe(b, [0], i.dias[0].layout, true),
      root = leesXml(new Pakket(c).lees(i.dias[0].pad));
    const placeholders = zoekAlle(root, "sp").filter((s) =>
      kind(kind(kind(s, "nvSpPr"), "nvPr"), "ph"),
    );
    expect(placeholders.length).toBeGreaterThan(0);
    placeholders.forEach((s) =>
      expect(kind(kind(s, "spPr"), "xfrm")).toBeNull(),
    );
    expect(new Pakket(c).lees(i.dias[0].pad)).toContain("Eigen vorm");
    const own = open(c)
      .snapshot()
      .slides[0].shapes.find((s) => s.name === "Eigen vorm")!;
    expect([own.x, own.y, own.width, own.height]).toEqual([500, 600, 700, 800]);
    expect(zoekAlle(root, "t").length).toBe(zoekAlle(leesXml(old), "t").length);
  });
  it.each([THEMAS[0], THEMAS[1], THEMAS[2]])(
    "isoleert thema $naam voor één dia en behoudt de andere masters/dia's",
    (t) => {
      const bytes = bron(),
        i = leesOntwerp(bytes),
        p = new Pakket(bytes);
      const b = pasThemaToe(bytes, [0], t),
        n = leesOntwerp(b),
        q = new Pakket(b);
      expect(n.masters.length).toBe(i.masters.length + 1);
      expect(n.dias[0].layout).not.toBe(i.dias[0].layout);
      expect(n.dias.slice(1)).toEqual(i.dias.slice(1));
      for (const d of i.dias.slice(1))
        expect(q.lees(d.pad)).toBe(p.lees(d.pad));
      for (const m of i.masters) expect(q.lees(m.pad)).toBe(p.lees(m.pad));
      for (const l of i.layouts) expect(q.lees(l.pad)).toBe(p.lees(l.pad));
      const ids = n.masters.flatMap((m) =>
        zoekAlle(leesXml(q.lees(m.pad)), "sldLayoutId").map((e) =>
          attr(e, "id"),
        ),
      );
      expect(new Set(ids).size).toBe(ids.length);
      const theme = q.namen().find((s) => s.startsWith("ppt/theme/oosTheme"))!;
      expect(q.lees(theme)).toContain(`typeface="${t.kop}"`);
      expect(q.lees(theme)).toContain(t.kleuren[4].slice(1));
      relatiesGeldig(b);
      const h = open(b),
        saved = h.save(),
        reopened = open(saved);
      expect(reopened.snapshot().slides.length).toBe(i.dias.length);
      expect(leesOntwerp(saved).dias[0].layout).toBe(n.dias[0].layout);
      expect(new Pakket(saved).lees(theme)).toContain(t.kleuren[4].slice(1));
    },
  );
  it("past een thema toe op alle dia's, ook vanuit meerdere diamodellen", () => {
    const bytes = bron(),
      a = pasThemaToe(bytes, [0], THEMAS[1]),
      i = leesOntwerp(a);
    const b = pasThemaToe(
      a,
      i.dias.map((_, n) => n),
      THEMAS[2],
    );
    relatiesGeldig(b);
    const n = leesOntwerp(b);
    n.dias.forEach((d, k) => expect(d.layout).not.toBe(i.dias[k].layout));
    expect(open(b).snapshot().slides.length).toBe(i.dias.length);
  });
  it("schrijft en verwijdert kleur/verloop op dia, indeling en diamodel met juiste kindvolgorde", () => {
    const bytes = bron(),
      i = leesOntwerp(bytes),
      pad = i.dias[0].pad;
    const b = schrijfAchtergrond(
      bytes,
      [pad, i.layouts[0].pad, i.masters[0].pad],
      { soort: "verloop", kleur: "#123456", tweede: "#ABCDEF", hoek: 90 },
    );
    const p = new Pakket(b);
    for (const d of [pad, i.layouts[0].pad, i.masters[0].pad]) {
      const cs = kind(leesXml(p.lees(d)), "cSld")!;
      expect(
        cs.kinderen
          .filter((c) => c.soort === "element")
          .map((c) => c.soort === "element" && c.lokaal)
          .slice(0, 2),
      ).toEqual(["bg", "spTree"]);
      expect(p.lees(d)).toContain('ang="5400000"');
    }
    const c = schrijfAchtergrond(b, [pad], { soort: "erven" });
    expect(
      kind(kind(leesXml(new Pakket(c).lees(pad)), "cSld"), "bg"),
    ).toBeNull();
    expect(open(c).snapshot().slides.length).toBe(i.dias.length);
  });
  it("voegt een echte PNG-achtergrond met interne relatie toe en bewaart die na heropenen", () => {
    const bytes = bron(),
      i = leesOntwerp(bytes);
    const png = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    const b = schrijfAchtergrond(bytes, [i.dias[0].pad], {
      soort: "afbeelding",
      bytes: png,
    });
    relatiesGeldig(b);
    const h = open(b),
      saved = h.save(),
      p = new Pakket(saved);
    expect(p.namen().some((n) => /oosBackground\d+\.png$/.test(n))).toBe(true);
    expect(p.lees(i.dias[0].pad)).toContain("blipFill");
    expect(open(saved).snapshot().slides.length).toBe(i.dias.length);
  });
  it("weigert ongeldige doelen/selecties/thema's/afbeeldingen zonder bronbytes te wijzigen", () => {
    const bytes = bron(),
      copy = bytes.slice(),
      i = leesOntwerp(bytes);
    expect(() => pasThemaToe(bytes, [-1], THEMAS[0])).toThrow(OntwerpFout);
    expect(() => pasThemaToe(bytes, [], THEMAS[0])).toThrow(OntwerpFout);
    expect(() =>
      schrijfAchtergrond(bytes, ["ppt/presentation.xml"], {
        soort: "kleur",
        kleur: "#abcdef",
      }),
    ).toThrow(OntwerpFout);
    expect(() =>
      schrijfAchtergrond(bytes, [i.dias[0].pad], {
        soort: "afbeelding",
        bytes: new Uint8Array([1, 2, 3]),
      }),
    ).toThrow(OntwerpFout);
    expect(() => valideerThema({ ...THEMAS[0], kleuren: ["red"] })).toThrow(
      OntwerpFout,
    );
    expect(bytes).toEqual(copy);
  });
});
