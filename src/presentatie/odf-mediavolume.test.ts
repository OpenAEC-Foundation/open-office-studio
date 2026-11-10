import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { initWasm, openPresentation } from "@betteroffice/pptx";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrNs,
  kind,
  leesXml,
  ontsnap,
  tekstVan,
  vervang,
  zoekAlle,
} from "../grafieken/xml";
import { zipDelen } from "../grafieken/zipdelen";
import { STANDAARD_MEDIA, leesMedia, voegMediaToe } from "./media";
import { behoudOdfMediavolume } from "./odf-mediavolume";
import { ODF_NS as N } from "./odf-overgangen";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVwAAAABJRU5ErkJggg==",
    "base64",
  ),
);
const base = () =>
  new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpvisie.pptx"));
function wav() {
  const b = new Uint8Array(2044),
    v = new DataView(b.buffer);
  b.set(strToU8("RIFF"));
  v.setUint32(4, b.length - 8, true);
  b.set(strToU8("WAVEfmt "), 8);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  b.set(strToU8("data"), 36);
  v.setUint32(40, 2000, true);
  return b;
}
function deck(volume = 0.35) {
  return voegMediaToe(base(), 0, "clip.wav", wav(), png, {
    ...STANDAARD_MEDIA,
    volume,
    automatisch: true,
    herhalen: true,
  });
}
function reset(b: Uint8Array) {
  const p = new Pakket(b),
    xml = p.lees("ppt/slides/slide1.xml"),
    root = leesXml(xml),
    t = kind(root, "timing")!;
  p.schrijf(
    "ppt/slides/slide1.xml",
    vervang(xml, [{ start: t.start, eind: t.eind, tekst: "" }]),
  );
  return p.inpakken();
}
const decl = Object.entries(N)
  .map(([k, v]) => `xmlns:${k}="${v}"`)
  .join(" ");
