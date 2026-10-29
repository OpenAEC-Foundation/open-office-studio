import { describe, expect, it } from "vitest";
import {
  leesHtmlTabel,
  leesTsv,
  letterlijk,
  naarHtml,
  naarTsv,
  plakInvoer,
  STANDAARD_PLAKKEN,
  transponeer,
  zelfdeTekst,
} from "./klembordLogica";
import { breedtePx, breedteTekens, breedteVoor, hoogtePunten, hoogtePx, hoogteVoor, regelsVoor } from "./maten";
import { leesMaat } from "./MaatVenster";

describe("maten (#60)", () => {
  it("rekent kolombreedte heen en terug zoals de rekenkern tekent", () => {
    expect(breedtePx(8.43)).toBeCloseTo(64.01, 1);
    expect(breedtePx(20)).toBe(145);
    expect(breedteTekens(145.0039)).toBe(20);
    expect(breedteTekens(64.01172)).toBe(8.43);
    expect(breedteTekens(0)).toBe(0);
    expect(breedteVoor(100)).toBeCloseTo((108 - 5) / 7, 1);
  });
  it("rijhoogte: standaardrij 15 pt, eigen hoogten terug naar punten", () => {
    expect(hoogtePunten(20)).toBe(15);
    expect(hoogtePunten(hoogtePx(30))).toBe(30);
    expect(hoogtePunten(hoogtePx(45))).toBe(45);
    expect(hoogtePx(hoogteVoor(40))).toBeGreaterThanOrEqual(40);
  });
  it("leest maten met komma of punt", () => {
    expect(leesMaat("12,5")).toBe(12.5);
    expect(leesMaat("12.5")).toBe(12.5);
    expect(leesMaat(" 8 ")).toBe(8);
    expect(leesMaat("abc")).toBeNull();
    expect(leesMaat("")).toBeNull();
  });
  it("telt regels bij tekstterugloop", () => {
    const meet = (t: string) => t.length * 10;
    expect(regelsVoor("aaa bbb ccc", 75, "", meet)).toBe(2);
    expect(regelsVoor("aaa", 10, "", meet)).toBe(1);
  });
});

describe("klembord zonder engine (#20)", () => {
  it("TSV met aanhalingstekens heen en terug", () => {
    const rijen = [
      ["a", "b\tc"],
      ['"x"', "regel 1\nregel 2"],
    ];
    expect(leesTsv(naarTsv(rijen))).toEqual(rijen);
    expect(zelfdeTekst("a\r\nb\r\n", "a\nb")).toBe(true);
  });
  it("HTML-tabel uit Excel (x:num), LibreOffice (sdval) en Word met samengevoegde cellen", () => {
    const excel =
      '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><body><table>' +
      '<tr><td x:num="1234.5">1.234,50</td><td>tekst &lt;b&gt;</td></tr>' +
      '<tr><td rowspan=2 sdval="7">7</td><td><p>een</p><p>twee</p></td></tr>' +
      "<tr><td>laatste</td></tr></table></body></html>";
    expect(leesHtmlTabel(excel)).toEqual([
      ["1234.5", "tekst <b>"],
      ["7", "een\ntwee"],
      ["", "laatste"],
    ]);
    expect(leesHtmlTabel("<p>geen tabel</p>")).toBeNull();
  });
  it("eigen HTML bevat opmaak, samenvoeging en ruwe getallen", () => {
    const html = naarHtml(
      [
        [{ tekst: "Kop", vet: true, kolommen: 2 }, { tekst: "", verborgen: true }],
        [{ tekst: "1,5", getal: true, ruw: 1.5 }, { tekst: "<x>", kleur: "#ff0000" }],
      ],
      [64, 80],
    );
    expect(html).toContain('<td colspan="2" style="font-weight:bold">Kop</td>');
    expect(html).toContain('x:num="1.5"');
    expect(html).toContain("text-align:right");
    expect(html).toContain("&lt;x&gt;");
    expect(leesHtmlTabel(html)).toEqual([
      ["Kop", ""],
      ["1.5", "<x>"],
    ]);
  });
  it("letterlijke tekst krijgt een apostrof als hij anders iets anders wordt", () => {
    expect(letterlijk("abc")).toBe("abc");
    expect(letterlijk("=1+1")).toBe("'=1+1");
    expect(letterlijk("12")).toBe("'12");
    expect(letterlijk("1-1-2026")).toBe("'1-1-2026");
    expect(letterlijk("TRUE")).toBe("'TRUE");
  });
  it("plakplan: bewerkingen met formules en lege cellen", () => {
    const leeg = { kind: "empty" as const };
    const bron = [
      [
        { invoer: "2", formule: false, waarde: { kind: "number" as const, value: 2 } },
        { invoer: "=A1", formule: true, waarde: { kind: "number" as const, value: 5 } },
        { invoer: "", formule: false, waarde: leeg },
      ],
    ];
    const doel = [
      [
        { invoer: "=B9", formule: true, waarde: { kind: "number" as const, value: 3 } },
        { invoer: "10", formule: false, waarde: { kind: "number" as const, value: 10 } },
        { invoer: "x", formule: false, waarde: { kind: "text" as const, value: "x" } },
      ],
    ];
    const verschuif = () => ({ rijen: 1, kolommen: 0 });
    expect(
      plakInvoer(bron, doel, { ...STANDAARD_PLAKKEN, bewerking: "vermenigvuldigen" }, verschuif)[0],
    ).toEqual(["=(B9)*2", "=10*(A2)", "x"]);
    expect(
      plakInvoer(bron, doel, { ...STANDAARD_PLAKKEN, wat: "waarden", bewerking: "optellen" }, verschuif)[0],
    ).toEqual(["=(B9)+2", "15", "x"]);
    expect(plakInvoer(bron, doel, { ...STANDAARD_PLAKKEN, legeOverslaan: true }, verschuif)[0]).toEqual([
      "2",
      "=A2",
      null,
    ]);
    expect(transponeer([[1, 2, 3]])).toEqual([[1], [2], [3]]);
  });
});
