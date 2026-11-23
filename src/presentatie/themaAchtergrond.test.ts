import { readFileSync } from "node:fs";
import { afterEach, beforeAll, expect, it } from "vitest";
import {
  initWasm,
  openPresentation,
  type PresentationHandle,
} from "@betteroffice/pptx";
import { Pakket } from "../grafieken/pakket";
import { zipDelen } from "../grafieken/zipdelen";
import { kind, leesXml } from "../grafieken/xml";
import {
  leesOntwerp,
  schrijfAchtergrond,
  pasThemaToe,
  THEMAS,
} from "./ontwerp";
import { leesThemaAchtergrond } from "./themaAchtergrond";
const R =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const bron = () =>
  new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpvisie.pptx"));
const handles: PresentationHandle[] = [];
beforeAll(async () =>
  initWasm(
    readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  ),
);
afterEach(() => handles.splice(0).forEach((h) => h.dispose()));
function open(bytes: Uint8Array) {
  const h = openPresentation(bytes);
  handles.push(h);
  return h;
}
function padInfo(bytes: Uint8Array) {
  const p = new Pakket(bytes),
    info = leesOntwerp(bytes),
    dia = info.dias[0].pad;
  const layout = info.dias[0].layout,
    master = info.layouts.find((l) => l.pad === layout)!.master;
  const theme = p.doel(
    master,
    p.relaties(master).find((r) => r.type === R + "theme")!.id,
  )!;
  return { p, info, dia, layout, master, theme };
}
function override(masterXml: string, target: string) {
  const attrs = masterXml
    .match(/<p:clrMap\b([^>]+)\/>/)![1]
    .replace('accent1="accent1"', `accent1="${target}"`);
  return `<p:clrMapOvr><a:overrideClrMapping${attrs}/></p:clrMapOvr>`;
}
it("leest de echte actieve accentkleuren ook bij een complexe achtergrond, zonder presetfallback", () => {
  const b = pasThemaToe(bron(), [0], THEMAS[1]);
  const gradient = schrijfAchtergrond(b, [leesOntwerp(b).dias[0].pad], {
    soort: "verloop",
    kleur: "#123456",
    tweede: "#ABCDEF",
    hoek: 30,
  });
  expect(leesThemaAchtergrond(gradient, 0)).toMatchObject({
    beschikbaar: true,
    kleuren: { accent1: THEMAS[1].kleuren[4], accent6: THEMAS[1].kleuren[9] },
  });
});
it("schrijft alleen geselecteerde dia's als schemeClr en houdt alle andere gecomprimeerde onderdelen exact", () => {
  const bytes = bron(),
    { p, info } = padInfo(bytes),
    doel = info.dias[0].pad;
  const na = schrijfAchtergrond(bytes, [doel], {
    soort: "themakleur",
    naam: "accent1",
  });
  expect(new Pakket(na).lees(doel)).toContain('<a:schemeClr val="accent1"/>');
  expect(leesThemaAchtergrond(na, 0)).toMatchObject({
    beschikbaar: true,
    gekozen: "accent1",
  });
  const delen = new Map(zipDelen(na)!.map((d) => [d.naam, d]));
  for (const deel of zipDelen(bytes)!)
    if (deel.naam !== doel)
      expect(delen.get(deel.naam)!.lokaal, deel.naam).toEqual(deel.lokaal);
  expect(new Pakket(na).lees(doel).replace(/<p:bg\b[\s\S]*?<\/p:bg>/, "")).toBe(
    p.lees(doel).replace(/<p:bg\b[\s\S]*?<\/p:bg>/, ""),
  );
});
it("behoudt de themaverwijzing en tekst/notities bij echte engine edit/save en vers heropenen", () => {
  const bytes = bron(),
    { info } = padInfo(bytes),
    b = schrijfAchtergrond(bytes, [info.dias[0].pad], {
      soort: "themakleur",
      naam: "accent3",
    });
  const h = open(b),
    slide = h.snapshot().slides[0];
  expect(slide.background?.color?.themeColor).toBe("accent3");
  const story = slide.shapes.find((s) => s.textStories.length)!.textStories[0];
  h.insertText(story.id, 0, "Theme edit: ");
  h.setSlideNotes(slide.id, "Theme background notes");
  const saved = h.save(),
    fresh = open(saved);
  expect(fresh.snapshot().slides[0].background?.color?.themeColor).toBe(
    "accent3",
  );
  const again = fresh.save();
  expect(leesThemaAchtergrond(again, 0)).toMatchObject({
    beschikbaar: true,
    gekozen: "accent3",
  });
  expect(new Pakket(again).lees(info.dias[0].pad)).toContain('val="accent3"');
  expect(
    fresh
      .snapshot()
      .slides[0].shapes.flatMap((s) =>
        s.textStories.flatMap((t) =>
          t.paragraphs.flatMap((p) => p.runs.map((r) => r.text)),
        ),
      )
      .join(""),
  ).toContain("Theme edit: ");
  expect(fresh.snapshot().slides[0].notes).toContain("Theme background notes");
});
it("dezelfde accentverwijzing gebruikt per geselecteerde dia het eigen thema", () => {
  let b = pasThemaToe(bron(), [0], THEMAS[1]);
  b = pasThemaToe(b, [1], THEMAS[2]);
  const info = leesOntwerp(b);
  b = schrijfAchtergrond(
    b,
    info.dias.slice(0, 2).map((d) => d.pad),
    { soort: "themakleur", naam: "accent2" },
  );
  for (const [i, theme] of [
    [0, THEMAS[1]],
    [1, THEMAS[2]],
  ] as const) {
    expect(leesThemaAchtergrond(b, i)).toMatchObject({
      beschikbaar: true,
      gekozen: "accent2",
      kleuren: { accent2: theme.kleuren[5] },
    });
  }
  const fresh = open(open(b).save());
  expect(
    fresh
      .snapshot()
      .slides.slice(0, 2)
      .map((s) => s.background?.color?.themeColor),
  ).toEqual(["accent2", "accent2"]);
});
it("een latere wijziging van het echte kleurenschema werkt door zonder de achtergrond te herschrijven", () => {
  const b = schrijfAchtergrond(bron(), [leesOntwerp(bron()).dias[0].pad], {
    soort: "themakleur",
    naam: "accent1",
  });
  const { p, theme, dia } = padInfo(b),
    oud = p.lees(dia);
  p.schrijf(
    theme,
    p.lees(theme).replace(/(<a:accent1>\s*<a:srgbClr val=")[^"]+/, "$1EF1234"),
  );
  const na = p.inpakken();
  expect(p.lees(dia)).toBe(oud);
  expect(leesThemaAchtergrond(na, 0)).toMatchObject({
    beschikbaar: true,
    kleuren: { accent1: "#EF1234" },
    gekozen: "accent1",
  });
  const h = open(na);
  expect(h.layoutSlide(0).background).toEqual({
    kind: "solid",
    color: "#EF1234",
  });
});
it("volgt master clrMap en expliciete layout/slide-overrides, inclusief masterClrMapping", () => {
  const { p, master, layout, dia } = padInfo(bron()),
    masterXml = p.lees(master);
  const basis = leesThemaAchtergrond(p.inpakken(), 0);
  expect(basis.beschikbaar).toBe(true);
  if (!basis.beschikbaar) throw new Error("fixture palette");
  p.schrijf(
    master,
    masterXml.replace('accent1="accent1"', 'accent1="accent2"'),
  );
  expect(leesThemaAchtergrond(p.inpakken(), 0)).toMatchObject({
    kleuren: { accent1: basis.kleuren.accent2 },
  });
  p.schrijf(
    layout,
    p
      .lees(layout)
      .replace(
        /<p:clrMapOvr\b[\s\S]*?<\/p:clrMapOvr>/,
        override(masterXml, "accent3"),
      ),
  );
  p.schrijf(
    dia,
    p.lees(dia).replace(/<p:clrMapOvr\b[\s\S]*?<\/p:clrMapOvr>/, ""),
  );
  expect(leesThemaAchtergrond(p.inpakken(), 0)).toMatchObject({
    kleuren: { accent1: basis.kleuren.accent3 },
  });
  p.schrijf(
    dia,
    p
      .lees(dia)
      .replace(
        "</p:sld>",
        "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>",
      ),
  );
  expect(leesThemaAchtergrond(p.inpakken(), 0)).toMatchObject({
    kleuren: { accent1: basis.kleuren.accent2 },
  });
  p.schrijf(
    dia,
    p
      .lees(dia)
      .replace(
        /<p:clrMapOvr\b[\s\S]*?<\/p:clrMapOvr>/,
        override(masterXml, "accent4"),
      ),
  );
  expect(leesThemaAchtergrond(p.inpakken(), 0)).toMatchObject({
    kleuren: { accent1: basis.kleuren.accent4 },
  });
  const h = open(
    schrijfAchtergrond(p.inpakken(), [dia], {
      soort: "themakleur",
      naam: "accent1",
    }),
  );
  expect(h.layoutSlide(0).background).toEqual({
    kind: "solid",
    color: basis.kleuren.accent4,
  });
});
it("maakt een geldig themeOverride-palet begrensd onbeschikbaar waar de engine de verkeerde achtergrondkleur tekent", () => {
  const { p, theme, layout } = padInfo(bron());
  const schema = p
    .lees(theme)
    .match(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/)![0]
    .replace(/(<a:accent1>\s*<a:srgbClr val=")[^"]+/, "$1FA1234");
  p.schrijf(
    "ppt/theme/qaOverride.xml",
    `<a:themeOverride xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${schema}</a:themeOverride>`,
  );
  p.voegRelatieToe(layout, R + "themeOverride", "ppt/theme/qaOverride.xml");
  p.voegOverrideToe(
    "ppt/theme/qaOverride.xml",
    "application/vnd.openxmlformats-officedocument.themeOverride+xml",
  );
  const dia = padInfo(bron()).dia;
  const metKleur = schrijfAchtergrond(bron(), [dia], {
    soort: "themakleur",
    naam: "accent1",
  });
  p.schrijf(dia, new Pakket(metKleur).lees(dia));
  const bytes = p.inpakken(),
    origineel = bytes.slice();
  const h = open(bytes);
  expect(p.lees("ppt/theme/qaOverride.xml")).toContain('val="FA1234"');
  const saved = new Pakket(h.save());
  expect(saved.lees("ppt/theme/qaOverride.xml")).toBe(
    p.lees("ppt/theme/qaOverride.xml"),
  );
  expect(saved.lees(Pakket.relsPad(layout))).toBe(
    p.lees(Pakket.relsPad(layout)),
  );
  // Onafhankelijke bestandsoracle is #FA1234; dit bewaart de echte SDK-grens.
  expect(h.layoutSlide(0).background).toEqual({
    kind: "solid",
    color: "#4F81BD",
  });
  expect(leesThemaAchtergrond(bytes, 0)).toEqual({
    beschikbaar: false,
    reden: "unsupportedOverride",
  });
  expect(() =>
    schrijfAchtergrond(bytes, [dia], { soort: "themakleur", naam: "accent1" }),
  ).toThrow("themeColorUnavailable");
  expect(bytes).toEqual(origineel);
});
it("gebruikt nooit een willekeurig palet bij externe, missende, cyclische of ongeldige definities", () => {
  for (const [reden, wijzig] of [
    [
      "external",
      (p: Pakket, master: string, _theme: string) =>
        p.schrijf(
          Pakket.relsPad(master),
          p
            .lees(Pakket.relsPad(master))
            .replace(
              /(<Relationship\b[^>]*Type="[^"]+\/theme"[^>]*?)\/>/,
              '$1 TargetMode="External"/>',
            ),
        ),
    ],
    [
      "missing",
      (p: Pakket, _master: string, theme: string) => p.verwijder(theme),
    ],
    [
      "cycle",
      (p: Pakket, master: string, theme: string) =>
        p.schrijf(
          Pakket.relsPad(master),
          p
            .lees(Pakket.relsPad(master))
            .replace(
              Pakket.relatief(master, theme),
              Pakket.relatief(master, master),
            ),
        ),
    ],
    [
      "invalid",
      (p: Pakket, _master: string, theme: string) =>
        p.schrijf(
          theme,
          p
            .lees(theme)
            .replace(/(<a:accent1>\s*<a:srgbClr val=")[^"]+/, "$1NOTRGB"),
        ),
    ],
  ] as const) {
    const { p, master, theme, info } = padInfo(bron());
    wijzig(p, master, theme);
    const b = p.inpakken();
    expect(leesThemaAchtergrond(b, 0)).toEqual({ beschikbaar: false, reden });
    expect(() =>
      schrijfAchtergrond(b, [info.dias[0].pad], {
        soort: "themakleur",
        naam: "accent1",
      }),
    ).toThrow("themeColorUnavailable");
  }
});
it("weigert masterdoelen en ongeldige kleurkeuzes; RGB/verloop en onbezochte dia's blijven zelfstandig", () => {
  const bytes = bron(),
    { info } = padInfo(bytes);
  expect(() =>
    schrijfAchtergrond(bytes, [info.masters[0].pad], {
      soort: "themakleur",
      naam: "accent1",
    }),
  ).toThrow("themeColorUnavailable");
  expect(() =>
    schrijfAchtergrond(bytes, [info.dias[0].pad], {
      soort: "themakleur",
      naam: "unknown" as "accent1",
    }),
  ).toThrow("invalid");
  expect(leesThemaAchtergrond(bytes, -1)).toEqual({
    beschikbaar: false,
    reden: "invalid",
  });
});
it("weigert de hele selectie als één dia geen oplosbaar thema heeft, zonder gedeeltelijke bronwijziging", () => {
  const raw = pasThemaToe(bron(), [1], THEMAS[1]),
    kopie = raw.slice(),
    p = new Pakket(raw),
    info = leesOntwerp(raw);
  const layout = info.layouts.find((l) => l.pad === info.dias[1].layout)!;
  const theme = p.relaties(layout.master).find((r) => r.type === R + "theme")!;
  p.verwijder(p.doel(layout.master, theme.id)!);
  const bytes = p.inpakken(),
    before = bytes.slice();
  expect(leesThemaAchtergrond(bytes, 0).beschikbaar).toBe(true);
  expect(leesThemaAchtergrond(bytes, 1).beschikbaar).toBe(false);
  expect(() =>
    schrijfAchtergrond(
      bytes,
      info.dias.slice(0, 2).map((d) => d.pad),
      { soort: "themakleur", naam: "accent1" },
    ),
  ).toThrow("themeColorUnavailable");
  expect(bytes).toEqual(before);
  expect(raw).toEqual(kopie);
});
