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
  elementen,
  kind,
  leesXml,
  ontsnap,
  zoekAlle,
} from "../grafieken/xml";
import {
  diagramIndeling,
  leesDiagrammen,
  schrijfDiagramTekst,
  voegDiagramToe,
  DIAGRAM_NS,
  DIAGRAM_DRAW_NS,
  TEKEN_NS,
  PRESENTATIE_NS,
  RELATIE_NS,
  type DiagramSoort,
} from "./diagrammen";
import { naarDiagramVormen } from "./diagram-conversie";
import { hefGroepOp } from "./groepen";

const A = "{11111111-1111-1111-1111-111111111111}",
  P = "{22222222-2222-2222-2222-222222222222}";
const bron = () => new Uint8Array(readFileSync("public/templates/nieuw.pptx"));
function tekst(waarde = "Manager") {
  return `<a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr b="1" sz="1600"/><a:t>${ontsnap(waarde.slice(0, 2))}</a:t></a:r><a:r><a:rPr i="1" sz="1600"/><a:t>${ontsnap(waarde.slice(2))}</a:t></a:r></a:p>`;
}
function fixture(cache = true) {
  const p = new Pakket(bron()),
    slide = "ppt/slides/slide1.xml",
    data = "ppt/diagrams/test-data.xml",
    drawing = "ppt/diagrams/test-drawing.xml";
  const rd = p.voegRelatieToe(slide, `${RELATIE_NS}/diagramData`, data),
    rc = p.voegRelatieToe(
      slide,
      "http://schemas.microsoft.com/office/2007/relationships/diagramDrawing",
      drawing,
    );
  p.schrijf(
    data,
    `<dgm:dataModel xmlns:dgm="${DIAGRAM_NS}" xmlns:a="${TEKEN_NS}" xmlns:dsp="${DIAGRAM_DRAW_NS}"><dgm:ptLst><dgm:pt modelId="${A}"><dgm:prSet/><dgm:spPr/><dgm:t>${tekst()}</dgm:t></dgm:pt><dgm:pt modelId="${P}" type="pres"><dgm:prSet presAssocID="{33333333-3333-3333-3333-333333333333}"/><dgm:spPr/></dgm:pt></dgm:ptLst><dgm:cxnLst><dgm:cxn modelId="{44444444-4444-4444-4444-444444444444}" type="presOf" srcId="${A}" destId="${P}" srcOrd="0" destOrd="0"/></dgm:cxnLst><dgm:bg/><dgm:whole/><dgm:extLst><a:ext uri="${DIAGRAM_DRAW_NS}"><dsp:dataModelExt relId="${rc}" minVer="${DIAGRAM_NS}"/></a:ext></dgm:extLst></dgm:dataModel>`,
  );
  p.voegOverrideToe(
    data,
    "application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml",
  );
  if (cache) {
    p.schrijf(
      drawing,
      `<dsp:drawing xmlns:dsp="${DIAGRAM_DRAW_NS}" xmlns:a="${TEKEN_NS}" xmlns:r="${RELATIE_NS}"><dsp:spTree><dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr><dsp:grpSpPr/><dsp:sp modelId="${P}"><dsp:nvSpPr><dsp:cNvPr id="0" name="Cache node"/><dsp:cNvSpPr/></dsp:nvSpPr><dsp:spPr><a:xfrm><a:off x="200000" y="300000"/><a:ext cx="3000000" cy="1000000"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="336699"/></a:solidFill></dsp:spPr><dsp:txBody>${tekst()}</dsp:txBody><dsp:txXfrm><a:off x="500000" y="600000"/><a:ext cx="2000000" cy="500000"/></dsp:txXfrm></dsp:sp></dsp:spTree></dsp:drawing>`,
    );
    p.voegOverrideToe(
      drawing,
      "application/vnd.ms-office.drawingml.diagramDrawing+xml",
    );
  }
  const xml = p.lees(slide),
    root = leesXml(xml),
    tree = kind(kind(root, "cSld"), "spTree")!;
  const frame = `<p:graphicFrame xmlns:p="${PRESENTATIE_NS}" xmlns:a="${TEKEN_NS}" xmlns:r="${RELATIE_NS}"><p:nvGraphicFramePr><p:cNvPr id="33" name="Example diagram"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="1000000" y="1000000"/><a:ext cx="6000000" cy="3000000"/></p:xfrm><a:graphic><a:graphicData uri="${DIAGRAM_NS}"><dgm:relIds xmlns:dgm="${DIAGRAM_NS}" r:dm="${rd}"/></a:graphicData></a:graphic></p:graphicFrame>`;
  p.schrijf(
    slide,
    xml.slice(0, tree.inhoudEind) + frame + xml.slice(tree.inhoudEind),
  );
  return p.inpakken();
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
  h.registerFont({
    family: "Arial",
    bytes: readFileSync(
      "node_modules/@betteroffice/fonts/assets/LiberationSans-Regular.ttf",
    ),
  });
  return h;
}

