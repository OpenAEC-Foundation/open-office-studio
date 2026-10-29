import { describe, expect, it } from "vitest";
import {
  tabelUitKlembord,
  cssGrootte,
  cssKleur,
  deltaUitHtml,
  heeftHtmlOpmaak,
  koppelOpmaak,
  leesHtml,
  platteTekst,
  stukken,
  zelfdeDelta,
} from "./plakopties";
describe("plakopties: HTML lezen", () => {
  it("leest nadruk, kleur en grootte per teken", () => {
    const html =
      '<html><body><!--StartFragment--><p>Een <b>vet</b> en <span style="color:#c00000;font-size:16pt;font-family:&quot;Source Serif 4&quot;, serif">rood</span></p><!--EndFragment--></body></html>';
    const gelezen = leesHtml(html);
    expect(gelezen.tekst).toBe("Een vet en rood");
    expect(gelezen.opmaak[4]).toEqual({ bold: true });
    expect(gelezen.opmaak[11]).toEqual({ color: "C00000", fontSize: 16, fontFamily: "Source Serif 4" });
    expect(gelezen.opmaak[0]).toEqual({});
    expect(heeftHtmlOpmaak(gelezen)).toBe(true);
  });

  it("maakt van blokken regels en voegt witruimte samen", () => {
    const gelezen = leesHtml("<p>a\n  b</p><p><i>c</i><br>d</p><ul><li>e</li></ul>");
    expect(gelezen.tekst).toBe("a b\nc\nd\ne");
    expect(gelezen.opmaak[4]).toEqual({ italic: true });
  });

  it("slaat style- en scriptinhoud over en ontcijfert entiteiten", () => {
    const gelezen = leesHtml("<style>p{color:red}</style><p>A&amp;B&nbsp;&#8364;</p>");
    expect(gelezen.tekst).toBe("A&B €");
    expect(heeftHtmlOpmaak(gelezen)).toBe(false);
  });

  it("kent CSS-kleuren en -groottes", () => {
    expect(cssKleur("rgb(255, 0, 16)")).toBe("FF0010");
    expect(cssKleur("#abc")).toBe("AABBCC");
    expect(cssKleur("red")).toBe("FF0000");
    expect(cssKleur("var(--x)")).toBeUndefined();
    expect(cssGrootte("16px")).toBe(12);
    expect(cssGrootte("11pt")).toBe(11);
    expect(cssGrootte("2em")).toBe(22);
  });

  it("koppelt de opmaak aan de geplakte tekst, ook met andere witruimte", () => {
    const bron = leesHtml("<p><b>Kop</b></p><p>tekst <i>schuin</i></p>");
    const geplakt = "Kop\n\ntekst  schuin";
    const per = koppelOpmaak(geplakt, bron);
    expect(per[0]).toEqual({ bold: true });
    expect(per[2]).toEqual({ bold: true });
    expect(per[5]).toEqual({});
    expect(per[geplakt.length - 1]).toEqual({ italic: true });
  });

  it("maakt delta's: volledig voor ‘behouden’, alleen nadruk voor ‘samenvoegen’", () => {
    const o = { bold: true, color: "FF0000", fontSize: 14 };
    expect(deltaUitHtml(o)).toEqual({
      bold: true,
      italic: false,
      underline: false,
      strike: false,
      color: { rgb: "FF0000" },
      fontSize: 14,
    });
    expect(deltaUitHtml(o, true)).toEqual({ bold: true, italic: false, underline: false });
  });

  it("deelt een reeks op in stukken met gelijke opmaak", () => {
    const deltas = [{ bold: true }, { bold: true }, null, { italic: true }];
    expect(stukken(deltas, zelfdeDelta).map((s) => [s.begin, s.eind])).toEqual([
      [0, 2],
      [2, 3],
      [3, 4],
    ]);
  });

  it("normaliseert regeleinden", () => {
    expect(platteTekst("a\r\nb\rc")).toBe("a\nb\nc");
  });
});

describe("tabel uit het klembord", () => {
  const rekenblad =
    '<html><body><table><tr><td>Naam</td><td x:num="12">12</td></tr><tr><td>Peer &amp; appel</td><td>3,5</td></tr></table></body></html>';
  it("leest de cellen van een tabel", () => {
    expect(tabelUitKlembord(rekenblad)).toEqual([
      ["Naam", "12"],
      ["Peer & appel", "3,5"],
    ]);
  });
  it("één cel blijft tekst", () => {
    expect(tabelUitKlembord("<table><tr><td>42</td></tr></table>")).toBeNull();
  });
  it("tekst buiten de tabel: gewoon plakken (niets kwijt)", () => {
    expect(tabelUitKlembord("<p>Inleiding</p><table><tr><td>a</td><td>b</td></tr></table>")).toBeNull();
  });
  it("geen tabel", () => {
    expect(tabelUitKlembord("<p>a</p>")).toBeNull();
  });
});
