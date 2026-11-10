import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { attr, kind, kinderen, leesXml, zoekAlle } from "../grafieken/xml";
import {
  diaKeuze,
  leesVoetteksten,
  schrijfVoetteksten,
  type Voetteksten,
} from "./voetteksten";

const bron = () =>
  new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpvisie.pptx"));
const instelling: Voetteksten = {
  dianummer: true,
  datum: true,
  automatisch: false,
  datumTekst: "9 november 2026",
  voettekst: true,
  tekst: "Project A & B <concept>",
  nietOpTitel: false,
};
const xml = (bytes: Uint8Array, pad: string) =>
  strFromU8(unzipSync(bytes)[pad]);
const vormen = (bytes: Uint8Array, index: number) =>
  kinderen(
    kind(
      kind(leesXml(xml(bytes, `ppt/slides/slide${index + 1}.xml`)), "cSld"),
      "spTree",
    ),
    "sp",
  );
const type = (v: ReturnType<typeof leesXml>) =>
  attr(kind(kind(kind(v, "nvSpPr"), "nvPr"), "ph"), "type");

describe("dia's kiezen", () => {
  it("leest nummers en bereiken, sorteert en ontdubbelt", () =>
    expect(diaKeuze("3; 1–2,2", 4)).toEqual([0, 1, 2]));
  it.each(["", "0", "4", "3-2", "1,", "x", "1-99999999999999999"])(
    "weigert ongeldige selectie %s",
    (s) => expect(() => diaKeuze(s, 3)).toThrow(),
  );
});

