import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  initWasm,
  openPresentation,
  type PresentationHandle,
} from "@betteroffice/pptx";
import { Pakket } from "../grafieken/pakket";
import { attr, kind, kinderen, leesXml, rid, zoekAlle } from "../grafieken/xml";
import {
  hergebruikDias,
  leesDiaKopie,
  leesHergebruik,
  maakDiaKopie,
} from "./hergebruik";
import { leesOntwerp } from "./ontwerp";
import { voegSectieToe, leesSecties } from "./pakket";
import { voegGrafiekToePptx, lijstGrafieken } from "../grafieken/documenten";
import { standaardModel } from "../grafieken/model";
import { schrijfTabel, leesTabellen } from "./tabellen";
import { nieuwRooster } from "./tabelrooster";

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
    new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpvisie.pptx")),
  doel = () => new Uint8Array(readFileSync("public/templates/nieuw.pptx"));
function open(bytes: Uint8Array) {
  const h = openPresentation(bytes);
  h.registerFont({
    family: "Arial",
    bytes: readFileSync(
      "node_modules/@betteroffice/fonts/assets/LiberationSans-Regular.ttf",
    ),
  });
  handles.push(h);
  return h;
}
const tekst = (h: PresentationHandle, i: number) =>
  h
    .snapshot()
    .slides[
      i
    ].shapes.flatMap((s) => s.textStories.flatMap((st) => st.paragraphs.map((p) => p.runs.map((r) => r.text).join(""))));
