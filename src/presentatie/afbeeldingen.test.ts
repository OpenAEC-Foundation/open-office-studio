import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  initWasm,
  openPresentation,
  type PresentationHandle,
} from "@betteroffice/pptx";
import { Pakket } from "../grafieken/pakket";
import { attr, attrNs, kind, leesXml, zoekAlle } from "../grafieken/xml";
import {
  controleerBeeld,
  controleerBijsnijden,
  leesAfbeeldingen,
  schrijfAfbeelding,
} from "./afbeeldingen";
beforeAll(async () =>
  initWasm(
    readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  ),
);
const handles: PresentationHandle[] = [];
afterEach(() => handles.splice(0).forEach((h) => h.dispose()));
function open(b: Uint8Array) {
  const h = openPresentation(b);
  handles.push(h);
  h.registerFont({
    family: "Arial",
    bytes: readFileSync(
      "node_modules/@betteroffice/fonts/assets/LiberationSans-Regular.ttf",
    ),
  });
  return h;
}
const logo = new Uint8Array(
  readFileSync("public/studio-icons/presentation.png"),
);
const replacement = new Uint8Array(
  readFileSync("public/studio-icons/spreadsheet.png"),
);
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const crop = { links: 10, boven: 20, rechts: 5, onder: 15 };
function fixture(two = false) {
  const h = open(readFileSync("public/templates/nieuw.pptx")),
    slide = h.snapshot().slides[0];
  for (const name of two ? ["Picture A", "Picture B"] : ["Picture A"])
    h.addPicture(slide.id, {
      name,
      rect: { x: 1000000, y: 2000000, width: 3000000, height: 1500000 },
      contentType: "image/png",
      mediaBase64: Buffer.from(logo).toString("base64"),
    });
  const b = h.save();
  return { b, id: leesAfbeeldingen(b, 0)[0].id };
}
function imageXml(b: Uint8Array) {
  const p = new Pakket(b),
    xml = p.lees("ppt/slides/slide1.xml");
  return { p, xml, pics: zoekAlle(leesXml(xml), "pic") };
}
describe("afbeeldingen bewerken (#80)", () => {
  it("reads source image, dimensions and default effects", () => {
    const { b } = fixture(),
      [i] = leesAfbeeldingen(b, 0);
    expect(i.naam).toBe("Picture A");
    expect(i.bytes).toEqual(logo);
    expect(i.verhouding).toBe(2);
    expect(i.transparantie).toBe(0);
    expect(i.bijsnijden).toEqual({ links: 0, boven: 0, rechts: 0, onder: 0 });
  });
  it("retains crop, alpha and geometry through native save and independent reopen", () => {
    const { b, id } = fixture(),
      before = open(b)
        .snapshot()
        .slides[0].shapes.find((s) => s.name === "Picture A")!;
    const result = schrijfAfbeelding(b, 0, id, {
        bijsnijden: crop,
        transparantie: 35,
      }),
      h = open(result),
      saved = h.save();
    const after = open(saved)
      .snapshot()
      .slides[0].shapes.find((s) => s.name === "Picture A")!;
    for (const k of [
      "x",
      "y",
      "width",
      "height",
      "rotationDeg",
      "flipH",
      "flipV",
    ] as const)
      expect(after[k]).toEqual(before[k]);
    const [i] = leesAfbeeldingen(saved, 0);
    expect(i.bijsnijden).toEqual(crop);
    expect(i.transparantie).toBe(35);
    const image = h.layoutSlide(0).primitives.find((p) => p.kind === "image");
    expect(image).toBeTruthy();
    if (image?.kind === "image") {
      expect(image.crop?.left).toBeCloseTo(0.1);
      expect(image.effects).toContainEqual({ kind: "alpha", amount: 0.65 });
    }
  });
  it("can crop and change alpha repeatedly without duplicate namespaces/effects", () => {
    const { b, id } = fixture();
    let result = b;
    for (let n = 1; n <= 3; n++)
      result = schrijfAfbeelding(result, 0, id, {
        bijsnijden: { ...crop, links: n },
        transparantie: n * 10,
      });
    expect(leesAfbeeldingen(open(result).save(), 0)[0].bijsnijden.links).toBe(
      3,
    );
    expect(leesAfbeeldingen(result, 0)[0].transparantie).toBe(30);
    expect(imageXml(result).xml.match(/<a:alphaModFix/g)).toHaveLength(1);
  });
  it("replaces media using an inherited relationship namespace and removes unreferenced original", () => {
    const { b, id } = fixture(),
      result = schrijfAfbeelding(b, 0, id, { vervanging: replacement });
    expect(leesAfbeeldingen(result, 0)[0].bytes).toEqual(replacement);
    expect(leesAfbeeldingen(open(result).save(), 0)[0].bytes).toEqual(
      replacement,
    );
    const { p } = imageXml(result);
    expect(
      p.namen().some((n) => Buffer.from(p.bytes(n)!).equals(Buffer.from(logo))),
    ).toBe(false);
  });
  it("does not replace another picture that shares the original media", () => {
    const { b, id } = fixture(true),
      result = schrijfAfbeelding(b, 0, id, { vervanging: replacement });
    const images = leesAfbeeldingen(open(result).save(), 0);
    expect(images.find((i) => i.naam === "Picture A")?.bytes).toEqual(
      replacement,
    );
    expect(images.find((i) => i.naam === "Picture B")?.bytes).toEqual(logo);
  });
  it("leaves text, geometry and unrelated XML untouched", () => {
    const { b, id } = fixture(),
      before = imageXml(b),
      result = schrijfAfbeelding(b, 0, id, { bijsnijden: crop });
    const after = imageXml(result);
    const strip = (s: string) => s.replace(/<a:srcRect\b[^>]*\/>/g, "");
    expect(strip(after.xml)).toBe(strip(before.xml));
    for (const n of before.p
      .namen()
      .filter((n) => n !== "ppt/slides/slide1.xml"))
      expect(after.p.bytes(n)).toEqual(before.p.bytes(n));
  });
  it("accepts negative outsets and exact transparency endpoints", () => {
    const { b, id } = fixture();
    for (const alpha of [0, 100]) {
      const r = schrijfAfbeelding(b, 0, id, {
        bijsnijden: { ...crop, links: -10 },
        transparantie: alpha,
      });
      expect(leesAfbeeldingen(r, 0)[0].transparantie).toBe(alpha);
    }
  });
  it("rejects invalid crop, alpha, image and stale IDs without modifying the input", () => {
    const { b, id } = fixture(),
      before = b.slice();
    for (const c of [
      { ...crop, links: NaN },
      { ...crop, links: 96 },
      { ...crop, boven: -1001 },
    ])
      expect(() => controleerBijsnijden(c)).toThrow();
    for (const a of [-1, 101, NaN])
      expect(() => schrijfAfbeelding(b, 0, id, { transparantie: a })).toThrow();
    expect(() =>
      schrijfAfbeelding(b, 0, "missing", { transparantie: 10 }),
    ).toThrow();
    expect(() => controleerBeeld(new Uint8Array([1, 2, 3]))).toThrow();
    expect(b).toEqual(before);
  });
  it("checks encoded image dimensions and refuses oversized decoding", () => {
    expect(controleerBeeld(logo).mime).toBe("image/png");
    const bad = logo.slice();
    new DataView(bad.buffer).setUint32(16, 100000);
    expect(() => controleerBeeld(bad)).toThrow("tooLarge");
  });
  it("keeps every internal relationship resolvable after replacement", () => {
    const { b, id } = fixture(),
      { p, pics } = imageXml(
        schrijfAfbeelding(b, 0, id, {
          vervanging: replacement,
          bijsnijden: crop,
          transparantie: 25,
        }),
      );
    expect(
      attrNs(kind(kind(pics[0], "blipFill"), "blip"), R, "embed"),
    ).toBeTruthy();
    for (const n of p.namen().filter((n) => !n.endsWith(".rels")))
      for (const r of p.relaties(n).filter((r) => !r.extern))
        expect(p.heeft(Pakket.doelPad(n, r.target)), `${n} → ${r.target}`).toBe(
          true,
        );
  });
  it("removes stale SVG fallbacks without discarding another extension or shared media", () => {
    const { b, id } = fixture(true),
      { p, xml, pics } = imageXml(b);
    const blip = kind(kind(pics[0], "blipFill"), "blip")!;
    const embed = attrNs(blip, R, "embed")!;
    const tag = `<a:blip r:embed="${embed}"><a:extLst><a:ext uri="svg"><s:svgBlip xmlns:s="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${embed}"/></a:ext><a:ext uri="other"><keep xmlns="urn:keep"/></a:ext></a:extLst></a:blip>`;
    p.schrijf(
      "ppt/slides/slide1.xml",
      xml.slice(0, blip.start) + tag + xml.slice(blip.eind),
    );
    const r = schrijfAfbeelding(p.inpakken(), 0, id, {
        vervanging: replacement,
      }),
      result = imageXml(r);
    expect(result.xml).not.toContain("svgBlip");
    expect(result.xml).toContain('<keep xmlns="urn:keep"/>');
    expect(leesAfbeeldingen(r, 0)[1].bytes).toEqual(logo);
  });
  it("replaces a linked picture without fetching or retaining the obsolete external relationship", () => {
    const { b, id } = fixture(),
      { p, xml, pics } = imageXml(b),
      blip = kind(kind(pics[0], "blipFill"), "blip")!,
      rid = attrNs(blip, R, "embed")!;
    p.schrijf(
      "ppt/slides/slide1.xml",
      xml.replace(`r:embed="${rid}"`, `r:link="${rid}"`),
    );
    const path = "ppt/slides/_rels/slide1.xml.rels";
    p.schrijf(
      path,
      p
        .lees(path)
        .replace(/<Relationship\b[^>]+\/>/g, (tag) =>
          tag.includes(`Id="${rid}"`)
            ? tag.replace(
                /Target="[^"]+"/,
                'Target="https://example.invalid/private.png" TargetMode="External"',
              )
            : tag,
        ),
    );
    expect(leesAfbeeldingen(p.inpakken(), 0)[0].bytes).toBeUndefined();
    const result = schrijfAfbeelding(p.inpakken(), 0, id, {
      vervanging: replacement,
    });
    expect(leesAfbeeldingen(result, 0)[0].bytes).toEqual(replacement);
    expect(imageXml(result).p.lees(path)).not.toContain("example.invalid");
  });
});