describe("PPTX-voetteksten (#87)", () => {
  it("past dianummer, vaste datum en tekst op gekozen dia's toe", () => {
    const voor = bron(),
      na = schrijfVoetteksten(voor, [1], instelling);
    expect(leesVoetteksten(na, 1)).toEqual(instelling);
    expect(
      vormen(na, 1).filter((v) =>
        ["dt", "ftr", "sldNum"].includes(type(v) ?? ""),
      ),
    ).toHaveLength(3);
    const deel = xml(na, "ppt/slides/slide2.xml");
    expect(deel).toContain('type="slidenum"');
    expect(deel).toContain("Project A &amp; B &lt;concept&gt;");
    expect(
      zoekAlle(leesXml(deel), "fld").some(
        (f) =>
          attr(f, "type") === "slidenum" &&
          zoekAlle(f, "t").some((t) =>
            t.kinderen.some((k) => k.soort === "tekst" && k.tekst === "2"),
          ),
      ),
    ).toBe(true);
    const a = unzipSync(voor),
      b = unzipSync(na);
    for (const pad of Object.keys(a).filter(
      (p) => !["ppt/presentation.xml", "ppt/slides/slide2.xml"].includes(p),
    ))
      expect(b[pad], pad).toEqual(a[pad]);
  });

  it("neemt positie en letteropmaak van het diamodel over", () => {
    const na = schrijfVoetteksten(bron(), [0], instelling);
    const root = leesXml(xml(na, "ppt/slideMasters/slideMaster1.xml"));
    const master = kinderen(kind(kind(root, "cSld"), "spTree"), "sp").find(
      (v) => type(v) === "ftr",
    )!;
    const vorm = vormen(na, 0).find((v) => type(v) === "ftr")!;
    expect(zoekAlle(vorm, "off")[0].attrs).toEqual(
      zoekAlle(master, "off")[0].attrs,
    );
    expect(zoekAlle(vorm, "ext")[0].attrs).toEqual(
      zoekAlle(master, "ext")[0].attrs,
    );
    expect(zoekAlle(vorm, "defRPr")[0].attrs).toEqual(
      zoekAlle(master, "defRPr")[0].attrs,
    );
  });

  it("behoudt bestaande vorm-id, positie en opmaak bij wijzigen zonder duplicaten", () => {
    const eerste = schrijfVoetteksten(bron(), [1], instelling);
    const tweede = schrijfVoetteksten(eerste, [1], {
      ...instelling,
      tekst: "Definitief",
    });
    const a = vormen(eerste, 1).find((v) => type(v) === "ftr")!,
      b = vormen(tweede, 1).find((v) => type(v) === "ftr")!;
    expect(kind(kind(b, "nvSpPr"), "cNvPr")?.attrs).toEqual(
      kind(kind(a, "nvSpPr"), "cNvPr")?.attrs,
    );
    expect(zoekAlle(b, "xfrm")[0].kinderen).toMatchObject(
      zoekAlle(a, "xfrm")[0].kinderen.map((k) =>
        k.soort === "element"
          ? { soort: k.soort, naam: k.naam, attrs: k.attrs }
          : { soort: k.soort },
      ),
    );
    expect(vormen(tweede, 1).filter((v) => type(v) === "ftr")).toHaveLength(1);
    expect(leesVoetteksten(tweede, 1).tekst).toBe("Definitief");
  });

  it("verbergt velden op titellay-outs en laat de titelinhoud ongewijzigd", () => {
    const z = unzipSync(bron());
    z["ppt/slides/_rels/slide1.xml.rels"] = strToU8(
      strFromU8(z["ppt/slides/_rels/slide1.xml.rels"]).replace(
        "slideLayout7.xml",
        "slideLayout1.xml",
      ),
    );
    const voor = zipSync(z),
      na = schrijfVoetteksten(voor, [0, 1, 2], {
        ...instelling,
        nietOpTitel: true,
      });
    expect(leesVoetteksten(na, 0)).toMatchObject({
      dianummer: false,
      voettekst: false,
      datum: false,
      nietOpTitel: true,
    });
    expect(leesVoetteksten(na, 1)).toMatchObject({
      dianummer: true,
      tekst: instelling.tekst,
    });
    expect(unzipSync(na)["ppt/slides/slide1.xml"]).toEqual(
      z["ppt/slides/slide1.xml"],
    );
  });

  it("schrijft automatische datum als veld en behoudt oorspronkelijke beginnummering", () => {
    const z = unzipSync(bron());
    z["ppt/presentation.xml"] = strToU8(
      strFromU8(z["ppt/presentation.xml"]).replace(
        "<p:presentation ",
        '<p:presentation firstSlideNum="5" ',
      ),
    );
    const na = schrijfVoetteksten(
      zipSync(z),
      [2],
      { ...instelling, automatisch: true },
      new Date(2026, 10, 9, 12),
    );
    expect(leesVoetteksten(na, 2)).toMatchObject({
      automatisch: true,
      datumTekst: "09-11-2026",
    });
    expect(xml(na, "ppt/slides/slide3.xml")).toContain('type="datetime1"');
    expect(xml(na, "ppt/slides/slide3.xml")).toMatch(
      /type="slidenum"[\s\S]*?<a:t>7<\/a:t>/,
    );
  });

  it("verwijdert alleen de speciale placeholders bij uitschakelen", () => {
    const voor = bron(),
      tussen = schrijfVoetteksten(voor, [0, 1, 2], instelling);
    const na = schrijfVoetteksten(tussen, [1], {
      ...instelling,
      dianummer: false,
      datum: false,
      voettekst: false,
    });
    expect(unzipSync(na)["ppt/slides/slide2.xml"]).toEqual(
      unzipSync(voor)["ppt/slides/slide2.xml"],
    );
    expect(leesVoetteksten(na, 0)).toEqual(instelling);
  });

  it("maakt geldige vormen zonder model-placeholders", () => {
    const z = unzipSync(bron());
    const pad = "ppt/slideMasters/slideMaster1.xml",
      root = leesXml(strFromU8(z[pad]));
    let s = strFromU8(z[pad]);
    for (const v of kinderen(kind(kind(root, "cSld"), "spTree"), "sp")
      .filter((v) => ["ftr", "dt", "sldNum"].includes(type(v) ?? ""))
      .reverse())
      s = s.slice(0, v.start) + s.slice(v.eind);
    z[pad] = strToU8(s);
    const na = schrijfVoetteksten(zipSync(z), [0], instelling);
    expect(leesVoetteksten(na, 0)).toEqual(instelling);
    const ids = zoekAlle(
      leesXml(xml(na, "ppt/slides/slide1.xml")),
      "cNvPr",
    ).map((v) => attr(v, "id"));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("bewaart velden en tekst door de echte PPTX-engine heen", async () => {
    const pptx = await import("@betteroffice/pptx");
    await pptx.initWasm(
      readFileSync(
        "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
      ),
    );
    const bytes = schrijfVoetteksten(
      bron(),
      [0, 1, 2],
      { ...instelling, automatisch: true },
      new Date(2026, 10, 9, 12),
    );
    const deck = pptx.openPresentation(bytes);
    deck.registerFont({ family: "Arial", bytes: readFileSync("node_modules/@betteroffice/fonts/assets/LiberationSans-Regular.ttf") });
    const tekst = deck
      .snapshot()
      .slides[1].shapes.flatMap((v) =>
        v.textStories.flatMap((s) =>
          s.paragraphs.map((p) => p.runs.map((r) => r.text).join("")),
        ),
      );
    expect(tekst).toContain(instelling.tekst);
    expect(tekst).toContain("09-11-2026");
    expect(tekst).toContain("2");
    const getekend = deck
      .layoutSlide(1)
      .primitives.filter((p) => p.kind === "textBox")
      .flatMap((p) =>
        p.paragraphs.map((a) => a.runs.map((r) => r.text).join("")),
      );
    expect(getekend).toContain(instelling.tekst);
    const opgeslagen = deck.save();
    deck.dispose();
    expect(leesVoetteksten(opgeslagen, 1)).toMatchObject({
      ...instelling,
      automatisch: true,
      datumTekst: "09-11-2026",
    });
    const opnieuw = pptx.openPresentation(opgeslagen);
    expect(opnieuw.snapshot().slides).toHaveLength(3);
    expect(
      opnieuw.snapshot().slides[1].shapes.filter((v) => v.kind === "shape")
        .length,
    ).toBeGreaterThan(2);
    opnieuw.dispose();
  });
});