function relaties(bytes: Uint8Array) {
  const p = new Pakket(bytes);
  for (const pad of p.namen().filter((n) => !n.endsWith(".rels")))
    for (const r of p.relaties(pad).filter((r) => !r.extern))
      expect(
        p.heeft(Pakket.doelPad(pad, r.target)),
        `${pad} → ${r.target}`,
      ).toBe(true);
}
describe("dia's hergebruiken met bronopmaak (#76)", () => {
  it("bewaart afbeeldingsbytes en de beeldrelatie na hergebruik en native opslag", () => {
    const h = open(bron()),
      logo = readFileSync("public/studio-icons/presentation.png");
    h.addPicture(h.snapshot().slides[0].id, {
      name: "Reuse logo",
      rect: { x: 11000000, y: 6000000, width: 500000, height: 500000 },
      contentType: "image/png",
      mediaBase64: logo.toString("base64"),
    });
    const r = hergebruikDias(doel(), h.save(), [0], 0),
      saved = open(r.bytes).save(),
      p = new Pakket(saved);
    expect(p.namen().some((n) => Buffer.from(p.bytes(n)!).equals(logo))).toBe(
      true,
    );
    expect(
      open(saved)
        .snapshot()
        .slides[1].shapes.some((s) => s.name === "Reuse logo"),
    ).toBe(true);
    relaties(saved);
  });
  it("neemt dia's, eigen masters, thema's, media en notities over en bewaart native", () => {
    const b = bron(),
      d = doel(),
      before = d.slice(),
      r = hergebruikDias(d, b, [0, 1, 2], 0),
      src = leesOntwerp(b),
      dst = leesOntwerp(r.bytes);
    expect(r.aantal).toBe(3);
    expect(r.eerste).toBe(1);
    expect(dst.dias).toHaveLength(4);
    expect(dst.masters).toHaveLength(2);
    const p = new Pakket(r.bytes),
      s = new Pakket(b);
    src.dias.forEach((dia, i) =>
      expect(p.lees(dst.dias[i + 1].pad)).toBe(s.lees(dia.pad)),
    );
    const h = open(r.bytes),
      hs = open(b);
    for (let i = 0; i < 3; i++) expect(tekst(h, i + 1)).toEqual(tekst(hs, i));
    expect(h.snapshot().slides[1].notes).toBe(hs.snapshot().slides[0].notes);
    relaties(r.bytes);
    const saved = h.save();
    expect(leesOntwerp(saved).dias).toHaveLength(4);
    relaties(saved);
    expect(open(saved).layoutSlide(1).primitives.length).toBeGreaterThan(0);
    expect(d).toEqual(before);
    const root = leesXml(p.lees("ppt/presentation.xml"));
    expect(
      kinderen(kind(root, "notesMasterIdLst"), "notesMasterId"),
    ).toHaveLength(1);
  });
  it("behoudt bron-ID's op vormen, maakt unieke layout-/slide-IDs en kan dezelfde bron tweemaal importeren", () => {
    const a = hergebruikDias(doel(), bron(), [0], 0),
      b = hergebruikDias(a.bytes, bron(), [1], 1),
      p = new Pakket(b.bytes),
      i = leesOntwerp(b.bytes);
    const ids = i.masters.flatMap((m) =>
      zoekAlle(leesXml(p.lees(m.pad)), "sldLayoutId").map((e) => attr(e, "id")),
    );
    expect(new Set(ids).size).toBe(ids.length);
    const allIds = [
      ...ids,
      ...kinderen(
        kind(leesXml(p.lees("ppt/presentation.xml")), "sldMasterIdLst"),
        "sldMasterId",
      ).map((e) => attr(e, "id")),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(i.dias).toHaveLength(3);
    relaties(b.bytes);
    expect(open(b.bytes).snapshot().slides).toHaveLength(3);
  });
  it("neemt intern gelinkte dia's ook mee en verwijst naar de nieuwe diaonderdelen", () => {
    const b = bron(),
      p = new Pakket(b),
      src = leesOntwerp(b);
    p.voegRelatieToe(
      src.dias[0].pad,
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
      src.dias[2].pad,
    );
    const r = hergebruikDias(doel(), p.inpakken(), [0], 0),
      dst = leesOntwerp(r.bytes),
      q = new Pakket(r.bytes);
    expect(r.aantal).toBe(2);
    expect(r.extra).toBe(1);
    const link = q
      .relaties(dst.dias[1].pad)
      .find((r) => r.type.endsWith("/slide"))!;
    expect(q.doel(dst.dias[1].pad, link.id)).toBe(dst.dias[2].pad);
    relaties(r.bytes);
  });
  it("behoudt bewerkbare tabellen en grafieken met een eigen ingesloten werkboek", () => {
    const m = standaardModel({
      categorieen: ["A", "B"],
      reeksen: [{ naam: "Waarde", waarden: [2, 3] }],
    });
    let source = voegGrafiekToePptx(bron(), m, { dia: 0 }).bytes;
    source = schrijfTabel(source, 1, nieuwRooster(2, 2));
    const r = hergebruikDias(doel(), source, [0, 1], 0),
      saved = open(r.bytes).save();
    expect(lijstGrafieken(saved, "pptx")).toHaveLength(1);
    expect(leesTabellen(saved, 2)).toHaveLength(1);
    relaties(saved);
  });
  it("laat bestaande dia's, masteronderdelen en media bytegelijk en houdt secties op hun plaats", () => {
    const d = voegSectieToe(bron(), 1, "Tweede deel", "Sectie")!,
      old = leesSecties(d),
      i = leesOntwerp(d),
      p = new Pakket(d);
    const r = hergebruikDias(d, bron(), [0], 0),
      q = new Pakket(r.bytes),
      n = leesSecties(r.bytes);
    expect(n[1].begin).toBe(old[1].begin + 1);
    for (const s of [...i.dias, ...i.masters, ...i.layouts])
      expect(q.bytes(s.pad)).toEqual(p.bytes(s.pad));
  });
  it("maakt een zelfstandig klembordpakket zonder niet-gekozen dia's of privéonderdelen", () => {
    const p = new Pakket(bron());
    p.schrijf("private/test.xml", "<data>UNRELATED</data>");
    p.voegOverrideToe("private/test.xml", "application/xml");
    const clip = maakDiaKopie(p.inpakken(), [1]),
      bytes = leesDiaKopie(clip.replace("\n", "\r\n")),
      i = leesOntwerp(bytes);
    expect(i.dias).toHaveLength(1);
    expect(new Pakket(bytes).namen()).not.toContain("private/test.xml");
    expect(tekst(open(bytes), 0)).toEqual(tekst(open(bron()), 1));
    relaties(bytes);
    const result = hergebruikDias(doel(), bytes, [0], 0);
    expect(open(result.bytes).snapshot().slides).toHaveLength(2);
  });
  it("weigert een ander diaformaat, ongeldige selectie en niet-ondersteunde pakketmetadata zonder mutatie", () => {
    const d = doel(),
      copy = d.slice(),
      p = new Pakket(bron());
    p.schrijf(
      "ppt/presentation.xml",
      p.lees("ppt/presentation.xml").replace(/cx="12191695"/, 'cx="9144000"'),
    );
    expect(() => hergebruikDias(d, p.inpakken(), [0], 0)).toThrow("size");
    expect(() => hergebruikDias(d, bron(), [-1], 0)).toThrow("invalid");
    const q = new Pakket(bron());
    q.schrijf(
      "ppt/presentation.xml",
      q
        .lees("ppt/presentation.xml")
        .replace(
          "</p:presentation>",
          "<p:embeddedFontLst><p:embeddedFont/></p:embeddedFontLst></p:presentation>",
        ),
    );
    expect(() => hergebruikDias(d, q.inpakken(), [0], 0)).toThrow("metadata");
    expect(d).toEqual(copy);
    expect(() => leesDiaKopie("not slides")).toThrow();
  });
  it("weigert conflicterende notitiemodellen en houdt het doel ongewijzigd", () => {
    const a = hergebruikDias(doel(), bron(), [0], 0),
      p = new Pakket(bron()),
      path = p.namen().find((n) => /^ppt\/notesMasters\/[^/]+\.xml$/.test(n))!,
      xml = p.lees(path);
    const gewijzigd = xml.replace('accent1="accent1"', 'accent1="accent2"');
    expect(gewijzigd).not.toBe(xml);
    p.schrijf(path, gewijzigd);
    const copy = a.bytes.slice();
    expect(() => hergebruikDias(a.bytes, p.inpakken(), [0], 0)).toThrow(
      "notes",
    );
    expect(a.bytes).toEqual(copy);
  });
});