describe("SmartArt tekst en veilige conversie (#86)", () => {
  it("koppelt data aan de echte cache via presOf, ook als presAssocID naar iets anders wijst", () => {
    expect(leesDiagrammen(fixture(), 0)[0]).toMatchObject({
      id: 33,
      cacheVormen: 1,
      gedeeld: false,
      punten: [{ id: A, tekst: "Manager", bewerkbaar: true }],
    });
  });
  it("houdt ongewijzigde bytes exact en weigert onbekende node-ID's", () => {
    const b = fixture();
    expect(schrijfDiagramTekst(b, 0, 33, { [A]: "Manager" })).toBe(b);
    expect(() => schrijfDiagramTekst(b, 0, 33, { unknown: "X" })).toThrow(
      "invalidNode",
    );
  });
  it("splitst een nieuw Unicode-teken niet tussen bestaande opmaakruns", () => {
    const p = new Pakket(fixture()),
      path = "ppt/diagrams/test-data.xml",
      xml = p.lees(path);
    p.schrijf(
      path,
      xml
        .replace("<a:t>Ma</a:t>", "<a:t>M</a:t>")
        .replace("<a:t>nager</a:t>", "<a:t>anager</a:t>"),
    );
    const cache = "ppt/diagrams/test-drawing.xml";
    p.schrijf(
      cache,
      p
        .lees(cache)
        .replace("<a:t>Ma</a:t>", "<a:t>M</a:t>")
        .replace("<a:t>nager</a:t>", "<a:t>anager</a:t>"),
    );
    const na = schrijfDiagramTekst(p.inpakken(), 0, 33, {
      [A]: "😀 nieuwe tekst",
    });
    expect(leesDiagrammen(na, 0)[0].punten[0].tekst).toBe("😀 nieuwe tekst");
  });
  it("werkt data en bijbehorende cache bij, met Unicode, runopmaak en behoud van alle overige delen", () => {
    const b = fixture(),
      na = schrijfDiagramTekst(b, 0, 33, { [A]: "  R&D <建築> 😀  " }),
      voor = new Pakket(b),
      p = new Pakket(na);
    expect(leesDiagrammen(na, 0)[0].punten[0].tekst).toBe("  R&D <建築> 😀  ");
    for (const pad of [
      "ppt/diagrams/test-data.xml",
      "ppt/diagrams/test-drawing.xml",
    ]) {
      const xml = p.lees(pad);
      expect(xml).toContain('b="1"');
      expect(xml).toContain('i="1"');
      expect(xml).toContain('xml:space="preserve"');
      expect(zoekAlle(leesXml(xml), "t").map((n) => n.lokaal)).not.toHaveLength(
        0,
      );
    }
    for (const pad of voor.namen())
      if (
        ![
          "ppt/diagrams/test-data.xml",
          "ppt/diagrams/test-drawing.xml",
        ].includes(pad)
      )
        expect(p.bytes(pad), pad).toEqual(voor.bytes(pad));
  });
  it("bewerkt ook brondata zonder tekenbuffer en bewaart de alinea-indeling", () => {
    const b = fixture(false),
      na = schrijfDiagramTekst(b, 0, 33, { [A]: "Another manager" });
    expect(leesDiagrammen(na, 0)[0].punten[0].tekst).toBe("Another manager");
    expect(() => schrijfDiagramTekst(b, 0, 33, { [A]: "A\nB" })).toThrow(
      "paragraphCount",
    );
  });
  it("raakt gedeelde brondata niet aan", () => {
    const p = new Pakket(fixture()),
      path = "ppt/slides/slide1.xml",
      xml = p.lees(path),
      frame = xml.match(/<p:graphicFrame[\s\S]*?<\/p:graphicFrame>/)![0];
    p.schrijf(
      path,
      xml.replace(frame, frame + frame.replace('id="33"', 'id="34"')),
    );
    const b = p.inpakken();
    expect(leesDiagrammen(b, 0).every((d) => d.gedeeld)).toBe(true);
    expect(() => schrijfDiagramTekst(b, 0, 33, { [A]: "X" })).toThrow(
      "unsupportedText",
    );
  });
  it("weigert gedeeltelijke of niet te koppelen cachetekst in plaats van een oude weergave te bewaren", () => {
    const p = new Pakket(fixture());
    p.schrijf(
      "ppt/diagrams/test-drawing.xml",
      p
        .lees("ppt/diagrams/test-drawing.xml")
        .replace('modelId="' + P + '"', 'modelId="unrelated"'),
    );
    const b = p.inpakken();
    expect(leesDiagrammen(b, 0)[0].punten[0].bewerkbaar).toBe(false);
    expect(() => schrijfDiagramTekst(b, 0, 33, { [A]: "X" })).toThrow(
      "unsupportedText",
    );
  });
  it("bewaart velden en hyperlinks zonder ze als gewone tekst te herschrijven", () => {
    const p = new Pakket(fixture()),
      path = "ppt/diagrams/test-data.xml";
    p.schrijf(
      path,
      p
        .lees(path)
        .replace(
          '<a:r><a:rPr b="1" sz="1600"/>',
          '<a:fld id="{55555555-5555-5555-5555-555555555555}" type="slidenum"><a:rPr b="1" sz="1600"/>',
        )
        .replace("</a:r>", "</a:fld>"),
    );
    const b = p.inpakken();
    expect(leesDiagrammen(b, 0)[0].punten[0].bewerkbaar).toBe(false);
    expect(() => schrijfDiagramTekst(b, 0, 33, { [A]: "X" })).toThrow(
      "unsupportedText",
    );
  });
  it("zet de cache om naar native vormen met aparte tekstgeometrie en unieke ID's", () => {
    const b = fixture(),
      na = naarDiagramVormen(b, 0, 33),
      p = new Pakket(na),
      voor = new Pakket(b),
      root = leesXml(p.lees("ppt/slides/slide1.xml")),
      group = zoekAlle(root, "grpSp")[0];
    expect(leesDiagrammen(na, 0)).toHaveLength(0);
    expect(attr(kind(kind(group, "nvGrpSpPr"), "cNvPr"), "id")).toBe("33");
    const shapes = elementen(group).filter((n) => n.lokaal === "sp");
    expect(shapes).toHaveLength(2);
    expect(attr(kind(kind(kind(shapes[1], "spPr"), "xfrm"), "off"), "x")).toBe(
      "500000",
    );
    const ids = zoekAlle(root, "cNvPr").map((n) => attr(n, "id"));
    expect(new Set(ids).size).toBe(ids.length);
    for (const path of voor.namen())
      if (path !== "ppt/slides/slide1.xml")
        expect(p.bytes(path), path).toEqual(voor.bytes(path));
    const h = open(na),
      g = h.snapshot().slides[0].shapes.find((s) => s.sourceId === 33)!;
    expect(g.kind).toBe("group");
    expect(g.children).toHaveLength(2);
    expect(
      h
        .layoutSlide(0)
        .primitives.filter((p) => p.kind === "textBox")
        .some((p) =>
          p.paragraphs.some(
            (p) => p.runs.map((r) => r.text).join("") === "Manager",
          ),
        ),
    ).toBe(true);
  });
  it("houdt ontbrekende, complexe en gekoppelde caches ongewijzigd", () => {
    expect(() => naarDiagramVormen(fixture(false), 0, 33)).toThrow(
      "missingCache",
    );
    const p = new Pakket(fixture()),
      path = "ppt/diagrams/test-drawing.xml";
    p.schrijf(
      path,
      p
        .lees(path)
        .replace(
          '<dsp:cNvPr id="0" name="Cache node"/>',
          '<dsp:cNvPr id="0" name="Cache node"><a:hlinkClick r:id="rId99"/></dsp:cNvPr>',
        ),
    );
    expect(() => naarDiagramVormen(p.inpakken(), 0, 33)).toThrow(
      "unsupportedCache",
    );
  });
  it("laat de gewone groep opheffen na verwijderen van de oude modificatiestempel", () => {
    const p = new Pakket(fixture()),
      path = "ppt/slides/slide1.xml";
    p.schrijf(
      path,
      p
        .lees(path)
        .replace(
          "<p:cNvGraphicFramePr/><p:nvPr/>",
          '<p:cNvGraphicFramePr/><p:nvPr><p:extLst><p:ext uri="{D42A27DB-BD31-4B8C-83A1-F6EECF244321}"><p14:modId xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" val="123"/></p:ext></p:extLst></p:nvPr>',
        ),
    );
    const converted = naarDiagramVormen(p.inpakken(), 0, 33),
      los = hefGroepOp(converted, 0, "33");
    expect(zoekAlle(leesXml(new Pakket(los).lees(path)), "grpSp")).toHaveLength(
      0,
    );
  });
});
describe("eenvoudige diagrammen als bewerkbare native vormen (#86)", () => {
  it.each(["process", "cycle", "hierarchy"] as DiagramSoort[])(
    "bewaart %s, tekst, verbindingen en andere pakketdelen via de echte engine",
    (soort) => {
      const b = bron(),
        labels =
          soort === "hierarchy"
            ? "Project\n  First\n  Second\n    Detail"
            : "First\nSecond\nThird",
        na = voegDiagramToe(b, 0, soort, labels, "Test diagram"),
        p = new Pakket(na),
        v = new Pakket(b);
      for (const path of v.namen())
        if (path !== "ppt/slides/slide1.xml")
          expect(p.bytes(path), path).toEqual(v.bytes(path));
      const h = open(na),
        g = h
          .snapshot()
          .slides[0].shapes.find((s) => s.name === "Test diagram")!,
        nodes = labels.split("\n").length;
      expect(g.kind).toBe("group");
      expect(g.children).toHaveLength(
        nodes + (soort === "cycle" ? nodes : nodes - 1),
      );
      const list = h.layoutSlide(0),
        idsInGroup = new Set(g.children.map((c) => c.id));
      for (const primitive of list.primitives)
        if (
          primitive.kind === "textBox" &&
          idsInGroup.has(primitive.shapeId ?? "")
        )
          for (const p of primitive.paragraphs)
            for (const r of p.runs)
              expect(r.fontSizePt).toBeLessThanOrEqual(16.01);
      const saved = h.save(),
        fresh = open(saved);
      expect(
        fresh.snapshot().slides[0].shapes.find((s) => s.name === "Test diagram")
          ?.children,
      ).toHaveLength(g.children.length);
      const los = open(hefGroepOp(saved, 0, String(g.sourceId)));
      expect(
        los.snapshot().slides[0].shapes.some((s) => s.name === "Test diagram"),
      ).toBe(false);
      for (const child of g.children)
        expect(
          los
            .snapshot()
            .slides[0].shapes.some((s) => s.sourceId === child.sourceId),
        ).toBe(true);
      const root = leesXml(new Pakket(saved).lees("ppt/slides/slide1.xml")),
        ids = new Set(zoekAlle(root, "cNvPr").map((n) => attr(n, "id")));
      for (const c of [...zoekAlle(root, "stCxn"), ...zoekAlle(root, "endCxn")])
        expect(ids.has(attr(c, "id"))).toBe(true);
    },
  );
  it.each(["process", "cycle"] as DiagramSoort[])(
    "houdt de %s-vakken binnen het diagram zonder onderlinge overlap",
    (soort) => {
      const n = diagramIndeling(
        soort,
        Array.from({ length: 12 }, (_, i) => `Node ${i}`).join("\n"),
      );
      for (const a of n) {
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.x + a.b).toBeLessThanOrEqual(1);
        expect(a.y + a.h).toBeLessThanOrEqual(1);
      }
      for (let i = 0; i < n.length; i++)
        for (let j = i + 1; j < n.length; j++) {
          const a = n[i],
            b = n[j];
          expect(
            Math.min(a.x + a.b, b.x + b.b) - Math.max(a.x, b.x) > 1e-6 &&
              Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-6,
          ).toBe(false);
        }
    },
  );
  it("leest hiërarchie met spaties en tabs met dezelfde ouders", () => {
    const a = diagramIndeling("hierarchy", "Root\n  A\n    A1\n  B"),
      b = diagramIndeling("hierarchy", "Root\n\tA\n\t\tA1\n\tB");
    expect(a).toEqual(b);
    expect(a.map((n) => n.ouder)).toEqual([null, 0, 1, 0]);
  });
  it.each([
    "Root\n    Skipped",
    "  Root\n  Child",
    "Root\nOther root",
    "Root\n Child",
  ])("weigert een onduidelijke hiërarchie %s", (s) =>
    expect(() => diagramIndeling("hierarchy", s)).toThrow("invalidHierarchy"),
  );
  it("weigert lege, te grote en te lange invoer", () => {
    expect(() => diagramIndeling("process", "Single")).toThrow("invalidText");
    expect(() =>
      diagramIndeling("cycle", Array(13).fill("Node").join("\n")),
    ).toThrow("invalidText");
    expect(() => diagramIndeling("process", "A\n" + "B".repeat(181))).toThrow(
      "invalidText",
    );
  });
});
