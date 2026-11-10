import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { zipDelen } from "../grafieken/zipdelen";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  initWasm,
  openPresentation,
  type PresentationHandle,
} from "@betteroffice/pptx";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  kind,
  kinderen,
  leesXml,
  rid,
  tekstVan,
  zoekAlle,
} from "../grafieken/xml";
import { schrijfVoetteksten } from "./voetteksten";
import { werkDianummersBij } from "./dianummers";
const bron = () =>
  new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpvisie.pptx"));
function seed() {
  return schrijfVoetteksten(
    bron(),
    [0, 1, 2],
    {
      dianummer: true,
      datum: true,
      automatisch: true,
      datumTekst: "",
      voettekst: true,
      tekst: "Project A",
      nietOpTitel: false,
    },
    new Date("2020-01-02T12:00:00Z"),
    "nl-NL",
  );
}
function nummers(b: Uint8Array) {
  const p = new Pakket(b),
    pres = leesXml(p.lees("ppt/presentation.xml"));
  return kinderen(kind(pres, "sldIdLst"), "sldId").map((s) => {
    const path = p.doel("ppt/presentation.xml", rid(s)!)!;
    return zoekAlle(leesXml(p.lees(path)), "fld")
      .filter((f) => attr(f, "type") === "slidenum")
      .map((f) => tekstVan(kind(f, "t")));
  });
}
const handles: PresentationHandle[] = [];
beforeAll(async () =>
  initWasm(
    readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  ),
);
afterEach(() => handles.splice(0).forEach((h) => h.dispose()));
function open(b: Uint8Array) {
  const h = openPresentation(b);
  handles.push(h);
  return h;
}
describe("dianummers na native herschikken (#87)", () => {
  it("reproduceert oude opgeslagen veldwaarden en corrigeert volgens de actuele diavolgorde", () => {
    const h = open(seed()),
      slides = h.snapshot().slides;
    h.moveSlide(slides[2].id, 0);
    const before = h.save();
    expect(nummers(before)).toEqual([["3"], ["1"], ["2"]]);
    const after = werkDianummersBij(before);
    expect(nummers(after)).toEqual([["1"], ["2"], ["3"]]);
    const fresh = open(after);
    expect(nummers(fresh.save())).toEqual([["1"], ["2"], ["3"]]);
  });
  it("behoudt dezelfde bytes wanneer alle nummers al kloppen", () => {
    const b = seed();
    expect(werkDianummersBij(b)).toBe(b);
  });
  it("werkt na verwijderen en dupliceren zonder de editor opnieuw te openen", () => {
    const h = open(seed()),
      slides = h.snapshot().slides;
    h.deleteSlide(slides[0].id);
    h.duplicateSlide(slides[1].id, 1);
    expect(nummers(h.save())).toEqual([["2"], ["2"], ["3"]]);
    expect(nummers(werkDianummersBij(h.save()))).toEqual([["1"], ["2"], ["3"]]);
  });
  it("telt verborgen dia’s mee en respecteert firstSlideNum, ook nul", () => {
    for (const start of [0, 7]) {
      const z = unzipSync(seed());
      z["ppt/presentation.xml"] = strToU8(
        strFromU8(z["ppt/presentation.xml"]).replace(
          "<p:presentation ",
          `<p:presentation firstSlideNum="${start}" `,
        ),
      );
      z["ppt/slides/slide2.xml"] = strToU8(
        strFromU8(z["ppt/slides/slide2.xml"]).replace(
          "<p:sld ",
          '<p:sld show="0" ',
        ),
      );
      expect(nummers(werkDianummersBij(zipSync(z)))).toEqual([
        [String(start)],
        [String(start + 1)],
        [String(start + 2)],
      ]);
    }
  });
  it("voegt geen velden toe aan dia’s zonder nummer", () => {
    const b = schrijfVoetteksten(bron(), [2], {
      dianummer: true,
      datum: false,
      automatisch: false,
      datumTekst: "",
      voettekst: false,
      tekst: "",
      nietOpTitel: false,
    });
    const h = open(b);
    h.moveSlide(h.snapshot().slides[2].id, 0);
    expect(nummers(werkDianummersBij(h.save()))).toEqual([["1"], [], []]);
  });
  it("behoudt exacte XML buiten de numerieke tekst en gecomprimeerde overige onderdelen", () => {
    const h = open(seed());
    h.moveSlide(h.snapshot().slides[2].id, 0);
    const before = h.save(),
      after = werkDianummersBij(before);
    const a = unzipSync(before),
      b = unzipSync(after);
    for (const path of Object.keys(a)) {
      if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) {
        const mask = (x: Uint8Array) =>
          strFromU8(x).replace(
            /(<a:fld\b[^>]*type="slidenum"[^>]*>[\s\S]*?<a:t[^>]*>)\d+(<\/a:t>)/g,
            "$1NUMBER$2",
          );
        expect(mask(b[path]), path).toBe(mask(a[path]));
      } else expect(b[path], path).toEqual(a[path]);
    }
    const parts = new Map(zipDelen(after)!.map((d) => [d.naam, d]));
    for (const part of zipDelen(before)!)
      if (!/^ppt\/slides\/slide\d+\.xml$/.test(part.naam))
        expect(parts.get(part.naam)!.lokaal, part.naam).toEqual(part.lokaal);
  });
});