function odf(
  b: Uint8Array,
  options: {
    db?: number;
    muted?: boolean;
    external?: boolean;
    duplicate?: boolean;
    meta?: boolean;
  } = {},
) {
  const p = new Pakket(b),
    size = kind(leesXml(p.lees("ppt/presentation.xml")), "sldSz")!,
    w = Number(attr(size, "cx")),
    h = Number(attr(size, "cy"));
  const media = leesMedia(b, 0),
    frames = media.map(
      (m, i) =>
        `<draw:frame xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" svg:x="${(m.x * w) / 360000}cm" svg:y="${(m.y * h) / 360000}cm" svg:width="${(m.breedte * w) / 360000}cm" svg:height="${(m.hoogte * h) / 360000}cm"><draw:plugin xlink:href="${options.external ? "https://example.invalid/clip.wav" : `Media/clip${i}.wav`}"><draw:param draw:name="Mute" draw:value="${options.muted ? "true" : "false"}"/><draw:param draw:name="VolumeDB" draw:value="${options.db ?? 0}"/><draw:param draw:name="Loop" draw:value="false"/></draw:plugin></draw:frame>`,
    );
  const content = `<office:document-content ${decl}><office:body><office:presentation><draw:page>${frames.join("")}${options.duplicate ? frames[0] : ""}</draw:page><draw:page/><draw:page/></office:presentation></office:body></office:document-content>`;
  return zipSync({
    mimetype: [
      strToU8("application/vnd.oasis.opendocument.presentation"),
      { level: 0 },
    ],
    "content.xml": strToU8(content),
    "styles.xml": strToU8(`<office:document-styles ${decl}/>`),
    ...(options.meta === false
      ? {}
      : {
          "meta.xml": strToU8(
            `<office:document-meta ${decl}><office:meta><meta:user-defined meta:name="Other" meta:value-type="string">keep</meta:user-defined></office:meta></office:document-meta>`,
          ),
        }),
    ...Object.fromEntries(
      media.map((m, i) => [`Media/clip${i}.wav`, m.bytes!]),
    ),
    "Pictures/other.bin": new Uint8Array([1, 2, 3]),
  });
}
function modify(b: Uint8Array, path: string, fn: (s: string) => string) {
  const parts = unzipSync(b);
  parts[path] = strToU8(fn(strFromU8(parts[path])));
  return zipSync(parts);
}
function precision(b: Uint8Array) {
  const xml = strFromU8(unzipSync(b)["meta.xml"]),
    node = zoekAlle(leesXml(xml), "user-defined").find((n) =>
      attrNs(n, N.meta, "name")?.startsWith(
        "OpenOfficeStudio.Presentation.MediaVolume",
      ),
    )!;
  return JSON.parse(tekstVan(node));
}
function alterPrecision(
  b: Uint8Array,
  fn: (p: ReturnType<typeof precision>) => unknown,
) {
  return modify(b, "meta.xml", (xml) => {
    const node = zoekAlle(leesXml(xml), "user-defined").find((n) =>
      attrNs(n, N.meta, "name")?.startsWith(
        "OpenOfficeStudio.Presentation.MediaVolume",
      ),
    )!;
    return vervang(xml, [
      {
        start: node.inhoudStart,
        eind: node.inhoudEind,
        tekst: ontsnap(JSON.stringify(fn(JSON.parse(tekstVan(node))))),
      },
    ]);
  });
}
beforeAll(async () =>
  initWasm(
    readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  ),
);
describe("gebonden ODF-mediavolume (#298)", () => {
  it("bewaart videovolume met dezelfde standaard videomedianode", async () => {
    const source = voegMediaToe(
        base(),
        0,
        "clip.mp4",
        new Uint8Array(
          readFileSync("src/presentatie/testbestanden/synthetic-volume.mp4"),
        ),
        png,
        { ...STANDAARD_MEDIA, volume: 0.9 },
      ),
      out = await behoudOdfMediavolume(source, "pptx", "odp", odf(source)),
      back = await behoudOdfMediavolume(out, "odp", "pptx", reset(source));
    expect(leesMedia(back, 0)[0]).toMatchObject({
      soort: "video",
      volume: 0.9,
    });
    expect(
      zoekAlle(
        leesXml(new Pakket(back).lees("ppt/slides/slide1.xml")),
        "video",
      ),
    ).toHaveLength(1);
  });
  it("onderscheidt twee instanties van hetzelfde mediabestand op verschillende posities", async () => {
    const source0 = voegMediaToe(deck(0.35), 0, "clip.wav", wav(), png, {
        ...STANDAARD_MEDIA,
        volume: 0.9,
      }),
      p = new Pakket(source0),
      xml = p.lees("ppt/slides/slide1.xml"),
      root = leesXml(xml),
      pic = zoekAlle(root, "pic").at(-1)!,
      off = kind(kind(kind(pic, "spPr"), "xfrm"), "off")!;
    p.schrijf(
      "ppt/slides/slide1.xml",
      vervang(xml, [
        {
          start: off.start,
          eind: off.eind,
          tekst: `<${off.naam} x="${Number(attr(off, "x")) + 720000}" y="${attr(off, "y")}"/>`,
        },
      ]),
    );
    const source = p.inpakken(),
      out = await behoudOdfMediavolume(source, "pptx", "odp", odf(source)),
      back = await behoudOdfMediavolume(out, "odp", "pptx", reset(source));
    expect(leesMedia(back, 0).map((m) => m.volume)).toEqual([0.35, 0.9]);
    const ids = zoekAlle(
      leesXml(new Pakket(back).lees("ppt/slides/slide1.xml")),
      "cTn",
    ).map((e) => attr(e, "id"));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("wijzigt alleen het volume van bestaande onbekende mediatiming", async () => {
    const source = deck(0.35),
      out = await behoudOdfMediavolume(source, "pptx", "odp", odf(source)),
      p = new Pakket(source),
      path = "ppt/slides/slide1.xml";
    p.schrijf(
      path,
      p
        .lees(path)
        .replace('vol="35000"', 'vol="100000"')
        .replace(
          'dur="indefinite" repeatCount="indefinite"',
          'dur="indefinite" repeatCount="indefinite" fill="hold"',
        ),
    );
    const native = p.inpakken(),
      back = await behoudOdfMediavolume(out, "odp", "pptx", native),
      mask = (x: string) =>
        x.replace(/<p:cMediaNode\b[^>]*>/g, "<p:cMediaNode VOLUME>");
    expect(mask(new Pakket(back).lees(path)) === mask(p.lees(path))).toBe(true);
    expect(leesMedia(back, 0)[0]).toMatchObject({
      volume: 0.35,
      automatisch: true,
      herhalen: true,
    });
  });
  it.each([0, 0.35, 0.9, 1])(
    "bewaart volume %s exact door ODP en engine save/reopen",
    async (v) => {
      const source = deck(v),
        out = await behoudOdfMediavolume(source, "pptx", "odp", odf(source)),
        back = await behoudOdfMediavolume(out, "odp", "pptx", reset(source));
      expect(leesMedia(back, 0)[0].volume).toBe(v);
      const h = openPresentation(back);
      try {
        expect(leesMedia(h.save(), 0)[0].volume).toBe(v);
      } finally {
        h.dispose();
      }
      expect(precision(out).media[0].volume).toBe(v);
      expect(strFromU8(unzipSync(out)["meta.xml"])).toContain(
        'meta:name="Other"',
      );
    },
  );
  it("houdt expliciet dempen en het oorspronkelijke niet-gedempte niveau afzonderlijk", async () => {
    const p = new Pakket(deck(0.35));
    p.schrijf(
      "ppt/slides/slide1.xml",
      p
        .lees("ppt/slides/slide1.xml")
        .replace('vol="35000"', 'vol="35000" mute="1"'),
    );
    const source = p.inpakken(),
      out = await behoudOdfMediavolume(source, "pptx", "otp", odf(source)),
      back = await behoudOdfMediavolume(out, "otp", "pptx", reset(source));
    const m = zoekAlle(
      leesXml(new Pakket(back).lees("ppt/slides/slide1.xml")),
      "cMediaNode",
    )[0];
    expect(attr(m, "vol")).toBe("35000");
    expect(attr(m, "mute")).toBe("1");
    expect(leesMedia(back, 0)[0].volume).toBe(0);
    expect(precision(out).media[0]).toMatchObject({
      volume: 0.35,
      muted: true,
    });
  });
  it("schrijft gewone decibel-/muteparameters en laat andere pluginparameters ongemoeid", async () => {
    const source = deck(0.35),
      out = await behoudOdfMediavolume(source, "pptx", "odp", odf(source));
    const root = leesXml(strFromU8(unzipSync(out)["content.xml"]));
    const values = Object.fromEntries(
      zoekAlle(root, "param").map((p) => [
        attrNs(p, N.draw, "name"),
        attrNs(p, N.draw, "value"),
      ]),
    );
    expect(values).toEqual({ VolumeDB: "-9", Mute: "false", Loop: "false" });
  });
  it("verwerpt oude precisiegegevens na een externe volume-/inhoudswijziging", async () => {
    const source = deck(0.35),
      out = await behoudOdfMediavolume(source, "pptx", "odp", odf(source));
    const changed = modify(out, "content.xml", (xml) =>
        xml.replace('draw:value="-9"', 'draw:value="-20"'),
      ),
      back = await behoudOdfMediavolume(changed, "odp", "pptx", reset(source));
    expect(leesMedia(back, 0)[0].volume).toBe(0.1);
  });
  it("verwerpt oude precisiegegevens na een wijziging van de stijlen", async () => {
    const source = deck(0.35),
      out = await behoudOdfMediavolume(source, "pptx", "odp", odf(source));
    const changed = modify(out, "styles.xml", (xml) =>
        xml.replace("/>", "><!-- external edit --></office:document-styles>"),
      ),
      back = await behoudOdfMediavolume(changed, "odp", "pptx", reset(source));
    expect(leesMedia(back, 0)[0].volume).toBeCloseTo(10 ** (-9 / 20), 5);
    expect(leesMedia(back, 0)[0].volume).not.toBe(0.35);
  });
  it.each(["duplicate", "invalid", "large"])(
    "gebruikt geen ongeldige precisiegegevens: %s",
    async (mode) => {
      const source = deck(0.35),
        out = await behoudOdfMediavolume(source, "pptx", "odp", odf(source));
      const changed = alterPrecision(out, (p) =>
        mode === "duplicate"
          ? { ...p, media: [...p.media, ...p.media] }
          : mode === "large"
            ? { ...p, media: Array(201).fill(p.media[0]) }
            : { ...p, media: [{ ...p.media[0], volume: NaN }] },
      );
      const back = await behoudOdfMediavolume(
        changed,
        "odp",
        "pptx",
        reset(source),
      );
      expect(leesMedia(back, 0)[0].volume).toBeCloseTo(10 ** (-9 / 20), 5);
    },
  );
  it("koppelt niet op naam en wijst geen volume aan een andere mediabestand toe", async () => {
    const source = deck(0.35),
      out = await behoudOdfMediavolume(source, "pptx", "odp", odf(source)),
      p = new Pakket(reset(source));
    const media = p.namen().find((n) => n.endsWith(".wav"))!,
      data = p.bytes(media)!;
    data[data.length - 1] ^= 1;
    const changed = p.inpakken(),
      back = await behoudOdfMediavolume(out, "odp", "pptx", changed);
    expect(back).toBe(changed);
    expect(leesMedia(back, 0)[0].volume).toBe(1);
  });
  it("weigert overlappende dubbelzinnige bronnen en dubbele doelobjecten", async () => {
    const a = deck(0.35),
      b = voegMediaToe(a, 0, "second.wav", wav(), png, {
        ...STANDAARD_MEDIA,
        volume: 0.9,
      });
    const raw = odf(b);
    expect(await behoudOdfMediavolume(b, "pptx", "odp", raw)).toBe(raw);
    const duplicate = odf(a, { duplicate: true });
    expect(await behoudOdfMediavolume(a, "pptx", "odp", duplicate)).toBe(
      duplicate,
    );
  });
  it("haalt geen externe bestanden op en slaat onbekende geometrie over", async () => {
    const source = deck(0.35),
      external = odf(source, { external: true });
    expect(await behoudOdfMediavolume(source, "pptx", "odp", external)).toBe(
      external,
    );
    const native = reset(source);
    expect(await behoudOdfMediavolume(external, "odp", "pptx", native)).toBe(
      native,
    );
    const rotated = modify(odf(source), "content.xml", (xml) =>
      xml.replace("<draw:frame ", '<draw:frame draw:transform="rotate(0.2)" '),
    );
    expect(await behoudOdfMediavolume(source, "pptx", "odp", rotated)).toBe(
      rotated,
    );
  });
  it("behoudt media, notities, opmaak en gecomprimeerde overige onderdelen", async () => {
    const source = deck(0.35),
      raw = odf(source),
      out = await behoudOdfMediavolume(source, "pptx", "odp", raw),
      native = reset(source),
      back = await behoudOdfMediavolume(out, "odp", "pptx", native);
    for (const [a, b, except] of [
      [raw, out, ["content.xml", "meta.xml"]],
      [native, back, ["ppt/slides/slide1.xml"]],
    ] as const) {
      const after = new Map(zipDelen(b)!.map((d) => [d.naam, d]));
      for (const part of zipDelen(a)!)
        if (!except.some((n) => n === part.naam))
          expect(
            Buffer.from(after.get(part.naam)!.lokaal).equals(
              Buffer.from(part.lokaal),
            ),
            part.naam,
          ).toBe(true);
    }
    expect(leesMedia(back, 0)[0]).toMatchObject({
      volume: 0.35,
      automatisch: false,
      herhalen: false,
    }); // De native timingdefaults niet als oorspronkelijke keuzes herstellen.
  });
  it("raakt ontbrekende metadata, andere routes en presentaties zonder media niet aan", async () => {
    const source = deck(0.35),
      missing = odf(source, { meta: false });
    expect(await behoudOdfMediavolume(source, "pptx", "odp", missing)).toBe(
      missing,
    );
    expect(await behoudOdfMediavolume(source, "pptx", "fodp", missing)).toBe(
      missing,
    );
    const raw = odf(base());
    expect(await behoudOdfMediavolume(base(), "pptx", "odp", raw)).toBe(raw);
  });
  it("weigert een gedeeltelijke koppeling wanneer het aantal dia’s afwijkt", async () => {
    const source = deck(0.35),
      out = await behoudOdfMediavolume(source, "pptx", "odp", odf(source)),
      changed = modify(out, "content.xml", (xml) =>
        xml.replace("<draw:page/>", ""),
      ),
      native = reset(source);
    expect(await behoudOdfMediavolume(changed, "odp", "pptx", native)).toBe(
      native,
    );
  });
  it("bewaart de gecomprimeerde inhoud als alleen metadata hoeft te veranderen", async () => {
    const source = deck(1),
      raw = odf(source),
      out = await behoudOdfMediavolume(source, "pptx", "odp", raw);
    const a = zipDelen(raw)!.find((d) => d.naam === "content.xml")!,
      b = zipDelen(out)!.find((d) => d.naam === a.naam)!;
    expect(b.lokaal).toEqual(a.lokaal);
    expect(precision(out).media[0].volume).toBe(1);
  });
});
