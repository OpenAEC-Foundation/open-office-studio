import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { berekenTrendlijn } from "./trendlijnen";
import { standaardModel, type Trendlijn } from "./model";
import { grafiekXml, leesGrafiekXml, werkGrafiekXmlBij } from "./chartxml";
import { Voorvertoning } from "./ui/Voorvertoning";

describe("trendlijnen (#66)", () => {
  it.each([
    ["linear", (x: number) => 2 * x + 3],
    ["poly", (x: number) => 4 * x * x - 2 * x + 3],
    ["exp", (x: number) => 2 * Math.exp(0.3 * x)],
    ["log", (x: number) => 1 + 2 * Math.log(x)],
    ["power", (x: number) => 3 * x * x],
  ] as const)(
    "berekent %s tegen een onafhankelijk bekende functie",
    (soort, f) => {
      const r = berekenTrendlijn(
        [1, 2, 3, 4, 5].map((x) => ({ x, y: f(x) })),
        { soort, graad: 2 },
      );
      expect(r.punten).toHaveLength(81);
      for (const p of r.punten) expect(p.y).toBeCloseTo(f(p.x), 7);
      expect(r.r2).toBeCloseTo(1, 10);
    },
  );
  it("berekent een werkelijk voortschrijdend gemiddelde", () => {
    expect(
      berekenTrendlijn(
        [1, 2, 4, 8].map((y, i) => ({ x: i + 1, y })),
        { soort: "movingAvg", periode: 2 },
      ).punten,
    ).toEqual([
      { x: 2, y: 1.5 },
      { x: 3, y: 3 },
      { x: 4, y: 6 },
    ]);
  });
  it("verwerkt vast intercept, voorspelling en grote x-waarden zonder instabiele machten", () => {
    const r = berekenTrendlijn(
      [1, 2, 3, 4].map((x) => ({ x, y: 3 * x })),
      { soort: "linear", intercept: 0, vooruit: 2, achteruit: 1 },
    );
    expect(r.punten[0]).toEqual({ x: 0, y: 0 });
    expect(r.punten.at(-1)?.y).toBeCloseTo(18, 8);
    const groot = berekenTrendlijn(
      [1, 2, 3, 4].map((i) => ({ x: 1e6 + i, y: i * i })),
      { soort: "poly", graad: 2 },
    );
    expect(groot.punten.at(-1)?.y).toBeCloseTo(16, 8);
  });
  it("verzint geen lijn voor ongeschikte logaritmen of identieke x-waarden", () => {
    expect(
      berekenTrendlijn(
        [
          { x: 0, y: 1 },
          { x: 1, y: 2 },
        ],
        { soort: "log" },
      ).punten,
    ).toEqual([]);
    expect(
      berekenTrendlijn(
        [
          { x: 1, y: -1 },
          { x: 2, y: 2 },
        ],
        { soort: "exp" },
      ).punten,
    ).toEqual([]);
    expect(
      berekenTrendlijn(
        [
          { x: 1, y: 1 },
          { x: 1, y: 2 },
        ],
        { soort: "linear" },
      ).punten,
    ).toEqual([]);
  });
  const model = (trendlijnen: Trendlijn[]) =>
    standaardModel({
      soort: "lijn",
      categorieen: ["A", "B", "C"],
      reeksen: [{ naam: "Waarden", waarden: [2, 4, 6], trendlijnen }],
    });
  it.each(["linear", "exp", "log", "power", "poly", "movingAvg"] as const)(
    "bewaart %s bij lezen en een gerichte titelbewerking",
    (soort) => {
      const xml = grafiekXml(
        model([{ soort, graad: 3, periode: 2, vooruit: 1, toonR2: true }]),
      );
      const gelezen = leesGrafiekXml(xml);
      expect(gelezen.model.reeksen[0].trendlijnen?.[0]).toMatchObject({
        soort,
        toonR2: true,
        vooruit: 1,
      });
      const nieuw = werkGrafiekXmlBij(xml, {
        ...gelezen.model,
        titel: "Nieuwe titel",
      });
      expect(
        leesGrafiekXml(nieuw).model.reeksen[0].trendlijnen?.[0],
      ).toMatchObject({ soort, toonR2: true });
      expect(
        gelezen.waarschuwingen.some((w) => /trendlijn|trendline/i.test(w)),
      ).toBe(false);
    },
  );
  it("behoudt meerdere trendlijnen, bronopmaak en onbekende uitbreidingen", () => {
    let xml = grafiekXml(
      model([{ soort: "linear" }, { soort: "movingAvg", periode: 2 }]),
    );
    xml = xml.replace(
      '<c:trendlineType val="linear"/>',
      '<c:trendlineType val="linear"/><c:extLst><c:ext uri="keep"><vendor xmlns="urn:keep"/></c:ext></c:extLst>',
    );
    const gelezen = leesGrafiekXml(xml),
      nieuw = werkGrafiekXmlBij(xml, { ...gelezen.model, titel: "Test" });
    expect(nieuw).toContain('<vendor xmlns="urn:keep"/>');
    expect(leesGrafiekXml(nieuw).model.reeksen[0].trendlijnen).toHaveLength(2);
    expect(nieuw).toContain('<a:prstDash val="dash"/>');
  });
  it("tekent een gestippelde lijn en R² in het grafiekvoorbeeld", () => {
    const svg = renderToStaticMarkup(
      createElement(Voorvertoning, {
        model: model([{ soort: "linear", toonR2: true }]),
      }),
    );
    expect(svg).toContain('stroke-dasharray="5 3"');
    expect(svg).toContain("R²");
  });
});
