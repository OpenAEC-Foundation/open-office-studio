import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  initWasm,
  openPresentation,
  type PresentationHandle,
} from "@betteroffice/pptx";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  kind,
  leesXml,
  zoekAlle,
  vervang,
  elementen,
} from "../grafieken/xml";
import {
  effectieveOpmaak,
  kopieerObjectOpmaak,
  leesOpmaakObjecten,
} from "./opmaakKopie";
import { schrijfAfbeelding, leesAfbeeldingen } from "./afbeeldingen";
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
  h.registerFont({
    family: "Arial",
    bytes: readFileSync(
      "node_modules/@betteroffice/fonts/assets/LiberationSans-Regular.ttf",
    ),
  });
  handles.push(h);
  return h;
}
const name = (e: ReturnType<typeof leesXml>) =>
  attr(
    kind(
      elementen(e).find((e) => e.lokaal.startsWith("nv")),
      "cNvPr",
    ),
    "name",
  );
function fixture() {
  const h = open(readFileSync("public/templates/nieuw.pptx")),
    slide = h.snapshot().slides[0];
  for (const [n, text, size, color] of [
    ["Source", "Source text", 22, "#AA1122"],
    ["Target", "Target 🧱\nSecond paragraph", 10, "#123456"],
    ["Other", "Other text", 16, "#0000FF"],
  ] as const)
    h.addTextBox(slide.id, {
      name: n,
      rect: {
        x: n === "Source" ? 1000000 : 5000000,
        y: n === "Other" ? 4000000 : 1000000,
        width: 3000000,
        height: 1500000,
      },
      text,
      style: {
        fontFamily: "Arial",
        fontSizePt: size,
        color,
        bold: n === "Source",
        italic: n === "Source",
        underline: n === "Source" ? "dbl" : "none",
      },
    });
  const source = h
    .snapshot()
    .slides[0].shapes.find((s) => s.name === "Source")!;
  h.setShapeFill(slide.id, source.id, "#FFAA00");
  h.setShapeStroke(slide.id, source.id, { color: "#112233", widthPt: 3 });
  h.setParagraphAlignment(
    source.textStories[0].id,
    0,
    source.textStories[0].length,
    "ctr",
  );
  h.addPicture(slide.id, {
    name: "Picture",
    rect: { x: 7000000, y: 5000000, width: 1000000, height: 500000 },
    contentType: "image/png",
    mediaBase64: readFileSync("public/studio-icons/presentation.png").toString(
      "base64",
    ),
  });
  const b = h.save(),
    objects = leesOpmaakObjecten(b, 0);
  return {
    b,
    src: objects.find((s) => s.naam === "Source")!.id,
    dst: objects.find((s) => s.naam === "Target")!.id,
    other: objects.find((s) => s.naam === "Other")!.id,
    pic: objects.find((s) => s.naam === "Picture")!.id,
    eff: effectieveOpmaak(h.layoutSlide(0).primitives).get(
      String(source.sourceId),
    )!,
  };
}
function source(b: Uint8Array) {
  return new Pakket(b).lees("ppt/slides/slide1.xml");
}
function shape(b: Uint8Array, n: string) {
  const xml = source(b);
  return { xml, e: zoekAlle(leesXml(xml), "sp").find((e) => name(e) === n)! };
}
const tekst = (h: PresentationHandle, n: string) =>
  h
    .snapshot()
    .slides[0].shapes.find((s) => s.name === n)!
    .textStories.map((s) =>
      s.paragraphs.map((p) => p.runs.map((r) => r.text).join("")),
    );
