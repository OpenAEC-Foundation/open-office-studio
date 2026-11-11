import { readFileSync } from "node:fs";
import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { initWasm, openPresentation } from "@betteroffice/pptx";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrNs,
  kind,
  leesXml,
  ontsnap,
  vervang,
  zoekAlle,
} from "../grafieken/xml";
import { zipDelen } from "../grafieken/zipdelen";
import { STANDAARD_MEDIA, leesMedia, voegMediaToe, wijzigMedia } from "./media";
import { herstelOdfMedianamen } from "./odf-medianamen";
import { ODF_NS as N, odfAttribuutWijziging } from "./odf-overgangen";

const sourceNames = ['Geluid & <concept> "π" 🎵.wav', "Beeld – 東京 🎬.mp4"];
const base = () =>
  new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpvisie.pptx"));
const video = new Uint8Array(
  readFileSync("src/presentatie/testbestanden/synthetic-volume.mp4"),
);
const poster = new Uint8Array(
  readFileSync("src/presentatie/testbestanden/synthetic-volume.png"),
);
function wav() {
  const b = new Uint8Array(46),
    v = new DataView(b.buffer);
  b.set(strToU8("RIFF"));
  v.setUint32(4, 38, true);
  b.set(strToU8("WAVEfmt "), 8);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  b.set(strToU8("data"), 36);
  v.setUint32(40, 2, true);
  return b;
}
function source(audioOnly = false) {
  let b = voegMediaToe(base(), 0, sourceNames[0], wav(), poster, {
    ...STANDAARD_MEDIA,
    volume: 0.35,
  });
  if (!audioOnly)
    b = voegMediaToe(b, 0, sourceNames[1], video, poster, {
      ...STANDAARD_MEDIA,
      volume: 0.9,
    });
  return b;
}
const path = "ppt/slides/slide1.xml";
function named(b: Uint8Array, names: (string | null)[]) {
  const p = new Pakket(b),
    xml = p.lees(path),
    ids = leesMedia(b, 0).map((m) => m.id),
    edits = zoekAlle(leesXml(xml), "pic").flatMap((pic) => {
      const pr = kind(kind(pic, "nvPicPr"), "cNvPr"),
        index = ids.indexOf(Number(attr(pr, "id")));
      if (!pr || index < 0) return [];
      const edit = odfAttribuutWijziging(pr, { name: names[index] ?? null });
      return edit ? [edit] : [];
    });
  p.schrijf(path, vervang(xml, edits));
  return p.inpakken();
}
function odf(
  b: Uint8Array,
  options: {
    names?: string[];
    external?: boolean;
    duplicate?: boolean;
    reverse?: boolean;
    dx?: number;
    count?: number;
    image?: boolean;
  } = {},
) {
  const p = new Pakket(b),
    size = kind(leesXml(p.lees("ppt/presentation.xml")), "sldSz"),
    w = Number(attr(size, "cx")),
    h = Number(attr(size, "cy")),
    media = leesMedia(b, 0);
  const frames = media.map(
    (m, i) =>
      `<draw:frame draw:name="${ontsnap(options.names?.[i] ?? m.naam)}" svg:x="${(m.x * w + (options.dx ?? 0)) / 360000}cm" svg:y="${(m.y * h) / 360000}cm" svg:width="${(m.breedte * w) / 360000}cm" svg:height="${(m.hoogte * h) / 360000}cm"><draw:${options.image ? "image" : "plugin"} xlink:href="${options.external ? "https://example.invalid/clip" : `Media/clip${i}.bin`}"/></draw:frame>`,
  );
  if (options.reverse) frames.reverse();
  const decl = Object.entries(N)
      .map(([k, v]) => `xmlns:${k}="${v}"`)
      .join(" "),
    xml = `<office:document-content ${decl} xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"><office:body><office:presentation><draw:page>${frames.join("")}${options.duplicate ? frames[0] : ""}</draw:page>${"<draw:page/>".repeat((options.count ?? 3) - 1)}</office:presentation></office:body></office:document-content>`;
  return zipSync({
    mimetype: [
      strToU8("application/vnd.oasis.opendocument.presentation"),
      { level: 0 },
    ],
    "content.xml": strToU8(xml),
    ...Object.fromEntries(
      media.map((m, i) => [`Media/clip${i}.bin`, m.bytes!]),
    ),
  });
}
beforeAll(async () =>
  initWasm(
    readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  ),
);
describe("ODF-medianamen terugzetten (#310)", () => {
  it.each(["odp", "otp"])(
    "herstelt %s namen uit framegegevens, inclusief XML-tekens en Unicode, door echte opslag",
    async (ext) => {
      const original = source(),
        native = named(original, ["", ""]),
        after = await herstelOdfMedianamen(odf(original), ext, "pptx", native);
      expect(leesMedia(after, 0).map((m) => m.naam)).toEqual(sourceNames);
      const h = openPresentation(after);
      try {
        const saved = h.save();
        const reopened = openPresentation(saved);
        try {
          expect(leesMedia(reopened.save(), 0).map((m) => m.naam)).toEqual(
            sourceNames,
          );
        } finally {
          reopened.dispose();
        }
      } finally {
        h.dispose();
      }
      expect(
        leesMedia(after, 0).map(({ volume, automatisch, herhalen }) => [
          volume,
          automatisch,
          herhalen,
        ]),
      ).toEqual(
        leesMedia(native, 0).map(({ volume, automatisch, herhalen }) => [
          volume,
          automatisch,
          herhalen,
        ]),
      );
    },
  );
  it("vult ontbrekende en lege attributen zonder bestaande namen te overschrijven", async () => {
    const original = source(),
      native = named(original, ["Eigen naam behouden", null]),
      after = await herstelOdfMedianamen(odf(original), "odp", "pptx", native);
    expect(leesMedia(after, 0).map((m) => m.naam)).toEqual([
      "Eigen naam behouden",
      sourceNames[1],
    ]);
  });
  it("behoudt de betekenisvolle spaties van de bron en herstelt een witruimte-doel", async () => {
    const original = source(),
      doc = odf(original, { names: ["  Bron met spaties  ", "Tweede"] }),
      after = await herstelOdfMedianamen(
        doc,
        "odp",
        "pptx",
        named(original, [" \t ", ""]),
      );
    expect(leesMedia(after, 0).map((m) => m.naam)).toEqual([
      "  Bron met spaties  ",
      "Tweede",
    ]);
  });
  it("blijft byte-identiek bij al benoemde doelobjecten en bij een tweede toepassing", async () => {
    const original = source(),
      doc = odf(original);
    expect(await herstelOdfMedianamen(doc, "odp", "pptx", original)).toBe(
      original,
    );
    const fixed = await herstelOdfMedianamen(
      doc,
      "odp",
      "pptx",
      named(original, ["", ""]),
    );
    expect(await herstelOdfMedianamen(doc, "odp", "pptx", fixed)).toBe(fixed);
  });
  it("verzint geen oorspronkelijke namen wanneer de ODF-bron naamloos is", async () => {
    const original = source(),
      native = named(original, ["", ""]),
      doc = odf(original, { names: ["", "  "] });
    expect(await herstelOdfMedianamen(doc, "odp", "pptx", native)).toBe(native);
    const medium = leesMedia(native, 0)[0];
    expect(medium.naam).toBe("");
    expect(
      wijzigMedia(native, 0, medium.id, {
        ...STANDAARD_MEDIA,
        volume: medium.volume,
      }),
    ).toBe(native);
  });
  it.each([{ external: true }, { dx: 3600000 }, { count: 2 }, { image: true }])(
    "weigert onveilige of onvolledige koppelingen: %j",
    async (options) => {
      const original = source(),
        native = named(original, ["", ""]);
      expect(
        (await herstelOdfMedianamen(
          odf(original, options),
          "odp",
          "pptx",
          native,
        )) === native,
      ).toBe(true);
    },
  );
  it("slaat een dubbelzinnige bron over en herstelt de andere eenduidige naam wel", async () => {
    const original = source(),
      native = named(original, ["", ""]),
      after = await herstelOdfMedianamen(
        odf(original, { duplicate: true }),
        "odp",
        "pptx",
        native,
      );
    expect(leesMedia(after, 0).map((m) => m.naam)).toEqual([
      "",
      sourceNames[1],
    ]);
  });
  it("laat ander mediagehalte niet dezelfde naam erven", async () => {
    const original = source(true),
      native = named(original, [""]),
      p = new Pakket(native),
      media = p.namen().find((n) => n.endsWith(".wav"))!,
      bytes = p.bytes(media)!;
    bytes[bytes.length - 1] ^= 1;
    const changed = p.inpakken();
    expect(
      await herstelOdfMedianamen(odf(original), "odp", "pptx", changed),
    ).toBe(changed);
  });
  it("weigert identieke overlappende media, ook met verschillende namen", async () => {
    const original = voegMediaToe(
        source(true),
        0,
        "Tweede.wav",
        wav(),
        poster,
        STANDAARD_MEDIA,
      ),
      native = named(original, ["", ""]);
    expect(
      await herstelOdfMedianamen(odf(original), "odp", "pptx", native),
    ).toBe(native);
  });
  it("onderscheidt hergebruikte media op andere posities onafhankelijk van bronvolgorde", async () => {
    const original0 = voegMediaToe(
        source(true),
        0,
        "Tweede.wav",
        wav(),
        poster,
        STANDAARD_MEDIA,
      ),
      p = new Pakket(original0),
      xml = p.lees(path),
      pic = zoekAlle(leesXml(xml), "pic").at(-1)!,
      off = kind(kind(kind(pic, "spPr"), "xfrm"), "off")!;
    p.schrijf(
      path,
      vervang(xml, [
        {
          start: off.start,
          eind: off.eind,
          tekst: `<${off.naam} x="${Number(attr(off, "x")) + 720000}" y="${attr(off, "y")}"/>`,
        },
      ]),
    );
    const original = p.inpakken(),
      after = await herstelOdfMedianamen(
        odf(original, { reverse: true }),
        "odp",
        "pptx",
        named(original, ["", ""]),
      );
    expect(leesMedia(after, 0).map((m) => m.naam)).toEqual([
      sourceNames[0],
      "Tweede.wav",
    ]);
  });
  it("behoudt ID, alternatieve tekst, hyperlinks, timing, media en alle overige ZIP-onderdelen", async () => {
    const original = source(),
      native0 = named(original, ["", ""]),
      p = new Pakket(native0);
    p.schrijf(
      path,
      p
        .lees(path)
        .replace(
          'name=""',
          'name="" descr="Alternatieve tekst &amp; bron" hidden="0"',
        ),
    );
    const native = p.inpakken(),
      after = await herstelOdfMedianamen(odf(original), "odp", "pptx", native),
      a = unzipSync(native),
      b = unzipSync(after),
      mask = (x: string) => x.replace(/<p:cNvPr\b[^>]*>/g, "<p:cNvPr>");
    expect(mask(strFromU8(a[path])) === mask(strFromU8(b[path]))).toBe(true);
    const before = zoekAlle(leesXml(strFromU8(a[path])), "cNvPr"),
      afterProps = zoekAlle(leesXml(strFromU8(b[path])), "cNvPr");
    for (let i = 0; i < before.length; i++) {
      const attrs = (e: (typeof before)[number]) =>
        Object.fromEntries(
          Object.entries(e.attrs).filter(([k]) => k !== "name"),
        );
      expect(attrs(afterProps[i])).toEqual(attrs(before[i]));
    }
    const raw = new Map(zipDelen(after)!.map((d) => [d.naam, d]));
    for (const part of zipDelen(native)!)
      if (part.naam !== path)
        expect(
          Buffer.from(raw.get(part.naam)!.lokaal).equals(
            Buffer.from(part.lokaal),
          ),
          part.naam,
        ).toBe(true);
  });
  it("raakt andere routes en documenten zonder media niet aan", async () => {
    const original = source(),
      native = named(original, ["", ""]);
    for (const [van, naar] of [
      ["pptx", "odp"],
      ["fodp", "pptx"],
      ["ppt", "pptx"],
      ["odp", "pdf"],
    ])
      expect(await herstelOdfMedianamen(odf(original), van, naar, native)).toBe(
        native,
      );
    const b = base();
    expect(await herstelOdfMedianamen(odf(original), "odp", "pptx", b)).toBe(b);
  });
});