const P = "http://schemas.openxmlformats.org/presentationml/2006/main",
  A = "http://schemas.openxmlformats.org/drawingml/2006/main",
  R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const field = (value: string, type = "slidenum") =>
  `<a:fld id="{SAVED-ID}" type="${type}"><a:rPr sz="1800" b="1"/><a:pPr algn="r"/><a:t xml:space="preserve">${value}</a:t></a:fld>`;
const shape = (contents: string) =>
  `<p:sp><p:nvSpPr/><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p>${contents}</a:p></p:txBody></p:sp>`;
function synthetic(content: string, extra: Record<string, Uint8Array> = {}) {
  return zipSync({
    "_rels/.rels": strToU8(
      `<Relationships><Relationship Id="doc" Type="${R}/officeDocument" Target="custom/main.xml"/></Relationships>`,
    ),
    "custom/main.xml": strToU8(
      `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="second"/></p:sldIdLst></p:presentation>`,
    ),
    "custom/_rels/main.xml.rels": strToU8(
      `<Relationships><Relationship Id="second" Type="${R}/slide" Target="../slides/not-number-one.xml"/></Relationships>`,
    ),
    "slides/not-number-one.xml": strToU8(
      `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><p:cSld><p:spTree>${content}</p:spTree></p:cSld></p:sld>`,
    ),
    ...extra,
  });
}
describe("verliesvrije OOXML-veldcorrectie", () => {
  it("behoudt oorspronkelijke attribuutspelling en vult lege tekstvelden", () => {
    const source =
      shape(
        field("42").replace('xml:space="preserve"', "xml:space = 'preserve'"),
      ) +
      shape(
        field("42").replace(
          '<a:t xml:space="preserve">42</a:t>',
          "<a:t xml:space = 'preserve'/>",
        ),
      );
    const b = synthetic(source),
      after = strFromU8(
        unzipSync(werkDianummersBij(b))["slides/not-number-one.xml"],
      );
    expect(after).toContain("<a:t xml:space = 'preserve'>1</a:t>");
    expect(after.match(/>1<\/a:t>/g)).toHaveLength(2);
  });
  it("volgt pakketrelaties en corrigeert gegroepeerde velden en compatibiliteitstakken", () => {
    const contents = `<p:grpSp>${shape(field("42"))}</p:grpSp><mc:AlternateContent><mc:Choice Requires="p">${shape(field("42"))}</mc:Choice><mc:Fallback>${shape(field("42"))}</mc:Fallback></mc:AlternateContent>`;
    const b = synthetic(contents),
      after = unzipSync(werkDianummersBij(b));
    expect(strFromU8(after["slides/not-number-one.xml"])).toBe(
      strFromU8(unzipSync(b)["slides/not-number-one.xml"]).replaceAll(
        ">42<",
        ">1<",
      ),
    );
  });
  it("laat vaste tekst, andere veldtypen, extensieprototypes en onvolledige velden intact", () => {
    const preserved =
      shape(
        `<a:r><a:t>42</a:t></a:r>${field("42", "datetime1")}${field("42", "unknown")}<a:fld type="slidenum" id="empty"/>`,
      ) +
      `<p:extLst><p:ext uri="prototype">${shape(field("42"))}</p:ext></p:extLst>`;
    const b = synthetic(shape(field("42")) + preserved),
      after = unzipSync(werkDianummersBij(b));
    expect(strFromU8(after["slides/not-number-one.xml"])).toContain(preserved);
    expect(strFromU8(after["slides/not-number-one.xml"])).toContain(
      shape(field("1")),
    );
  });
  it("pakt een ongebruikt mediaonderdeel niet uit, zelfs met onbekende compressiemethode", () => {
    const b = synthetic(shape(field("42")), {
        "media/opaque.bin": new Uint8Array(8192).fill(71),
      }),
      part = zipDelen(b)!.find((d) => d.naam === "media/opaque.bin")!;
    new DataView(part.lokaal.buffer, part.lokaal.byteOffset).setUint16(
      8,
      99,
      true,
    );
    new DataView(part.centraal.buffer, part.centraal.byteOffset).setUint16(
      10,
      99,
      true,
    );
    const after = werkDianummersBij(b),
      media = zipDelen(after)!.find((d) => d.naam === part.naam)!;
    expect(media.lokaal).toEqual(part.lokaal);
    expect(
      strFromU8(
        unzipSync(after, { filter: (f) => f.name.endsWith(".xml") })[
          "slides/not-number-one.xml"
        ],
      ),
    ).toContain(shape(field("1")));
  });
  it("laat documenten zonder nummer en andere documenttypen exact ongemoeid", () => {
    for (const b of [
      synthetic(shape(field("42", "datetime1"))),
      zipSync({ "_rels/.rels": strToU8("<Relationships/>") }),
    ])
      expect(werkDianummersBij(b)).toBe(b);
  });
});