function geometry(h: PresentationHandle, n: string) {
  const s = h.snapshot().slides[0].shapes.find((s) => s.name === n)!;
  return [
    s.sourceId,
    s.x,
    s.y,
    s.width,
    s.height,
    s.rotationDeg,
    s.flipH,
    s.flipV,
    s.geometry,
  ];
}
describe("objectopmaak kopiëren (#80)", () => {
  it("copies fill/border and the first text style to multiple targets while retaining content and geometry", () => {
    const f = fixture(),
      before = open(f.b),
      b = kopieerObjectOpmaak(f.b, 0, f.src, [f.dst, f.other], {
        object: true,
        tekst: true,
        effectief: f.eff,
      }),
      h = open(b);
    for (const n of ["Target", "Other"]) {
      const s = h.snapshot().slides[0].shapes.find((s) => s.name === n)!;
      expect(s.fill).toMatchObject({ type: "solid", color: { rgb: "FFAA00" } });
      expect(s.outline?.width).toBe(38100);
      expect(tekst(h, n)).toEqual(tekst(before, n));
      expect(geometry(h, n)).toEqual(geometry(before, n));
      for (const p of s.textStories[0].paragraphs) {
        expect(p.alignment).toBe("ctr");
        for (const r of p.runs)
          expect(r.style).toMatchObject({
            bold: true,
            italic: true,
            fontSizePt: 22,
            fontFamily: "Arial",
            underline: "dbl",
          });
      }
    }
    expect(tekst(h, "Source")).toEqual(tekst(before, "Source"));
    expect(geometry(h, "Source")).toEqual(geometry(before, "Source"));
  });
  it("keeps copied formatting editable through native save and independent reopen", () => {
    const f = fixture(),
      h = open(
        kopieerObjectOpmaak(f.b, 0, f.src, [f.dst], {
          object: true,
          tekst: true,
          effectief: f.eff,
        }),
      ),
      saved = h.save(),
      again = open(saved);
    expect(tekst(again, "Target")).toEqual(tekst(open(f.b), "Target"));
    expect(
      again.snapshot().slides[0].shapes.find((s) => s.name === "Target")
        ?.textStories[0].paragraphs[0].runs[0].style.fontSizePt,
    ).toBe(22);
    expect(again.layoutSlide(0).primitives.length).toBeGreaterThan(0);
  });
  it("copies inherited title typography from painted source properties", () => {
    const f = fixture(),
      h = open(f.b),
      title = h.snapshot().slides[0].shapes.find((s) => s.name === "Title 1")!,
      eff = effectieveOpmaak(h.layoutSlide(0).primitives).get(
        String(title.sourceId),
      )!,
      b = kopieerObjectOpmaak(f.b, 0, String(title.sourceId), [f.dst], {
        object: false,
        tekst: true,
        effectief: eff,
      }),
      target = open(b)
        .snapshot()
        .slides[0].shapes.find((s) => s.name === "Target")!;
    expect(eff.size).toBe(44);
    expect(target.textStories[0].paragraphs[0].runs[0].style).toMatchObject({
      fontSizePt: 44,
      fontFamily: eff.font,
      color: eff.color,
    });
    expect(target.textStories[0].paragraphs[0].alignment).toBe("ctr");
  });
  it("object-only copy leaves every text byte untouched", () => {
    const f = fixture(),
      before = shape(f.b, "Target"),
      body = kind(before.e, "txBody")!,
      b = kopieerObjectOpmaak(f.b, 0, f.src, [f.dst], {
        object: true,
        tekst: false,
      }),
      after = shape(b, "Target"),
      next = kind(after.e, "txBody")!;
    expect(after.xml.slice(next.start, next.eind)).toBe(
      before.xml.slice(body.start, body.eind),
    );
  });
  it("text-only copy leaves shape geometry and object fill/border unchanged", () => {
    const f = fixture(),
      before = shape(f.b, "Target"),
      p = kind(before.e, "spPr")!,
      b = kopieerObjectOpmaak(f.b, 0, f.src, [f.dst], {
        object: false,
        tekst: true,
        effectief: f.eff,
      }),
      after = shape(b, "Target"),
      next = kind(after.e, "spPr")!;
    expect(after.xml.slice(next.start, next.eind)).toBe(
      before.xml.slice(p.start, p.eind),
    );
  });
  it("preserves target hyperlinks and unknown metadata", () => {
    const f = fixture(),
      p = new Pakket(f.b),
      { xml, e } = shape(f.b, "Target"),
      r = zoekAlle(e, "r")[0],
      rp = kind(r, "rPr")!,
      rid = p.voegRelatieToe(
        "ppt/slides/slide1.xml",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
        "ppt/slides/slide1.xml",
      );
    const content = `<a:rPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" b="0"><a:hlinkClick r:id="${rid}"/><a:extLst><a:ext uri="target"><keep xmlns="urn:target"/></a:ext></a:extLst></a:rPr>`;
    p.schrijf(
      "ppt/slides/slide1.xml",
      vervang(xml, [{ start: rp.start, eind: rp.eind, tekst: content }]),
    );
    const b = kopieerObjectOpmaak(p.inpakken(), 0, f.src, [f.dst], {
        object: true,
        tekst: true,
        effectief: f.eff,
      }),
      after = shape(b, "Target"),
      ap = kind(zoekAlle(after.e, "r")[0], "rPr")!;
    expect(after.xml.slice(ap.start, ap.eind)).toContain(`r:id="${rid}"`);
    expect(after.xml).toContain('<keep xmlns="urn:target"/>');
    expect(
      new Pakket(b).relaties("ppt/slides/slide1.xml").some((r) => r.id === rid),
    ).toBe(true);
    expect(tekst(open(b), "Target")).toEqual(tekst(open(f.b), "Target"));
  });
  it("copies gradient fills without replacing target geometry", () => {
    const f = fixture(),
      p = new Pakket(f.b),
      { xml, e } = shape(f.b, "Source"),
      fill = kind(kind(e, "spPr"), "solidFill")!;
    p.schrijf(
      "ppt/slides/slide1.xml",
      vervang(xml, [
        {
          start: fill.start,
          eind: fill.eind,
          tekst:
            '<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="123456"/></a:gs><a:gs pos="100000"><a:srgbClr val="ABCDEF"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="1"/></a:gradFill>',
        },
      ]),
    );
    const b = kopieerObjectOpmaak(p.inpakken(), 0, f.src, [f.dst], {
      object: true,
      tekst: false,
    });
    expect(
      open(b)
        .snapshot()
        .slides[0].shapes.find((s) => s.name === "Target")?.fill?.type,
    ).toBe("gradient");
    expect(source(b)).toContain('val="ABCDEF"');
    expect(geometry(open(b), "Target")).toEqual(geometry(open(f.b), "Target"));
  });
  it("formats a picture border without changing its binary media or crop", () => {
    const f = fixture();
    f.b = schrijfAfbeelding(f.b, 0, f.pic, {
      bijsnijden: { links: 10, boven: 20, rechts: 5, onder: 10 },
      transparantie: 35,
    });
    const p = new Pakket(f.b),
      before = open(f.b)
        .snapshot()
        .slides[0].shapes.find((s) => s.name === "Picture")!,
      b = kopieerObjectOpmaak(f.b, 0, f.src, [f.pic], {
        object: true,
        tekst: false,
      }),
      after = open(b)
        .snapshot()
        .slides[0].shapes.find((s) => s.name === "Picture")!,
      q = new Pakket(b);
    expect(after.outline?.width).toBe(38100);
    expect(after.mediaPartPath).toBe(before.mediaPartPath);
    expect(q.bytes(after.mediaPartPath!)).toEqual(
      p.bytes(before.mediaPartPath!),
    );
    expect(geometry(open(b), "Picture")).toEqual(
      geometry(open(f.b), "Picture"),
    );
    expect(leesAfbeeldingen(b, 0)[0].bijsnijden).toEqual(
      leesAfbeeldingen(f.b, 0)[0].bijsnijden,
    );
    expect(leesAfbeeldingen(b, 0)[0].transparantie).toBe(35);
  });
  it("combines paragraph default character formatting with inline run properties", () => {
    const f = fixture(),
      p = new Pakket(f.b),
      { xml, e } = shape(f.b, "Source"),
      pp = kind(zoekAlle(e, "p")[0], "pPr")!;
    p.schrijf(
      "ppt/slides/slide1.xml",
      vervang(xml, [
        {
          start: pp.start,
          eind: pp.eind,
          tekst:
            '<a:pPr algn="ctr"><a:defRPr baseline="15000" spc="120" cap="all"/></a:pPr>',
        },
      ]),
    );
    const b = kopieerObjectOpmaak(p.inpakken(), 0, f.src, [f.dst], {
        object: false,
        tekst: true,
        effectief: f.eff,
      }),
      target = open(b)
        .snapshot()
        .slides[0].shapes.find((s) => s.name === "Target")!;
    expect(target.textStories[0].paragraphs[0].runs[0].style).toMatchObject({
      baselinePct: 15,
      spacingPt: 1.2,
      caps: "all",
      fontSizePt: 22,
      bold: true,
    });
  });
  it("retains a target field ID, type and value while updating its character style", () => {
    const f = fixture(),
      p = new Pakket(f.b),
      { xml, e } = shape(f.b, "Target"),
      r = zoekAlle(e, "r")[0],
      id = "{11111111-2222-3333-4444-555555555555}",
      value = xml.slice(r.inhoudStart, r.inhoudEind);
    p.schrijf(
      "ppt/slides/slide1.xml",
      vervang(xml, [
        {
          start: r.start,
          eind: r.eind,
          tekst: `<a:fld id="${id}" type="slidenum">${value}</a:fld>`,
        },
      ]),
    );
    const b = kopieerObjectOpmaak(p.inpakken(), 0, f.src, [f.dst], {
        object: false,
        tekst: true,
        effectief: f.eff,
      }),
      after = shape(b, "Target"),
      field = zoekAlle(after.e, "fld")[0];
    expect(attr(field, "id")).toBe(id);
    expect(attr(field, "type")).toBe("slidenum");
    const text = kind(field, "t")!;
    expect(after.xml.slice(text.start, text.eind)).toBe(
      value.match(/<a:t[^>]*>[\s\S]*?<\/a:t>/)![0],
    );
    expect(attr(kind(field, "rPr"), "sz")).toBe("2200");
  });
  it("does not copy a source hyperlink into the destination", () => {
    const f = fixture(),
      p = new Pakket(f.b),
      { xml, e } = shape(f.b, "Source"),
      rp = kind(zoekAlle(e, "r")[0], "rPr")!,
      rid = p.voegRelatieToe(
        "ppt/slides/slide1.xml",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
        "ppt/slides/slide1.xml",
      ),
      updated = `<${rp.naam}${attrTekst(rp.attrs)}>${xml.slice(rp.inhoudStart, rp.inhoudEind)}<a:hlinkClick xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rid}"/></${rp.naam}>`;
    p.schrijf(
      "ppt/slides/slide1.xml",
      vervang(xml, [{ start: rp.start, eind: rp.eind, tekst: updated }]),
    );
    const b = kopieerObjectOpmaak(p.inpakken(), 0, f.src, [f.dst], {
        object: false,
        tekst: true,
        effectief: f.eff,
      }),
      after = shape(b, "Target");
    expect(after.xml.slice(after.e.start, after.e.eind)).not.toContain(
      `r:id="${rid}"`,
    );
  });
  it("refuses incompatible and stale multi-target selections atomically", () => {
    const f = fixture(),
      before = f.b.slice();
    for (const ids of [
      [f.dst, "missing"],
      [f.dst, f.pic],
    ])
      expect(() =>
        kopieerObjectOpmaak(f.b, 0, f.src, ids, {
          object: true,
          tekst: true,
          effectief: f.eff,
        }),
      ).toThrow();
    for (const ids of [[], [f.src], [f.dst, f.dst]])
      expect(() =>
        kopieerObjectOpmaak(f.b, 0, f.src, ids, { object: true, tekst: false }),
      ).toThrow("invalid");
    expect(f.b).toEqual(before);
  });
  it("preserves every unrelated package part and all internal relationships", () => {
    const f = fixture(),
      b = kopieerObjectOpmaak(f.b, 0, f.src, [f.dst], {
        object: true,
        tekst: true,
        effectief: f.eff,
      }),
      p = new Pakket(f.b),
      q = new Pakket(b);
    for (const n of p.namen().filter((n) => n !== "ppt/slides/slide1.xml"))
      expect(q.bytes(n)).toEqual(p.bytes(n));
    for (const n of q.namen().filter((n) => !n.endsWith(".rels")))
      for (const r of q.relaties(n).filter((r) => !r.extern))
        expect(q.heeft(Pakket.doelPad(n, r.target))).toBe(true);
  });
});
