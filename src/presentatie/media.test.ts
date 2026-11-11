import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { attr, elementen, kind, leesXml } from "../grafieken/xml";
import {
  leesMedia,
  mediaFormaat,
  voegMediaToe,
  wijzigMedia,
  STANDAARD_MEDIA,
} from "./media";
import { leesAnimaties, nieuweAnimatie, schrijfAnimaties } from "./animaties";
const bron = () =>
  new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpvisie.pptx"));
const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVwAAAABJRU5ErkJggg==",
    "base64",
  ),
);
function wav() {
  const b = new Uint8Array(2044),
    v = new DataView(b.buffer);
  for (const [i, s] of [
    [0, "RIFF"],
    [8, "WAVEfmt "],
    [36, "data"],
  ] as const)
    b.set(strToU8(s), i);
  v.setUint32(4, b.length - 8, true);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  v.setUint32(40, 2000, true);
  return b;
}
const voeg = (b: Uint8Array = bron()) =>
  voegMediaToe(b, 0, "test.wav", wav(), png, STANDAARD_MEDIA);
describe("ingesloten presentatiemedia (#85)", () => {
  it("behoudt een ongewijzigde mediadialoog byte-identiek zonder herladen", () => {
    const b = voeg();
    expect(wijzigMedia(b, 0, leesMedia(b, 0)[0].id, STANDAARD_MEDIA)).toBe(b);
  });
  it("plaatst media onder de ene verplichte root-par van p:tnLst (Open XML SDK-schema)", () => {
    const b = schrijfAnimaties(voeg(), 0, [nieuweAnimatie(3)]),
      p = unzipSync(b),
      root = leesXml(strFromU8(p["ppt/slides/slide1.xml"]));
    const lijst = kind(kind(root, "timing"), "tnLst")!;
    expect(elementen(lijst).map((n) => n.lokaal)).toEqual(["par"]);
    const takken = kind(kind(kind(lijst, "par"), "cTn"), "childTnLst")!;
    expect(elementen(takken).map((n) => n.lokaal)).toEqual(["seq", "audio"]);
  });
  it("vervangt ook een posterrelatie met enkele aanhalingstekens", () => {
    const p = unzipSync(voeg()),
      path = "ppt/slides/slide1.xml";
    p[path] = strToU8(
      strFromU8(p[path]).replace(/(<a:blip r:embed=)"([^"]+)"/g, "$1'$2'"),
    );
    const b = zipSync(p),
      id = leesMedia(b, 0)[0].id,
      na = wijzigMedia(b, 0, id, STANDAARD_MEDIA, png);
    expect(strFromU8(unzipSync(na)[path])).toMatch(/<a:blip r:embed="rId\d+"/);
  });
  it("voegt standaardmedia toe en behoudt alle andere dia- en notitieonderdelen exact", () => {
    const b = bron(),
      na = voeg(b),
      a = unzipSync(b),
      n = unzipSync(na),
      m = leesMedia(na, 0)[0];
    expect(m).toMatchObject({
      soort: "audio",
      mime: "audio/wav",
      bewerkbaar: true,
      opDia: true,
      ...STANDAARD_MEDIA,
    });
    expect(m.bytes).toEqual(wav());
    const grootte = kind(
      leesXml(strFromU8(n["ppt/presentation.xml"])),
      "sldSz",
    );
    expect(
      Math.abs(
        m.breedte * Number(attr(grootte, "cx")) -
          m.hoogte * Number(attr(grootte, "cy")),
      ),
    ).toBeLessThanOrEqual(1); // De 1×1-poster blijft vierkant.
    for (const [pad, bytes] of Object.entries(a))
      if (
        ![
          "[Content_Types].xml",
          "ppt/slides/slide1.xml",
          "ppt/slides/_rels/slide1.xml.rels",
        ].includes(pad)
      )
        expect(n[pad], pad).toEqual(bytes);
    expect(leesAnimaties(na, 0)).toEqual({
      lijst: [],
      alleenLezen: false,
      onbekend: 0,
    });
  });
  it("wijzigt alleen de gekozen media-instellingen, met niet-destructieve eindtrim", () => {
    const b = voeg(),
      m = leesMedia(b, 0)[0],
      na = wijzigMedia(b, 0, m.id, {
        automatisch: true,
        herhalen: true,
        volume: 0.35,
        begin: 0.02,
        eindeAf: 0.03,
      });
    expect(leesMedia(na, 0)[0]).toMatchObject({
      automatisch: true,
      herhalen: true,
      volume: 0.35,
      begin: 0.02,
      eindeAf: 0.03,
    });
    const a = unzipSync(b),
      n = unzipSync(na);
    for (const pad of Object.keys(a))
      if (pad !== "ppt/slides/slide1.xml") expect(n[pad], pad).toEqual(a[pad]);
    expect(strFromU8(n["ppt/slides/slide1.xml"])).toContain('st="20" end="30"');
  });
  it("behoudt objectanimaties bij invoegen en wijzigen van media", () => {
    const a = { ...nieuweAnimatie(3), effect: "spin" as const },
      b = schrijfAnimaties(bron(), 0, [a]),
      m = voeg(b),
      id = leesMedia(m, 0)[0].id;
    const voor = leesAnimaties(b, 0);
    expect(leesAnimaties(m, 0)).toEqual(voor);
    expect(
      leesAnimaties(
        wijzigMedia(m, 0, id, { ...STANDAARD_MEDIA, volume: 0.2 }),
        0,
      ),
    ).toEqual(voor);
  });
  it("behoudt de mediatak en unieke tijdlijn-ID's bij wijzigen of verwijderen van animaties", () => {
    const b = voeg(),
      parts = unzipSync(b),
      xml = strFromU8(parts["ppt/slides/slide1.xml"]),
      tak = xml.match(/<p:audio[\s\S]*?<\/p:audio>/)![0];
    const m = schrijfAnimaties(b, 0, [nieuweAnimatie(3)]),
      n = unzipSync(m),
      s = strFromU8(n["ppt/slides/slide1.xml"]);
    expect(s).toContain(tak);
    const ids = [...s.matchAll(/<p:cTn id="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(leesAnimaties(m, 0).alleenLezen).toBe(false);
    const leeg = schrijfAnimaties(m, 0, []);
    expect(leesMedia(leeg, 0)[0].bytes).toEqual(wav());
    expect(leesAnimaties(leeg, 0).alleenLezen).toBe(false);
  });
  it("bewaart onbekende tijdlijnconstructies byte voor byte en weigert instellingen te herschrijven", () => {
    const b = voeg(),
      p = unzipSync(b);
    p["ppt/slides/slide1.xml"] = strToU8(
      strFromU8(p["ppt/slides/slide1.xml"]).replace(
        'showWhenStopped="1"',
        'showWhenStopped="1" numSld="5"',
      ),
    );
    const na = zipSync(p),
      m = leesMedia(na, 0)[0];
    expect(m.bewerkbaar).toBe(false);
    expect(m.opDia).toBe(false);
    expect(wijzigMedia(na, 0, m.id, STANDAARD_MEDIA)).toBe(na);
    expect(() =>
      wijzigMedia(na, 0, m.id, { ...STANDAARD_MEDIA, volume: 0.5 }),
    ).toThrow("unsupportedMedia");
    expect(leesAnimaties(na, 0).alleenLezen).toBe(true);
  });
  it("houdt onbekende media-extensies bij wijzigen van bekende instellingen", () => {
    const p = unzipSync(voeg());
    p["ppt/slides/slide1.xml"] = strToU8(
      strFromU8(p["ppt/slides/slide1.xml"]).replace(
        "</p14:media>",
        '<p14:bmkLst><p14:bmk name="A" time="20"/></p14:bmkLst></p14:media>',
      ),
    );
    const b = zipSync(p),
      id = leesMedia(b, 0)[0].id,
      n = unzipSync(wijzigMedia(b, 0, id, { ...STANDAARD_MEDIA, volume: 0.7 }));
    expect(strFromU8(n["ppt/slides/slide1.xml"])).toContain(
      '<p14:bmkLst><p14:bmk name="A" time="20"/></p14:bmkLst>',
    );
  });
  it("vervangt een poster via een nieuwe relatie zonder gedeelde afbeeldingen te wijzigen", () => {
    const b = voeg(),
      m = leesMedia(b, 0)[0],
      n = unzipSync(wijzigMedia(b, 0, m.id, STANDAARD_MEDIA, png)),
      a = unzipSync(b);
    expect(Object.keys(n).filter((k) => k.includes("oos-poster"))).toHaveLength(
      2,
    );
    expect(n["ppt/media/oos-poster1.png"]).toEqual(
      a["ppt/media/oos-poster1.png"],
    );
  });
  it("haalt externe verwijzingen nooit op", () => {
    const p = unzipSync(voeg());
    p["ppt/slides/_rels/slide1.xml.rels"] = strToU8(
      strFromU8(p["ppt/slides/_rels/slide1.xml.rels"]).replace(
        /Target="\.\.\/media\/oos-media1.wav"/g,
        'Target="https://example.invalid/private.wav" TargetMode="External"',
      ),
    );
    expect(leesMedia(zipSync(p), 0)[0]).toMatchObject({
      bytes: null,
      extern: true,
    });
  });
  it.each([-1, NaN, Infinity, 1.1])("weigert ongeldig volume %s", (volume) => {
    const b = voeg(),
      id = leesMedia(b, 0)[0].id;
    expect(() => wijzigMedia(b, 0, id, { ...STANDAARD_MEDIA, volume })).toThrow(
      "invalidSettings",
    );
  });
  it("weigert onbekende formaten, te grote bestanden, ongeldige handtekeningen en posters", () => {
    expect(() => mediaFormaat("x.exe", wav())).toThrow("invalidFile");
    expect(() => mediaFormaat("x.mp4", wav())).toThrow("invalidFile");
    expect(() =>
      mediaFormaat("x.wav", new Uint8Array(50 * 1024 * 1024 + 1)),
    ).toThrow("invalidFile");
    expect(() =>
      voegMediaToe(
        bron(),
        0,
        "x.wav",
        wav(),
        new Uint8Array(30),
        STANDAARD_MEDIA,
      ),
    ).toThrow("invalidPoster");
  });
});
