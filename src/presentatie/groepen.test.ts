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
  elementen,
  kind,
  leesXml,
  vervang,
  zoekAlle,
} from "../grafieken/xml";
import { groepeerObjecten, hefGroepOp, leesGroepObjecten } from "./groepen";
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
function fixture() {
  const h = open(readFileSync("public/templates/nieuw.pptx")),
    s = h.snapshot().slides[0];
  for (let i = 0; i < 3; i++)
    h.addShape(s.id, {
      name: `Object ${i + 1}`,
      geometry: i === 1 ? "ellipse" : "rect",
      rect: {
        x: 1000000 + i * 2000000,
        y: 1000000 + i * 500000,
        width: 1000000,
        height: 500000,
      },
    });
  h.addPicture(s.id, {
    name: "Picture",
    rect: { x: 8000000, y: 1000000, width: 1000000, height: 500000 },
    contentType: "image/png",
    mediaBase64: readFileSync("public/studio-icons/presentation.png").toString(
      "base64",
    ),
  });
  const b = h.save();
  return {
    b,
    ids: leesGroepObjecten(b, 0)
      .filter((o) => o.naam.startsWith("Object"))
      .map((o) => o.id),
  };
}
function group(b: Uint8Array, ids?: string[]) {
  return groepeerObjecten(
    b,
    0,
    ids ??
      leesGroepObjecten(b, 0)
        .filter((o) => o.mogelijk)
        .map((o) => o.id),
    "My group",
  );
}
function modifyGroup(b: Uint8Array, change: (t: string) => string) {
  const p = new Pakket(b),
    path = "ppt/slides/slide1.xml",
    xml = p.lees(path),
    g = zoekAlle(leesXml(xml), "grpSp")[0],
    t = kind(kind(g, "grpSpPr"), "xfrm")!;
  p.schrijf(
    path,
    vervang(xml, [
      {
        start: t.start,
        eind: t.eind,
        tekst: change(xml.slice(t.start, t.eind)),
      },
    ]),
  );
  return p.inpakken();
}
function geometry(b: Uint8Array) {
  return open(b)
    .snapshot()
    .slides[0].shapes.filter((s) =>
      ["Object 1", "Object 2", "Object 3", "Picture"].includes(s.name),
    )
    .map(
      ({
        sourceId,
        name,
        x,
        y,
        width,
        height,
        rotationDeg,
        flipH,
        flipV,
        geometry,
        mediaPartPath,
      }) => ({
        sourceId,
        name,
        x,
        y,
        width,
        height,
        rotationDeg,
        flipH,
        flipV,
        geometry,
        mediaPartPath,
      }),
    );
}
function visual(b: Uint8Array) {
  return open(b)
    .layoutSlide(0)
    .primitives.filter(
      (p) =>
        "name" in p &&
        ["Object 1", "Object 2", "Object 3", "Picture"].includes(p.name),
    )
    .map((p) => ({
      name: "name" in p ? p.name : "",
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      transform: p.transform,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
function expectVisual(
  a: ReturnType<typeof visual>,
  b: ReturnType<typeof visual>,
) {
  expect(a).toHaveLength(b.length);
  a.forEach((p, i) => {
    expect(p.name).toBe(b[i].name);
    expect(p.transform).toEqual(b[i].transform);
    for (const k of ["x", "y", "w", "h"] as const)
      expect(p[k]).toBeCloseTo(b[i][k], 3);
  });
}
describe("groeperen en groepering opheffen (#80)", () => {
  it("groups shapes and pictures without moving children, changing IDs or losing image bytes", () => {
    const { b } = fixture(),
      before = visual(b),
      r = group(b),
      h = open(r.bytes),
      g = h
        .snapshot()
        .slides[0].shapes.find((s) => s.sourceId === Number(r.id))!;
    expect(g.name).toBe("My group");
    expect(g.children).toHaveLength(4);
    expectVisual(visual(r.bytes), before);
    const saved = h.save();
    expectVisual(visual(saved), before);
    expect(leesGroepObjecten(saved, 0).find((o) => o.id === r.id)?.groep).toBe(
      true,
    );
    const p = new Pakket(saved),
      logo = readFileSync("public/studio-icons/presentation.png");
    expect(p.namen().some((n) => Buffer.from(p.bytes(n)!).equals(logo))).toBe(
      true,
    );
  });
  it("ungroups an unchanged group with exact child geometry and source identities", () => {
    const { b } = fixture(),
      r = group(b),
      flat = hefGroepOp(open(r.bytes).save(), 0, r.id);
    expect(geometry(flat)).toEqual(geometry(b));
    expect(visual(open(flat).save())).toEqual(visual(b));
  });
  it("places noncontiguous selections at their highest stack position and preserves child order", () => {
    const { b, ids } = fixture(),
      r = group(b, [ids[0], ids[2]]);
    const names = leesGroepObjecten(r.bytes, 0).map((o) => o.naam);
    expect(names.indexOf("Object 2")).toBeLessThan(names.indexOf("My group"));
    const kids = open(r.bytes)
      .snapshot()
      .slides[0].shapes.find((s) => s.sourceId === Number(r.id))!.children;
    expect(kids.map((s) => s.name)).toEqual(["Object 1", "Object 3"]);
  });
  it("flattens a translated group into new child positions", () => {
    const { b } = fixture(),
      r = group(b),
      m = modifyGroup(r.bytes, (t) =>
        t.replace(
          /<a:off x="([^"]+)" y="([^"]+)"\/>/,
          (_, x, y) =>
            `<a:off x="${Number(x) + 500000}" y="${Number(y) - 200000}"/>`,
        ),
      ),
      flat = hefGroepOp(m, 0, r.id);
    const before = geometry(b),
      after = geometry(flat);
    after.forEach((s, i) => {
      expect(s.x).toBe(before[i].x + 500000);
      expect(s.y).toBe(before[i].y - 200000);
      expect(s.width).toBe(before[i].width);
    });
  });
  it("flattens a uniformly scaled, rotated and mirrored group without shearing its children", () => {
    const { b } = fixture(),
      r = group(b),
      m = modifyGroup(r.bytes, (t) =>
        t
          .replace("<a:xfrm>", '<a:xfrm rot="5400000" flipH="1">')
          .replace(
            /<a:ext cx="([^"]+)" cy="([^"]+)"\/>/,
            (_, w, h) => `<a:ext cx="${Number(w) * 2}" cy="${Number(h) * 2}"/>`,
          ),
      );
    const flat = hefGroepOp(m, 0, r.id),
      after = geometry(flat);
    expect(
      after.every((s) => s.width === 2000000 && s.height === 1000000),
    ).toBe(true);
    expect(after.every((s) => s.rotationDeg === 270 && s.flipV)).toBe(true);
    const saved = open(flat).save();
    expect(geometry(saved)).toEqual(after);
  });
  it("supports nested groups and flattens only the selected level", () => {
    const { b, ids } = fixture(),
      inner = group(b, ids.slice(0, 2)),
      outer = group(inner.bytes, [inner.id, ids[2]]),
      flat = hefGroepOp(outer.bytes, 0, outer.id);
    expect(
      leesGroepObjecten(flat, 0).find((o) => o.id === inner.id)?.groep,
    ).toBe(true);
    expectVisual(visual(flat), visual(b));
  });
  it("refuses placeholders and invalid or stale selections", () => {
    const { b, ids } = fixture(),
      list = leesGroepObjecten(b, 0);
    expect(list.some((o) => !o.mogelijk)).toBe(true);
    expect(() => group(b, [ids[0]])).toThrow("invalid");
    expect(() => group(b, [ids[0], "missing"])).toThrow("missing");
    expect(() => group(b, [ids[0], list.find((o) => !o.mogelijk)!.id])).toThrow(
      "unsupported",
    );
    expect(() => hefGroepOp(b, 0, ids[0])).toThrow("missing");
  });
  it("refuses a nonuniform scale combined with diagonal child rotation instead of losing shear", () => {
    const { b, ids } = fixture(),
      p = new Pakket(b),
      path = "ppt/slides/slide1.xml";
    const xml = p.lees(path),
      shape = zoekAlle(leesXml(xml), "sp").find(
        (e) => attr(kind(kind(e, "nvSpPr"), "cNvPr"), "id") === ids[0],
      )!,
      t = kind(kind(shape, "spPr"), "xfrm")!;
    p.schrijf(
      path,
      vervang(xml, [
        {
          start: t.start,
          eind: t.inhoudStart,
          tekst: `<${t.naam}${attrTekst({ ...t.attrs, rot: "2700000" })}>`,
        },
      ]),
    );
    expect(
      open(p.inpakken())
        .snapshot()
        .slides[0].shapes.find((s) => s.sourceId === Number(ids[0]))
        ?.rotationDeg,
    ).toBe(45);
    const r = group(p.inpakken(), ids),
      m = modifyGroup(r.bytes, (t) =>
        t.replace(
          /<a:ext cx="([^"]+)"/,
          (_, w) => `<a:ext cx="${Number(w) * 2}"`,
        ),
      );
    expect(() => hefGroepOp(m, 0, r.id)).toThrow("unsupported");
  });
  it("refuses group effects and animation targets instead of dropping their meaning", () => {
    const { b } = fixture(),
      r = group(b),
      p = new Pakket(r.bytes),
      path = "ppt/slides/slide1.xml";
    p.schrijf(
      path,
      p
        .lees(path)
        .replace(
          "</p:grpSpPr>",
          '<a:effectLst><a:glow rad="12700"/></a:effectLst></p:grpSpPr>',
        ),
    );
    expect(() => hefGroepOp(p.inpakken(), 0, r.id)).toThrow("unsupported");
    const q = new Pakket(r.bytes);
    q.schrijf(
      path,
      q
        .lees(path)
        .replace(
          "</p:sld>",
          `<p:timing><p:spTgt spid="${r.id}"/></p:timing></p:sld>`,
        ),
    );
    expect(() => hefGroepOp(q.inpakken(), 0, r.id)).toThrow("unsupported");
  });
  it("preserves unrelated package parts and all internal relationships", () => {
    const { b } = fixture(),
      r = group(b),
      flat = hefGroepOp(r.bytes, 0, r.id),
      p = new Pakket(flat),
      old = new Pakket(b);
    for (const n of old.namen().filter((n) => n !== "ppt/slides/slide1.xml"))
      expect(p.bytes(n)).toEqual(old.bytes(n));
    for (const n of p.namen().filter((n) => !n.endsWith(".rels")))
      for (const rel of p.relaties(n).filter((r) => !r.extern))
        expect(p.heeft(Pakket.doelPad(n, rel.target))).toBe(true);
  });
  it("retains inherited extension namespaces when moving children out of a group", () => {
    const { b } = fixture(),
      r = group(b),
      p = new Pakket(r.bytes),
      path = "ppt/slides/slide1.xml";
    p.schrijf(
      path,
      p
        .lees(path)
        .replace(
          "<p:grpSp xmlns:p=",
          '<p:grpSp xmlns:test="urn:source-extension" xmlns:p=',
        )
        .replace('name="Object 1"', 'name="Object 1" test:flag="preserve"'),
    );
    const result = hefGroepOp(p.inpakken(), 0, r.id),
      root = leesXml(new Pakket(result).lees(path)),
      nv = zoekAlle(root, "cNvPr").find((e) => attr(e, "name") === "Object 1")!;
    expect(attr(nv, "flag")).toBe("preserve");
    let node: typeof nv | null = nv,
      namespace: string | undefined;
    while (node) {
      namespace ??= node.attrs["xmlns:test"];
      node = node.ouder;
    }
    expect(namespace).toBe("urn:source-extension");
    expect(geometry(open(result).save())).toEqual(geometry(b));
  });
  it("retains invisibility when a hidden parent group is removed", () => {
    const { b } = fixture(),
      r = group(b),
      p = new Pakket(r.bytes),
      path = "ppt/slides/slide1.xml";
    p.schrijf(
      path,
      p
        .lees(path)
        .replace(
          `id="${r.id}" name="My group"`,
          `id="${r.id}" name="My group" hidden="1"`,
        ),
    );
    const flat = hefGroepOp(p.inpakken(), 0, r.id),
      shapes = open(flat)
        .snapshot()
        .slides[0].shapes.filter(
          (s) => s.name.startsWith("Object") || s.name === "Picture",
        );
    expect(shapes.every((s) => s.hidden)).toBe(true);
  });
  it("flattens nonuniformly scaled axis-aligned children with the correct sizes", () => {
    const { b } = fixture(),
      r = group(b),
      m = modifyGroup(r.bytes, (t) =>
        t.replace(
          /<a:ext cx="([^"]+)"/,
          (_, w) => `<a:ext cx="${Number(w) * 3}"`,
        ),
      );
    const flat = hefGroepOp(m, 0, r.id);
    expect(
      geometry(flat).every((s) => s.width === 3000000 && s.height === 500000),
    ).toBe(true);
    expectVisual(visual(flat), visual(m));
  });
  it("preserves authored text and painted font sizes when a scaled group is ungrouped", () => {
    const { b } = fixture(),
      h = open(b),
      s = h.snapshot().slides[0];
    h.addTextBox(s.id, {
      name: "Group text",
      rect: { x: 2000000, y: 3000000, width: 3000000, height: 1500000 },
      text: "Grouped text",
      style: { fontFamily: "Arial", fontSizePt: 20 },
    });
    const shape = s.shapes.find((s) => s.name === "Object 1")!;
    h.setShapeStroke(s.id, shape.id, { color: "#FF0000", widthPt: 4 });
    const r = group(h.save()),
      m = modifyGroup(r.bytes, (t) =>
        t.replace(
          /<a:ext cx="([^"]+)" cy="([^"]+)"\/>/,
          (_, w, h) => `<a:ext cx="${Number(w) * 2}" cy="${Number(h) * 2}"/>`,
        ),
      ),
      flat = hefGroepOp(m, 0, r.id);
    const fonts = (b: Uint8Array) =>
      open(b)
        .layoutSlide(0)
        .primitives.filter(
          (p) =>
            p.kind === "textBox" &&
            p.paragraphs.some((p) =>
              p.runs.some((r) => r.text.includes("Grouped")),
            ),
        )
        .flatMap((p) =>
          p.kind === "textBox"
            ? p.lines.flatMap((l) => l.runs.map((r) => r.fontSizePx))
            : [],
        );
    expect(fonts(m).length).toBeGreaterThan(0);
    expect(fonts(flat)).toEqual(fonts(m));
    const stroke = (b: Uint8Array) =>
      open(b)
        .layoutSlide(0)
        .primitives.find((p) => p.kind === "shape" && p.name === "Object 1");
    const a = stroke(flat),
      original = stroke(m);
    if (a?.kind !== "shape" || original?.kind !== "shape")
      throw new Error("Missing painted shape");
    expect(a.stroke?.width).toBeCloseTo(16 / 3, 5);
    expect(a.stroke?.width).toBe(original.stroke?.width);
  });
});
